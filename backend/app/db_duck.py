"""DuckDB — banco analítico. Recebe o arquivo consolidado pelo KNIME e
responde às perguntas do painel da gerente e ao histórico de movimento."""
import threading
from datetime import datetime
from pathlib import Path

import duckdb

from .config import DADOS, DUCKDB_PATH

_trava = threading.Lock()
_conexao: duckdb.DuckDBPyConnection | None = None
_historico: dict[tuple[int, int], float] | None = None

# Só o que já aconteceu entra nas análises
PASSADO = "data < current_date AND status IN ('concluido', 'faltou')"

# Média de atendimentos que começam em cada (dia da semana, hora); segunda = 0
MOVIMENTO = f"""
    SELECT t.dia_semana, t.hora, t.n / d.dias AS media
    FROM (SELECT isodow(data) - 1 AS dia_semana, hora, count(*) AS n
          FROM fato_atendimentos WHERE {PASSADO} GROUP BY 1, 2) t
    JOIN (SELECT isodow(data) - 1 AS dia_semana, count(DISTINCT data) AS dias
          FROM fato_atendimentos WHERE {PASSADO} GROUP BY 1) d USING (dia_semana)
"""


def _con() -> duckdb.DuckDBPyConnection:
    global _conexao
    if _conexao is None:
        DADOS.mkdir(parents=True, exist_ok=True)
        _conexao = duckdb.connect(str(DUCKDB_PATH))
        _conexao.execute(
            "CREATE TABLE IF NOT EXISTS etl_execucoes "
            "(executado_em TIMESTAMP, linhas INTEGER, origem VARCHAR)"
        )
    return _conexao


def _consultar(sql: str, parametros: list | None = None) -> list[dict]:
    with _trava:
        cur = _con().cursor()
        cur.execute(sql, parametros or [])
        colunas = [c[0] for c in cur.description]
        return [dict(zip(colunas, linha)) for linha in cur.fetchall()]


def carregado() -> bool:
    return bool(_consultar(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'fato_atendimentos'"
    ))


def carregar(csv: Path, origem: str = "KNIME") -> int:
    """Recria a tabela fato a partir do CSV consolidado pelo KNIME.

    nivel_tranquilidade e clima_dia já chegam calculados pelas regras do
    workflow (nós Rule Engine); o painel só agrupa por elas.
    """
    global _historico
    with _trava:
        cur = _con().cursor()
        cur.execute(
            """
            CREATE OR REPLACE TABLE fato_atendimentos AS
            SELECT
                CAST(agendamento_id AS INTEGER)                 AS agendamento_id,
                CAST(data AS DATE)                              AS data,
                CAST(hora AS INTEGER)                           AS hora,
                CAST(cliente_id AS INTEGER)                     AS cliente_id,
                status,
                CAST(primeira_visita AS INTEGER) = 1            AS primeira_visita,
                CAST(indice_tranquilidade AS INTEGER)           AS indice_tranquilidade,
                servico, categoria,
                CAST(duracao_min AS INTEGER)                    AS duracao_min,
                CAST(preco AS DOUBLE)                           AS preco,
                profissional, funcao,
                COALESCE(CAST(perfil_sensivel AS INTEGER), 0) = 1 AS perfil_sensivel,
                sens_ruido IS NOT NULL                          AS tem_perfil,
                CAST(nota_conforto AS DOUBLE)                   AS nota_conforto,
                CAST(nota_geral AS DOUBLE)                      AS nota_geral,
                CAST(temp_max AS DOUBLE)                        AS temp_max,
                CAST(chuva_mm AS DOUBLE)                        AS chuva_mm,
                condicao,
                CAST(nivel_tranquilidade AS VARCHAR)            AS nivel_tranquilidade,
                CAST(clima_dia AS VARCHAR)                      AS clima_dia
            FROM read_csv_auto(?, header = true)
            """,
            [str(csv)],
        )
        total = cur.execute("SELECT count(*) FROM fato_atendimentos").fetchone()[0]
        cur.execute("INSERT INTO etl_execucoes VALUES (?, ?, ?)", [datetime.now(), total, origem])
    _historico = None
    return total


def ultima_carga() -> dict | None:
    r = _consultar("SELECT * FROM etl_execucoes ORDER BY executado_em DESC LIMIT 1")
    return r[0] if r else None


def movimento_historico() -> dict[tuple[int, int], float]:
    """Movimento médio por (dia da semana, hora), de 0 (vazio) a 1 (pico).

    É o caminho de volta do analítico para a operação: o que o painel aprendeu
    com o histórico entra no índice de tranquilidade dos próximos horários.
    """
    global _historico
    if _historico is None:
        if not carregado():
            return {}
        dados = _consultar(
            f"SELECT dia_semana, hora, media / max(media) OVER () AS relativo FROM ({MOVIMENTO})")
        _historico = {(d["dia_semana"], d["hora"]): float(d["relativo"]) for d in dados}
    return _historico


def painel() -> dict:
    """Tudo que a tela da gerente mostra."""
    if not carregado():
        return {"carregado": False}

    resumo = _consultar(f"""
        SELECT count(*) FILTER (WHERE status = 'concluido')                         AS atendimentos,
               coalesce(sum(preco) FILTER (WHERE status = 'concluido'), 0)          AS receita,
               avg(CASE WHEN status = 'faltou' THEN 1.0 ELSE 0 END)           AS taxa_faltas,
               avg(CASE WHEN primeira_visita THEN 1.0 ELSE 0 END)             AS pct_primeira_visita,
               avg(nota_conforto)                                             AS conforto_medio,
               count(DISTINCT cliente_id)                                     AS clientes,
               count(DISTINCT cliente_id) FILTER (WHERE tem_perfil)                 AS clientes_com_perfil,
               min(data) AS inicio, max(data) AS fim
        FROM fato_atendimentos WHERE {PASSADO}
    """)[0]

    movimento = _consultar(
        f"SELECT dia_semana, hora, round(media, 2) AS media FROM ({MOVIMENTO}) ORDER BY 1, 2")

    semanas = _consultar(f"""
        SELECT CAST(date_trunc('week', data) AS DATE)       AS semana,
               count(*) FILTER (WHERE primeira_visita)            AS novos,
               count(*) FILTER (WHERE NOT primeira_visita)        AS recorrentes
        FROM fato_atendimentos WHERE {PASSADO} AND status = 'concluido'
        GROUP BY ALL ORDER BY 1
    """)

    faltas = _consultar(f"""
        SELECT grupo, rotulo, total, taxa FROM (
            SELECT 'Cliente' AS grupo,
                   CASE WHEN primeira_visita THEN 'Primeira visita' ELSE 'Já conhece o salão' END AS rotulo,
                   count(*) AS total, avg(CASE WHEN status = 'faltou' THEN 1.0 ELSE 0 END) AS taxa
            FROM fato_atendimentos WHERE {PASSADO} GROUP BY ALL
            UNION ALL
            SELECT 'Clima', clima_dia,
                   count(*), avg(CASE WHEN status = 'faltou' THEN 1.0 ELSE 0 END)
            FROM fato_atendimentos WHERE {PASSADO} AND clima_dia IS NOT NULL GROUP BY ALL
        ) ORDER BY grupo, rotulo
    """)

    conforto = _consultar(f"""
        SELECT nivel_tranquilidade                                           AS nivel,
               CASE WHEN perfil_sensivel THEN 'Com sensibilidade sensorial'
                    ELSE 'Demais clientes' END                               AS publico,
               round(avg(nota_conforto), 2)                                  AS nota,
               count(nota_conforto)                                          AS respostas
        FROM fato_atendimentos
        WHERE {PASSADO} AND nota_conforto IS NOT NULL AND nivel_tranquilidade IS NOT NULL
        GROUP BY ALL
    """)

    categorias = _consultar(f"""
        SELECT categoria, count(*) AS atendimentos, sum(preco) AS receita
        FROM fato_atendimentos WHERE {PASSADO} AND status = 'concluido'
        GROUP BY ALL ORDER BY receita DESC
    """)

    return {
        "carregado": True,
        "ultima_carga": ultima_carga(),
        "resumo": resumo,
        "movimento": movimento,
        "semanas": semanas,
        "faltas": faltas,
        "conforto": conforto,
        "categorias": categorias,
    }

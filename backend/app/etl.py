"""Consolidação dos dados: MongoDB + API -> staging -> KNIME -> DuckDB.

1. preparar_staging  exporta do MongoDB o que o KNIME vai cruzar
                     (perfis sensoriais, feedbacks e clima da Open-Meteo)
2. executar_knime    roda o workflow, que lê o SQLite direto, junta com os
                     arquivos do staging e grava o CSV consolidado
3. db_duck.carregar  leva o CSV consolidado para o DuckDB
"""
import csv
import subprocess
import tempfile
import threading
from datetime import datetime

from . import apis, db_duck
from .agenda import nivel_do_indice, perfil_sensivel, sensibilidades
from .config import CONSOLIDADO, KNIME_EXE, KNIME_WORKFLOW, STAGING
from .db_mongo import banco
from .db_sqlite import linhas, sessao

RESERVA = CONSOLIDADO.with_name("fato_atendimentos_reserva.csv")

estado = {"situacao": "parado", "etapa": None, "mensagem": None,
          "iniciado_em": None, "terminado_em": None}
_trava = threading.Lock()


def _gravar_csv(nome: str, colunas: list[str], registros: list[dict]) -> int:
    STAGING.mkdir(parents=True, exist_ok=True)
    with open(STAGING / nome, "w", newline="", encoding="utf-8") as arq:
        escritor = csv.DictWriter(arq, fieldnames=colunas, extrasaction="ignore")
        escritor.writeheader()
        escritor.writerows(registros)
    return len(registros)


def preparar_staging() -> dict:
    """Exporta as coleções do MongoDB em formato tabular para o KNIME."""
    bd = banco()
    apis.atualizar_clima()

    perfis = []
    for p in bd.perfis_sensoriais.find({}, {"_id": 0}):
        s = sensibilidades(p)
        perfis.append({
            "cliente_id": p["cliente_id"],
            "perfil_sensivel": int(perfil_sensivel(p)),
            "sens_ruido": s["ruido"] or 0,
            "sens_luz": s["luz"] or 0,
            "sens_cheiros": s["cheiros"] or 0,
            "sens_toque": s["toque"] or 0,
        })
    feedbacks = list(bd.feedbacks.find({}, {"_id": 0}))
    clima = list(bd.clima_diario.find({"temp_max": {"$ne": None}}, {"_id": 0}).sort("data"))

    return {
        "perfis": _gravar_csv(
            "perfis_sensoriais.csv",
            ["cliente_id", "perfil_sensivel", "sens_ruido", "sens_luz", "sens_cheiros", "sens_toque"],
            perfis),
        "feedbacks": _gravar_csv(
            "feedbacks.csv", ["agendamento_id", "nota_conforto", "nota_geral"], feedbacks),
        "clima": _gravar_csv(
            "clima_diario.csv", ["data", "temp_max", "chuva_mm", "condicao"], clima),
    }


class KnimeManual(RuntimeError):
    """O KNIME não pôde ser executado sozinho: o workflow precisa ser rodado pela interface."""


MANUAL = ("Os arquivos já foram exportados para data/staging. Abra o workflow "
          "'fenty_consolidacao' no KNIME, execute todos os nós e depois clique em "
          "'Carregar resultado do KNIME'.")


def executar_knime() -> None:
    """Roda o workflow em modo batch (sem abrir a interface do KNIME).

    Precisa da extensão gratuita "KNIME Batch Executor". Sem ela, o workflow
    é executado pela interface e o resultado é carregado em seguida.
    """
    console = KNIME_EXE.with_name("knimec.exe")       # versão que escreve no terminal
    executavel = console if console.exists() else KNIME_EXE
    if not executavel.exists():
        raise KnimeManual(f"KNIME não encontrado em {KNIME_EXE}. {MANUAL}")
    CONSOLIDADO.parent.mkdir(parents=True, exist_ok=True)
    antes = CONSOLIDADO.stat().st_mtime if CONSOLIDADO.exists() else 0
    with tempfile.TemporaryDirectory(prefix="knime-ws-") as workspace:
        processo = subprocess.run(
            [str(executavel), "-nosplash", "-consoleLog", "--launcher.suppressErrors",
             "-application", "org.knime.product.KNIME_BATCH_APPLICATION",
             "-data", workspace, f"-workflowDir={KNIME_WORKFLOW}", "-reset", "-nosave"],
            capture_output=True, text=True, errors="replace", timeout=600, check=False,
        )
    saida = (processo.stdout or "") + (processo.stderr or "")
    if "Batch Executor is not installed" in saida:
        raise KnimeManual(f"Este KNIME não tem a extensão Batch Executor. {MANUAL}")
    depois = CONSOLIDADO.stat().st_mtime if CONSOLIDADO.exists() else 0
    if processo.returncode != 0 or depois <= antes:
        erros = [l for l in saida.splitlines() if "ERROR" in l or "WARN" in l]
        raise RuntimeError(
            f"O KNIME terminou com código {processo.returncode} sem gerar o arquivo "
            f"consolidado. {' | '.join(erros[-3:])[:500]}"
        )


def aplicar_regras(ag: dict) -> None:
    """Espelho dos nós Rule Engine (#10) e (#11) do workflow.

    Se mudar uma regra no KNIME, mude aqui também (e em agenda.nivel_do_indice,
    que usa os mesmos limites para classificar os horários livres).
    """
    indice = ag.get("indice_tranquilidade")
    ag["nivel_tranquilidade"] = (nivel_do_indice(int(indice)).capitalize()
                                 if indice not in (None, "") else None)
    chuva = ag.get("chuva_mm")
    ag["clima_dia"] = (None if chuva in (None, "")
                       else "Dia de chuva" if float(chuva) >= 5 else "Dia sem chuva")


def consolidar_reserva() -> None:
    """A mesma junção e as mesmas regras do workflow, feitas em Python.

    Existe só para o painel não ficar vazio em uma máquina sem KNIME
    (por exemplo, logo depois de criar os dados de demonstração).
    O painel mostra a origem da carga, então fica visível qual caminho foi usado.
    """
    def ler(nome: str, chave: str) -> dict[str, dict]:
        with open(STAGING / nome, newline="", encoding="utf-8") as arq:
            return {linha.pop(chave): linha for linha in csv.DictReader(arq)}

    perfis = ler("perfis_sensoriais.csv", "cliente_id")
    feedbacks = ler("feedbacks.csv", "agendamento_id")
    clima = ler("clima_diario.csv", "data")
    with sessao() as con:
        agendamentos = linhas(con.execute(
            """SELECT a.id AS agendamento_id, substr(a.inicio, 1, 10) AS data,
                      CAST(substr(a.inicio, 12, 2) AS INTEGER) AS hora, a.cliente_id, a.status,
                      a.primeira_visita, a.indice_tranquilidade, s.nome AS servico, s.categoria,
                      s.duracao_min, s.preco, p.nome AS profissional, p.funcao
               FROM agendamentos a
               JOIN servicos s ON s.id = a.servico_id
               JOIN profissionais p ON p.id = a.profissional_id"""))
    colunas = list(agendamentos[0]) + [
        "perfil_sensivel", "sens_ruido", "sens_luz", "sens_cheiros", "sens_toque",
        "nota_conforto", "nota_geral", "temp_max", "chuva_mm", "condicao",
        "nivel_tranquilidade", "clima_dia"]
    for ag in agendamentos:
        ag.update(perfis.get(str(ag["cliente_id"]), {}))
        ag.update(feedbacks.get(str(ag["agendamento_id"]), {}))
        ag.update(clima.get(ag["data"], {}))
        aplicar_regras(ag)
    RESERVA.parent.mkdir(parents=True, exist_ok=True)
    with open(RESERVA, "w", newline="", encoding="utf-8") as arq:
        escritor = csv.DictWriter(arq, fieldnames=colunas)
        escritor.writeheader()
        escritor.writerows(agendamentos)


def _executar(modo: str) -> None:
    try:
        if modo in ("knime", "reserva"):
            estado["etapa"] = "Exportando perfis, feedbacks e clima do MongoDB"
            preparar_staging()
        if modo == "knime":
            estado["etapa"] = "KNIME cruzando SQLite, MongoDB e clima"
            executar_knime()
        if modo == "reserva":
            estado["etapa"] = "Cruzando as fontes em Python (sem KNIME)"
            consolidar_reserva()
            arquivo, origem = RESERVA, "Python (reserva, sem KNIME)"
        else:
            arquivo, origem = CONSOLIDADO, "KNIME"
        if not arquivo.exists():
            raise KnimeManual("O KNIME ainda não gerou o arquivo consolidado. " + MANUAL)
        estado["etapa"] = "Carregando o resultado no DuckDB"
        total = db_duck.carregar(arquivo, origem)
        estado.update(situacao="ok", mensagem=f"{total} atendimentos consolidados via {origem}.")
    except KnimeManual as aviso:
        estado.update(situacao="aguardando_knime", mensagem=str(aviso))
    except Exception as erro:  # o erro vai para a tela da gerente
        estado.update(situacao="erro", mensagem=str(erro))
    finally:
        estado.update(etapa=None, terminado_em=datetime.now().isoformat(timespec="seconds"))
        _trava.release()


def iniciar(modo: str = "knime") -> bool:
    """Dispara a consolidação em segundo plano. False se já houver uma rodando.

    modo: 'knime'    exporta, roda o workflow e carrega
          'carregar' só carrega o arquivo que o KNIME já gerou
          'reserva'  exporta, cruza em Python e carrega
    """
    if not _trava.acquire(blocking=False):
        return False
    estado.update(situacao="executando", etapa="Iniciando", mensagem=None,
                  iniciado_em=datetime.now().isoformat(timespec="seconds"), terminado_em=None)
    threading.Thread(target=_executar, args=(modo,), daemon=True).start()
    return True

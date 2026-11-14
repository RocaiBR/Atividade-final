"""Horários disponíveis e índice de tranquilidade.

O índice (0 a 100) estima quão calmo o salão deve estar em um horário,
cruzando quatro fontes:
  - SQLite    quem já está agendado naquele horário e quão barulhento é o serviço
  - DuckDB    movimento histórico daquele dia da semana e hora
  - Open-Meteo trovoadas, chuva forte e calor
  - BrasilAPI vésperas de feriado
O perfil sensorial do cliente (MongoDB) pesa cada fator.
"""
from datetime import date, datetime, time, timedelta

from . import apis, db_duck
from .config import (ACOLHIMENTO_MIN, CATEGORIA_POR_FUNCAO, DIAS_ABERTO,
                     DIAS_AGENDA, DIAS_SEMANA, INTERVALO_MIN)
from .db_mongo import banco
from .db_sqlite import linhas

FORMATO = "%Y-%m-%d %H:%M"


def texto_para_dt(valor: str) -> datetime:
    return datetime.strptime(valor, FORMATO)


def dt_para_texto(valor: datetime) -> str:
    return valor.strftime(FORMATO)


def nivel_do_indice(indice: int) -> str:
    # Os mesmos limites estão no nó Rule Engine (#10) do workflow do KNIME
    if indice >= 75:
        return "calmo"
    if indice >= 50:
        return "moderado"
    return "movimentado"


def sensibilidades(perfil: dict | None) -> dict:
    """Sensibilidades do cliente (0 a 3). Sem perfil, tudo conta com peso neutro."""
    base = {"ruido": None, "luz": None, "cheiros": None, "toque": None}
    if perfil:
        base.update(perfil.get("sensibilidades") or {})
    return base


def perfil_sensivel(perfil: dict | None) -> bool:
    return any((v or 0) >= 2 for v in sensibilidades(perfil).values())


def _peso(sensibilidade: int | None) -> float:
    """0 -> 0,5 (incomoda pouco) ... 3 -> 1,5 (incomoda muito). Sem perfil -> 1,0."""
    if sensibilidade is None:
        return 1.0
    return 0.5 + sensibilidade / 3


def indice_tranquilidade(
    inicio: datetime,
    fim: datetime,
    outros: list[dict],
    historico: dict[tuple[int, int], float],
    clima: dict | None,
    feriado_amanha: str | None,
    perfil: dict | None = None,
) -> dict:
    """Calcula o índice e explica, em linguagem simples, o que pesou."""
    sens = sensibilidades(perfil)
    peso_ruido, peso_cheiro = _peso(sens["ruido"]), _peso(sens["cheiros"])
    indice = 100.0
    motivos: list[str] = []

    # 1. Quem mais estará no salão (SQLite)
    simultaneos = [a for a in outros if a["inicio"] < fim and a["fim"] > inicio]
    if simultaneos:
        n = len(simultaneos)
        indice -= min(30, n * 6)
        motivos.append(f"{n} atendimento{'s' if n > 1 else ''} ao mesmo tempo")
        ruido = max(a["nivel_ruido"] for a in simultaneos)
        if ruido >= 2:
            indice -= 4 * ruido * peso_ruido
            motivos.append("secador ou aparelho barulhento em uso")
        cheiro = max(a["nivel_cheiro"] for a in simultaneos)
        if cheiro >= 3:
            indice -= 2 * cheiro * peso_cheiro
            motivos.append("cheiro forte de produto (tintura ou gel)")
    else:
        motivos.append("nenhum outro atendimento marcado")

    # 2. Movimento histórico daquele dia e hora (DuckDB)
    movimento = historico.get((inicio.weekday(), inicio.hour), 0.0)
    indice -= 15 * movimento
    if movimento >= 0.6:
        motivos.append("horário que costuma ser cheio")
    elif 0 < movimento <= 0.3:
        motivos.append("horário que costuma ser vazio")

    # 3. Clima (Open-Meteo)
    if clima:
        if clima.get("codigo_tempo") in (95, 96, 99):
            indice -= 10 * peso_ruido
            motivos.append("previsão de trovoadas")
        elif (clima.get("chuva_mm") or 0) >= 10:
            indice -= 4
            motivos.append("previsão de chuva forte")
        if (clima.get("temp_max") or 0) >= 32:
            indice -= 4
            motivos.append("dia muito quente")

    # 4. Véspera de feriado (BrasilAPI) e sábado
    if feriado_amanha:
        indice -= 8
        motivos.append(f"véspera de feriado ({feriado_amanha})")
    elif inicio.weekday() == 5:
        indice -= 6
        motivos.append("sábado costuma ter mais movimento")

    indice = int(max(0, min(100, round(indice))))
    return {"indice": indice, "nivel": nivel_do_indice(indice), "motivos": motivos}


# --- Consultas de apoio ------------------------------------------------------
def e_primeira_visita(con, cliente_id: int | None) -> bool:
    if cliente_id is None:
        return True
    feito = con.execute(
        "SELECT 1 FROM agendamentos WHERE cliente_id = ? AND status = 'concluido' LIMIT 1",
        (cliente_id,),
    ).fetchone()
    return feito is None


def agendamentos_do_dia(con, dia: date) -> list[dict]:
    """Agendamentos ativos do dia, com o ruído/cheiro do serviço."""
    registros = linhas(con.execute(
        """SELECT a.id, a.profissional_id, a.inicio, a.fim, s.nivel_ruido, s.nivel_cheiro
           FROM agendamentos a JOIN servicos s ON s.id = a.servico_id
           WHERE a.inicio LIKE ? AND a.status IN ('agendado', 'concluido')""",
        (f"{dia.isoformat()}%",),
    ))
    for r in registros:
        r["inicio"], r["fim"] = texto_para_dt(r["inicio"]), texto_para_dt(r["fim"])
    return registros


def perfil_do_cliente(cliente_id: int | None) -> dict | None:
    if cliente_id is None:
        return None
    return banco().perfis_sensoriais.find_one({"cliente_id": cliente_id}, {"_id": 0})


def situacao_do_dia(dia: date, feriados: dict[str, str]) -> tuple[bool, str | None]:
    """(aberto?, motivo se fechado)."""
    if dia.isoformat() in feriados:
        return False, f"Feriado: {feriados[dia.isoformat()]}"
    if dia.weekday() not in DIAS_ABERTO:
        return False, "Fechado aos domingos e segundas"
    return True, None


# --- Horários ----------------------------------------------------------------
def horarios_do_dia(
    con,
    servico: dict,
    dia: date,
    profissional_id: int | None,
    contexto: dict,
) -> list[dict]:
    """Horários livres do dia para o serviço, um por horário de início.

    Quando há mais de uma profissional livre no mesmo horário, fica a que foi
    capacitada em atendimento neuroinclusivo (se o perfil pedir) e, em seguida,
    a que tem o dia mais livre.
    """
    aberto, _ = situacao_do_dia(dia, contexto["feriados"])
    if not aberto:
        return []

    perfil = contexto["perfil"]
    sensivel = perfil_sensivel(perfil)
    duracao = servico["duracao_min"] + (ACOLHIMENTO_MIN if contexto["primeira_visita"] else 0)

    funcoes = [f for f, cat in CATEGORIA_POR_FUNCAO.items() if cat == servico["categoria"]]
    profissionais = linhas(con.execute(
        f"SELECT * FROM profissionais WHERE funcao IN ({','.join('?' * len(funcoes))})", funcoes
    ))
    if profissional_id:
        profissionais = [p for p in profissionais if p["id"] == profissional_id]

    do_dia = agendamentos_do_dia(con, dia)
    clima = contexto["clima"].get(dia.isoformat())
    feriado_amanha = contexto["feriados"].get((dia + timedelta(days=1)).isoformat())
    limite = datetime.now() + timedelta(minutes=30)

    melhores: dict[datetime, dict] = {}
    for prof in profissionais:
        if str(dia.weekday()) not in prof["dias_semana"].split(","):
            continue
        ocupados = [a for a in do_dia if a["profissional_id"] == prof["id"]]
        outros = [a for a in do_dia if a["profissional_id"] != prof["id"]]
        inicio = datetime.combine(dia, time.fromisoformat(prof["hora_inicio"]))
        fim_expediente = datetime.combine(dia, time.fromisoformat(prof["hora_fim"]))

        while inicio + timedelta(minutes=duracao) <= fim_expediente:
            fim = inicio + timedelta(minutes=duracao)
            livre = all(not (a["inicio"] < fim and a["fim"] > inicio) for a in ocupados)
            if livre and inicio >= limite:
                calculo = indice_tranquilidade(
                    inicio, fim, outros, contexto["historico"], clima, feriado_amanha, perfil
                )
                candidato = {
                    "inicio": dt_para_texto(inicio),
                    "fim": dt_para_texto(fim),
                    "hora": inicio.strftime("%H:%M"),
                    "profissional_id": prof["id"],
                    "profissional_nome": prof["nome"],
                    "capacitacao_neuro": bool(prof["capacitacao_neuro"]),
                    **calculo,
                    "_ordem": (
                        bool(prof["capacitacao_neuro"]) if sensivel else False,
                        calculo["indice"],
                        -len(ocupados),
                    ),
                }
                atual = melhores.get(inicio)
                if atual is None or candidato["_ordem"] > atual["_ordem"]:
                    melhores[inicio] = candidato
            inicio += timedelta(minutes=INTERVALO_MIN)

    horarios = [melhores[k] for k in sorted(melhores)]
    # Recomendados: os três mais tranquilos do dia (desde que sejam calmos)
    top = sorted(horarios, key=lambda h: (h["_ordem"][0], h["indice"]), reverse=True)[:3]
    for h in horarios:
        h["recomendado"] = h in top and h["nivel"] == "calmo"
        del h["_ordem"]
    return horarios


def montar_contexto(con, cliente_id: int | None, inicio: date, fim: date) -> dict:
    """Junta, uma vez só, o que vem das outras fontes para o período."""
    return {
        "perfil": perfil_do_cliente(cliente_id),
        "primeira_visita": e_primeira_visita(con, cliente_id),
        "clima": apis.clima_por_dia(inicio, fim),
        "feriados": apis.feriados_por_dia(inicio, fim + timedelta(days=1)),
        "historico": db_duck.movimento_historico(),
    }


def resumo_dos_dias(con, servico: dict, cliente_id: int | None,
                    profissional_id: int | None) -> list[dict]:
    """Próximos dias com clima, feriado e o melhor índice de cada dia."""
    hoje = date.today()
    fim = hoje + timedelta(days=DIAS_AGENDA - 1)
    contexto = montar_contexto(con, cliente_id, hoje, fim)
    dias = []
    for i in range(DIAS_AGENDA):
        dia = hoje + timedelta(days=i)
        aberto, motivo = situacao_do_dia(dia, contexto["feriados"])
        horarios = horarios_do_dia(con, servico, dia, profissional_id, contexto)
        melhor = max((h["indice"] for h in horarios), default=None)
        dias.append({
            "data": dia.isoformat(),
            "dia_semana": DIAS_SEMANA[dia.weekday()],
            "aberto": aberto,
            "motivo_fechado": motivo,
            "clima": contexto["clima"].get(dia.isoformat()),
            "vespera_feriado": contexto["feriados"].get((dia + timedelta(days=1)).isoformat()),
            "horarios_livres": len(horarios),
            "melhor_indice": melhor,
            "melhor_nivel": nivel_do_indice(melhor) if melhor is not None else None,
        })
    return dias

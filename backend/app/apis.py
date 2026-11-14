"""APIs externas: ViaCEP (endereço), Open-Meteo (clima) e BrasilAPI (feriados).

Clima e feriados ficam guardados no MongoDB. Se a API estiver fora do ar,
o sistema segue funcionando com o que já foi guardado.
"""
from datetime import date, datetime, timedelta

import httpx

from .config import SALAO
from .db_mongo import banco

TIMEOUT = httpx.Timeout(8.0)
VALIDADE_CLIMA = timedelta(hours=3)
ESPERA_APOS_FALHA = timedelta(minutes=5)
_falhas: dict[str, datetime] = {}   # evita insistir numa API que acabou de falhar


def _em_espera(chave: str) -> bool:
    falha = _falhas.get(chave)
    return bool(falha and datetime.now() - falha < ESPERA_APOS_FALHA)

# Códigos WMO usados pela Open-Meteo
CONDICOES = [
    ((0,), "Céu limpo", "sol"),
    ((1, 2), "Parcialmente nublado", "sol-nuvem"),
    ((3,), "Nublado", "nuvem"),
    ((45, 48), "Neblina", "nuvem"),
    ((51, 53, 55, 56, 57), "Garoa", "chuva"),
    ((61, 63, 66, 80, 81), "Chuva", "chuva"),
    ((65, 67, 82), "Chuva forte", "chuva"),
    ((71, 73, 75, 77, 85, 86), "Neve", "nuvem"),
    ((95, 96, 99), "Trovoadas", "trovoada"),
]


def descrever_tempo(codigo: int | None) -> tuple[str, str]:
    for codigos, texto, icone in CONDICOES:
        if codigo in codigos:
            return texto, icone
    return "Sem previsão", "nuvem"


# --- ViaCEP ------------------------------------------------------------------
def buscar_cep(cep: str) -> dict | None:
    """Devolve o endereço do CEP ou None se o CEP não existir."""
    digitos = "".join(c for c in cep if c.isdigit())
    if len(digitos) != 8:
        return None
    r = httpx.get(f"https://viacep.com.br/ws/{digitos}/json/", timeout=TIMEOUT)
    r.raise_for_status()
    dados = r.json()
    if dados.get("erro"):
        return None
    return {
        "cep": dados.get("cep"),
        "logradouro": dados.get("logradouro"),
        "bairro": dados.get("bairro"),
        "cidade": dados.get("localidade"),
        "uf": dados.get("uf"),
    }


# --- Open-Meteo --------------------------------------------------------------
def atualizar_clima(forcar: bool = False) -> bool:
    """Busca 92 dias de histórico + 16 de previsão e grava em clima_diario."""
    bd = banco()
    controle = bd.cache_api.find_one({"_id": "clima"})
    if not forcar and controle and datetime.now() - controle["atualizado_em"] < VALIDADE_CLIMA:
        return True
    if not forcar and _em_espera("clima"):
        return False
    try:
        r = httpx.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": SALAO["latitude"],
                "longitude": SALAO["longitude"],
                "daily": "weather_code,temperature_2m_max,temperature_2m_min,"
                         "precipitation_sum,precipitation_probability_max",
                "timezone": SALAO["fuso"],
                "past_days": 92,
                "forecast_days": 16,
            },
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        diario = r.json()["daily"]
    except (httpx.HTTPError, KeyError, ValueError):
        _falhas["clima"] = datetime.now()
        return False

    for i, dia in enumerate(diario["time"]):
        codigo = diario["weather_code"][i]
        texto, icone = descrever_tempo(codigo)
        bd.clima_diario.update_one(
            {"data": dia},
            {"$set": {
                "data": dia,
                "codigo_tempo": codigo,
                "condicao": texto,
                "icone": icone,
                "temp_max": diario["temperature_2m_max"][i],
                "temp_min": diario["temperature_2m_min"][i],
                "chuva_mm": diario["precipitation_sum"][i],
                "prob_chuva": diario["precipitation_probability_max"][i],
                "fonte": "open-meteo",
            }},
            upsert=True,
        )
    bd.cache_api.update_one(
        {"_id": "clima"}, {"$set": {"atualizado_em": datetime.now()}}, upsert=True
    )
    return True


def clima_por_dia(inicio: date, fim: date) -> dict[str, dict]:
    atualizar_clima()
    docs = banco().clima_diario.find(
        {"data": {"$gte": inicio.isoformat(), "$lte": fim.isoformat()}}, {"_id": 0}
    )
    return {d["data"]: d for d in docs}


# --- BrasilAPI ---------------------------------------------------------------
def feriados_por_dia(inicio: date, fim: date) -> dict[str, str]:
    """Feriados nacionais no período: {'2026-11-20': 'Dia da consciência negra'}."""
    bd = banco()
    for ano in {inicio.year, fim.year}:
        chave = f"feriados-{ano}"
        if bd.cache_api.find_one({"_id": chave}) or _em_espera(chave):
            continue
        try:
            r = httpx.get(f"https://brasilapi.com.br/api/feriados/v1/{ano}", timeout=TIMEOUT)
            r.raise_for_status()
            lista = r.json()
        except (httpx.HTTPError, ValueError):
            _falhas[chave] = datetime.now()
            continue
        for f in lista:
            bd.feriados.update_one(
                {"data": f["date"]},
                {"$set": {"data": f["date"], "nome": f["name"], "fonte": "brasilapi"}},
                upsert=True,
            )
        bd.cache_api.update_one(
            {"_id": chave}, {"$set": {"atualizado_em": datetime.now()}}, upsert=True
        )
    docs = bd.feriados.find({"data": {"$gte": inicio.isoformat(), "$lte": fim.isoformat()}})
    return {d["data"]: d["nome"] for d in docs}

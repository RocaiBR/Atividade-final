"""MongoDB — documentos de formato flexível.

Coleções:
  perfis_sensoriais  preferências de atendimento de cada cliente (opcional, com consentimento)
  roteiros           passo a passo de cada serviço, com avisos sensoriais
  feedbacks          avaliação de conforto depois do atendimento
  clima_diario       previsão/histórico diário vindo da Open-Meteo
  feriados           feriados nacionais vindos da BrasilAPI
  cache_api          controle de quando cada API foi consultada
"""
from functools import lru_cache

from pymongo import MongoClient
from pymongo.database import Database

from .config import MONGO_DB, MONGO_URL


@lru_cache(maxsize=1)
def _cliente() -> MongoClient:
    return MongoClient(MONGO_URL, serverSelectionTimeoutMS=2500)


def banco() -> Database:
    return _cliente()[MONGO_DB]


def criar_indices() -> None:
    bd = banco()
    bd.perfis_sensoriais.create_index("cliente_id", unique=True)
    bd.roteiros.create_index("servico_id", unique=True)
    bd.feedbacks.create_index("agendamento_id", unique=True)
    bd.clima_diario.create_index("data", unique=True)
    bd.feriados.create_index("data", unique=True)


def sem_id(doc: dict | None) -> dict | None:
    """Remove o _id do Mongo para o documento virar JSON."""
    if doc:
        doc.pop("_id", None)
    return doc

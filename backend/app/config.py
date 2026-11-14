"""Configuração central: caminhos dos bancos, dados do salão e regras da agenda."""
import os
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]

# --- Armazenamento -----------------------------------------------------------
DADOS = RAIZ / "data"
SQLITE_PATH = DADOS / "fenty_operacional.sqlite"   # operação do dia a dia
DUCKDB_PATH = DADOS / "fenty_analitico.duckdb"     # painel da gerente
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "fenty_beauty")   # perfis, roteiros, feedbacks

# --- Integração (KNIME) ------------------------------------------------------
KNIME_EXE = Path(os.getenv("KNIME_EXE", r"C:\Program Files\KNIME\knime.exe"))
KNIME_WORKFLOW = RAIZ / "knime" / "fenty_consolidacao"
# O workflow enxerga estas pastas por caminho relativo (../../data/...)
STAGING = DADOS / "staging"                         # o backend entrega ao KNIME
CONSOLIDADO = DADOS / "consolidado" / "fato_atendimentos.csv"   # o KNIME devolve

# --- Salão -------------------------------------------------------------------
SALAO = {
    "nome": "Fenty Beauty",
    "cidade": os.getenv("SALAO_CIDADE", "São Paulo"),
    "latitude": float(os.getenv("SALAO_LAT", "-23.5505")),
    "longitude": float(os.getenv("SALAO_LON", "-46.6333")),
    "fuso": "America/Sao_Paulo",
}

# --- Regras da agenda --------------------------------------------------------
DIAS_ABERTO = {1, 2, 3, 4, 5}          # terça a sábado (segunda = 0)
INTERVALO_MIN = 30                      # grade de horários
ACOLHIMENTO_MIN = 15                    # tempo extra na primeira visita
DIAS_AGENDA = 14                        # janela de agendamento
CATEGORIA_POR_FUNCAO = {
    "cabeleireira": "cabelo",
    "manicure": "unhas",
    "maquiadora": "maquiagem",
}
DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]

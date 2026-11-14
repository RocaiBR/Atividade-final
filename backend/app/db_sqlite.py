"""SQLite — banco operacional (clientes, equipe, serviços e agendamentos)."""
import sqlite3
from contextlib import contextmanager

from .config import DADOS, SQLITE_PATH

ESQUEMA = """
CREATE TABLE IF NOT EXISTS profissionais (
    id                INTEGER PRIMARY KEY,
    nome              TEXT NOT NULL,
    funcao            TEXT NOT NULL CHECK (funcao IN ('gerente','cabeleireira','manicure','maquiadora')),
    capacitacao_neuro INTEGER NOT NULL DEFAULT 0,   -- treinada em atendimento neuroinclusivo
    hora_inicio       TEXT NOT NULL DEFAULT '09:00',
    hora_fim          TEXT NOT NULL DEFAULT '18:00',
    dias_semana       TEXT NOT NULL DEFAULT '1,2,3,4,5'  -- segunda = 0
);

CREATE TABLE IF NOT EXISTS servicos (
    id             INTEGER PRIMARY KEY,
    nome           TEXT NOT NULL,
    categoria      TEXT NOT NULL CHECK (categoria IN ('cabelo','unhas','maquiagem')),
    duracao_min    INTEGER NOT NULL,
    preco          REAL NOT NULL,
    nivel_ruido    INTEGER NOT NULL DEFAULT 0,   -- 0 (silencioso) a 3 (secador, lixa elétrica)
    nivel_cheiro   INTEGER NOT NULL DEFAULT 0,   -- 0 a 3 (tintura, acetona)
    contato_fisico INTEGER NOT NULL DEFAULT 1    -- 0 a 3
);

CREATE TABLE IF NOT EXISTS clientes (
    id         INTEGER PRIMARY KEY,
    nome       TEXT NOT NULL,
    telefone   TEXT NOT NULL UNIQUE,
    email      TEXT,
    cep        TEXT,
    logradouro TEXT,
    bairro     TEXT,
    cidade     TEXT,
    uf         TEXT,
    criado_em  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agendamentos (
    id                   INTEGER PRIMARY KEY,
    cliente_id           INTEGER NOT NULL REFERENCES clientes(id),
    profissional_id      INTEGER NOT NULL REFERENCES profissionais(id),
    servico_id           INTEGER NOT NULL REFERENCES servicos(id),
    inicio               TEXT NOT NULL,            -- 'AAAA-MM-DD HH:MM'
    fim                  TEXT NOT NULL,
    status               TEXT NOT NULL DEFAULT 'agendado'
                         CHECK (status IN ('agendado','concluido','cancelado','faltou')),
    primeira_visita      INTEGER NOT NULL DEFAULT 0,
    indice_tranquilidade INTEGER,                  -- 0 a 100, calculado na hora da reserva
    observacoes          TEXT,
    criado_em            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_agendamentos_inicio ON agendamentos (inicio);
CREATE INDEX IF NOT EXISTS ix_agendamentos_cliente ON agendamentos (cliente_id);
"""


def conectar() -> sqlite3.Connection:
    DADOS.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(SQLITE_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


@contextmanager
def sessao():
    """Conexão com commit no sucesso e rollback no erro."""
    con = conectar()
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def criar_esquema() -> None:
    with sessao() as con:
        con.executescript(ESQUEMA)


def linhas(cursor) -> list[dict]:
    return [dict(l) for l in cursor.fetchall()]

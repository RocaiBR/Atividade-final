"""API do Fenty Beauty — agenda inclusiva.

Rodar:  uvicorn app.main:app --reload   (dentro da pasta backend)
"""
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pymongo.errors import PyMongoError

from . import agenda, apis, db_duck, etl
from .acolhimento import orientacoes
from .config import ACOLHIMENTO_MIN, SALAO
from .db_mongo import banco, criar_indices, sem_id
from .db_sqlite import criar_esquema, linhas, sessao

@asynccontextmanager
async def preparar(_: FastAPI):
    criar_esquema()
    try:
        criar_indices()
    except PyMongoError:
        pass  # /api/saude mostra que o MongoDB está fora do ar
    yield


app = FastAPI(title="Fenty Beauty — Agenda inclusiva", version="1.0", lifespan=preparar)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Modelos -----------------------------------------------------------------
class ClienteNovo(BaseModel):
    nome: str = Field(min_length=2, max_length=120)
    telefone: str
    email: str | None = None
    cep: str | None = None
    logradouro: str | None = None
    bairro: str | None = None
    cidade: str | None = None
    uf: str | None = None


class Sensibilidades(BaseModel):
    ruido: int = Field(0, ge=0, le=3)
    luz: int = Field(0, ge=0, le=3)
    cheiros: int = Field(0, ge=0, le=3)
    toque: int = Field(0, ge=0, le=3)


class Preferencias(BaseModel):
    pouca_conversa: bool = False
    avisar_antes_de_tocar: bool = False
    explicar_etapas: bool = False
    pausas: bool = False
    acompanhante: bool = False
    comunicacao: Literal["fala", "escrita"] = "fala"


class Perfil(BaseModel):
    consentimento: bool
    sensibilidades: Sensibilidades = Sensibilidades()
    preferencias: Preferencias = Preferencias()
    observacoes: str | None = Field(None, max_length=500)


class AgendamentoNovo(BaseModel):
    cliente_id: int
    servico_id: int
    profissional_id: int
    inicio: str                      # 'AAAA-MM-DD HH:MM'
    observacoes: str | None = Field(None, max_length=500)


class MudancaStatus(BaseModel):
    status: Literal["agendado", "concluido", "cancelado", "faltou"]


class Feedback(BaseModel):
    agendamento_id: int
    nota_conforto: int = Field(ge=1, le=5)
    nota_geral: int = Field(ge=1, le=5)
    comentario: str | None = Field(None, max_length=500)


def so_digitos(texto: str) -> str:
    return "".join(c for c in texto if c.isdigit())


def buscar_servico(con, servico_id: int) -> dict:
    servico = con.execute("SELECT * FROM servicos WHERE id = ?", (servico_id,)).fetchone()
    if not servico:
        raise HTTPException(404, "Serviço não encontrado.")
    return dict(servico)


# --- Situação do sistema -----------------------------------------------------
@app.get("/api/saude")
def saude() -> dict:
    """Mostra se cada fonte de dados está respondendo."""
    with sessao() as con:
        agendamentos = con.execute("SELECT count(*) FROM agendamentos").fetchone()[0]
    try:
        perfis = banco().perfis_sensoriais.count_documents({})
        mongo = {"ok": True, "perfis": perfis}
    except PyMongoError as erro:
        mongo = {"ok": False, "erro": str(erro)[:120]}
    return {
        "salao": SALAO,
        "sqlite": {"ok": True, "agendamentos": agendamentos},
        "mongodb": mongo,
        "duckdb": {"ok": True, "carregado": db_duck.carregado(),
                   "ultima_carga": db_duck.ultima_carga()},
    }


# --- Catálogo ----------------------------------------------------------------
@app.get("/api/servicos")
def listar_servicos() -> list[dict]:
    with sessao() as con:
        return linhas(con.execute("SELECT * FROM servicos ORDER BY categoria, nome"))


@app.get("/api/profissionais")
def listar_profissionais() -> list[dict]:
    with sessao() as con:
        return linhas(con.execute("SELECT * FROM profissionais ORDER BY funcao, nome"))


@app.get("/api/roteiros/{servico_id}")
def roteiro(servico_id: int) -> dict:
    """Passo a passo do serviço, para o cliente saber o que esperar."""
    doc = sem_id(banco().roteiros.find_one({"servico_id": servico_id}))
    if not doc:
        raise HTTPException(404, "Roteiro não encontrado.")
    return doc


# --- Clientes ----------------------------------------------------------------
@app.get("/api/cep/{cep}")
def consultar_cep(cep: str) -> dict:
    try:
        endereco = apis.buscar_cep(cep)
    except httpx.HTTPError:
        raise HTTPException(503, "Não foi possível consultar o CEP agora. "
                                 "Preencha o endereço manualmente.") from None
    if not endereco:
        raise HTTPException(404, "CEP não encontrado.")
    return endereco


@app.get("/api/clientes")
def listar_clientes(busca: str = "") -> list[dict]:
    termo = f"%{busca.strip()}%"
    with sessao() as con:
        clientes = linhas(con.execute(
            """SELECT c.id, c.nome, c.telefone, c.bairro, c.cidade, c.criado_em,
                      count(a.id) FILTER (WHERE a.status = 'concluido') AS visitas,
                      max(a.inicio) FILTER (WHERE a.status = 'concluido') AS ultima_visita
               FROM clientes c LEFT JOIN agendamentos a ON a.cliente_id = c.id
               WHERE c.nome LIKE ? OR c.telefone LIKE ?
               GROUP BY c.id ORDER BY c.nome LIMIT 200""",
            (termo, termo),
        ))
    com_perfil = {p["cliente_id"]: agenda.perfil_sensivel(p)
                  for p in banco().perfis_sensoriais.find({}, {"_id": 0})}
    for c in clientes:
        c["tem_perfil"] = c["id"] in com_perfil
        c["perfil_sensivel"] = com_perfil.get(c["id"], False)
    return clientes


@app.get("/api/clientes/por-telefone/{telefone}")
def cliente_por_telefone(telefone: str) -> dict:
    with sessao() as con:
        cliente = con.execute(
            "SELECT * FROM clientes WHERE telefone = ?", (so_digitos(telefone),)
        ).fetchone()
        if not cliente:
            raise HTTPException(404, "Cliente não encontrado.")
        return _cliente_completo(con, dict(cliente))


@app.get("/api/clientes/{cliente_id}")
def detalhar_cliente(cliente_id: int) -> dict:
    with sessao() as con:
        cliente = con.execute("SELECT * FROM clientes WHERE id = ?", (cliente_id,)).fetchone()
        if not cliente:
            raise HTTPException(404, "Cliente não encontrado.")
        return _cliente_completo(con, dict(cliente))


def _cliente_completo(con, cliente: dict) -> dict:
    cliente["perfil"] = agenda.perfil_do_cliente(cliente["id"])
    cliente["primeira_visita"] = agenda.e_primeira_visita(con, cliente["id"])
    cliente["historico"] = linhas(con.execute(
        """SELECT a.id, a.inicio, a.status, a.indice_tranquilidade,
                  s.nome AS servico, p.nome AS profissional
           FROM agendamentos a
           JOIN servicos s ON s.id = a.servico_id
           JOIN profissionais p ON p.id = a.profissional_id
           WHERE a.cliente_id = ? ORDER BY a.inicio DESC LIMIT 20""",
        (cliente["id"],),
    ))
    return cliente


@app.post("/api/clientes", status_code=201)
def cadastrar_cliente(dados: ClienteNovo) -> dict:
    telefone = so_digitos(dados.telefone)
    if len(telefone) not in (10, 11):
        raise HTTPException(422, "Informe o telefone com DDD (10 ou 11 dígitos).")
    with sessao() as con:
        if con.execute("SELECT 1 FROM clientes WHERE telefone = ?", (telefone,)).fetchone():
            raise HTTPException(409, "Já existe cliente com este telefone.")
        cur = con.execute(
            """INSERT INTO clientes (nome, telefone, email, cep, logradouro, bairro, cidade, uf, criado_em)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (dados.nome.strip(), telefone, dados.email, dados.cep, dados.logradouro,
             dados.bairro, dados.cidade, dados.uf, datetime.now().isoformat(timespec="seconds")),
        )
        cliente = con.execute("SELECT * FROM clientes WHERE id = ?", (cur.lastrowid,)).fetchone()
        return _cliente_completo(con, dict(cliente))


@app.put("/api/clientes/{cliente_id}/perfil")
def salvar_perfil(cliente_id: int, perfil: Perfil) -> dict:
    """Grava as preferências de atendimento. Sem consentimento, apaga o perfil."""
    with sessao() as con:
        if not con.execute("SELECT 1 FROM clientes WHERE id = ?", (cliente_id,)).fetchone():
            raise HTTPException(404, "Cliente não encontrado.")
    colecao = banco().perfis_sensoriais
    if not perfil.consentimento:
        colecao.delete_one({"cliente_id": cliente_id})
        return {"cliente_id": cliente_id, "perfil": None}
    doc = {"cliente_id": cliente_id, **perfil.model_dump(),
           "atualizado_em": datetime.now().isoformat(timespec="seconds")}
    colecao.replace_one({"cliente_id": cliente_id}, doc, upsert=True)
    return {"cliente_id": cliente_id, "perfil": sem_id(doc)}


# --- Horários ----------------------------------------------------------------
@app.get("/api/dias")
def proximos_dias(servico_id: int, cliente_id: int | None = None,
                  profissional_id: int | None = None) -> dict:
    """Próximos dias com clima, feriados e o horário mais tranquilo de cada um."""
    with sessao() as con:
        servico = buscar_servico(con, servico_id)
        primeira = agenda.e_primeira_visita(con, cliente_id)
        return {
            "primeira_visita": primeira,
            "duracao_min": servico["duracao_min"] + (ACOLHIMENTO_MIN if primeira else 0),
            "acolhimento_min": ACOLHIMENTO_MIN if primeira else 0,
            "dias": agenda.resumo_dos_dias(con, servico, cliente_id, profissional_id),
        }


@app.get("/api/horarios")
def horarios(servico_id: int, data: date, cliente_id: int | None = None,
             profissional_id: int | None = None) -> list[dict]:
    with sessao() as con:
        servico = buscar_servico(con, servico_id)
        contexto = agenda.montar_contexto(con, cliente_id, data, data)
        return agenda.horarios_do_dia(con, servico, data, profissional_id, contexto)


# --- Agendamentos ------------------------------------------------------------
@app.post("/api/agendamentos", status_code=201)
def agendar(dados: AgendamentoNovo) -> dict:
    try:
        inicio = agenda.texto_para_dt(dados.inicio)
    except ValueError:
        raise HTTPException(422, "Data e hora inválidas.") from None
    if inicio.date() > date.today() + timedelta(days=30):
        raise HTTPException(422, "A agenda abre com até 30 dias de antecedência.")

    with sessao() as con:
        con.execute("BEGIN IMMEDIATE")   # ninguém mais grava até confirmar o horário
        servico = buscar_servico(con, dados.servico_id)
        if not con.execute("SELECT 1 FROM clientes WHERE id = ?", (dados.cliente_id,)).fetchone():
            raise HTTPException(404, "Cliente não encontrado.")
        contexto = agenda.montar_contexto(con, dados.cliente_id, inicio.date(), inicio.date())
        livres = agenda.horarios_do_dia(con, servico, inicio.date(), dados.profissional_id, contexto)
        escolhido = next((h for h in livres if h["inicio"] == dados.inicio), None)
        if not escolhido:
            raise HTTPException(409, "Este horário acabou de ser ocupado. Escolha outro.")
        cur = con.execute(
            """INSERT INTO agendamentos (cliente_id, profissional_id, servico_id, inicio, fim,
                   status, primeira_visita, indice_tranquilidade, observacoes, criado_em)
               VALUES (?, ?, ?, ?, ?, 'agendado', ?, ?, ?, ?)""",
            (dados.cliente_id, dados.profissional_id, dados.servico_id, escolhido["inicio"],
             escolhido["fim"], int(contexto["primeira_visita"]), escolhido["indice"],
             dados.observacoes, datetime.now().isoformat(timespec="seconds")),
        )
        return {"id": cur.lastrowid, **escolhido, "servico": servico["nome"],
                "primeira_visita": contexto["primeira_visita"]}


@app.get("/api/agenda")
def agenda_do_dia(data: date = Query(default_factory=date.today)) -> dict:
    """Agenda da equipe, com o cartão de acolhimento de cada atendimento."""
    with sessao() as con:
        itens = linhas(con.execute(
            """SELECT a.id, a.inicio, a.fim, a.status, a.primeira_visita,
                      a.indice_tranquilidade, a.observacoes,
                      c.id AS cliente_id, c.nome AS cliente, c.telefone,
                      p.id AS profissional_id, p.nome AS profissional, p.funcao,
                      s.nome AS servico, s.categoria, s.nivel_ruido, s.nivel_cheiro, s.contato_fisico
               FROM agendamentos a
               JOIN clientes c ON c.id = a.cliente_id
               JOIN profissionais p ON p.id = a.profissional_id
               JOIN servicos s ON s.id = a.servico_id
               WHERE a.inicio LIKE ? ORDER BY a.inicio""",
            (f"{data.isoformat()}%",),
        ))
    bd = banco()
    ids_clientes = list({i["cliente_id"] for i in itens})
    perfis = {p["cliente_id"]: p for p in
              bd.perfis_sensoriais.find({"cliente_id": {"$in": ids_clientes}}, {"_id": 0})}
    avaliados = {f["agendamento_id"] for f in
                 bd.feedbacks.find({"agendamento_id": {"$in": [i["id"] for i in itens]}})}
    for item in itens:
        perfil = perfis.get(item["cliente_id"])
        item["primeira_visita"] = bool(item["primeira_visita"])
        item["tem_perfil"] = perfil is not None
        item["orientacoes"] = orientacoes(perfil, item, item["primeira_visita"])
        item["avaliado"] = item["id"] in avaliados
        item["nivel"] = (agenda.nivel_do_indice(item["indice_tranquilidade"])
                         if item["indice_tranquilidade"] is not None else None)

    feriados = apis.feriados_por_dia(data, data + timedelta(days=1))
    return {
        "data": data.isoformat(),
        "clima": apis.clima_por_dia(data, data).get(data.isoformat()),
        "feriado": feriados.get(data.isoformat()),
        "agendamentos": itens,
    }


@app.patch("/api/agendamentos/{agendamento_id}")
def mudar_status(agendamento_id: int, dados: MudancaStatus) -> dict:
    with sessao() as con:
        cur = con.execute("UPDATE agendamentos SET status = ? WHERE id = ?",
                          (dados.status, agendamento_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Agendamento não encontrado.")
    return {"id": agendamento_id, "status": dados.status}


@app.post("/api/feedbacks", status_code=201)
def registrar_feedback(dados: Feedback) -> dict:
    with sessao() as con:
        ag = con.execute("SELECT cliente_id, status FROM agendamentos WHERE id = ?",
                         (dados.agendamento_id,)).fetchone()
    if not ag:
        raise HTTPException(404, "Agendamento não encontrado.")
    if ag["status"] != "concluido":
        raise HTTPException(409, "Só é possível avaliar atendimentos concluídos.")
    doc = {**dados.model_dump(), "cliente_id": ag["cliente_id"],
           "criado_em": datetime.now().isoformat(timespec="seconds")}
    banco().feedbacks.replace_one({"agendamento_id": dados.agendamento_id}, doc, upsert=True)
    return sem_id(doc)


# --- Painel da gerente -------------------------------------------------------
@app.get("/api/painel")
def painel() -> dict:
    return db_duck.painel()


@app.post("/api/etl/executar", status_code=202)
def executar_etl(modo: Literal["knime", "carregar", "reserva"] = "knime") -> dict:
    """Dispara a consolidação (staging -> KNIME -> DuckDB) em segundo plano."""
    if not etl.iniciar(modo):
        raise HTTPException(409, "Já existe uma atualização em andamento.")
    return etl.estado


@app.get("/api/etl/status")
def status_etl() -> dict:
    return etl.estado

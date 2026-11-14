"""Dados de demonstração: equipe, serviços, roteiros, clientes e 10 semanas de
histórico. Os nomes e atendimentos são fictícios; o clima é real (Open-Meteo).

Rodar (dentro da pasta backend):  python -m app.seed
"""
import random
from datetime import date, datetime, time, timedelta

from . import apis
from .agenda import dt_para_texto, indice_tranquilidade, perfil_sensivel
from .config import CATEGORIA_POR_FUNCAO, DIAS_ABERTO, SQLITE_PATH
from .db_mongo import banco, criar_indices
from .db_sqlite import criar_esquema, sessao

SEMANAS_HISTORICO = 10
DIAS_FUTUROS = 14

PROFISSIONAIS = [
    # nome, função, capacitação neuroinclusiva, início, fim, dias
    ("Renata Albuquerque", "gerente", 1, "09:00", "18:00", "1,2,3,4,5"),
    ("Camila Duarte", "cabeleireira", 1, "09:00", "18:00", "1,2,3,4,5"),
    ("Jéssica Moreira", "cabeleireira", 0, "10:00", "19:00", "1,2,3,4,5"),
    ("Patrícia Lopes", "manicure", 1, "09:00", "18:00", "1,2,3,4,5"),
    ("Bianca Farias", "manicure", 0, "10:00", "19:00", "2,3,4,5"),
    ("Thaís Nogueira", "maquiadora", 1, "09:00", "18:00", "1,2,3,4,5"),
    ("Larissa Teixeira", "maquiadora", 0, "11:00", "19:00", "3,4,5"),
]

SERVICOS = [
    # nome, categoria, minutos, preço, ruído, cheiro, contato físico
    ("Corte", "cabelo", 45, 80, 1, 0, 2),
    ("Corte e escova", "cabelo", 75, 130, 3, 1, 2),
    ("Escova", "cabelo", 45, 70, 3, 1, 2),
    ("Coloração", "cabelo", 120, 220, 1, 3, 2),
    ("Hidratação", "cabelo", 60, 110, 2, 1, 2),
    ("Manicure", "unhas", 45, 40, 0, 2, 2),
    ("Pedicure", "unhas", 45, 45, 0, 2, 2),
    ("Manicure e pedicure", "unhas", 90, 80, 0, 2, 2),
    ("Alongamento em gel", "unhas", 120, 160, 2, 3, 2),
    ("Maquiagem social", "maquiagem", 60, 150, 0, 1, 3),
    ("Maquiagem para noiva", "maquiagem", 120, 380, 0, 1, 3),
    ("Design de sobrancelhas", "maquiagem", 30, 50, 0, 0, 3),
]

# Etapas reutilizadas nos roteiros: (título, descrição, minutos, aviso sensorial)
CHEGADA = ("Chegada", "A recepção te recebe e te leva até a cadeira. "
           "Você pode escolher o lugar mais confortável.", 5, None)
CONVERSA = ("Combinar o serviço", "A profissional pergunta o que você deseja e explica "
            "o que vai fazer. Você pode mostrar uma foto.", 5, None)
LAVAGEM = ("Lavagem", "O cabelo é lavado no lavatório, com a cabeça inclinada para trás.",
           10, "Água morna e toque no couro cabeludo")
CORTE = ("Corte", "O corte é feito com tesoura e pente. A profissional avisa antes de "
         "chegar perto do rosto e das orelhas.", 20, "Som de tesoura perto das orelhas")
SECAGEM = ("Secagem", "O cabelo é seco com secador e escova.", 20,
           "Barulho alto e ar quente. Você pode pedir protetor de ouvido ou secagem natural")
COR = ("Aplicação da cor", "A tintura é aplicada com pincel, mecha por mecha.", 35,
       "Cheiro forte de tintura")
ESPERA = ("Tempo de ação", "Você espera na cadeira enquanto o produto age. Pode usar fones, "
          "ler ou ficar em silêncio.", 30, None)
MASCARA = ("Máscara de hidratação", "O creme é aplicado e massageado no cabelo.", 15,
           "Toque no couro cabeludo e perfume do creme")
LIXA = ("Lixar e cuidar das cutículas", "As unhas são lixadas e as cutículas afastadas.", 15,
        "Sensação de lixa e toque nas mãos ou pés")
ESMALTE = ("Esmaltação", "O esmalte é aplicado em duas camadas. É preciso ficar com as "
           "mãos paradas.", 20, "Cheiro de esmalte e acetona")
GEL = ("Aplicação do gel", "O gel é moldado sobre a unha e seco em uma cabine de luz.", 70,
       "Lixa elétrica (vibração e barulho) e cheiro forte")
PELE = ("Preparar a pele", "A pele é limpa e hidratada com algodão e pincéis.", 10,
        "Toque no rosto")
MAQUIAGEM = ("Maquiagem", "A maquiagem é aplicada com pincéis e esponja. A profissional "
             "avisa antes de mexer perto dos olhos.", 35, "Toque no rosto e perto dos olhos")
SOBRANCELHA = ("Design", "Os pelos são retirados com pinça, seguindo o desenho combinado.",
               15, "Puxões rápidos, pode arder um pouco")
FINAL = ("Finalização", "Você confere o resultado no espelho e pode pedir ajustes. "
         "O pagamento é feito na recepção.", 5, None)

ROTEIROS = {
    "Corte": [CHEGADA, CONVERSA, LAVAGEM, CORTE, FINAL],
    "Corte e escova": [CHEGADA, CONVERSA, LAVAGEM, CORTE, SECAGEM, FINAL],
    "Escova": [CHEGADA, LAVAGEM, SECAGEM, FINAL],
    "Coloração": [CHEGADA, CONVERSA, COR, ESPERA, LAVAGEM, SECAGEM, FINAL],
    "Hidratação": [CHEGADA, LAVAGEM, MASCARA, SECAGEM, FINAL],
    "Manicure": [CHEGADA, LIXA, ESMALTE, FINAL],
    "Pedicure": [CHEGADA, LIXA, ESMALTE, FINAL],
    "Manicure e pedicure": [CHEGADA, LIXA, ESMALTE, LIXA, ESMALTE, FINAL],
    "Alongamento em gel": [CHEGADA, CONVERSA, LIXA, GEL, ESMALTE, FINAL],
    "Maquiagem social": [CHEGADA, CONVERSA, PELE, MAQUIAGEM, FINAL],
    "Maquiagem para noiva": [CHEGADA, CONVERSA, PELE, MAQUIAGEM, MAQUIAGEM, FINAL],
    "Design de sobrancelhas": [CHEGADA, CONVERSA, SOBRANCELHA, FINAL],
}

NOMES = ["Ana", "Beatriz", "Carla", "Daniela", "Eduarda", "Fernanda", "Gabriela", "Helena",
         "Isabela", "Juliana", "Karina", "Letícia", "Mariana", "Natália", "Olívia", "Paula",
         "Rafaela", "Sabrina", "Tatiane", "Vanessa", "Yasmin", "Aline", "Bruna", "Cecília",
         "Débora", "Elaine", "Flávia", "Giovana", "Lorena", "Mônica", "Pedro", "Lucas",
         "Rafael", "Thiago", "Sofia", "Luana"]
SOBRENOMES = ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves",
              "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho",
              "Almeida", "Barbosa", "Rocha", "Dias", "Nascimento", "Andrade", "Cardoso",
              "Mendes", "Freitas", "Vieira"]
BAIRROS = ["Pinheiros", "Vila Madalena", "Perdizes", "Lapa", "Butantã", "Consolação",
           "Bela Vista", "Santa Cecília", "Pompeia", "Sumaré"]

PESO_DIA = {1: 0.70, 2: 0.80, 3: 0.90, 4: 1.15, 5: 1.30}
PESO_HORA = {9: 0.55, 10: 1.10, 11: 1.15, 12: 0.70, 13: 0.60, 14: 0.75,
             15: 0.90, 16: 1.15, 17: 1.25, 18: 1.10}
OCUPACAO_BASE = 0.50


def _limpar() -> None:
    with sessao() as con:
        for tabela in ("agendamentos", "clientes", "servicos", "profissionais"):
            con.execute(f"DROP TABLE IF EXISTS {tabela}")
    criar_esquema()
    bd = banco()
    for colecao in ("perfis_sensoriais", "roteiros", "feedbacks"):
        bd[colecao].delete_many({})
    criar_indices()


def _catalogo(con) -> None:
    con.executemany(
        "INSERT INTO profissionais (nome, funcao, capacitacao_neuro, hora_inicio, hora_fim, "
        "dias_semana) VALUES (?, ?, ?, ?, ?, ?)", PROFISSIONAIS)
    con.executemany(
        "INSERT INTO servicos (nome, categoria, duracao_min, preco, nivel_ruido, nivel_cheiro, "
        "contato_fisico) VALUES (?, ?, ?, ?, ?, ?, ?)", SERVICOS)
    for linha in con.execute("SELECT id, nome FROM servicos").fetchall():
        banco().roteiros.insert_one({
            "servico_id": linha["id"],
            "servico": linha["nome"],
            "etapas": [{"titulo": t, "descricao": d, "minutos": m, "aviso_sensorial": a}
                       for t, d, m, a in ROTEIROS[linha["nome"]]],
        })


def _clientes(con, rng: random.Random, inicio_historico: date) -> list[int]:
    combinacoes = [(n, s) for n in NOMES for s in SOBRENOMES]
    rng.shuffle(combinacoes)
    fixos = [("Marina Costa", "11999990001"), ("Juliana Prado", "11999990002")]
    registros = [(nome, tel) for nome, tel in fixos]
    for i, (nome, sobrenome) in enumerate(combinacoes[:150]):
        registros.append((f"{nome} {sobrenome}", f"119{rng.randint(4000, 9999)}{1000 + i}"))
    ids = []
    for nome, telefone in registros:
        cur = con.execute(
            "INSERT INTO clientes (nome, telefone, bairro, cidade, uf, criado_em) "
            "VALUES (?, ?, ?, 'São Paulo', 'SP', ?)",
            (nome, telefone, rng.choice(BAIRROS), f"{inicio_historico.isoformat()}T09:00:00"))
        ids.append(cur.lastrowid)
    return ids


def _perfis(rng: random.Random, clientes: list[int]) -> dict[int, dict]:
    """Cerca de 30% dos clientes preencheram as preferências de atendimento."""
    perfis = {}
    for cliente_id in clientes:
        if cliente_id == clientes[0]:        # Marina Costa: perfil fixo para a demonstração
            sens = {"ruido": 3, "luz": 2, "cheiros": 1, "toque": 2}
            pref = {"pouca_conversa": True, "avisar_antes_de_tocar": True,
                    "explicar_etapas": True, "pausas": False, "acompanhante": False,
                    "comunicacao": "fala"}
            obs = "Uso fone com cancelamento de ruído durante a secagem."
        elif cliente_id == clientes[1] or rng.random() > 0.30:
            continue
        else:
            sensivel = rng.random() < 0.6
            sens = {k: rng.choice([2, 3] if sensivel and rng.random() < 0.6 else [0, 1])
                    for k in ("ruido", "luz", "cheiros", "toque")}
            pref = {"pouca_conversa": rng.random() < 0.5,
                    "avisar_antes_de_tocar": rng.random() < 0.4,
                    "explicar_etapas": rng.random() < 0.5,
                    "pausas": rng.random() < 0.2,
                    "acompanhante": rng.random() < 0.15,
                    "comunicacao": "escrita" if rng.random() < 0.15 else "fala"}
            obs = None
        perfis[cliente_id] = {
            "cliente_id": cliente_id, "consentimento": True, "sensibilidades": sens,
            "preferencias": pref, "observacoes": obs,
            "atualizado_em": datetime.now().isoformat(timespec="seconds"),
        }
    if perfis:
        banco().perfis_sensoriais.insert_many([dict(p) for p in perfis.values()])
    return perfis


def _gerar_dia(rng, dia, profissionais, servicos, estado, ocupacao) -> list[dict]:
    """Monta a agenda de um dia. Clientes sensíveis tendem a escolher horas vazias."""
    do_dia, atendidos_hoje = [], set()
    for prof in profissionais:
        if str(dia.weekday()) not in prof["dias_semana"].split(","):
            continue
        opcoes = [s for s in servicos if s["categoria"] == CATEGORIA_POR_FUNCAO[prof["funcao"]]]
        cursor = datetime.combine(dia, time.fromisoformat(prof["hora_inicio"]))
        fim_expediente = datetime.combine(dia, time.fromisoformat(prof["hora_fim"]))
        while cursor < fim_expediente:
            movimento = PESO_DIA[dia.weekday()] * PESO_HORA.get(cursor.hour, 1.0)
            servico = rng.choice(opcoes)
            if rng.random() > ocupacao * movimento:
                cursor += timedelta(minutes=30)
                continue

            # Quem vem: cliente novo, sensível (em hora calma) ou qualquer conhecido
            if estado["novos"] and rng.random() < 0.09:
                cliente = estado["novos"].pop()
            else:
                calmo = movimento < 0.75
                grupo = estado["sensiveis"] if rng.random() < (0.30 if calmo else 0.08) \
                    else estado["conhecidos"]
                cliente = rng.choice(grupo)
            primeira = cliente not in estado["ja_veio"]
            duracao = servico["duracao_min"] + (15 if primeira else 0)
            fim = cursor + timedelta(minutes=duracao)
            if cliente in atendidos_hoje or fim > fim_expediente:
                cursor += timedelta(minutes=30)
                continue

            atendidos_hoje.add(cliente)
            estado["conhecidos"].append(cliente)
            do_dia.append({
                "cliente_id": cliente, "profissional_id": prof["id"],
                "capacitada": bool(prof["capacitacao_neuro"]), "servico_id": servico["id"],
                "inicio": cursor, "fim": fim, "primeira_visita": primeira,
                "nivel_ruido": servico["nivel_ruido"], "nivel_cheiro": servico["nivel_cheiro"],
            })
            cursor = fim + timedelta(minutes=(-duracao) % 30)   # volta para a grade de 30 min
    return do_dia


def _definir_status(rng, ag: dict, chuva: float, agora: datetime) -> str:
    if ag["inicio"] >= agora:
        return "agendado"
    falta = 0.05 + (0.08 if ag["primeira_visita"] else 0) + (0.07 if chuva >= 5 else 0)
    sorteio = rng.random()
    if sorteio < falta:
        return "faltou"
    if sorteio < falta + 0.04:
        return "cancelado"
    return "concluido"


def _nota_conforto(rng, ag: dict, sensivel: bool) -> int:
    """Clientes sensíveis sentem muito mais a diferença entre um horário calmo e um cheio."""
    indice = ag["indice_tranquilidade"] / 100
    if sensivel:
        media = 2.0 + 2.8 * indice + (0.3 if ag["capacitada"] else 0)
    else:
        media = 3.9 + 0.7 * indice
    return int(max(1, min(5, round(rng.gauss(media, 0.6)))))


def semear() -> dict:
    rng = random.Random(2026)
    hoje, agora = date.today(), datetime.now()
    inicio = hoje - timedelta(weeks=SEMANAS_HISTORICO)
    _limpar()

    apis.atualizar_clima(forcar=True)
    clima = apis.clima_por_dia(inicio, hoje + timedelta(days=DIAS_FUTUROS))
    feriados = apis.feriados_por_dia(inicio, hoje + timedelta(days=DIAS_FUTUROS + 1))
    pico = max(PESO_DIA.values()) * max(PESO_HORA.values())
    historico = {(d, h): PESO_DIA[d] * PESO_HORA[h] / pico for d in PESO_DIA for h in PESO_HORA}

    with sessao() as con:
        _catalogo(con)
        clientes = _clientes(con, rng, inicio)
        perfis = _perfis(rng, clientes)
        profissionais = [dict(p) for p in con.execute(
            "SELECT * FROM profissionais WHERE funcao <> 'gerente'")]
        servicos = [dict(s) for s in con.execute("SELECT * FROM servicos")]

        antigos, novos = clientes[:45], clientes[45:]
        rng.shuffle(novos)
        estado = {
            "ja_veio": set(antigos),          # já eram clientes antes do sistema
            "conhecidos": list(antigos),
            "sensiveis": [c for c in antigos if perfil_sensivel(perfis.get(c))] or antigos[:5],
            "novos": novos,
        }

        feedbacks, total = [], 0
        for n in range((hoje - inicio).days + DIAS_FUTUROS):
            dia = inicio + timedelta(days=n)
            if dia.weekday() not in DIAS_ABERTO or dia.isoformat() in feriados:
                continue
            ocupacao = OCUPACAO_BASE if dia < hoje else OCUPACAO_BASE * 0.6
            do_dia = _gerar_dia(rng, dia, profissionais, servicos, estado, ocupacao)
            clima_dia = clima.get(dia.isoformat())
            vespera = feriados.get((dia + timedelta(days=1)).isoformat())

            for ag in do_dia:
                outros = [o for o in do_dia if o["profissional_id"] != ag["profissional_id"]]
                perfil = perfis.get(ag["cliente_id"])
                ag["indice_tranquilidade"] = indice_tranquilidade(
                    ag["inicio"], ag["fim"], outros, historico, clima_dia, vespera, perfil
                )["indice"]
                status = _definir_status(rng, ag, (clima_dia or {}).get("chuva_mm") or 0, agora)
                cur = con.execute(
                    """INSERT INTO agendamentos (cliente_id, profissional_id, servico_id, inicio,
                           fim, status, primeira_visita, indice_tranquilidade, criado_em)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (ag["cliente_id"], ag["profissional_id"], ag["servico_id"],
                     dt_para_texto(ag["inicio"]), dt_para_texto(ag["fim"]), status,
                     int(ag["primeira_visita"]), ag["indice_tranquilidade"],
                     (ag["inicio"] - timedelta(days=rng.randint(1, 9))).isoformat(timespec="seconds")),
                )
                total += 1
                if status == "concluido":
                    estado["ja_veio"].add(ag["cliente_id"])
                    if perfil_sensivel(perfil) and ag["cliente_id"] not in estado["sensiveis"]:
                        estado["sensiveis"].append(ag["cliente_id"])
                    if rng.random() < 0.65:
                        conforto = _nota_conforto(rng, ag, perfil_sensivel(perfil))
                        feedbacks.append({
                            "agendamento_id": cur.lastrowid, "cliente_id": ag["cliente_id"],
                            "nota_conforto": conforto,
                            "nota_geral": int(max(1, min(5, conforto + rng.choice([-1, 0, 0, 1])))),
                            "comentario": None,
                            "criado_em": ag["fim"].isoformat(timespec="seconds"),
                        })
        if feedbacks:
            banco().feedbacks.insert_many(feedbacks)

    return {"clientes": len(clientes), "perfis": len(perfis), "agendamentos": total,
            "feedbacks": len(feedbacks), "dias_de_clima": len(clima), "sqlite": str(SQLITE_PATH)}


if __name__ == "__main__":
    from . import db_duck, etl

    resumo = semear()
    print("Dados de demonstração criados:")
    for chave, valor in resumo.items():
        print(f"  {chave}: {valor}")

    # Primeira carga do painel, para ele não abrir vazio. Depois disso,
    # a atualização é feita pelo workflow do KNIME.
    etl.preparar_staging()
    etl.consolidar_reserva()
    carregados = db_duck.carregar(etl.RESERVA, "Python (carga inicial, sem KNIME)")
    print(f"  painel (DuckDB): {carregados} atendimentos na carga inicial")

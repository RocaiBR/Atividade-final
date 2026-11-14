import { useCallback, useEffect, useState } from "react";
import { api, formato } from "../api.js";
import { Cabecalho, Clima, Erro, Nivel } from "../componentes/Comuns.jsx";

const STATUS = { agendado: "Agendado", concluido: "Concluído", cancelado: "Cancelado", faltou: "Faltou" };

function somarDias(dataIso, dias) {
  const data = new Date(`${dataIso}T12:00:00`);
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

export default function Agenda() {
  const [data, setData] = useState(formato.hojeIso);
  const [dia, setDia] = useState(null);
  const [profissional, setProfissional] = useState("");
  const [erro, setErro] = useState(null);

  const carregar = useCallback(() => {
    setErro(null);
    api.agenda(data).then(setDia).catch(setErro);
  }, [data]);

  useEffect(carregar, [carregar]);

  const todos = dia?.agendamentos ?? [];
  const equipe = [...new Set(todos.map((a) => a.profissional))].sort();
  const visiveis = todos.filter((a) => !profissional || a.profissional === profissional);
  const comPreparo = todos.filter((a) => a.status === "agendado" && a.orientacoes.length > 0).length;

  return (
    <>
      <Cabecalho titulo="Agenda do dia">
        Cada atendimento vem com as orientações de acolhimento, montadas a partir das preferências do cliente e do serviço marcado.
      </Cabecalho>

      <div className="cartao linha entre" style={{ marginBottom: 16 }}>
        <div className="linha">
          <button className="botao menor" onClick={() => setData(somarDias(data, -1))} aria-label="Dia anterior">←</button>
          <input type="date" value={data} onChange={(e) => e.target.value && setData(e.target.value)}
                 aria-label="Data da agenda" style={{ width: "auto" }} />
          <button className="botao menor" onClick={() => setData(somarDias(data, 1))} aria-label="Próximo dia">→</button>
          <button className="botao menor discreto" onClick={() => setData(formato.hojeIso())}>Hoje</button>
        </div>
        <div className="linha">
          {dia?.feriado && <span className="selo destaque">Feriado: {dia.feriado}</span>}
          <Clima clima={dia?.clima} />
          <select value={profissional} onChange={(e) => setProfissional(e.target.value)}
                  aria-label="Filtrar por profissional" style={{ width: "auto" }}>
            <option value="">Toda a equipe</option>
            {equipe.map((nome) => <option key={nome}>{nome}</option>)}
          </select>
        </div>
      </div>

      <Erro erro={erro} />
      {dia && (
        <p className="suave" style={{ marginBottom: 12 }}>
          {formato.dataLonga(data)}: {todos.length} atendimentos
          {comPreparo > 0 && `, ${comPreparo} com orientações de acolhimento`}.
        </p>
      )}

      <div className="pilha">
        {dia && visiveis.length === 0 && <p className="vazio">Nenhum atendimento neste dia.</p>}
        {visiveis.map((a) => <Atendimento key={a.id} atendimento={a} aoMudar={carregar} />)}
      </div>
    </>
  );
}

function Atendimento({ atendimento: a, aoMudar }) {
  const [erro, setErro] = useState(null);
  const [avaliando, setAvaliando] = useState(false);
  const encerrado = a.status === "cancelado" || a.status === "faltou";

  async function mudar(status) {
    setErro(null);
    try {
      await api.mudarStatus(a.id, status);
      aoMudar();
    } catch (e) {
      setErro(e);
    }
  }

  return (
    <article className={`cartao atendimento ${encerrado ? "encerrado" : ""}`}>
      <div>
        <div className="hora">{formato.hora(a.inicio)}</div>
        <div className="suave pequeno numeros">até {formato.hora(a.fim)}</div>
      </div>
      <div className="pilha" style={{ gap: 10 }}>
        <div className="linha entre">
          <div>
            <h2>{a.cliente}</h2>
            <p className="suave">{a.servico} com {a.profissional}</p>
          </div>
          <div className="linha">
            {a.primeira_visita && <span className="selo destaque">Primeira visita</span>}
            <Nivel nivel={a.nivel} indice={a.indice_tranquilidade} />
            <span className="selo">{STATUS[a.status]}</span>
          </div>
        </div>

        {a.orientacoes.length > 0 && (
          <div className="aviso">
            <h3>Como acolher</h3>
            <ul className="orientacoes">
              {a.orientacoes.map((o) => <li key={o}>{o}</li>)}
            </ul>
          </div>
        )}

        <Erro erro={erro} />
        {a.status === "agendado" && (
          <div className="linha">
            <button className="botao menor principal" onClick={() => mudar("concluido")}>Concluir</button>
            <button className="botao menor" onClick={() => mudar("faltou")}>Não veio</button>
            <button className="botao menor" onClick={() => mudar("cancelado")}>Cancelar</button>
          </div>
        )}
        {a.status === "concluido" && !a.avaliado && !avaliando && (
          <div className="linha">
            <button className="botao menor" onClick={() => setAvaliando(true)}>Registrar avaliação do cliente</button>
          </div>
        )}
        {a.status === "concluido" && a.avaliado && <p className="suave pequeno">Avaliação registrada.</p>}
        {encerrado && (
          <div className="linha">
            <button className="botao menor discreto" onClick={() => mudar("agendado")}>Desfazer</button>
          </div>
        )}
        {avaliando && (
          <Avaliacao agendamentoId={a.id} aoSalvar={() => { setAvaliando(false); aoMudar(); }}
                     aoCancelar={() => setAvaliando(false)} />
        )}
      </div>
    </article>
  );
}

function Avaliacao({ agendamentoId, aoSalvar, aoCancelar }) {
  const [conforto, setConforto] = useState(5);
  const [geral, setGeral] = useState(5);
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState(null);

  async function enviar(evento) {
    evento.preventDefault();
    try {
      await api.avaliar({
        agendamento_id: agendamentoId, nota_conforto: conforto, nota_geral: geral,
        comentario: comentario.trim() || null,
      });
      aoSalvar();
    } catch (e) {
      setErro(e);
    }
  }

  const notas = [1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>);
  return (
    <form className="pilha" onSubmit={enviar} style={{ gap: 10 }}>
      <div className="notas">
        <div className="campo">
          <label htmlFor={`conforto-${agendamentoId}`}>Conforto no ambiente (1 a 5)</label>
          <select id={`conforto-${agendamentoId}`} value={conforto} onChange={(e) => setConforto(Number(e.target.value))}>{notas}</select>
        </div>
        <div className="campo">
          <label htmlFor={`geral-${agendamentoId}`}>Nota geral (1 a 5)</label>
          <select id={`geral-${agendamentoId}`} value={geral} onChange={(e) => setGeral(Number(e.target.value))}>{notas}</select>
        </div>
        <div className="campo" style={{ flex: "1 1 220px" }}>
          <label htmlFor={`comentario-${agendamentoId}`}>Comentário <span className="ajuda">(opcional)</span></label>
          <input id={`comentario-${agendamentoId}`} type="text" maxLength={500} value={comentario}
                 onChange={(e) => setComentario(e.target.value)} />
        </div>
      </div>
      <Erro erro={erro} />
      <div className="linha">
        <button className="botao menor principal">Salvar avaliação</button>
        <button type="button" className="botao menor discreto" onClick={aoCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

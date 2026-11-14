import { useEffect, useState } from "react";
import { api, CATEGORIAS, formato } from "../api.js";
import { Cabecalho, Clima, Erro, Nivel } from "../componentes/Comuns.jsx";
import PerfilForm, { resumirPerfil } from "../componentes/PerfilForm.jsx";

const PASSOS = ["Identificação", "Preferências", "Serviço", "Dia e horário", "Confirmação"];
const INTENSIDADE = ["", "baixo", "médio", "alto"];

export default function Agendar() {
  const [passo, setPasso] = useState(0);
  const [cliente, setCliente] = useState(null);
  const [servico, setServico] = useState(null);
  const [profissionalId, setProfissionalId] = useState("");
  const [confirmado, setConfirmado] = useState(null);

  function recomecar() {
    setPasso(0);
    setCliente(null);
    setServico(null);
    setProfissionalId("");
    setConfirmado(null);
  }

  return (
    <>
      <Cabecalho titulo="Agendar um horário">
        Cinco passos curtos. Você pode voltar e mudar qualquer resposta.
      </Cabecalho>

      <ol className="passos" aria-label="Etapas do agendamento">
        {PASSOS.map((nome, i) => (
          <li key={nome} className={i === passo ? "atual" : i < passo ? "feito" : ""}
              aria-current={i === passo ? "step" : undefined}>
            <b>{i + 1}</b> {nome}
          </li>
        ))}
      </ol>

      {passo === 0 && (
        <Identificacao aoIdentificar={(c) => { setCliente(c); setPasso(1); }} />
      )}
      {passo === 1 && (
        <Preferencias
          cliente={cliente}
          aoSalvar={(perfil) => { setCliente({ ...cliente, perfil }); setPasso(2); }}
          aoPular={() => setPasso(2)}
          aoVoltar={() => setPasso(0)}
        />
      )}
      {passo === 2 && (
        <EscolherServico
          servico={servico}
          profissionalId={profissionalId}
          aoEscolher={(s, p) => { setServico(s); setProfissionalId(p); setPasso(3); }}
          aoVoltar={() => setPasso(1)}
        />
      )}
      {passo === 3 && (
        <EscolherHorario
          cliente={cliente}
          servico={servico}
          profissionalId={profissionalId}
          aoConfirmar={(resultado) => { setConfirmado(resultado); setPasso(4); }}
          aoVoltar={() => setPasso(2)}
        />
      )}
      {passo === 4 && (
        <Confirmacao cliente={cliente} servico={servico} agendamento={confirmado} aoRecomecar={recomecar} />
      )}
    </>
  );
}

/* --- 1. Identificação ------------------------------------------------------ */
function Identificacao({ aoIdentificar }) {
  const [telefone, setTelefone] = useState("");
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState(null);
  const [buscando, setBuscando] = useState(false);

  async function buscar(evento) {
    evento.preventDefault();
    setErro(null);
    setBuscando(true);
    try {
      aoIdentificar(await api.clientePorTelefone(telefone));
    } catch (e) {
      if (e.status === 404) setNovo(true);
      else setErro(e);
    } finally {
      setBuscando(false);
    }
  }

  if (novo) return <Cadastro telefone={telefone} aoCadastrar={aoIdentificar} aoVoltar={() => setNovo(false)} />;

  return (
    <form className="cartao pilha" onSubmit={buscar}>
      <h2>Qual é o seu telefone?</h2>
      <div className="campo" style={{ maxWidth: 320 }}>
        <label htmlFor="telefone">
          Telefone com DDD <span className="ajuda">Usamos só para encontrar o seu cadastro.</span>
        </label>
        <input id="telefone" type="tel" inputMode="tel" autoComplete="tel" required
               placeholder="(11) 99999-0000" value={telefone}
               onChange={(e) => setTelefone(e.target.value)} />
      </div>
      <Erro erro={erro} />
      <div className="linha">
        <button className="botao principal" disabled={buscando}>
          {buscando ? "Procurando…" : "Continuar"}
        </button>
      </div>
    </form>
  );
}

function Cadastro({ telefone, aoCadastrar, aoVoltar }) {
  const [dados, setDados] = useState({
    nome: "", telefone, email: "", cep: "", logradouro: "", bairro: "", cidade: "", uf: "",
  });
  const [avisoCep, setAvisoCep] = useState(null);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const mudar = (chave) => (e) => setDados((d) => ({ ...d, [chave]: e.target.value }));

  // CEP completo -> a API ViaCEP preenche o endereço
  async function aoDigitarCep(evento) {
    const cep = evento.target.value;
    setDados((d) => ({ ...d, cep }));
    setAvisoCep(null);
    if (cep.replace(/\D/g, "").length !== 8) return;
    try {
      const endereco = await api.cep(cep);
      setDados((d) => ({ ...d, ...endereco }));
      setAvisoCep("Endereço preenchido pelo CEP. Confira se está certo.");
    } catch (e) {
      setAvisoCep(e.message);
    }
  }

  async function enviar(evento) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const limpos = Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, (v ?? "").trim() || null]));
      aoCadastrar(await api.cadastrarCliente(limpos));
    } catch (e) {
      setErro(e);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cartao pilha" onSubmit={enviar}>
      <div>
        <h2>Boas-vindas! Vamos fazer seu cadastro</h2>
        <p className="suave">Não encontramos este telefone. Leva menos de um minuto.</p>
      </div>
      <div className="grade-2">
        <div className="campo">
          <label htmlFor="nome">Nome</label>
          <input id="nome" type="text" required minLength={2} autoComplete="name"
                 value={dados.nome} onChange={mudar("nome")} />
        </div>
        <div className="campo">
          <label htmlFor="tel-cadastro">Telefone com DDD</label>
          <input id="tel-cadastro" type="tel" required value={dados.telefone} onChange={mudar("telefone")} />
        </div>
        <div className="campo">
          <label htmlFor="email">E-mail <span className="ajuda">(opcional)</span></label>
          <input id="email" type="email" autoComplete="email" value={dados.email} onChange={mudar("email")} />
        </div>
        <div className="campo">
          <label htmlFor="cep">CEP <span className="ajuda">(opcional, preenche o endereço)</span></label>
          <input id="cep" type="text" inputMode="numeric" placeholder="00000-000" maxLength={9}
                 value={dados.cep} onChange={aoDigitarCep} aria-describedby="aviso-cep" />
          <span id="aviso-cep" className="ajuda" role="status">{avisoCep}</span>
        </div>
        <div className="campo">
          <label htmlFor="logradouro">Rua</label>
          <input id="logradouro" type="text" value={dados.logradouro ?? ""} onChange={mudar("logradouro")} />
        </div>
        <div className="campo">
          <label htmlFor="bairro">Bairro</label>
          <input id="bairro" type="text" value={dados.bairro ?? ""} onChange={mudar("bairro")} />
        </div>
        <div className="campo">
          <label htmlFor="cidade">Cidade</label>
          <input id="cidade" type="text" value={dados.cidade ?? ""} onChange={mudar("cidade")} />
        </div>
        <div className="campo">
          <label htmlFor="uf">Estado</label>
          <input id="uf" type="text" maxLength={2} value={dados.uf ?? ""} onChange={mudar("uf")} />
        </div>
      </div>
      <Erro erro={erro} />
      <div className="linha">
        <button className="botao principal" disabled={enviando}>
          {enviando ? "Salvando…" : "Cadastrar e continuar"}
        </button>
        <button type="button" className="botao discreto" onClick={aoVoltar}>Usar outro telefone</button>
      </div>
    </form>
  );
}

/* --- 2. Preferências de atendimento ---------------------------------------- */
function Preferencias({ cliente, aoSalvar, aoPular, aoVoltar }) {
  const [editando, setEditando] = useState(!cliente.perfil);
  const [erro, setErro] = useState(null);
  const primeiroNome = cliente.nome.split(" ")[0];

  async function salvar(perfil) {
    setErro(null);
    try {
      const resposta = await api.salvarPerfil(cliente.id, perfil);
      aoSalvar(resposta.perfil);
    } catch (e) {
      setErro(e);
    }
  }

  if (!editando) {
    return (
      <div className="cartao pilha">
        <h2>Olá, {primeiroNome}! Suas preferências continuam assim?</h2>
        <ul className="orientacoes">
          {resumirPerfil(cliente.perfil).map((frase) => <li key={frase}>{frase}</li>)}
        </ul>
        <div className="linha">
          <button className="botao principal" onClick={aoPular}>Sim, continuar</button>
          <button className="botao" onClick={() => setEditando(true)}>Mudar preferências</button>
          <button className="botao discreto" onClick={aoVoltar}>Voltar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="cartao pilha">
      <div>
        <h2>{primeiroNome}, como podemos deixar seu atendimento mais confortável?</h2>
        <p className="suave">
          Esta etapa é opcional. Não pedimos diagnóstico nem explicação: só o que ajuda no seu
          atendimento. Com isso sugerimos horários mais calmos e a equipe se prepara antes de você chegar.
        </p>
      </div>
      <Erro erro={erro} />
      <PerfilForm inicial={cliente.perfil} aoSalvar={salvar} textoSalvar="Salvar e continuar">
        <button type="button" className="botao" onClick={aoPular}>Pular esta etapa</button>
        <button type="button" className="botao discreto" onClick={aoVoltar}>Voltar</button>
      </PerfilForm>
    </div>
  );
}

/* --- 3. Serviço ------------------------------------------------------------ */
function EscolherServico({ servico, profissionalId, aoEscolher, aoVoltar }) {
  const [servicos, setServicos] = useState([]);
  const [profissionais, setProfissionais] = useState([]);
  const [escolhido, setEscolhido] = useState(servico);
  const [profissional, setProfissional] = useState(profissionalId);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    Promise.all([api.servicos(), api.profissionais()])
      .then(([s, p]) => { setServicos(s); setProfissionais(p); })
      .catch(setErro);
  }, []);

  const funcaoDaCategoria = { cabelo: "cabeleireira", unhas: "manicure", maquiagem: "maquiadora" };
  const equipe = escolhido
    ? profissionais.filter((p) => p.funcao === funcaoDaCategoria[escolhido.categoria])
    : [];

  return (
    <div className="pilha">
      <Erro erro={erro} />
      {Object.entries(CATEGORIAS).map(([categoria, titulo]) => (
        <section className="cartao pilha" key={categoria}>
          <h2>{titulo}</h2>
          <div className="opcoes">
            {servicos.filter((s) => s.categoria === categoria).map((s) => (
              <button key={s.id} type="button" className="opcao"
                      aria-pressed={escolhido?.id === s.id}
                      onClick={() => { setEscolhido(s); setProfissional(""); }}>
                <strong>{s.nome}</strong>
                <span className="suave pequeno">
                  {formato.duracao(s.duracao_min)} · {formato.dinheiro(s.preco)}
                </span>
                <span className="linha" style={{ gap: 6 }}>
                  {s.nivel_ruido >= 2 && <span className="selo">Barulho {INTENSIDADE[s.nivel_ruido]}</span>}
                  {s.nivel_cheiro >= 2 && <span className="selo">Cheiro {INTENSIDADE[s.nivel_cheiro]}</span>}
                  {s.contato_fisico >= 3 && <span className="selo">Toque no rosto</span>}
                  {s.nivel_ruido < 2 && s.nivel_cheiro < 2 && s.contato_fisico < 3 && (
                    <span className="selo">Silencioso e sem cheiro forte</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {escolhido && (
        <section className="cartao pilha">
          <div className="campo" style={{ maxWidth: 420 }}>
            <label htmlFor="profissional">
              Com quem? <span className="ajuda">Sem preferência mostra mais horários.</span>
            </label>
            <select id="profissional" value={profissional} onChange={(e) => setProfissional(e.target.value)}>
              <option value="">Sem preferência</option>
              {equipe.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}{p.capacitacao_neuro ? " (capacitada em atendimento inclusivo)" : ""}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      <div className="linha">
        <button className="botao principal" disabled={!escolhido}
                onClick={() => aoEscolher(escolhido, profissional)}>
          Ver dias e horários
        </button>
        <button className="botao discreto" onClick={aoVoltar}>Voltar</button>
      </div>
    </div>
  );
}

/* --- 4. Dia e horário ------------------------------------------------------ */
function EscolherHorario({ cliente, servico, profissionalId, aoConfirmar, aoVoltar }) {
  const [resumo, setResumo] = useState(null);
  const [dia, setDia] = useState(null);
  const [horarios, setHorarios] = useState(null);
  const [horario, setHorario] = useState(null);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const consulta = { servico_id: servico.id, cliente_id: cliente.id, profissional_id: profissionalId };

  useEffect(() => {
    api.dias(consulta).then(setResumo).catch(setErro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servico.id, cliente.id, profissionalId]);

  async function escolherDia(d) {
    setDia(d);
    setHorario(null);
    setHorarios(null);
    setErro(null);
    try {
      setHorarios(await api.horarios({ ...consulta, data: d.data }));
    } catch (e) {
      setErro(e);
    }
  }

  async function confirmar() {
    setErro(null);
    setEnviando(true);
    try {
      aoConfirmar(await api.agendar({
        cliente_id: cliente.id,
        servico_id: servico.id,
        profissional_id: horario.profissional_id,
        inicio: horario.inicio,
      }));
    } catch (e) {
      setErro(e);
      if (e.status === 409) escolherDia(dia);   // horário ocupado: recarrega a lista
    } finally {
      setEnviando(false);
    }
  }

  if (!resumo) return <><Erro erro={erro} /><p className="vazio">Buscando os dias disponíveis…</p></>;

  return (
    <div className="pilha">
      <section className="cartao pilha">
        <div>
          <h2>Escolha o dia</h2>
          <p className="suave">
            {servico.nome}, {formato.duracao(resumo.duracao_min)}.
            {resumo.primeira_visita &&
              ` Como é sua primeira visita, reservamos ${resumo.acolhimento_min} minutos a mais para te receber com calma.`}
          </p>
        </div>
        <div className="dias">
          {resumo.dias.map((d) => (
            <button key={d.data} type="button" className="opcao"
                    disabled={!d.aberto || d.horarios_livres === 0}
                    aria-pressed={dia?.data === d.data} onClick={() => escolherDia(d)}>
              <strong>{d.dia_semana}, {formato.dataCurta(d.data)}</strong>
              <Clima clima={d.clima} />
              {d.aberto && d.horarios_livres > 0 && (
                <span><Nivel nivel={d.melhor_nivel} /></span>
              )}
              <span className="suave pequeno">
                {!d.aberto ? d.motivo_fechado
                  : d.horarios_livres === 0 ? "Sem horários livres"
                  : d.vespera_feriado ? "Véspera de feriado"
                  : d.horarios_livres === 1 ? "1 horário"
                  : `${d.horarios_livres} horários`}
              </span>
            </button>
          ))}
        </div>
        <p className="suave pequeno">
          O selo mostra o horário mais tranquilo de cada dia. Clima: Open-Meteo. Feriados: BrasilAPI.
        </p>
      </section>

      {dia && (
        <section className="cartao pilha" aria-live="polite">
          <div>
            <h2>Horários de {formato.dataLonga(dia.data)}</h2>
            <p className="suave">
              O índice vai de 0 a 100. Quanto maior, mais calmo o salão deve estar.
            </p>
          </div>
          {!horarios ? <p className="vazio">Calculando os horários…</p> : (
            <div className="horarios">
              {horarios.map((h) => (
                <button key={h.inicio} type="button" className="opcao"
                        aria-pressed={horario?.inicio === h.inicio} onClick={() => setHorario(h)}>
                  <span className="linha entre">
                    <strong className="numeros">{h.hora}</strong>
                    <Nivel nivel={h.nivel} indice={h.indice} />
                  </span>
                  <span className="suave pequeno">com {h.profissional_nome}</span>
                  {h.recomendado && <span><span className="selo destaque">Recomendado para você</span></span>}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {horario && (
        <section className="cartao pilha" aria-live="polite">
          <h2>Seu horário</h2>
          <dl className="resumo">
            <dt>Quando</dt>
            <dd>{formato.dataLonga(horario.inicio)}, das {horario.hora} às {formato.hora(horario.fim)}</dd>
            <dt>Serviço</dt>
            <dd>{servico.nome} ({formato.dinheiro(servico.preco)})</dd>
            <dt>Com</dt>
            <dd>
              {horario.profissional_nome}
              {horario.capacitacao_neuro && <span className="suave" style={{ fontWeight: 400 }}> · capacitada em atendimento inclusivo</span>}
            </dd>
            <dt>Ambiente</dt>
            <dd><Nivel nivel={horario.nivel} indice={horario.indice} /></dd>
          </dl>
          <div>
            <h3>Por que este índice?</h3>
            <ul className="motivos">
              {horario.motivos.map((m) => <li key={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</li>)}
            </ul>
          </div>
        </section>
      )}

      <Erro erro={erro} />
      <div className="linha">
        <button className="botao principal" disabled={!horario || enviando} onClick={confirmar}>
          {enviando ? "Confirmando…" : "Confirmar agendamento"}
        </button>
        <button className="botao discreto" onClick={aoVoltar}>Voltar</button>
      </div>
    </div>
  );
}

/* --- 5. Confirmação -------------------------------------------------------- */
function Confirmacao({ cliente, servico, agendamento, aoRecomecar }) {
  const [roteiro, setRoteiro] = useState(null);

  useEffect(() => {
    api.roteiro(servico.id).then(setRoteiro).catch(() => setRoteiro(null));
  }, [servico.id]);

  return (
    <div className="pilha">
      <section className="cartao pilha">
        <h2>Agendamento confirmado, {cliente.nome.split(" ")[0]}</h2>
        <dl className="resumo">
          <dt>Quando</dt>
          <dd>{formato.dataLonga(agendamento.inicio)}, das {agendamento.hora} às {formato.hora(agendamento.fim)}</dd>
          <dt>Serviço</dt>
          <dd>{servico.nome}</dd>
          <dt>Com</dt>
          <dd>{agendamento.profissional_nome}</dd>
          <dt>Ambiente</dt>
          <dd><Nivel nivel={agendamento.nivel} indice={agendamento.indice} /></dd>
        </dl>
        {cliente.perfil && (
          <p className="aviso">A equipe já recebeu suas preferências e vai se preparar antes de você chegar.</p>
        )}
      </section>

      {roteiro && (
        <section className="cartao pilha">
          <div>
            <h2>Como vai ser, passo a passo</h2>
            <p className="suave">Para você saber o que esperar. Pode pedir uma pausa em qualquer etapa.</p>
          </div>
          <ol className="roteiro">
            {agendamento.primeira_visita && (
              <li>
                <div>
                  <strong>Acolhimento</strong> <span className="suave pequeno">· 15 min</span>
                  <p>Como é sua primeira visita, mostramos o espaço e você conhece quem vai te atender.</p>
                </div>
              </li>
            )}
            {roteiro.etapas.map((etapa, i) => (
              <li key={i}>
                <div>
                  <strong>{etapa.titulo}</strong> <span className="suave pequeno">· {etapa.minutos} min</span>
                  <p>{etapa.descricao}</p>
                  {etapa.aviso_sensorial && <p className="sensorial">{etapa.aviso_sensorial}.</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="linha">
        <button className="botao" onClick={aoRecomecar}>Fazer outro agendamento</button>
      </div>
    </div>
  );
}

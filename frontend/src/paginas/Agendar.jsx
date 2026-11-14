import { useEffect, useState } from "react";
import { api, CATEGORIAS, formato } from "../api.js";
import { CampoIcone, Cabecalho, Clima, Erro, Nivel } from "../componentes/Comuns.jsx";
import { Ic, IconeServico } from "../componentes/Icones.jsx";
import PerfilForm, { resumirPerfil } from "../componentes/PerfilForm.jsx";

const PASSOS = ["Identificação", "Preferências", "Serviço", "Dia e horário", "Confirmação"];
const INTENSIDADE = ["", "baixo", "médio", "alto"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Tela de entrada dividida: arte do salão à esquerda, cartão branco à direita. */
function Entrada({ children }) {
  return (
    <div className="entrada">
      <div className="entrada-arte" aria-hidden="true">
        <svg className="entrada-linhas" viewBox="0 0 400 520" preserveAspectRatio="xMidYMid slice">
          <path d="M-20 90c60-40 90 20 70 70s-70 60-40 120 110 40 120 100-40 90-20 160" />
          <path d="M-40 120c70-50 110 20 85 75s-80 70-45 125 125 45 130 110-45 95-25 150" />
          <path d="M300 560c-30-60 20-90 60-110s60-80 20-120-30-90 40-110" />
          <path d="M270 560c-35-70 15-105 60-128s70-90 25-135-35-100 45-125" />
          <path d="M240 560c-40-80 10-120 60-145s80-100 30-150-40-110 50-140" />
        </svg>
        <span className="entrada-mais">+</span>
        <span className="entrada-circulo" />
        <span className="entrada-pontos" />
        <div className="entrada-texto">
          <p className="entrada-marca">fenty beauty</p>
          <p className="entrada-frase">Beleza no seu ritmo. Conte do que você precisa e preparamos o salão antes de você chegar.</p>
        </div>
      </div>
      <div className="entrada-cartao">{children}</div>
    </div>
  );
}

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
    <Entrada>
      <form className="pilha" onSubmit={buscar}>
        <div>
          <h2 className="titulo-entrada">Entrar</h2>
          <p className="suave">Digite seu telefone para encontrarmos o seu cadastro.</p>
        </div>
        <CampoIcone id="telefone" rotulo="Telefone com DDD" icone="telefone" type="tel" inputMode="tel"
                    autoComplete="tel" required placeholder="(11) 99999-0000" value={telefone}
                    onChange={(e) => setTelefone(e.target.value)} />
        <Erro erro={erro} />
        <button className="botao principal largo" disabled={buscando}>
          {buscando ? "Procurando…" : "Continuar"}
        </button>
        <p className="pequeno suave centro">
          Primeira vez aqui?{" "}
          <button type="button" className="link" onClick={() => setNovo(true)}>Criar cadastro</button>
        </p>
      </form>
    </Entrada>
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
    <Entrada>
      <form className="pilha" onSubmit={enviar}>
        <div>
          <h2 className="titulo-entrada">Criar cadastro</h2>
          <p className="suave">
            {telefone ? "Não encontramos este telefone. " : ""}Leva menos de um minuto.
          </p>
        </div>
        <CampoIcone id="nome" rotulo="Nome completo" icone="pessoa" required minLength={2} autoComplete="name"
                    value={dados.nome} onChange={mudar("nome")} />
        <CampoIcone id="tel-cadastro" rotulo="Telefone com DDD" icone="telefone" type="tel" inputMode="tel"
                    required value={dados.telefone} onChange={mudar("telefone")} />
        <CampoIcone id="email" rotulo="E-mail" ajuda="(opcional)" icone="email" type="email" autoComplete="email"
                    value={dados.email} onChange={mudar("email")} />
        <CampoIcone id="cep" rotulo="CEP" ajuda="(opcional, preenche o endereço)" icone="local" inputMode="numeric"
                    placeholder="00000-000" maxLength={9} value={dados.cep} onChange={aoDigitarCep}
                    aria-describedby="aviso-cep"
                    depois={<span id="aviso-cep" className="ajuda" role="status">{avisoCep}</span>} />
        <CampoIcone id="logradouro" rotulo="Rua" icone="casa" value={dados.logradouro ?? ""}
                    onChange={mudar("logradouro")} />
        <div className="grade-3">
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
        <button className="botao principal largo" disabled={enviando}>
          {enviando ? "Salvando…" : "Cadastrar e continuar"}
        </button>
        <p className="pequeno suave centro">
          Já tem cadastro?{" "}
          <button type="button" className="link" onClick={aoVoltar}>Entrar com outro telefone</button>
        </p>
      </form>
    </Entrada>
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
  const [categoria, setCategoria] = useState(servico?.categoria ?? "cabelo");
  const [profissional, setProfissional] = useState(profissionalId);
  const [erro, setErro] = useState(null);

  function trocarCategoria(nova) {
    setCategoria(nova);
    if (escolhido?.categoria !== nova) {
      setEscolhido(null);
      setProfissional("");
    }
  }

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
      <section className="cartao pilha">
        <h2>Nossos serviços</h2>
        <div className="categorias" role="group" aria-label="Tipo de serviço">
          {Object.entries(CATEGORIAS).map(([chave, titulo]) => (
            <button key={chave} type="button" className="categoria" aria-pressed={categoria === chave}
                    onClick={() => trocarCategoria(chave)}>
              <IconeServico categoria={chave} />
              <span>{titulo}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="cartao pilha">
        <h2>{CATEGORIAS[categoria]}</h2>
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
            <button key={d.data} type="button" className="opcao dia"
                    disabled={!d.aberto || d.horarios_livres === 0}
                    aria-pressed={dia?.data === d.data} onClick={() => escolherDia(d)}>
              <span className="dia-data">
                <span className="dia-semana">{d.dia_semana}</span>
                <span className="dia-numero numeros">{Number(d.data.slice(8, 10))}</span>
                <span className="dia-mes">{MESES[Number(d.data.slice(5, 7)) - 1]}</span>
              </span>
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
      <section className="cartao pilha confirmado">
        <h2>Até breve, {cliente.nome.split(" ")[0]}!</h2>
        <dl className="resumo-grade">
          <div><dt>Serviço</dt><dd>{servico.nome}</dd></div>
          <div><dt>Profissional</dt><dd>{agendamento.profissional_nome}</dd></div>
          <div><dt>Data</dt><dd>{formato.dataLonga(agendamento.inicio)}</dd></div>
          <div><dt>Horário</dt><dd className="numeros">{agendamento.hora} às {formato.hora(agendamento.fim)}</dd></div>
          <div><dt>Ambiente</dt><dd><Nivel nivel={agendamento.nivel} indice={agendamento.indice} /></dd></div>
        </dl>
        <p className="selo-confirmado" role="status">
          <Ic nome="ok" tamanho={20} /> Agendamento confirmado
        </p>
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

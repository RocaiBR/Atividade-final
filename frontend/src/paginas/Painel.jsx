import { useCallback, useEffect, useRef, useState } from "react";
import { api, CATEGORIAS, formato } from "../api.js";
import { Cabecalho, Erro } from "../componentes/Comuns.jsx";
import { Barras, ColunasEmpilhadas, Legenda, MapaDeCalor, TabelaDados } from "../componentes/Graficos.jsx";
import { Ic } from "../componentes/Icones.jsx";

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const NIVEIS = ["Calmo", "Moderado", "Movimentado"];
const SENSIVEL = { nome: "Com sensibilidade sensorial", cor: "var(--serie-1)" };
const DEMAIS = { nome: "Demais clientes", cor: "var(--serie-2)" };
const NOVOS = { nome: "Primeira visita", cor: "var(--serie-2)" };
const RECORRENTES = { nome: "Já conheciam o salão", cor: "var(--serie-1)" };

export default function Painel() {
  const [painel, setPainel] = useState(null);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(() => {
    api.painel().then(setPainel).catch(setErro);
  }, []);
  useEffect(carregar, [carregar]);

  return (
    <>
      <Cabecalho titulo="Painel da gerente">
        Agenda (SQLite), preferências e avaliações (MongoDB) e clima (Open-Meteo), cruzados pelo KNIME e consultados no DuckDB.
      </Cabecalho>
      <div className="pilha">
        <Erro erro={erro} />
        <Atualizacao ultimaCarga={painel?.ultima_carga} aoTerminar={carregar} />
        {painel && !painel.carregado && (
          <p className="vazio">O painel ainda não tem dados. Use o botão acima para fazer a primeira carga.</p>
        )}
        {painel?.carregado && <Conteudo painel={painel} />}
      </div>
    </>
  );
}

/* --- Atualização dos dados (staging -> KNIME -> DuckDB) --------------------- */
function Atualizacao({ ultimaCarga, aoTerminar }) {
  const [estado, setEstado] = useState(null);
  const [erro, setErro] = useState(null);
  const relogio = useRef(null);

  const acompanhar = useCallback(() => {
    clearInterval(relogio.current);
    relogio.current = setInterval(async () => {
      try {
        const atual = await api.statusEtl();
        setEstado(atual);
        if (atual.situacao !== "executando") {
          clearInterval(relogio.current);
          if (atual.situacao === "ok") aoTerminar();
        }
      } catch (e) {
        clearInterval(relogio.current);
        setErro(e);
      }
    }, 1500);
  }, [aoTerminar]);

  useEffect(() => {
    api.statusEtl().then((atual) => {
      setEstado(atual);
      if (atual.situacao === "executando") acompanhar();
    }).catch(() => {});
    return () => clearInterval(relogio.current);
  }, [acompanhar]);

  async function executar(modo) {
    setErro(null);
    try {
      setEstado(await api.executarEtl(modo));
      acompanhar();
    } catch (e) {
      setErro(e);
    }
  }

  const rodando = estado?.situacao === "executando";
  return (
    <section className="cartao pilha">
      <div className="linha entre">
        <div>
          <h2>Atualização dos dados</h2>
          <p className="suave pequeno">
            {ultimaCarga
              ? `Última carga: ${new Date(ultimaCarga.executado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · ${ultimaCarga.linhas} atendimentos · origem: ${ultimaCarga.origem}`
              : "Nenhuma carga feita ainda."}
          </p>
        </div>
        <div className="linha">
          <button className="botao principal" disabled={rodando} onClick={() => executar("knime")}>
            {rodando ? "Atualizando…" : "Atualizar com o KNIME"}
          </button>
        </div>
      </div>

      {rodando && <p className="aviso" role="status">{estado.etapa}…</p>}
      {estado?.situacao === "ok" && <p className="aviso" role="status">{estado.mensagem}</p>}
      {estado?.situacao === "erro" && <p className="aviso erro" role="alert">{estado.mensagem}</p>}
      {estado?.situacao === "aguardando_knime" && (
        <div className="aviso pilha" role="status" style={{ gap: 8 }}>
          <p>{estado.mensagem}</p>
          <div className="linha">
            <button className="botao menor principal" onClick={() => executar("carregar")}>
              Carregar resultado do KNIME
            </button>
            <button className="botao menor" onClick={() => executar("reserva")}>
              Atualizar sem o KNIME (reserva em Python)
            </button>
          </div>
        </div>
      )}
      <Erro erro={erro} />
    </section>
  );
}

/* --- Indicadores e gráficos ------------------------------------------------- */
function Conteudo({ painel }) {
  const { resumo } = painel;
  return (
    <>
      <p className="suave pequeno">
        Período analisado: {formato.dataCurta(resumo.inicio)} a {formato.dataCurta(resumo.fim)}.
        Os clientes e atendimentos são fictícios (dados de demonstração); o clima é real.
      </p>
      <div className="indicadores">
        <Indicador icone="calendario" rotulo="Atendimentos concluídos" valor={resumo.atendimentos.toLocaleString("pt-BR")} />
        <Indicador icone="alta" rotulo="Receita" valor={formato.dinheiro(resumo.receita)} />
        <Indicador icone="pessoaX" rotulo="Faltas" valor={formato.porcento(resumo.taxa_faltas)} nota="dos horários marcados" />
        <Indicador icone="pessoaMais" rotulo="Primeiras visitas" valor={formato.porcento(resumo.pct_primeira_visita)} nota="dos atendimentos" />
        <Indicador icone="coracao" rotulo="Conforto médio" valor={resumo.conforto_medio ? formato.nota(resumo.conforto_medio) : "—"} nota="de 1 a 5" />
        <Indicador icone="pessoas" rotulo="Clientes com preferências" valor={`${resumo.clientes_com_perfil} de ${resumo.clientes}`} nota="atendidos no período" />
      </div>
      <div className="graficos">
        <Conforto dados={painel.conforto} />
        <Movimento dados={painel.movimento} />
        <Faltas dados={painel.faltas} />
        <Semanas dados={painel.semanas} />
        <Categorias dados={painel.categorias} />
      </div>
    </>
  );
}

function Indicador({ icone, rotulo, valor, nota }) {
  return (
    <div className="indicador">
      {icone && <span className="indicador-icone"><Ic nome={icone} tamanho={26} traco={1.5} /></span>}
      <div>
        <div className="rotulo">{rotulo}</div>
        <div className="valor">{valor}</div>
        {nota && <div className="nota">{nota}</div>}
      </div>
    </div>
  );
}

function Conforto({ dados }) {
  const achar = (nivel, publico) => dados.find((d) => d.nivel === nivel && d.publico === publico);
  const grupos = NIVEIS.map((nivel) => ({
    nome: `Horário ${nivel.toLowerCase()}`,
    itens: [SENSIVEL, DEMAIS].map((serie) => {
      const d = achar(nivel, serie.nome);
      return d && { serie: serie.nome, valor: d.nota, cor: serie.cor, detalhe: `${d.respostas} avaliações` };
    }).filter(Boolean),
  })).filter((g) => g.itens.length);

  const calmo = achar("Calmo", SENSIVEL.nome);
  const cheio = achar("Movimentado", SENSIVEL.nome);
  return (
    <section className="cartao grafico">
      <h2>Nota de conforto por tipo de horário</h2>
      {calmo && cheio && (
        <p className="leitura">
          Para quem tem sensibilidade sensorial, a nota vai de {formato.nota(cheio.nota)} em horário
          movimentado para {formato.nota(calmo.nota)} em horário calmo. É o que justifica recomendar
          os horários tranquilos.
        </p>
      )}
      <Legenda series={[SENSIVEL, DEMAIS]} />
      <Barras grupos={grupos} maximo={5} formatar={formato.nota} />
      <TabelaDados
        colunas={["Horário", "Público", "Nota média", "Avaliações"]}
        linhas={dados.map((d) => [d.nivel, d.publico, formato.nota(d.nota), d.respostas])}
      />
    </section>
  );
}

function Movimento({ dados }) {
  const horas = [...new Set(dados.map((d) => d.hora))].sort((a, b) => a - b);
  const dias = [...new Set(dados.map((d) => d.dia_semana))].sort((a, b) => a - b);
  const valor = (dia, hora) => dados.find((d) => d.dia_semana === dia && d.hora === hora)?.media;
  const pico = dados.reduce((maior, d) => (d.media > (maior?.media ?? 0) ? d : maior), null);
  return (
    <section className="cartao grafico">
      <h2>Movimento por dia e hora</h2>
      <p className="leitura">
        Média de atendimentos que começam em cada hora.
        {pico && ` O pico é ${DIAS[pico.dia_semana].toLowerCase()} às ${pico.hora}h.`} Este histórico
        entra no índice de tranquilidade dos próximos horários.
      </p>
      <MapaDeCalor
        linhas={dias.map((d) => ({ chave: d, nome: DIAS[d] }))}
        colunas={horas}
        valor={valor}
        descrever={(dia, hora, v) => `${dia}, ${hora}h: ${v ? formato.nota(v) : "nenhum"} atendimento(s) em média`}
      />
      <TabelaDados
        colunas={["Dia", ...horas.map((h) => `${h}h`)]}
        linhas={dias.map((d) => [DIAS[d], ...horas.map((h) => (valor(d, h) ? formato.nota(valor(d, h)) : "—"))])}
      />
    </section>
  );
}

function Faltas({ dados }) {
  const grupo = (nome) => dados.filter((d) => d.grupo === nome);
  const taxa = (rotulo) => dados.find((d) => d.rotulo === rotulo)?.taxa;
  const montar = (itens) => itens.map((d) => ({
    nome: d.rotulo,
    itens: [{ valor: d.taxa, detalhe: `${d.total} horários marcados` }],
  }));
  const teto = Math.max(...dados.map((d) => d.taxa), 0) * 1.15;
  return (
    <section className="cartao grafico">
      <h2>Quem falta mais</h2>
      {taxa("Primeira visita") !== undefined && taxa("Dia de chuva") !== undefined && (
        <p className="leitura">
          Clientes de primeira visita faltam em {formato.porcento(taxa("Primeira visita"))} dos horários
          e, em dia de chuva, a falta chega a {formato.porcento(taxa("Dia de chuva"))}. Vale confirmar
          esses horários na véspera.
        </p>
      )}
      <h3>Por tipo de cliente</h3>
      <Barras grupos={montar(grupo("Cliente"))} maximo={teto} formatar={formato.porcento} />
      <h3>Por clima do dia</h3>
      <Barras grupos={montar(grupo("Clima"))} maximo={teto} formatar={formato.porcento} />
      <TabelaDados
        colunas={["Grupo", "Horários marcados", "Faltas"]}
        linhas={dados.map((d) => [d.rotulo, d.total, formato.porcento(d.taxa)])}
      />
    </section>
  );
}

function Semanas({ dados }) {
  const totalNovos = dados.reduce((soma, d) => soma + d.novos, 0);
  return (
    <section className="cartao grafico">
      <h2>Atendimentos por semana</h2>
      <p className="leitura">
        {totalNovos} clientes fizeram a primeira visita no período.
      </p>
      <Legenda series={[NOVOS, RECORRENTES]} />
      <ColunasEmpilhadas
        dados={dados.map((d) => ({
          rotulo: formato.dataCurta(d.semana),
          partes: [
            { ...NOVOS, valor: d.novos },
            { ...RECORRENTES, valor: d.recorrentes },
          ],
        }))}
      />
      <TabelaDados
        colunas={["Semana de", "Primeira visita", "Já conheciam"]}
        linhas={dados.map((d) => [formato.dataCurta(d.semana), d.novos, d.recorrentes])}
      />
    </section>
  );
}

function Categorias({ dados }) {
  return (
    <section className="cartao grafico">
      <h2>Receita por categoria</h2>
      <Barras
        grupos={dados.map((d) => ({
          nome: CATEGORIAS[d.categoria] ?? d.categoria,
          itens: [{ valor: d.receita, detalhe: `${d.atendimentos} atendimentos` }],
        }))}
        formatar={formato.dinheiro}
      />
      <TabelaDados
        colunas={["Categoria", "Atendimentos", "Receita"]}
        linhas={dados.map((d) => [CATEGORIAS[d.categoria] ?? d.categoria, d.atendimentos, formato.dinheiro(d.receita)])}
      />
    </section>
  );
}

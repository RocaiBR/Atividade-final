import { useEffect, useState } from "react";
import { api, formato } from "../api.js";
import { CampoIcone, Cabecalho, Erro, Nivel } from "../componentes/Comuns.jsx";
import PerfilForm, { resumirPerfil } from "../componentes/PerfilForm.jsx";

const STATUS = { agendado: "Agendado", concluido: "Concluído", cancelado: "Cancelado", faltou: "Faltou" };
const nivelDe = (indice) => (indice >= 75 ? "calmo" : indice >= 50 ? "moderado" : "movimentado");

export default function Clientes() {
  const [busca, setBusca] = useState("");
  const [clientes, setClientes] = useState(null);
  const [aberto, setAberto] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    const espera = setTimeout(() => {
      api.clientes(busca).then(setClientes).catch(setErro);
    }, 250);
    return () => clearTimeout(espera);
  }, [busca]);

  if (aberto) return <Ficha clienteId={aberto} aoVoltar={() => setAberto(null)} />;

  return (
    <>
      <Cabecalho titulo="Clientes">
        Cadastro (SQLite) junto com as preferências de atendimento (MongoDB).
      </Cabecalho>
      <div style={{ maxWidth: 380, marginBottom: 16 }}>
        <CampoIcone id="busca" rotulo="Buscar por nome ou telefone" icone="busca" type="search"
                    value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <Erro erro={erro} />
      <div className="cartao rolagem">
        {!clientes ? <p className="vazio">Carregando…</p> : clientes.length === 0 ? (
          <p className="vazio">Nenhum cliente encontrado.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th><th>Telefone</th><th>Bairro</th>
                <th className="num">Visitas</th><th>Última visita</th><th>Preferências</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="clicavel" onClick={() => setAberto(c.id)}>
                  <td>
                    <button className="botao discreto menor" style={{ paddingInline: 0, minHeight: 0 }}
                            onClick={(e) => { e.stopPropagation(); setAberto(c.id); }}>
                      {c.nome}
                    </button>
                  </td>
                  <td className="numeros">{formato.telefone(c.telefone)}</td>
                  <td>{c.bairro ?? "—"}</td>
                  <td className="num">{c.visitas}</td>
                  <td className="numeros">{c.ultima_visita ? formato.dataCurta(c.ultima_visita) : "Ainda não veio"}</td>
                  <td>
                    {c.perfil_sensivel ? <span className="selo destaque">Sensibilidade sensorial</span>
                      : c.tem_perfil ? <span className="selo">Preenchidas</span>
                      : <span className="suave">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Ficha({ clienteId, aoVoltar }) {
  const [cliente, setCliente] = useState(null);
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    api.cliente(clienteId).then(setCliente).catch(setErro);
  }, [clienteId]);

  async function salvar(perfil) {
    setErro(null);
    try {
      const resposta = await api.salvarPerfil(clienteId, perfil);
      setCliente((c) => ({ ...c, perfil: resposta.perfil }));
      setEditando(false);
    } catch (e) {
      setErro(e);
    }
  }

  if (!cliente) return <><Erro erro={erro} /><p className="vazio">Carregando…</p></>;
  const frases = resumirPerfil(cliente.perfil);
  const endereco = [cliente.logradouro, cliente.bairro, cliente.cidade && `${cliente.cidade}/${cliente.uf}`]
    .filter(Boolean).join(", ");

  return (
    <div className="pilha">
      <div className="linha">
        <button className="botao discreto" onClick={aoVoltar}>← Todos os clientes</button>
      </div>
      <Cabecalho titulo={cliente.nome}>
        {formato.telefone(cliente.telefone)}{endereco && ` · ${endereco}`}
        {cliente.primeira_visita && " · ainda não fez a primeira visita"}
      </Cabecalho>
      <Erro erro={erro} />

      <section className="cartao pilha">
        <div className="linha entre">
          <h2>Preferências de atendimento</h2>
          {!editando && (
            <button className="botao menor" onClick={() => setEditando(true)}>
              {cliente.perfil ? "Editar" : "Preencher com o cliente"}
            </button>
          )}
        </div>
        {editando ? (
          <PerfilForm inicial={cliente.perfil} aoSalvar={salvar}>
            <button type="button" className="botao discreto" onClick={() => setEditando(false)}>Cancelar</button>
          </PerfilForm>
        ) : frases.length > 0 ? (
          <ul className="orientacoes">{frases.map((f) => <li key={f}>{f}</li>)}</ul>
        ) : (
          <p className="suave">
            {cliente.perfil ? "Preencheu o formulário e não marcou nenhuma necessidade específica."
              : "Ainda não preencheu. É opcional e pode ser feito no agendamento."}
          </p>
        )}
      </section>

      <section className="cartao pilha rolagem">
        <h2>Histórico</h2>
        {cliente.historico.length === 0 ? <p className="suave">Nenhum agendamento ainda.</p> : (
          <table>
            <thead>
              <tr><th>Data</th><th>Serviço</th><th>Profissional</th><th>Ambiente</th><th>Situação</th></tr>
            </thead>
            <tbody>
              {cliente.historico.map((h) => (
                <tr key={h.id}>
                  <td className="numeros">{formato.dataCurta(h.inicio)} {formato.hora(h.inicio)}</td>
                  <td>{h.servico}</td>
                  <td>{h.profissional}</td>
                  <td>{h.indice_tranquilidade !== null && (
                    <Nivel nivel={nivelDe(h.indice_tranquilidade)} indice={h.indice_tranquilidade} />
                  )}</td>
                  <td>{STATUS[h.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

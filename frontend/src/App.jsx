import { useEffect, useState } from "react";
import { api } from "./api.js";
import Agendar from "./paginas/Agendar.jsx";
import Agenda from "./paginas/Agenda.jsx";
import Clientes from "./paginas/Clientes.jsx";
import Painel from "./paginas/Painel.jsx";
import { Ic } from "./componentes/Icones.jsx";

const AREAS = { cliente: "Área do cliente", equipe: "Área da equipe", gerente: "Área da gerente" };

const PAGINAS = [
  { rota: "agendar", titulo: "Agendar", quem: "cliente", Tela: Agendar },
  { rota: "agenda", titulo: "Agenda do dia", quem: "equipe", Tela: Agenda },
  { rota: "clientes", titulo: "Clientes", quem: "equipe", Tela: Clientes },
  { rota: "painel", titulo: "Painel", quem: "gerente", Tela: Painel },
];

const rotaAtual = () => window.location.hash.replace("#/", "") || "agendar";

export default function App() {
  const [rota, setRota] = useState(rotaAtual);
  const [saude, setSaude] = useState(null);

  useEffect(() => {
    const aoMudar = () => setRota(rotaAtual());
    window.addEventListener("hashchange", aoMudar);
    return () => window.removeEventListener("hashchange", aoMudar);
  }, []);

  useEffect(() => {
    api.saude().then(setSaude).catch(() => setSaude({ fora: true }));
  }, [rota]);

  const pagina = PAGINAS.find((p) => p.rota === rota) ?? PAGINAS[0];

  return (
    <>
      <header className="topo">
        <div className="topo-dentro">
          <a className="marca" href="#/agendar" aria-label="Fenty Beauty, agenda inclusiva">
            fenty beauty
          </a>
          <span className="marca-sub" aria-hidden="true">agenda inclusiva</span>
          <nav className="abas" aria-label="Áreas do sistema">
            {PAGINAS.map((p) => (
              <a key={p.rota} href={`#/${p.rota}`} title={AREAS[p.quem]}
                 aria-current={p.rota === pagina.rota ? "page" : undefined}>
                {p.titulo}
              </a>
            ))}
          </nav>
          <div className="area-atual">
            <span className="avatar"><Ic nome={pagina.quem === "gerente" ? "alta" : pagina.quem === "equipe" ? "pessoas" : "pessoa"} tamanho={18} /></span>
            {AREAS[pagina.quem]}
          </div>
        </div>
      </header>

      <main className="conteudo">
        <pagina.Tela />
      </main>

      <footer className="rodape">
        <div className="rodape-dentro">
          <FontesDeDados saude={saude} />
          <span className="rodape-marca">Beleza no seu ritmo.</span>
        </div>
      </footer>
    </>
  );
}

function FontesDeDados({ saude }) {
  if (!saude) return <span>Verificando as fontes de dados…</span>;
  if (saude.fora) return <span className="fonte fora">Backend fora do ar</span>;
  return (
    <>
      <span className="fonte">SQLite: {saude.sqlite.agendamentos} agendamentos</span>
      <span className={`fonte ${saude.mongodb.ok ? "" : "fora"}`}>
        MongoDB: {saude.mongodb.ok ? `${saude.mongodb.perfis} perfis de atendimento` : "fora do ar"}
      </span>
      <span className={`fonte ${saude.duckdb.carregado ? "" : "fora"}`}>
        DuckDB: {saude.duckdb.carregado ? `painel carregado via ${saude.duckdb.ultima_carga?.origem}` : "painel ainda sem dados"}
      </span>
      <span>APIs: ViaCEP, Open-Meteo e BrasilAPI</span>
    </>
  );
}

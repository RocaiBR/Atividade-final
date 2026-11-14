import { ICONES_CLIMA, NIVEIS } from "../api.js";
import { Ic } from "./Icones.jsx";

/**
 * Campo em pílula com ícone, como nos mockups. O rótulo fica visível acima do
 * campo (e não só como texto de exemplo), para não sumir enquanto a pessoa digita.
 */
export function CampoIcone({ id, rotulo, ajuda, icone, depois, ...entrada }) {
  return (
    <div className="campo">
      <label htmlFor={id}>
        {rotulo} {ajuda && <span className="ajuda">{ajuda}</span>}
      </label>
      <div className="com-icone">
        {icone && <Ic nome={icone} tamanho={18} />}
        <input id={id} type="text" {...entrada} />
      </div>
      {depois}
    </div>
  );
}

/** Selo do índice de tranquilidade: forma + palavra + número, nunca só cor. */
export function Nivel({ nivel, indice }) {
  if (!nivel) return null;
  return (
    <span className={`selo nivel ${nivel}`}>
      {NIVEIS[nivel]}
      {indice !== undefined && indice !== null && <span className="numeros">· {indice}</span>}
    </span>
  );
}

export function Clima({ clima }) {
  if (!clima) return <span className="suave pequeno">Sem previsão</span>;
  return (
    <span className="pequeno suave">
      <span aria-hidden="true">{ICONES_CLIMA[clima.icone] ?? "☁️"} </span>
      {clima.condicao}
      {clima.temp_max !== null && clima.temp_max !== undefined && `, ${Math.round(clima.temp_max)}°`}
    </span>
  );
}

export function Erro({ erro }) {
  if (!erro) return null;
  return (
    <p className="aviso erro" role="alert">
      {erro.message ?? String(erro)}
    </p>
  );
}

export function Cabecalho({ titulo, children }) {
  return (
    <div className="cabecalho">
      <h1>{titulo}</h1>
      {children && <p className="suave">{children}</p>}
    </div>
  );
}

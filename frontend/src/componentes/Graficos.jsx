import { useState } from "react";

/**
 * Gráficos do painel, em HTML/CSS puro.
 * Regras seguidas: marcas finas (até 24px), ponta arredondada só do lado do dado,
 * grade discreta, texto sempre na cor de texto (a cor fica na marca), legenda
 * quando há duas séries, valor na ponta das barras, dica ao passar o mouse e
 * uma tabela equivalente para cada gráfico.
 */

/** Dica que acompanha o mouse (ou o foco do teclado). */
export function useDica() {
  const [dica, setDica] = useState(null);
  const alvo = (texto, focavel = true) => ({
    onMouseEnter: (e) => setDica({ texto, x: e.clientX, y: e.clientY }),
    onMouseMove: (e) => setDica({ texto, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setDica(null),
    ...(focavel && {
      tabIndex: 0,
      onFocus: (e) => {
        const caixa = e.currentTarget.getBoundingClientRect();
        setDica({ texto, x: caixa.left + caixa.width / 2, y: caixa.bottom });
      },
      onBlur: () => setDica(null),
    }),
    "aria-label": texto,
  });
  const elemento = dica && (
    <div className="dica" role="tooltip"
         style={{ left: Math.min(dica.x + 14, window.innerWidth - 270), top: dica.y + 14 }}>
      {dica.texto}
    </div>
  );
  return [alvo, elemento];
}

export function Legenda({ series }) {
  return (
    <div className="legenda">
      {series.map((s) => <span key={s.nome} style={{ "--cor": s.cor }}>{s.nome}</span>)}
    </div>
  );
}

export function TabelaDados({ colunas, linhas }) {
  return (
    <details className="tabela">
      <summary>Ver como tabela</summary>
      <div className="rolagem">
        <table>
          <thead>
            <tr>{colunas.map((c, i) => <th key={c} className={i ? "num" : ""}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {linhas.map((linha, i) => (
              <tr key={i}>
                {linha.map((celula, j) => <td key={j} className={j ? "num" : ""}>{celula}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Barras horizontais, simples ou agrupadas.
 * grupos: [{ nome, itens: [{ serie?, valor, cor? }] }]
 */
export function Barras({ grupos, maximo, formatar = String }) {
  const [alvo, dica] = useDica();
  const teto = maximo ?? Math.max(...grupos.flatMap((g) => g.itens.map((i) => i.valor)), 0) * 1.05;
  return (
    <div className="barras">
      {grupos.map((grupo) => (
        <div className="grupo" key={grupo.nome}>
          <div className="nome">{grupo.nome}</div>
          {grupo.itens.map((item, i) => {
            const texto = `${grupo.nome}${item.serie ? `, ${item.serie.toLowerCase()}` : ""}: ${formatar(item.valor)}`
              + (item.detalhe ? ` (${item.detalhe})` : "");
            return (
              <div className="barra-linha" key={i} {...alvo(texto)}>
                <div className="barra"
                     style={{ width: `${teto ? (item.valor / teto) * 100 : 0}%`, "--cor": item.cor }} />
                <div className="barra-valor">{formatar(item.valor)}</div>
              </div>
            );
          })}
        </div>
      ))}
      {dica}
    </div>
  );
}

/** Arredonda o teto do eixo para um número limpo. */
function tetoLimpo(valor) {
  if (valor <= 0) return 1;
  const base = 10 ** Math.floor(Math.log10(valor));
  return [1, 2, 2.5, 5, 10].map((m) => m * base).find((t) => t >= valor);
}

/**
 * Colunas empilhadas. dados: [{ rotulo, partes: [{ nome, valor, cor }] }]
 * A primeira parte fica no topo da coluna; a última encosta no eixo.
 */
export function ColunasEmpilhadas({ dados }) {
  const [alvo, dica] = useDica();
  const teto = tetoLimpo(Math.max(...dados.map((d) => d.partes.reduce((s, p) => s + p.valor, 0)), 0));
  return (
    <div className="colunas">
      <div className="eixo-y" aria-hidden="true">
        <span>{teto}</span><span>{teto / 2}</span><span>0</span>
      </div>
      <div className="area">
        {dados.map((d) => {
          const texto = `Semana de ${d.rotulo}: ` + d.partes.map((p) => `${p.valor} ${p.nome.toLowerCase()}`).join(", ");
          return (
            <div className="coluna" key={d.rotulo} {...alvo(texto)}>
              {d.partes.filter((p) => p.valor > 0).map((p) => (
                <i key={p.nome} style={{ height: `${(p.valor / teto) * 100}%`, "--cor": p.cor }} />
              ))}
            </div>
          );
        })}
      </div>
      <div className="eixo-x" aria-hidden="true">
        {dados.map((d, i) => <span key={d.rotulo}>{i % 2 === 0 ? d.rotulo : ""}</span>)}
      </div>
      {dica}
    </div>
  );
}

/** Mapa de calor: uma só cor, do claro (pouco) ao escuro (muito). */
export function MapaDeCalor({ linhas, colunas, valor, descrever }) {
  const [alvo, dica] = useDica();
  const maximo = Math.max(...linhas.flatMap((l) => colunas.map((c) => valor(l.chave, c) ?? 0)), 0);
  return (
    <>
      <div className="calor" style={{ gridTemplateColumns: `max-content repeat(${colunas.length}, minmax(0, 1fr))` }}>
        <span />
        {colunas.map((c) => <span className="hora" key={c}>{c}h</span>)}
        {linhas.map((l) => (
          <LinhaCalor key={l.chave} linha={l} colunas={colunas} valor={valor} maximo={maximo}
                      alvo={alvo} descrever={descrever} />
        ))}
      </div>
      <div className="escala" aria-hidden="true">
        <span>menos</span><i /><span>mais</span>
      </div>
      {dica}
    </>
  );
}

function LinhaCalor({ linha, colunas, valor, maximo, alvo, descrever }) {
  return (
    <>
      <span className="dia">{linha.nome}</span>
      {colunas.map((c) => {
        const v = valor(linha.chave, c);
        const fundo = v
          ? `color-mix(in oklab, var(--calor-min), var(--calor-max) ${Math.round((v / maximo) * 100)}%)`
          : "var(--superficie-2)";
        return (
          <div key={c} className="celula" style={{ background: fundo }}
               {...alvo(descrever(linha.nome, c, v), false)} />
        );
      })}
    </>
  );
}

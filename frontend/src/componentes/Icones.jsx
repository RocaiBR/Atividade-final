/**
 * Ícones de traço fino, no estilo dos mockups. Os de interface seguem o
 * desenho do Feather Icons (licença MIT); os de serviço foram desenhados aqui.
 * São decorativos: o texto ao lado sempre diz o que é.
 */
function Icone({ tamanho = 20, caixa = 24, traco = 1.75, children, ...resto }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox={`0 0 ${caixa} ${caixa}`} fill="none"
         stroke="currentColor" strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true" focusable="false" {...resto}>
      {children}
    </svg>
  );
}

const DESENHOS = {
  pessoa: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  pessoas: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  pessoaMais: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" />
    <path d="M20 8v6M23 11h-6" /></>,
  pessoaX: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" />
    <path d="M18 8l5 5M23 8l-5 5" /></>,
  telefone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />,
  email: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <path d="M22 6l-10 7L2 6" /></>,
  local: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>,
  casa: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></>,
  calendario: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  relogio: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  alta: <><path d="M23 6l-9.5 9.5-5-5L1 18" /><path d="M17 6h6v6" /></>,
  coracao: <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />,
  busca: <><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></>,
  ok: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></>,
  esquerda: <path d="M15 18l-6-6 6-6" />,
  direita: <path d="M9 18l6-6-6-6" />,
  folha: <><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" /></>,
}

export function Ic({ nome, ...resto }) {
  return <Icone {...resto}>{DESENHOS[nome]}</Icone>;
}

/* --- Serviços (48 x 48), como nos cartões "Nossos Serviços" ----------------- */
const SERVICOS = {
  // pente inclinado
  cabelo: (
    <g transform="rotate(-35 24 24)">
      <rect x="5" y="17" width="38" height="7" rx="2.5" />
      {Array.from({ length: 11 }, (_, i) => <path key={i} d={`M${9 + i * 3} 24v10`} />)}
    </g>
  ),
  // frasco de esmalte
  unhas: (
    <>
      <rect x="19" y="4" width="10" height="15" rx="2.5" />
      <path d="M17 19h14v4H17z" />
      <rect x="11" y="23" width="26" height="21" rx="5" />
      <path d="M16 29v9" />
    </>
  ),
  // pincel de maquiagem
  maquiagem: (
    <>
      <path d="M9.5 41.5l13-13 3 3-13 13a2.1 2.1 0 0 1-3 0 2.1 2.1 0 0 1 0-3z" />
      <path d="M22.5 28.5l4-4 3 3-4 4" />
      <path d="M26.5 24.5c1-5 6-12.5 14-17-2 8.5-9 14-11 14z" />
      <path d="M31 19.5l4-4" />
    </>
  ),
};

export function IconeServico({ categoria, tamanho = 44 }) {
  return (
    <Icone tamanho={tamanho} caixa={48} traco={1.6}>
      {SERVICOS[categoria] ?? SERVICOS.cabelo}
    </Icone>
  );
}

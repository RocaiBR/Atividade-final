import { useId, useState } from "react";

const SENTIDOS = [
  ["ruido", "Barulho", "secador, música, muitas conversas"],
  ["luz", "Luz forte", "espelho iluminado, luz branca"],
  ["cheiros", "Cheiros", "tintura, esmalte, perfume"],
  ["toque", "Toque", "lavagem, massagem, pincéis no rosto"],
];
const INTENSIDADES = ["Nada", "Um pouco", "Bastante", "Muito"];
const PREFERENCIAS = [
  ["pouca_conversa", "Prefiro pouca conversa durante o atendimento"],
  ["avisar_antes_de_tocar", "Quero que avisem antes de cada toque"],
  ["explicar_etapas", "Quero que expliquem cada etapa antes de fazer"],
  ["pausas", "Posso precisar de pausas"],
  ["acompanhante", "Vou com acompanhante"],
];

export const PERFIL_VAZIO = {
  consentimento: false,
  sensibilidades: { ruido: 0, luz: 0, cheiros: 0, toque: 0 },
  preferencias: {
    pouca_conversa: false, avisar_antes_de_tocar: false, explicar_etapas: false,
    pausas: false, acompanhante: false, comunicacao: "fala",
  },
  observacoes: "",
};

/** Resumo curto do perfil, em frases. */
export function resumirPerfil(perfil) {
  if (!perfil) return [];
  const frases = SENTIDOS.filter(([chave]) => perfil.sensibilidades?.[chave] >= 2).map(
    ([chave, nome]) => `${nome}: incomoda ${INTENSIDADES[perfil.sensibilidades[chave]].toLowerCase()}`
  );
  PREFERENCIAS.forEach(([chave, texto]) => perfil.preferencias?.[chave] && frases.push(texto));
  if (perfil.preferencias?.comunicacao === "escrita") frases.push("Prefiro me comunicar por escrito");
  if (perfil.observacoes) frases.push(perfil.observacoes);
  return frases;
}

/**
 * Preferências de atendimento. Tudo é opcional e nada pergunta diagnóstico:
 * o que importa para a equipe é o que deixa o atendimento confortável.
 */
export default function PerfilForm({ inicial, aoSalvar, textoSalvar = "Salvar preferências", children }) {
  const id = useId();
  const [perfil, setPerfil] = useState(() => ({
    ...PERFIL_VAZIO,
    ...inicial,
    sensibilidades: { ...PERFIL_VAZIO.sensibilidades, ...inicial?.sensibilidades },
    preferencias: { ...PERFIL_VAZIO.preferencias, ...inicial?.preferencias },
    observacoes: inicial?.observacoes ?? "",
  }));
  const [salvando, setSalvando] = useState(false);

  const mudar = (grupo, chave, valor) =>
    setPerfil((p) => ({ ...p, [grupo]: { ...p[grupo], [chave]: valor } }));

  async function enviar(evento) {
    evento.preventDefault();
    setSalvando(true);
    try {
      await aoSalvar({ ...perfil, observacoes: perfil.observacoes.trim() || null });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="pilha" onSubmit={enviar}>
      <h3>Quanto cada coisa te incomoda?</h3>
      <div className="grade-2 sentidos">
        {SENTIDOS.map(([chave, nome, exemplos]) => (
          <fieldset key={chave}>
            <legend>
              {nome} <span className="suave pequeno" style={{ fontWeight: 400 }}>({exemplos})</span>
            </legend>
            <div className="faixa">
              {INTENSIDADES.map((texto, valor) => (
                <span key={valor} style={{ display: "contents" }}>
                  <input
                    type="radio"
                    id={`${id}-${chave}-${valor}`}
                    name={`${id}-${chave}`}
                    checked={perfil.sensibilidades[chave] === valor}
                    onChange={() => mudar("sensibilidades", chave, valor)}
                  />
                  <label htmlFor={`${id}-${chave}-${valor}`}>{texto}</label>
                </span>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <fieldset>
        <legend>Durante o atendimento</legend>
        {PREFERENCIAS.map(([chave, texto]) => (
          <label className="marcar" key={chave}>
            <input
              type="checkbox"
              checked={perfil.preferencias[chave]}
              onChange={(e) => mudar("preferencias", chave, e.target.checked)}
            />
            {texto}
          </label>
        ))}
        <label className="marcar">
          <input
            type="checkbox"
            checked={perfil.preferencias.comunicacao === "escrita"}
            onChange={(e) => mudar("preferencias", "comunicacao", e.target.checked ? "escrita" : "fala")}
          />
          Prefiro me comunicar por escrito (mensagem ou papel)
        </label>
      </fieldset>

      <div className="campo">
        <label htmlFor={`${id}-obs`}>
          Algo mais que ajude? <span className="ajuda">(opcional)</span>
        </label>
        <textarea
          id={`${id}-obs`}
          maxLength={500}
          value={perfil.observacoes}
          onChange={(e) => setPerfil((p) => ({ ...p, observacoes: e.target.value }))}
        />
      </div>

      <label className="marcar">
        <input
          type="checkbox"
          checked={perfil.consentimento}
          onChange={(e) => setPerfil((p) => ({ ...p, consentimento: e.target.checked }))}
        />
        <span>
          Autorizo o salão a guardar estas preferências para preparar meu atendimento.{" "}
          <span className="suave">Só a equipe vê. Se desmarcar, as preferências são apagadas.</span>
        </span>
      </label>

      <div className="linha">
        <button className="botao principal" disabled={salvando}>
          {salvando ? "Salvando…" : textoSalvar}
        </button>
        {children}
      </div>
    </form>
  );
}

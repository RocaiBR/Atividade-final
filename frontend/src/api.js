// Cliente da API em Python. Erros chegam como Error com a mensagem do backend.
async function chamar(caminho, { metodo = "GET", corpo, parametros } = {}) {
  const url = new URL(`/api${caminho}`, window.location.origin);
  Object.entries(parametros ?? {}).forEach(([chave, valor]) => {
    if (valor !== null && valor !== undefined && valor !== "") url.searchParams.set(chave, valor);
  });

  let resposta;
  try {
    resposta = await fetch(url, {
      method: metodo,
      headers: corpo ? { "Content-Type": "application/json" } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new Error("Não foi possível falar com o servidor. Verifique se o backend está rodando.");
  }

  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const detalhe = dados?.detail;
    const erro = new Error(
      typeof detalhe === "string" ? detalhe : "Algo deu errado. Tente novamente."
    );
    erro.status = resposta.status;
    throw erro;
  }
  return dados;
}

export const api = {
  saude: () => chamar("/saude"),
  servicos: () => chamar("/servicos"),
  profissionais: () => chamar("/profissionais"),
  roteiro: (servicoId) => chamar(`/roteiros/${servicoId}`),
  cep: (cep) => chamar(`/cep/${cep}`),
  clientes: (busca) => chamar("/clientes", { parametros: { busca } }),
  cliente: (id) => chamar(`/clientes/${id}`),
  clientePorTelefone: (telefone) => chamar(`/clientes/por-telefone/${telefone}`),
  cadastrarCliente: (dados) => chamar("/clientes", { metodo: "POST", corpo: dados }),
  salvarPerfil: (id, perfil) => chamar(`/clientes/${id}/perfil`, { metodo: "PUT", corpo: perfil }),
  dias: (parametros) => chamar("/dias", { parametros }),
  horarios: (parametros) => chamar("/horarios", { parametros }),
  agendar: (dados) => chamar("/agendamentos", { metodo: "POST", corpo: dados }),
  agenda: (data) => chamar("/agenda", { parametros: { data } }),
  mudarStatus: (id, status) => chamar(`/agendamentos/${id}`, { metodo: "PATCH", corpo: { status } }),
  avaliar: (dados) => chamar("/feedbacks", { metodo: "POST", corpo: dados }),
  painel: () => chamar("/painel"),
  executarEtl: (modo) => chamar("/etl/executar", { metodo: "POST", parametros: { modo } }),
  statusEtl: () => chamar("/etl/status"),
};

// --- Formatação -------------------------------------------------------------
const meioDia = (data) => new Date(`${String(data).slice(0, 10)}T12:00:00`);

export const formato = {
  dataLonga: (data) =>
    meioDia(data).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }),
  dataCurta: (data) => meioDia(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
  hora: (dataHora) => String(dataHora).slice(11, 16),
  dinheiro: (valor) =>
    Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
  porcento: (fracao) =>
    `${(fracao * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
  nota: (valor) => Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  telefone: (digitos) =>
    digitos?.length === 11
      ? `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`
      : digitos,
  duracao: (minutos) => {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return [h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
  },
  hojeIso: () => {
    const agora = new Date();
    return new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  },
};

export const NIVEIS = { calmo: "Calmo", moderado: "Moderado", movimentado: "Movimentado" };
export const CATEGORIAS = { cabelo: "Cabelo", unhas: "Unhas", maquiagem: "Maquiagem" };
export const ICONES_CLIMA = { sol: "☀️", "sol-nuvem": "⛅", nuvem: "☁️", chuva: "🌧️", trovoada: "⛈️" };

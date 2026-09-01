import "dotenv/config";

function envBool(nome, padrao) {
  const valor = process.env[nome];
  if (valor === undefined) return padrao;
  return ["1", "true", "yes", "sim"].includes(valor.trim().toLowerCase());
}

// Login/senha do ISS Online DF nunca ficam no .env -- vem da tela de login
// do front-end a cada processamento (ver server/rotas.js).
export const DF_CNPJ_ESTABELECIMENTO = process.env.DF_CNPJ_ESTABELECIMENTO ?? "";
export const DF_HEADLESS = envBool("DF_HEADLESS", true);
export const DF_DELAY_MS = Number(process.env.DF_DELAY_MS ?? "3000");

// So pra depuracao: expoe o Chromium via Chrome DevTools Protocol nessa
// porta (ver abrirNavegador em roboDf.js), permitindo que uma ferramenta
// externa (ex.: um MCP de navegador configurado com --cdp-endpoint) grude na
// MESMA sessao ja logada e inspecione o DOM ao vivo. Tambem faz o
// processarLote NAO fechar o navegador no final do lote, pra sobrar tempo de
// inspecionar depois. Deixar sem definir em producao -- esse endpoint deixa
// qualquer processo local controlar o navegador.
export const DF_DEBUG_CDP_PORT = process.env.DF_DEBUG_CDP_PORT ?? null;

export const URL_LOGIN = "https://iss.fazenda.df.gov.br/online/Login/Login.aspx";

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

export const URL_LOGIN = "https://iss.fazenda.df.gov.br/online/Login/Login.aspx";

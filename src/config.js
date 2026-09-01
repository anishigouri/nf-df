import "dotenv/config";

function envBool(nome, padrao) {
  const valor = process.env[nome];
  if (valor === undefined) return padrao;
  return ["1", "true", "yes", "sim"].includes(valor.trim().toLowerCase());
}

export const DF_LOGIN = process.env.DF_LOGIN ?? "";
export const DF_SENHA = process.env.DF_SENHA ?? "";
export const DF_CNPJ_ESTABELECIMENTO = process.env.DF_CNPJ_ESTABELECIMENTO ?? "";
export const DF_PLANILHA_PATH = process.env.DF_PLANILHA_PATH ?? "./planilhas/notas.xlsx";
export const DF_HEADLESS = envBool("DF_HEADLESS", true);
export const DF_DELAY_MS = Number(process.env.DF_DELAY_MS ?? "3000");

export const URL_LOGIN = "https://iss.fazenda.df.gov.br/online/Login/Login.aspx";

if (!DF_LOGIN || !DF_SENHA) {
  throw new Error(
    "DF_LOGIN e DF_SENHA precisam estar definidos no arquivo .env " +
      "(copie .env.example para .env e preencha)."
  );
}

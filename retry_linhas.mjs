// Reprocessa linhas especificas reaproveitando a sessao ja logada do
// navegador exposto via --remote-debugging-port (DF_DEBUG_CDP_PORT), em vez
// de abrir um navegador novo e pedir login de novo -- usa o mesmo
// emitirNota() testado do roboDf.js, so que direcionado so pras linhas
// passadas por argumento.
import { chromium } from "playwright";
import ExcelJS from "exceljs";

import { emitirNota, ErroEmissaoNota } from "./src/roboDf.js";
import { marcarResultado } from "./src/planilha.js";

const CAMINHO_PLANILHA = process.argv[2];
const LINHAS = process.argv
  .slice(3)
  .map(Number)
  .filter((n) => Number.isInteger(n) && n > 1);

if (!CAMINHO_PLANILHA || LINHAS.length === 0) {
  console.error("Uso: node retry_linhas.mjs <caminho-planilha> <linha1> <linha2> ...");
  process.exit(1);
}

async function lerLinha(caminho, numeroLinha) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(caminho);
  const worksheet = workbook.worksheets[0];
  const indices = {};
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const nome = String(cell.value ?? "").trim();
    if (nome) indices[nome] = col;
  });
  const row = worksheet.getRow(numeroLinha);
  const dados = {};
  for (const [nome, col] of Object.entries(indices)) dados[nome] = row.getCell(col).value;
  return dados;
}

const browser = await chromium.connectOverCDP("http://localhost:9222");
const context = browser.contexts()[0];
const page = context.pages()[0];
console.log(`[retry] conectado via CDP, pagina atual: ${page.url()}`);

for (const numeroLinha of LINHAS) {
  const dados = await lerLinha(CAMINHO_PLANILHA, numeroLinha);
  console.log(`[retry] linha ${numeroLinha}: CNPJ ${dados["CNPJ CLIENTE"]}`);
  try {
    const resultado = await emitirNota(page, dados, numeroLinha, {});
    await marcarResultado(CAMINHO_PLANILHA, numeroLinha, { numeroNfse: resultado });
    console.log(`[retry] OK linha ${numeroLinha} -> nota ${resultado}`);
  } catch (err) {
    const mensagem = err instanceof ErroEmissaoNota ? err.message : `Erro inesperado: ${err.message}`;
    await marcarResultado(CAMINHO_PLANILHA, numeroLinha, { erro: mensagem });
    console.log(`[retry] ERRO linha ${numeroLinha}: ${mensagem}`);
  }
}

await browser.close(); // so desconecta do CDP, nao fecha o navegador real (nao foi ele quem o abriu)
console.log("[retry] concluido");

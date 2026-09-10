// Leitura da planilha de notas e escrita do numero da nota emitida de volta nela.
//
// Segue exatamente o processo manual do usuario: a coluna "NOTA" comeca vazia
// e e preenchida com o numero da nota apos a emissao. Uma linha e considerada
// pendente enquanto "NOTA" estiver vazia.

import ExcelJS from "exceljs";

const COLUNA_NOTA = "NOTA";
const COLUNA_ERRO = "ERRO_ROBO"; // criada pelo robo so para registrar falhas, se houver

function indiceColunas(worksheet) {
  const indices = {};
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const nome = String(cell.value ?? "").trim();
    if (nome) indices[nome] = colNumber;
  });
  return indices;
}

function garantirColunaErro(worksheet, indices) {
  if (!(COLUNA_ERRO in indices)) {
    const proximaColuna = worksheet.columnCount + 1;
    worksheet.getRow(1).getCell(proximaColuna).value = COLUNA_ERRO;
    indices[COLUNA_ERRO] = proximaColuna;
  }
  return indices;
}

/** Le a planilha e retorna as linhas cuja coluna NOTA ainda esta vazia. */
export async function carregarNotasPendentes(caminho) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(caminho);
  const worksheet = workbook.worksheets[0];

  const indices = indiceColunas(worksheet);
  if (!(COLUNA_NOTA in indices)) {
    throw new Error(`A planilha nao tem uma coluna "${COLUNA_NOTA}".`);
  }

  const colNota = indices[COLUNA_NOTA];
  const pendentes = [];

  for (let numeroLinha = 2; numeroLinha <= worksheet.rowCount; numeroLinha++) {
    const row = worksheet.getRow(numeroLinha);
    const valorNota = row.getCell(colNota).value;
    if (valorNota !== null && valorNota !== undefined && valorNota !== "") continue;

    const dados = {};
    let vazia = true;
    for (const [nomeColuna, colIdx] of Object.entries(indices)) {
      const valor = row.getCell(colIdx).value;
      dados[nomeColuna] = valor;
      if (valor !== null && valor !== undefined && valor !== "") vazia = false;
    }
    if (vazia) continue;

    pendentes.push({ numeroLinha, dados });
  }

  return pendentes;
}

/** Grava o numero da nota emitida (ou o erro) direto na planilha. */
export async function marcarResultado(caminho, numeroLinha, { numeroNfse = null, erro = null }) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(caminho);
  const worksheet = workbook.worksheets[0];

  const indices = garantirColunaErro(worksheet, indiceColunas(worksheet));
  const row = worksheet.getRow(numeroLinha);

  if (numeroNfse) {
    row.getCell(indices[COLUNA_NOTA]).value = numeroNfse;
    row.getCell(indices[COLUNA_ERRO]).value = "";
  } else {
    row.getCell(indices[COLUNA_ERRO]).value = erro ?? "";
  }

  await workbook.xlsx.writeFile(caminho);
}

// Abre a planilha UMA VEZ e devolve uma funcao pra gravar resultado nela
// sem reabrir o arquivo do zero a cada linha -- usado no processamento em
// lote (ver processarLote.js). marcarResultado() acima reabre (le +
// reparseia) a planilha inteira toda vez que e chamada; num lote de
// dezenas de notas isso significa reparsear o mesmo arquivo dezenas de
// vezes, o que e caro em memoria (ExcelJS materializa o workbook inteiro em
// memoria a cada parse) -- confirmado como fator real no consumo de RAM que
// derrubou o servico no Render em 10/09/2026 (memoria subindo direto ate
// quase o limite mesmo com o navegador sendo fechado/reaberto entre
// pedacos do lote). Mantem marcarResultado() como esta pros outros usos
// (ex.: retry_linhas.mjs, que so mexe em poucas linhas por vez e nao tem
// esse problema).
export async function abrirPlanilhaParaEscrita(caminho) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(caminho);
  const worksheet = workbook.worksheets[0];
  const indices = garantirColunaErro(worksheet, indiceColunas(worksheet));

  return {
    async marcar(numeroLinha, { numeroNfse = null, erro = null }) {
      const row = worksheet.getRow(numeroLinha);
      if (numeroNfse) {
        row.getCell(indices[COLUNA_NOTA]).value = numeroNfse;
        row.getCell(indices[COLUNA_ERRO]).value = "";
      } else {
        row.getCell(indices[COLUNA_ERRO]).value = erro ?? "";
      }
      await workbook.xlsx.writeFile(caminho);
    },
  };
}

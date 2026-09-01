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

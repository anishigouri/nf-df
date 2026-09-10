// Monitora em tempo real a planilha que o robo esta atualizando (uploads/),
// imprimindo uma linha por vez que uma linha muda de estado (novo erro,
// erro diferente, ou virou OK).
import ExcelJS from "exceljs";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const PASTA = "uploads";
const COLUNA_NOTA = "NOTA";
const COLUNA_ERRO = "ERRO_ROBO";
const INTERVALO_MS = 5000;

function arquivoMaisRecente() {
  const arquivos = readdirSync(PASTA)
    .filter((f) => f.endsWith(".xlsx"))
    .map((f) => ({ f, mtime: statSync(path.join(PASTA, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return arquivos[0]?.f ?? null;
}

async function lerEstado(caminho) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(caminho);
  const worksheet = workbook.worksheets[0];

  const indices = {};
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const nome = String(cell.value ?? "").trim();
    if (nome) indices[nome] = colNumber;
  });

  const colNota = indices[COLUNA_NOTA];
  const colErro = indices[COLUNA_ERRO];
  const colCnpj = indices["CNPJ CLIENTE"];

  const estado = new Map();
  for (let numeroLinha = 2; numeroLinha <= worksheet.rowCount; numeroLinha++) {
    const row = worksheet.getRow(numeroLinha);
    const nota = colNota ? row.getCell(colNota).value : null;
    const erro = colErro ? row.getCell(colErro).value : null;
    const cnpj = colCnpj ? row.getCell(colCnpj).value : null;
    if (nota == null && erro == null) continue; // linha ainda nem tocada
    estado.set(numeroLinha, {
      nota: nota ?? "",
      erro: erro ? String(erro) : "",
      cnpj,
    });
  }
  return estado;
}

let arquivoAtual = null;
let estadoAnterior = new Map();

console.log(`[monitor] iniciado, observando pasta ${PASTA}/ a cada ${INTERVALO_MS}ms`);

async function tick() {
  const arquivo = arquivoMaisRecente();
  if (!arquivo) return;
  const caminho = path.join(PASTA, arquivo);

  if (arquivo !== arquivoAtual) {
    console.log(`[monitor] arquivo ativo: ${arquivo}`);
    arquivoAtual = arquivo;
    estadoAnterior = new Map();
  }

  let estadoNovo;
  try {
    estadoNovo = await lerEstado(caminho);
  } catch (err) {
    console.log(`[monitor] falha ao ler ${arquivo} (provavelmente sendo escrito agora): ${err.message}`);
    return;
  }

  for (const [linha, atual] of estadoNovo) {
    const antes = estadoAnterior.get(linha);
    const mudou =
      !antes || antes.erro !== atual.erro || antes.nota !== atual.nota;
    if (!mudou) continue;

    if (atual.nota) {
      console.log(`[OK] linha ${linha} (CNPJ ${atual.cnpj}) -> nota ${atual.nota}`);
    } else if (atual.erro) {
      console.log(`[ERRO] linha ${linha} (CNPJ ${atual.cnpj}): ${atual.erro}`);
    }
  }
  estadoAnterior = estadoNovo;
}

setInterval(tick, INTERVALO_MS);
tick();

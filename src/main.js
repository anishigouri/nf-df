// Ponto de entrada: le a planilha e lanca as notas pendentes no ISS Online DF.
//
// Uso:
//   node src/main.js --planilha planilhas/notas.xlsx --dry-run
//   node src/main.js --planilha planilhas/notas.xlsx --limite 3
//   node src/main.js --planilha planilhas/notas.xlsx

import * as config from "./config.js";
import { carregarNotasPendentes, marcarResultado } from "./planilha.js";
import { abrirNavegador, emitirNota, ErroEmissaoNota, fazerLogin, selecionarEstabelecimento } from "./roboDf.js";

function parseArgs(argv) {
  const args = { planilha: null, limite: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--planilha") args.planilha = argv[++i];
    else if (argv[i] === "--limite") args.limite = Number(argv[++i]);
    else if (argv[i] === "--dry-run") args.dryRun = true;
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const caminhoPlanilha = args.planilha ?? config.DF_PLANILHA_PATH;

  let notas = await carregarNotasPendentes(caminhoPlanilha);
  if (args.limite) notas = notas.slice(0, args.limite);

  if (notas.length === 0) {
    console.log("Nenhuma nota pendente encontrada na planilha (coluna NOTA ja preenchida em todas as linhas).");
    return;
  }

  console.log(`${notas.length} nota(s) pendente(s) para lancar.`);

  const { browser, page } = await abrirNavegador();

  console.log("Fazendo login...");
  await fazerLogin(page);
  console.log("Login OK. Selecionando estabelecimento", config.DF_CNPJ_ESTABELECIMENTO, "...");
  await selecionarEstabelecimento(page);
  console.log("Estabelecimento selecionado.");

  for (let i = 0; i < notas.length; i++) {
    const nota = notas[i];
    const cliente = nota.dados["CNPJ CLIENTE"] ?? "?";
    process.stdout.write(`[${i + 1}/${notas.length}] Linha ${nota.numeroLinha} - CNPJ cliente ${cliente}... `);

    try {
      const resultado = await emitirNota(page, nota.dados, nota.numeroLinha, { dryRun: args.dryRun });
      if (!args.dryRun) {
        await marcarResultado(caminhoPlanilha, nota.numeroLinha, { numeroNfse: resultado });
      }
      console.log(`OK -> ${resultado}`);
    } catch (err) {
      const mensagem = err instanceof ErroEmissaoNota ? err.message : `Erro inesperado: ${err.message}`;
      if (!args.dryRun) {
        await marcarResultado(caminhoPlanilha, nota.numeroLinha, { erro: mensagem });
      }
      console.log(`ERRO -> ${mensagem}`);
    }

    await sleep(config.DF_DELAY_MS);
  }

  await browser.close();
  console.log("Concluido.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Logica de processamento de um lote de notas pendentes de uma planilha,
// usada pelo servidor (server/gerenciadorJobs.js). Reporta o progresso via
// callback onEvento, pra quem chamar decidir o que fazer com cada evento.

import * as config from "./config.js";
import { carregarNotasPendentes, marcarResultado } from "./planilha.js";
import { abrirNavegador, emitirNota, ErroEmissaoNota, fazerLogin, selecionarEstabelecimento } from "./roboDf.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function dividirEmPedacos(lista, tamanho) {
  const pedacos = [];
  for (let i = 0; i < lista.length; i += tamanho) pedacos.push(lista.slice(i, i + tamanho));
  return pedacos;
}

// Processa um pedaco do lote com uma sessao de navegador propria (login +
// selecao de estabelecimento de novo a cada pedaco). Um Chromium so aberto
// pro lote inteiro vai acumulando memoria a cada nota (confirmado ao vivo em
// 10/09/2026 num lote real de 22 notas no Render: RAM subindo ate 505MB,
// quase estourando o limite de 512MB do plano free, e o processo foi
// derrubado por SIGTERM no meio do lote) -- reabrir o navegador a cada
// DF_TAMANHO_LOTE notas (ver config.js) devolve essa memoria pro SO antes de
// continuar, em vez de deixar crescer sem limite a sessao inteira.
async function processarPedaco(pedaco, caminhoPlanilha, { dryRun, dataCompetencia, credenciais, indiceInicial, total }, onEvento) {
  const { browser, page } = await abrirNavegador();

  try {
    onEvento({ tipo: "fase", mensagem: "Fazendo login..." });
    await fazerLogin(page, credenciais);

    onEvento({ tipo: "fase", mensagem: `Login OK. Selecionando estabelecimento ${config.DF_CNPJ_ESTABELECIMENTO}...` });
    await selecionarEstabelecimento(page);
    onEvento({ tipo: "fase", mensagem: "Estabelecimento selecionado." });

    for (let i = 0; i < pedaco.length; i++) {
      const nota = pedaco[i];
      const cliente = nota.dados["CNPJ CLIENTE"] ?? "?";

      onEvento({ tipo: "linha_inicio", indice: indiceInicial + i + 1, total, numeroLinha: nota.numeroLinha, cliente });

      try {
        const resultado = await emitirNota(page, nota.dados, nota.numeroLinha, { dryRun, dataCompetencia });
        if (!dryRun) {
          await marcarResultado(caminhoPlanilha, nota.numeroLinha, { numeroNfse: resultado });
        }
        onEvento({ tipo: "linha_resultado", numeroLinha: nota.numeroLinha, status: "ok", resultado });
      } catch (err) {
        const mensagem = err instanceof ErroEmissaoNota ? err.message : `Erro inesperado: ${err.message}`;
        if (!dryRun) {
          await marcarResultado(caminhoPlanilha, nota.numeroLinha, { erro: mensagem });
        }
        onEvento({ tipo: "linha_resultado", numeroLinha: nota.numeroLinha, status: "erro", erro: mensagem });
      }

      await sleep(config.DF_DELAY_MS);
    }
  } finally {
    // Em modo debug (DF_DEBUG_CDP_PORT setado, ver config.js) deixa o
    // navegador aberto depois do pedaco pra dar tempo de inspecionar o DOM
    // via CDP -- fechar aqui destruiria a sessao antes de conseguir olhar.
    if (!config.DF_DEBUG_CDP_PORT) {
      await browser.close();
    }
  }
}

/**
 * Processa as notas pendentes de uma planilha: login, seleciona o
 * estabelecimento e emite (ou simula, em dryRun) cada nota em sequencia.
 * Internamente divide o lote em pedacos de config.DF_TAMANHO_LOTE notas,
 * cada um com sua propria sessao de navegador (ver processarPedaco) -- pra
 * quem chama isso e transparente, continua sendo "processa a planilha
 * inteira" de ponta a ponta.
 *
 * @param {string} caminhoPlanilha
 * @param {{ limite?: number, dryRun?: boolean, dataCompetencia?: string, credenciais: { login: string, senha: string } }} opcoes
 * @param {(evento: object) => void} onEvento chamado a cada passo do processo
 */
export async function processarLote(
  caminhoPlanilha,
  { limite, dryRun = false, dataCompetencia = null, credenciais } = {},
  onEvento = () => {}
) {
  let notas = await carregarNotasPendentes(caminhoPlanilha);
  if (limite) notas = notas.slice(0, limite);

  if (notas.length === 0) {
    onEvento({ tipo: "sem_pendentes" });
    return;
  }

  onEvento({ tipo: "inicio", total: notas.length });

  // Modo debug processa tudo numa unica sessao (ver comentario em
  // processarPedaco) -- dividir em pedacos abriria/fecharia varios
  // navegadores no meio da depuracao, o que atrapalha em vez de ajudar.
  const tamanhoLote = config.DF_DEBUG_CDP_PORT ? notas.length : config.DF_TAMANHO_LOTE;
  const pedacos = dividirEmPedacos(notas, tamanhoLote);

  for (let i = 0; i < pedacos.length; i++) {
    if (pedacos.length > 1) {
      onEvento({ tipo: "fase", mensagem: `Iniciando lote ${i + 1}/${pedacos.length} (reabrindo o navegador)...` });
    }
    const indiceInicial = i * tamanhoLote;
    await processarPedaco(pedacos[i], caminhoPlanilha, { dryRun, dataCompetencia, credenciais, indiceInicial, total: notas.length }, onEvento);
  }

  onEvento({ tipo: "concluido" });
}

// Logica de processamento de um lote de notas pendentes de uma planilha,
// usada pelo servidor (server/gerenciadorJobs.js). Reporta o progresso via
// callback onEvento, pra quem chamar decidir o que fazer com cada evento.

import * as config from "./config.js";
import { carregarNotasPendentes, marcarResultado } from "./planilha.js";
import { abrirNavegador, emitirNota, ErroEmissaoNota, fazerLogin, selecionarEstabelecimento } from "./roboDf.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Processa as notas pendentes de uma planilha: login, seleciona o
 * estabelecimento e emite (ou simula, em dryRun) cada nota em sequencia.
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

  const { browser, page } = await abrirNavegador();

  try {
    onEvento({ tipo: "fase", mensagem: "Fazendo login..." });
    await fazerLogin(page, credenciais);

    onEvento({ tipo: "fase", mensagem: `Login OK. Selecionando estabelecimento ${config.DF_CNPJ_ESTABELECIMENTO}...` });
    await selecionarEstabelecimento(page);
    onEvento({ tipo: "fase", mensagem: "Estabelecimento selecionado." });

    for (let i = 0; i < notas.length; i++) {
      const nota = notas[i];
      const cliente = nota.dados["CNPJ CLIENTE"] ?? "?";

      onEvento({ tipo: "linha_inicio", indice: i + 1, total: notas.length, numeroLinha: nota.numeroLinha, cliente });

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
    // navegador aberto depois do lote pra dar tempo de inspecionar o DOM
    // via CDP -- fechar aqui destruiria a sessao antes de conseguir olhar.
    if (!config.DF_DEBUG_CDP_PORT) {
      await browser.close();
    }
  }

  onEvento({ tipo: "concluido" });
}

// So usado em producao (ver server/index.js) -- em desenvolvimento os
// arquivos de uploads/ ficam guardados pra sempre, de proposito, pra dar pra
// reabrir/depurar uma planilha ja processada.
//
// A planilha enviada precisa continuar em disco enquanto o usuario nao baixa
// o resultado (o robo escreve o numero de cada nota nela e o botao "Baixar
// planilha atualizada" serve esse mesmo arquivo -- ver server/rotas.js e
// src/planilha.js), entao nao da pra apagar na hora do upload. Em vez disso,
// varre a pasta periodicamente e apaga so o que ja passou da TTL -- tempo de
// sobra pra qualquer usuario baixar o resultado, mas sem acumular pra sempre
// no disco (efemero e limitado) do servidor.

import { readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";

const TTL_MS = 2 * 60 * 60 * 1000; // 2 horas

function limparArquivosAntigos(pasta) {
  let entradas;
  try {
    entradas = readdirSync(pasta);
  } catch {
    return;
  }

  const agora = Date.now();
  for (const nome of entradas) {
    const caminho = path.join(pasta, nome);
    try {
      const info = statSync(caminho);
      if (info.isFile() && agora - info.mtimeMs > TTL_MS) unlinkSync(caminho);
    } catch {
      // arquivo pode ter sumido entre o readdir e o stat/unlink (outra
      // varredura concorrente, ou o download reprocessando) -- ignora.
    }
  }
}

export function iniciarLimpezaPeriodica(pasta, intervaloMs = 30 * 60 * 1000) {
  limparArquivosAntigos(pasta);
  setInterval(() => limparArquivosAntigos(pasta), intervaloMs).unref();
}

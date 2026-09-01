// Estado em memoria dos jobs de lancamento de notas, disparados pelo front-end.
//
// So um job pode estar "rodando" por vez, porque o robo usa uma unica sessao
// de navegador (login uma vez, depois processa as linhas em sequencia) -- o
// mesmo comportamento sequencial que a CLI ja tem.

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import { CredenciaisInvalidasError } from "../src/roboDf.js";
import { processarLote } from "../src/processarLote.js";

const jobs = new Map();
let jobRodandoId = null;

export class JobJaRodandoError extends Error {}

export function criarJob(caminhoPlanilha, totalPendentes) {
  const id = randomUUID();
  const job = {
    id,
    caminhoPlanilha,
    status: "aguardando", // aguardando -> rodando -> concluido | erro
    totalPendentes,
    mensagemFase: null,
    linhas: [],
    erroFatal: null,
    credenciaisInvalidas: false,
    emitter: new EventEmitter(),
  };
  job.emitter.setMaxListeners(0);
  jobs.set(id, job);
  return job;
}

export function obterJob(jobId) {
  return jobs.get(jobId) ?? null;
}

/** Snapshot serializavel do job, sem o EventEmitter (para respostas HTTP). */
export function snapshotJob(job) {
  const { id, status, totalPendentes, mensagemFase, linhas, erroFatal, credenciaisInvalidas } = job;
  return { id, status, totalPendentes, mensagemFase, linhas, erroFatal, credenciaisInvalidas };
}

function aplicarEvento(job, evento) {
  switch (evento.tipo) {
    case "inicio":
      job.status = "rodando";
      break;
    case "fase":
      job.mensagemFase = evento.mensagem;
      break;
    case "linha_inicio":
      job.linhas.push({ numeroLinha: evento.numeroLinha, cliente: evento.cliente, status: "rodando" });
      break;
    case "linha_resultado": {
      const linha = job.linhas.find((l) => l.numeroLinha === evento.numeroLinha);
      if (linha) {
        linha.status = evento.status;
        linha.resultado = evento.resultado ?? null;
        linha.erro = evento.erro ?? null;
      }
      break;
    }
    case "concluido":
    case "sem_pendentes":
      job.status = "concluido";
      break;
  }
}

export function iniciarJob(jobId, opcoes) {
  const job = obterJob(jobId);
  if (!job) throw new Error(`Job ${jobId} nao encontrado.`);
  if (jobRodandoId) throw new JobJaRodandoError(`Ja existe um job em andamento (${jobRodandoId}).`);

  jobRodandoId = jobId;
  job.status = "rodando";

  processarLote(job.caminhoPlanilha, opcoes, (evento) => {
    aplicarEvento(job, evento);
    job.emitter.emit("evento", evento);
  })
    .catch((err) => {
      job.status = "erro";
      job.erroFatal = err.message ?? String(err);
      job.credenciaisInvalidas = err instanceof CredenciaisInvalidasError;
      job.emitter.emit("evento", {
        tipo: "erro_fatal",
        mensagem: job.erroFatal,
        credenciaisInvalidas: job.credenciaisInvalidas,
      });
    })
    .finally(() => {
      if (jobRodandoId === jobId) jobRodandoId = null;
      job.emitter.emit("fim");
    });

  return job;
}

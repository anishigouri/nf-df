import { mkdirSync } from "node:fs";
import path from "node:path";

import express from "express";
import multer from "multer";

import * as config from "../src/config.js";
import { carregarNotasPendentes } from "../src/planilha.js";
import { criarJob, iniciarJob, JobJaRodandoError, obterJob, snapshotJob } from "./gerenciadorJobs.js";

export const PASTA_UPLOADS = "uploads";
mkdirSync(PASTA_UPLOADS, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: PASTA_UPLOADS,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
});

export const rotas = express.Router();

rotas.post("/upload", upload.single("planilha"), async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: "Nenhum arquivo enviado (campo 'planilha')." });

  try {
    const pendentes = await carregarNotasPendentes(req.file.path);
    const job = criarJob(req.file.path, pendentes.length);
    res.status(201).json({ jobId: job.id, totalPendentes: pendentes.length });
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});

rotas.get("/jobs/:jobId", (req, res) => {
  const job = obterJob(req.params.jobId);
  if (!job) return res.status(404).json({ erro: "Job nao encontrado." });
  res.json(snapshotJob(job));
});

rotas.post("/jobs/:jobId/iniciar", express.json(), (req, res) => {
  let { limite = null, dryRun = false, dataCompetencia = null, login, senha } = req.body ?? {};
  if (!login || !senha) return res.status(400).json({ erro: "Login e senha sao obrigatorios." });

  // Em producao processa sempre o lote inteiro, pra valer -- dry-run e
  // limite parcial sao so ferramentas de depuracao/teste, e o front nem
  // oferece essas opcoes (ver client/src/App.jsx), mas forca aqui tambem
  // caso alguem chame a API direto.
  if (config.IS_PRODUCTION) {
    limite = null;
    dryRun = false;
  }

  try {
    const job = iniciarJob(req.params.jobId, { limite, dryRun, dataCompetencia, credenciais: { login, senha } });
    res.status(202).json(snapshotJob(job));
  } catch (err) {
    if (err instanceof JobJaRodandoError) return res.status(409).json({ erro: err.message });
    res.status(404).json({ erro: err.message });
  }
});

rotas.get("/jobs/:jobId/eventos", (req, res) => {
  const job = obterJob(req.params.jobId);
  if (!job) return res.status(404).end();

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const enviar = (tipo, dados) => res.write(`event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`);

  enviar("snapshot", snapshotJob(job));

  const onEvento = (evento) => enviar("progresso", evento);
  const onFim = () => {
    enviar("snapshot", snapshotJob(job));
    res.end();
  };

  job.emitter.on("evento", onEvento);
  job.emitter.on("fim", onFim);

  req.on("close", () => {
    job.emitter.off("evento", onEvento);
    job.emitter.off("fim", onFim);
  });
});

rotas.get("/jobs/:jobId/planilha", (req, res) => {
  const job = obterJob(req.params.jobId);
  if (!job) return res.status(404).json({ erro: "Job nao encontrado." });

  // Em producao o arquivo pode ja ter sido apagado pela limpeza periodica
  // (ver server/limpezaUploads.js) se o download demorou demais -- responde
  // com um erro claro em vez de deixar o res.download estourar um 500 generico.
  res.download(path.resolve(job.caminhoPlanilha), "notas.xlsx", (err) => {
    if (err && !res.headersSent) {
      res.status(410).json({ erro: "Planilha nao esta mais disponivel para download (expirou)." });
    }
  });
});

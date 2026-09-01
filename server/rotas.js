import { mkdirSync } from "node:fs";
import path from "node:path";

import express from "express";
import multer from "multer";

import { carregarNotasPendentes } from "../src/planilha.js";
import { criarJob, iniciarJob, JobJaRodandoError, obterJob, snapshotJob } from "./gerenciadorJobs.js";

const PASTA_UPLOADS = "uploads";
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
  const { limite = null, dryRun = false, dataCompetencia = null, login, senha } = req.body ?? {};
  if (!login || !senha) return res.status(400).json({ erro: "Login e senha sao obrigatorios." });

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
  res.download(path.resolve(job.caminhoPlanilha), "notas.xlsx");
});

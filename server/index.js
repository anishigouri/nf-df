import path from "node:path";

import express from "express";

import { rotas } from "./rotas.js";

const PORTA = Number(process.env.PORT ?? 3001);
const PASTA_CLIENT_BUILD = path.resolve("client/dist");

const app = express();
app.use("/api", rotas);

// Em producao (depois de "npm run build" no client), o proprio Express serve
// os arquivos estaticos do React. Em desenvolvimento, quem serve o front e o
// Vite (com proxy de /api pra esta porta) -- ver client/vite.config.js.
app.use(express.static(PASTA_CLIENT_BUILD));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(PASTA_CLIENT_BUILD, "index.html"), (err) => {
    if (err) next();
  });
});

app.listen(PORTA, () => {
  console.log(`Servidor rodando em http://localhost:${PORTA}`);
});

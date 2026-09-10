// Gera o pacote desktop (nf-df-pacote, na pasta ACIMA deste repositorio) --
// uma copia autossuficiente do sistema, com Node.js portatil e o Chromium
// headless-shell do Playwright embutidos, pronta pra copiar pra qualquer PC
// Windows e usar so dando dois cliques no Iniciar.bat (ver desktop/LEIA-ME.txt).
//
// Rodar com: npm run empacotar
//
// So funciona em Windows (o launcher gerado e um .bat e o Node portatil
// baixado e a build win-x64) -- combina com o unico jeito de distribuicao
// que este projeto tem hoje.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PASTA_DESKTOP = path.join(RAIZ_REPO, "desktop");
const PASTA_CACHE = path.join(RAIZ_REPO, ".cache");
const PASTA_PACOTE = path.resolve(RAIZ_REPO, "..", "nf-df-pacote");
const PASTA_PLAYWRIGHT_CACHE = path.join(os.homedir(), "AppData", "Local", "ms-playwright");

function log(mensagem) {
  console.log(`[empacotar] ${mensagem}`);
}

// No Windows, "npm"/"npx" sao arquivos .cmd (scripts em lote, nao
// executaveis diretos) -- rodar um .cmd via child_process exige shell:true
// (o Windows precisa do interpretador de comando pra executa-lo). curl e
// powershell sao .exe de verdade, nao precisam disso -- e e melhor evitar:
// com shell:true os argumentos nao sao escapados automaticamente, o que
// quebraria se algum caminho tivesse espaco (ex. "C:\Users\Joao Silva\...").
// Os args que passamos pro npm/npx aqui sao sempre fixos (nunca caminho
// dinamico), entao shell:true so nesses casos e seguro.
function rodar(comando, args, opcoes = {}) {
  const ehComandoBat = process.platform === "win32" && ["npm", "npx"].includes(comando);
  const comandoResolvido = ehComandoBat ? `${comando}.cmd` : comando;
  execFileSync(comandoResolvido, args, { stdio: "inherit", shell: ehComandoBat, ...opcoes });
}

function tamanhoLegivel(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(0)}MB`;
}

function tamanhoPasta(caminho) {
  let total = 0;
  for (const item of readdirSync(caminho, { withFileTypes: true })) {
    const caminhoItem = path.join(caminho, item.name);
    total += item.isDirectory() ? tamanhoPasta(caminhoItem) : statSync(caminhoItem).size;
  }
  return total;
}

// 1) recomeca do zero -------------------------------------------------------
if (existsSync(PASTA_PACOTE)) {
  // So apaga se realmente parecer um pacote gerado por este script --
  // seguranca contra apagar a pasta errada se PASTA_PACOTE algum dia mudar.
  if (!existsSync(path.join(PASTA_PACOTE, "Iniciar.bat")) && readdirSync(PASTA_PACOTE).length > 0) {
    throw new Error(
      `${PASTA_PACOTE} ja existe e nao parece um pacote gerado por este script (sem Iniciar.bat). ` +
        `Apague ou mova essa pasta manualmente antes de rodar de novo.`
    );
  }
  log("apagando pacote anterior...");
  rmSync(PASTA_PACOTE, { recursive: true, force: true });
}
mkdirSync(path.join(PASTA_PACOTE, "app"), { recursive: true });

// 2) builda o front-end -------------------------------------------------------
log("buildando o front-end (vite build)...");
rodar("npm", ["run", "build"], { cwd: path.join(RAIZ_REPO, "client") });

// 3) copia os arquivos do app -------------------------------------------------
log("copiando server/, src/, client/dist/...");
cpSync(path.join(RAIZ_REPO, "server"), path.join(PASTA_PACOTE, "app", "server"), { recursive: true });
cpSync(path.join(RAIZ_REPO, "src"), path.join(PASTA_PACOTE, "app", "src"), { recursive: true });
cpSync(path.join(RAIZ_REPO, "client", "dist"), path.join(PASTA_PACOTE, "app", "client", "dist"), { recursive: true });
cpSync(path.join(RAIZ_REPO, "package.json"), path.join(PASTA_PACOTE, "app", "package.json"));
cpSync(path.join(RAIZ_REPO, "package-lock.json"), path.join(PASTA_PACOTE, "app", "package-lock.json"));

// 4) node_modules so com dependencies de producao -----------------------------
// --ignore-scripts pula o postinstall (que roda "playwright install
// chromium", o Chromium completo) -- nao precisamos dele aqui, o browser
// entra separado no passo 6, via chromium-headless-shell.
log("instalando node_modules so com dependencias de producao...");
rodar("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], {
  cwd: path.join(PASTA_PACOTE, "app"),
});

// 5) Node.js portatil (baixa uma vez e guarda em cache) ------------------------
const versaoNode = process.version; // mesma versao ja testada rodando este repo
const zipNodeCache = path.join(PASTA_CACHE, `node-${versaoNode}-win-x64.zip`);
if (!existsSync(zipNodeCache)) {
  log(`baixando Node.js portatil ${versaoNode} (uma vez so, fica em cache)...`);
  mkdirSync(PASTA_CACHE, { recursive: true });
  rodar("curl", ["-L", "-o", zipNodeCache, `https://nodejs.org/dist/${versaoNode}/node-${versaoNode}-win-x64.zip`]);
} else {
  log("Node.js portatil ja em cache, pulando download.");
}

log("extraindo Node.js portatil...");
const pastaExtracaoTemp = path.join(PASTA_CACHE, "node-extraido-temp");
rmSync(pastaExtracaoTemp, { recursive: true, force: true });
rodar("powershell", [
  "-NoProfile",
  "-Command",
  `Expand-Archive -Path "${zipNodeCache}" -DestinationPath "${pastaExtracaoTemp}" -Force`,
]);
const pastaNodeExtraida = path.join(pastaExtracaoTemp, `node-${versaoNode}-win-x64`);
cpSync(pastaNodeExtraida, path.join(PASTA_PACOTE, "node"), { recursive: true });
rmSync(pastaExtracaoTemp, { recursive: true, force: true });

// So precisamos do node.exe pra rodar server/index.js -- nunca chamamos
// npm/npx/corepack de dentro do pacote, entao tira tudo isso fora.
const MANTER_NO_NODE = new Set(["node.exe", "LICENSE"]);
const pastaNodePacote = path.join(PASTA_PACOTE, "node");
for (const nome of readdirSync(pastaNodePacote)) {
  if (!MANTER_NO_NODE.has(nome)) {
    rmSync(path.join(pastaNodePacote, nome), { recursive: true, force: true });
  }
}

// 6) Chromium headless-shell do Playwright -------------------------------------
log("garantindo que o Chromium headless-shell do Playwright esta instalado...");
rodar("npx", ["playwright", "install", "chromium-headless-shell"], {
  cwd: RAIZ_REPO,
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: "" }, // forca o cache padrao, ignora qualquer override do ambiente
});

const pastaBrowserCache = readdirSync(PASTA_PLAYWRIGHT_CACHE).find((nome) => nome.startsWith("chromium_headless_shell-"));
if (!pastaBrowserCache) {
  throw new Error(`Nao encontrei chromium_headless_shell-* em ${PASTA_PLAYWRIGHT_CACHE} depois do playwright install.`);
}
log(`copiando ${pastaBrowserCache} (o navegador headless, maior parte do tamanho do pacote)...`);
mkdirSync(path.join(PASTA_PACOTE, "browsers"), { recursive: true });
cpSync(
  path.join(PASTA_PLAYWRIGHT_CACHE, pastaBrowserCache),
  path.join(PASTA_PACOTE, "browsers", pastaBrowserCache),
  { recursive: true }
);

// 7) launcher, LEIA-ME e .env, a partir dos templates em desktop/ -------------
log("copiando Iniciar.bat, LEIA-ME.txt e .env...");
cpSync(path.join(PASTA_DESKTOP, "Iniciar.bat"), path.join(PASTA_PACOTE, "Iniciar.bat"));
cpSync(path.join(PASTA_DESKTOP, "LEIA-ME.txt"), path.join(PASTA_PACOTE, "LEIA-ME.txt"));
cpSync(path.join(PASTA_DESKTOP, ".env.exemplo"), path.join(PASTA_PACOTE, "app", ".env"));

// 8) zip, se der (melhor esforco -- nao quebra o script se falhar) -----------
const caminhoZip = `${PASTA_PACOTE}.zip`;
try {
  log("compactando em .zip...");
  rmSync(caminhoZip, { force: true });
  rodar("powershell", [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path "${PASTA_PACOTE}\\*" -DestinationPath "${caminhoZip}"`,
  ]);
  log(`zip pronto em: ${caminhoZip}`);
} catch (err) {
  log(`nao consegui compactar automaticamente (${err.message}) -- compacte a pasta manualmente.`);
}

console.log("");
console.log(`Pacote pronto em: ${PASTA_PACOTE} (${tamanhoLegivel(tamanhoPasta(PASTA_PACOTE))})`);
console.log("Antes de mandar pra alguem, teste voce mesmo: de dois cliques no Iniciar.bat dessa pasta.");

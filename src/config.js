import "dotenv/config";

function envBool(nome, padrao) {
  const valor = process.env[nome];
  if (valor === undefined) return padrao;
  return ["1", "true", "yes", "sim"].includes(valor.trim().toLowerCase());
}

// O Dockerfile ja fixa NODE_ENV=production pra qualquer deploy (Render
// inclusive); em desenvolvimento local (node server/index.js direto, sem
// Docker) essa variavel fica indefinida, entao IS_PRODUCTION da false. Usado
// pra decidir o que grava em disco: em producao so a planilha (necessaria pro
// download) e mantida, e por pouco tempo -- nada de screenshot/texto de
// evidencia, que so servem pra depuracao e acumulavam sem limite no disco do
// servidor (ver roboDf.js e server/limpezaUploads.js).
export const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Login/senha do ISS Online DF nunca ficam no .env -- vem da tela de login
// do front-end a cada processamento (ver server/rotas.js).
export const DF_CNPJ_ESTABELECIMENTO = process.env.DF_CNPJ_ESTABELECIMENTO ?? "";
export const DF_HEADLESS = envBool("DF_HEADLESS", true);
export const DF_DELAY_MS = Number(process.env.DF_DELAY_MS ?? "3000");

// "chromium-headless-shell" e uma build separada do Chromium, so pra uso
// automatizado/headless -- bem menor em disco que o Chromium completo (o
// pacote desktop distribuido, ver LEIA-ME.txt, usa isso pra caber menos:
// ~272MB contra ~428MB do Chromium completo) mas NUNCA abre janela visivel,
// entao DF_HEADLESS e ignorado (forcado true) quando isso esta ligado.
// Deixar desligado no dev normal, onde DF_HEADLESS=false serve pra
// acompanhar/depurar o navegador de verdade.
export const DF_CHROMIUM_HEADLESS_SHELL = envBool("DF_CHROMIUM_HEADLESS_SHELL", false);

// Um Chromium so, aberto pro lote inteiro, vai acumulando memoria a cada
// nota. processarLote.js fecha e reabre o navegador a cada DF_TAMANHO_LOTE
// notas (login + selecao de estabelecimento de novo a cada reabertura),
// devolvendo a memoria do Chromium anterior pro SO antes de continuar. O
// numero de notas processado nao muda pra quem usa o sistema -- e so um
// detalhe interno de como o lote e dividido.
//
// Padrao 1 (fecha e reabre a CADA nota) porque, mesmo depois de eliminar o
// reparse repetido da planilha (ver planilha.js) e enxugar os args do
// Chromium (ver abrirNavegador em roboDf.js), um UNICO pedaco de so 5 notas
// ainda chegou a ~490MB no plano de 512MB do Render (confirmado ao vivo em
// 10/09/2026, 2 incidentes reais derrubando o servico) -- o formulario desse
// site (JS/Telerik pesado, varios iframes/postbacks) parece custar memoria
// real ja nas primeiras notas de uma sessao, entao o pedaco precisa ser bem
// pequeno pra sobrar margem. O custo e velocidade: relogar + reselecionar o
// estabelecimento a cada nota adiciona uns 15-30s por nota. Se isso ainda
// nao for suficiente, o teto de 512MB do plano (Free E Starter -- so o
// Standard tem mais RAM, ver README secao 4) provavelmente e o fator
// limitante de verdade, nao mais o codigo.
export const DF_TAMANHO_LOTE = Number(process.env.DF_TAMANHO_LOTE ?? "1");

// So pra depuracao: expoe o Chromium via Chrome DevTools Protocol nessa
// porta (ver abrirNavegador em roboDf.js), permitindo que uma ferramenta
// externa (ex.: um MCP de navegador configurado com --cdp-endpoint) grude na
// MESMA sessao ja logada e inspecione o DOM ao vivo. Tambem faz o
// processarLote NAO fechar o navegador no final do lote, pra sobrar tempo de
// inspecionar depois. Deixar sem definir em producao -- esse endpoint deixa
// qualquer processo local controlar o navegador.
export const DF_DEBUG_CDP_PORT = process.env.DF_DEBUG_CDP_PORT ?? null;

export const URL_LOGIN = "https://iss.fazenda.df.gov.br/online/Login/Login.aspx";

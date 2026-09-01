// Automacao do site iss.fazenda.df.gov.br usando Playwright.
//
// Fluxo mapeado navegando de verdade pelo site em 31/08/2026: login (com
// teclado virtual de senha) -> selecionar o estabelecimento (CNPJ) na lista
// paginada de empresas -> pular popup de confirmacao cadastral, se aparecer
// -> menu "Nota Eletronica" -> "Nova Nota Eletronica" (abre num <iframe>) ->
// preencher formulario -> Gravar.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

import * as config from "./config.js";
import { ACOES, EMPRESAS, FORMULARIO_NOTA, LOGIN, MENU, MODAL_ATENCAO, POPUP_CADASTRO, VALORES_FIXOS } from "./seletores.js";

const PASTA_SCREENSHOTS = "screenshots";
mkdirSync(PASTA_SCREENSHOTS, { recursive: true });

export class ErroEmissaoNota extends Error {}

/** Login ou senha recusados pelo site -- usado pelo servidor pra saber quando
 * precisa derrubar a sessao do front-end e pedir login de novo. */
export class CredenciaisInvalidasError extends ErroEmissaoNota {}

/**
 * Abre um browser configurado para nao ser bloqueado pelo Cloudflare que
 * protege os arquivos estaticos do site (sem isso, jQuery e as funcoes do
 * site nem carregam e nada funciona).
 */
export async function abrirNavegador() {
  const browser = await chromium.launch({
    headless: config.DF_HEADLESS,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();
  return { browser, page };
}

async function digitarSenhaTecladoVirtual(page, senha) {
  const pares = {};
  for (let i = 1; i <= 5; i++) {
    const texto = await page.locator(`#btn${i}`).getAttribute("value");
    pares[i] = texto.split("-").map((s) => s.trim());
  }
  for (const digito of senha) {
    const idx = Object.keys(pares).find((i) => pares[i].includes(digito));
    if (!idx) {
      throw new ErroEmissaoNota(`Digito ${digito} da senha nao apareceu no teclado virtual: ${JSON.stringify(pares)}`);
    }
    await page.locator(`#btn${idx}`).click();
    await page.waitForTimeout(120);
  }
}

/**
 * Faz login no site com as credenciais informadas -- nunca mais lidas do
 * .env aqui, quem chama decide de onde vem (CLI le do .env, servidor recebe
 * do front-end a cada requisicao).
 */
export async function fazerLogin(page, { login, senha }) {
  await page.goto(config.URL_LOGIN, { waitUntil: "networkidle" });
  await page.fill(LOGIN.campoUsuario, login);
  await digitarSenhaTecladoVirtual(page, senha);

  await Promise.all([page.waitForLoadState("networkidle"), page.locator(LOGIN.botaoEntrar).click()]);
  await page.waitForTimeout(1000);

  if (page.url().includes("Login.aspx")) {
    throw new CredenciaisInvalidasError("Login ou senha incorretos.");
  }
}

/** Seleciona, na lista paginada de empresas, o estabelecimento com o CNPJ configurado. */
export async function selecionarEstabelecimento(page) {
  const cnpjDigitos = config.DF_CNPJ_ESTABELECIMENTO.replace(/\D/g, "");

  for (let pagina = 1; pagina <= 10; pagina++) {
    const linha = await page.evaluate((cnpjAlvo) => {
      const linhas = Array.from(document.querySelectorAll("#dgEmpresas tr"));
      for (const tr of linhas) {
        const tds = Array.from(tr.querySelectorAll("td[title]"));
        const tdCnpj = tds.find((td) => /^\d+$/.test(td.getAttribute("title")));
        if (tdCnpj && tdCnpj.getAttribute("title") === cnpjAlvo) {
          const link = tr.querySelector("a[id*='imbSelecione']");
          return { encontrado: true, linkId: link?.id };
        }
      }
      return { encontrado: false };
    }, cnpjDigitos);

    if (linha.encontrado) {
      await Promise.all([page.waitForLoadState("networkidle"), page.locator(`#${linha.linkId}`).click()]);
      await page.waitForTimeout(1000);

      if (page.url().includes("popInformacaoCadastral")) {
        await Promise.all([
          page.waitForLoadState("networkidle"),
          page.locator(POPUP_CADASTRO.botaoCancelar).first().click(),
        ]);
        await page.waitForTimeout(1000);
      }
      return;
    }

    const linkProximaPagina = page.locator(EMPRESAS.tabela).getByRole("link", {
      name: EMPRESAS.linkPaginaTexto(pagina + 1),
      exact: true,
    });
    if ((await linkProximaPagina.count()) === 0) break;

    await Promise.all([page.waitForLoadState("networkidle"), linkProximaPagina.click()]);
    await page.waitForTimeout(800);
  }

  throw new ErroEmissaoNota(
    `CNPJ ${config.DF_CNPJ_ESTABELECIMENTO} nao encontrado na lista de empresas do usuario logado.`
  );
}

async function esperarFrame(page, predicado, timeoutMs) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const frame = page.frames().find(predicado);
    if (frame) return frame;
    await page.waitForTimeout(300);
  }
  return null;
}

/** Abre o menu lateral e navega ate o formulario de nova nota, que carrega dentro de um iframe. */
export async function abrirFormularioNovaNota(page) {
  await page.locator(MENU.grupoNotaEletronica).first().click();
  await page.waitForTimeout(500);

  await Promise.all([page.waitForLoadState("networkidle"), page.locator(MENU.linkNovaNota).click()]);

  // Espera ativamente (com retry) em vez de um tempo fixo -- o iframe pode
  // demorar mais que isso pra aparecer dependendo da resposta do site.
  const frame = await esperarFrame(page, (f) => f.url().includes("NotaNacional.aspx"), 15000);
  if (!frame) {
    const caminhoPrint = path.join(PASTA_SCREENSHOTS, "erro_iframe_nova_nota.png");
    await page.screenshot({ path: caminhoPrint, fullPage: true }).catch(() => {});
    throw new ErroEmissaoNota(`Nao encontrei o iframe da Nova Nota Eletronica. Screenshot salvo em ${caminhoPrint}.`);
  }
  await frame.waitForLoadState("networkidle").catch(() => {});
  return frame;
}

// Overlay de carregamento generico -- varios sites ASP.NET usam um destes
// padroes pra bloquear a tela durante um postback. E so um "melhor esforco":
// se nenhum desses seletores existir na pagina, ou o overlay sumir rapido
// demais pra pegar o "visible", segue sem travar o fluxo (o networkidle e o
// timeout extra em selecionarEEsperar cobrem esse caso).
async function esperarCarregamentoSumir(frame, timeoutMs = 10000) {
  const seletorOverlay =
    ".loading, .overlay-loading, .load-overlay, .blockUI, .blockOverlay, [id*='UpdateProgress'], #divCarregando, .modal-loading";
  const overlay = frame.locator(seletorOverlay).first();
  const apareceu = await overlay
    .waitFor({ state: "visible", timeout: 800 })
    .then(() => true)
    .catch(() => false);
  if (apareceu) {
    await overlay.waitFor({ state: "hidden", timeout: timeoutMs }).catch(() => {});
  }
}

// Alguns combos da cascata disparam um postback maior (usuario confirmou por
// screenshot em 01/09/2026 que os campos de retencao tambem carregam a tela)
// -- esperaExtraMs deixa dar uma folga maior pra esses casos especificos em
// vez de um timeout fixo curto pra todos.
async function selecionarEEsperar(frame, seletor, valor, esperaExtraMs = 800) {
  await frame.selectOption(seletor, valor);
  await frame.waitForLoadState("networkidle").catch(() => {});
  await esperarCarregamentoSumir(frame);
  await frame.waitForTimeout(esperaExtraMs);
}

// So para diagnostico: le o valor atualmente selecionado nos campos da
// cascata de tributacao. Usado pra descobrir em que ponto exato do fluxo
// esses campos "somem" -- confirmado por screenshot em 01/09/2026 que
// Tributacao do ISSQN, Regime Especial, Tipo de Retencao do ISSQN e Tipo de
// Retencao do PIS/COFINS/CSLL ficam vazios no Gravar mesmo apos serem
// selecionados explicitamente aqui, enquanto Situacao Tributaria do
// PIS/COFINS (selecionado no meio dessa mesma cascata) fica correto -- ou
// seja, a selecao em si funciona, mas algo DEPOIS reverte alguns campos.
async function lerCascataTributacao(frame) {
  const campos = ["ddlTribISSQN", "ddlTipoRetencaoISSQN", "ddlRegimeEspecial", "ddlSitTribFederal", "ddlTipoRetencaoPisCofinsCsll"];
  const valores = {};
  for (const campo of campos) {
    valores[campo] = await frame
      .locator(FORMULARIO_NOTA[campo])
      .inputValue()
      .catch(() => "(erro ao ler)");
  }
  return valores;
}

// Converte "AAAA-MM-DD" (formato do <input type="date"> do front-end) para
// "DD/MM/AAAA" (formato usado nos campos de data do site da DF).
function formatarDataBr(dataIso) {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

// Traduz os nomes de coluna da planilha para os campos do formulario.
function mapearDadosDaPlanilha(linha) {
  return {
    cnpjCliente: String(linha["CNPJ CLIENTE"] ?? "").trim(),
    descricaoServico: String(linha["DESCRIÇÃO"] ?? "").trim(),
    valorServico: linha["VALOR CONTABIL"],
  };
}

/**
 * Preenche o formulario da nota no iframe. Retorna sem gravar -- quem chama
 * decide se confirma a gravacao (ver emitirNota).
 */
async function preencherFormulario(frame, linha, dataCompetencia) {
  const dados = mapearDadosDaPlanilha(linha);

  if (!dados.cnpjCliente) throw new ErroEmissaoNota("Linha sem CNPJ CLIENTE preenchido.");
  if (!dados.descricaoServico) throw new ErroEmissaoNota("Linha sem DESCRIÇÃO preenchida.");
  if (!dados.valorServico) throw new ErroEmissaoNota("Linha sem VALOR CONTABIL preenchido.");

  // Descricao e Valor Total dos Servicos precisam vir ANTES da cascata de
  // tributacao -- Valor Total dos Servicos e a propria Base de Calculo do
  // ISSQN (confirmado por screenshot em 01/09/2026: os dois campos mostram
  // sempre o mesmo numero), entao o calculo/validacao da secao ISSQN
  // (Tributacao do ISSQN, Regime Especial, Tipo de Retencao do ISSQN)
  // depende desse valor ja estar preenchido. Preenchendo so no final (como
  // era antes), o modal "Atencao" volta a pedir esses campos de tributacao
  // mesmo apos serem selecionados. O Tab depois do valor garante o blur/
  // "change" real (fill() sozinho so dispara "input"), igual ja fizemos com
  // a Data de Competencia.
  await frame.fill(FORMULARIO_NOTA.descricaoServico, dados.descricaoServico);
  await frame.fill(FORMULARIO_NOTA.valorServico, String(dados.valorServico));
  await frame.locator(FORMULARIO_NOTA.valorServico).press("Tab");
  await frame.waitForLoadState("networkidle").catch(() => {});
  await frame.waitForTimeout(500);

  // cascata de selects -- cada um so populariza as opcoes (ou registra a
  // escolha no servidor via postback/AJAX) depois que o anterior e
  // escolhido. Espera a rede ficar parada de verdade em vez de um tempo
  // fixo, porque um delay fixo curto demais faz o site achar que o campo
  // ficou vazio (confirmado: modal "Atencao" pedindo pra preencher Tributacao
  // do ISSQN/Regime Especial/PIS-COFINS-CSLL mesmo com o valor selecionado).
  await selecionarEEsperar(frame, FORMULARIO_NOTA.ddlAtivMunicipal, VALORES_FIXOS.atividadeMunicipal);
  await selecionarEEsperar(frame, FORMULARIO_NOTA.ddlTrbNacional, VALORES_FIXOS.tributacaoNacional);
  await selecionarEEsperar(frame, FORMULARIO_NOTA.ddlNBS, VALORES_FIXOS.nbs);
  await selecionarEEsperar(frame, FORMULARIO_NOTA.ddlTribISSQN, VALORES_FIXOS.tribISSQN);
  // Regime Especial precisa vir ANTES de Tipo de Retencao do ISSQN -- essa e
  // a ordem real do formulario (confirmada pelo HTML que o usuario mandou em
  // 01/09/2026: Regime Especial aparece antes de Tipo de Retencao do ISSQN
  // na pagina). Selecionar na ordem trocada faz o site nunca popular a opcao
  // "1" em #ddlTipoRetencao, e frame.selectOption trava em timeout
  // ("did not find some options") esperando por uma opcao que nunca aparece.
  await selecionarEEsperar(frame, FORMULARIO_NOTA.ddlRegimeEspecial, VALORES_FIXOS.regimeEspecial);
  await selecionarEEsperar(frame, FORMULARIO_NOTA.ddlTipoRetencaoISSQN, VALORES_FIXOS.tipoRetencaoISSQN, 3000);
  await selecionarEEsperar(frame, FORMULARIO_NOTA.ddlSitTribFederal, VALORES_FIXOS.situacaoTributariaPisCofins);
  await selecionarEEsperar(frame, FORMULARIO_NOTA.ddlTipoRetencaoPisCofinsCsll, VALORES_FIXOS.tipoRetencaoPisCofinsCsll, 3000);

  // DIAGNOSTICO: retrato dos campos da cascata logo apos serem selecionados,
  // antes de qualquer outro campo (data/descricao/valor/cnpj) ser tocado.
  console.log("[diagnostico] cascata apos selects:", await lerCascataTributacao(frame));

  if (dataCompetencia) {
    // o campo tambem tem onchange disparando __doPostBack (igual aos combos
    // da cascata) -- fill() sozinho so dispara "input", entao o Tab garante
    // que o blur/"change" real aconteça e o site registre a competencia
    // informada antes do Gravar.
    await frame.fill(FORMULARIO_NOTA.dataCompetencia, formatarDataBr(dataCompetencia));
    await frame.locator(FORMULARIO_NOTA.dataCompetencia).press("Tab");
    await frame.waitForLoadState("networkidle").catch(() => {});
    await frame.waitForTimeout(500);
  }

  // DIAGNOSTICO: retrato apos a Data de Competencia -- se algum campo mudar
  // aqui em relacao ao retrato anterior, o culpado e o postback da data.
  console.log("[diagnostico] cascata apos data competencia:", await lerCascataTributacao(frame));

  // CNPJ do tomador -- ao sair do campo, o site auto-preenche razao social e endereco
  await frame.fill(FORMULARIO_NOTA.cnpjCliente, dados.cnpjCliente);
  await frame.locator(FORMULARIO_NOTA.cnpjCliente).press("Tab");
  await frame.waitForTimeout(2000);

  // DIAGNOSTICO: retrato final -- se algum campo so muda aqui (e nao no
  // retrato anterior), o culpado e o postback do CNPJ do tomador.
  console.log("[diagnostico] cascata apos CNPJ tomador:", await lerCascataTributacao(frame));

  const razaoSocialTomador = await frame.locator("#txtRazaoSocialTom").inputValue();
  if (!razaoSocialTomador) {
    throw new ErroEmissaoNota(
      `CNPJ do cliente (${dados.cnpjCliente}) nao foi reconhecido pelo site (razao social nao preencheu).`
    );
  }
}

/**
 * Preenche e emite uma nota. Retorna o numero da NFS-e gerada.
 *
 * Em modo dryRun, preenche tudo mas NAO clica em Gravar -- tira um
 * screenshot pra revisar antes de rodar em producao de verdade.
 */
export async function emitirNota(page, linha, numeroLinha, { dryRun = false, dataCompetencia = null } = {}) {
  const frame = await abrirFormularioNovaNota(page);
  await preencherFormulario(frame, linha, dataCompetencia);

  if (dryRun) {
    const caminhoPrint = path.join(PASTA_SCREENSHOTS, `dry_run_linha_${numeroLinha}.png`);
    await page.screenshot({ path: caminhoPrint, fullPage: true });
    return `[DRY-RUN] formulario preenchido, screenshot em ${caminhoPrint}`;
  }

  // Ate aqui nada e definitivo -- clicar em Gravar so abre o modal de
  // assinatura, o que realmente registra a nota e o Gravar final depois do
  // "Nao". Se qualquer passo desse bloco falhar (ex.: o seletor do "Nao"
  // nao bater), tira screenshot do estado real na hora e aborta ANTES de
  // arriscar gravar de verdade.
  try {
    await frame.locator(ACOES.botaoGravar).click();
    await frame.waitForTimeout(1500);

    // O site pode recusar o Gravar com um modal "Atencao" listando campos
    // obrigatorios nao preenchidos (confirmado por screenshot em 01/09/2026
    // -- aparenta ficar na pagina principal, cobrindo ate o menu lateral, e
    // NAO no modal de assinatura esperado abaixo). Se esse modal ficasse
    // aberto sem ser fechado, a proxima nota do lote falhava tentando abrir
    // o formulario de novo ("Nao encontrei o iframe da Nova Nota
    // Eletronica"), porque o clique no menu nao "passava" por baixo dele --
    // por isso detecta e fecha (clica OK) aqui antes de seguir ou abortar.
    const modalAtencao = page.locator(MODAL_ATENCAO.seletor);
    const modalAtencaoApareceu = await modalAtencao
      .first()
      .waitFor({ state: "visible", timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    if (modalAtencaoApareceu) {
      const mensagem = await modalAtencao.first().innerText().catch(() => "(nao consegui ler o texto do modal)");
      await page.locator(MODAL_ATENCAO.botaoOk).first().click().catch(() => {});
      throw new ErroEmissaoNota(
        `Site recusou Gravar por campo(s) obrigatorio(s) nao preenchido(s) (linha ${numeroLinha}): ${mensagem.trim()}`
      );
    }

    // modal perguntando se quer assinar com certificado digital -- escolher "Nao"
    await frame.locator(ACOES.modalAssinatura_botaoNao).first().click();
    await frame.waitForTimeout(1000);

    await Promise.all([
      frame.waitForLoadState("networkidle").catch(() => {}),
      frame.locator(ACOES.botaoGravarFinal).click(),
    ]);
    await frame.waitForTimeout(2000);
  } catch (err) {
    const caminhoPrint = path.join(PASTA_SCREENSHOTS, `erro_gravar_linha_${numeroLinha}.png`);
    await page.screenshot({ path: caminhoPrint, fullPage: true }).catch(() => {});
    if (err instanceof ErroEmissaoNota) {
      throw new ErroEmissaoNota(`${err.message} Screenshot do estado real salvo em ${caminhoPrint}.`);
    }
    throw new ErroEmissaoNota(
      `Falha ao clicar em Gravar/confirmar assinatura (linha ${numeroLinha}): ${err.message}. ` +
        `Screenshot do estado real salvo em ${caminhoPrint}.`
    );
  }

  // A partir daqui a nota MUITO provavelmente ja foi gravada de verdade no
  // site -- sempre guarda evidencia (screenshot + texto da pagina), mesmo
  // que o seletor do numero abaixo nao bata, pra nunca perder o numero da
  // nota emitida.
  const caminhoPrintFinal = path.join(PASTA_SCREENSHOTS, `nota_real_linha_${numeroLinha}.png`);
  await page.screenshot({ path: caminhoPrintFinal, fullPage: true }).catch(() => {});
  const textoPagina = await frame
    .locator("body")
    .innerText()
    .catch(() => "");
  const caminhoTexto = path.join(PASTA_SCREENSHOTS, `nota_real_linha_${numeroLinha}.txt`);
  writeFileSync(caminhoTexto, textoPagina);

  try {
    await frame.waitForSelector(ACOES.numeroNotaGerada, { timeout: 20000 });
  } catch {
    throw new ErroEmissaoNota(
      `Gravar foi confirmado mas nao consegui achar o numero da nota automaticamente (linha ${numeroLinha}). ` +
        `A nota MUITO provavelmente foi emitida -- confira o screenshot (${caminhoPrintFinal}) e o texto da ` +
        `pagina (${caminhoTexto}) pra pegar o numero e preencher a coluna NOTA manualmente (senao a linha ` +
        `continua "pendente" e pode ser emitida de novo, duplicada, num proximo lote).`
    );
  }

  const numeroNota = await frame.locator(ACOES.numeroNotaGerada).innerText();
  return numeroNota.trim();
}

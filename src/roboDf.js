// Automacao do site iss.fazenda.df.gov.br usando Playwright.
//
// Fluxo mapeado navegando de verdade pelo site em 31/08/2026: login (com
// teclado virtual de senha) -> selecionar o estabelecimento (CNPJ) na lista
// paginada de empresas -> pular popup de confirmacao cadastral, se aparecer
// -> menu "Nota Eletronica" -> "Nova Nota Eletronica" (abre num <iframe>) ->
// preencher formulario -> Gravar.

import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

import * as config from "./config.js";
import { ACOES, EMPRESAS, FORMULARIO_NOTA, LOGIN, MENU, POPUP_CADASTRO, VALORES_FIXOS } from "./seletores.js";

const PASTA_SCREENSHOTS = "screenshots";
mkdirSync(PASTA_SCREENSHOTS, { recursive: true });

export class ErroEmissaoNota extends Error {}

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

export async function fazerLogin(page) {
  await page.goto(config.URL_LOGIN, { waitUntil: "networkidle" });
  await page.fill(LOGIN.campoUsuario, config.DF_LOGIN);
  await digitarSenhaTecladoVirtual(page, config.DF_SENHA);

  await Promise.all([page.waitForLoadState("networkidle"), page.locator(LOGIN.botaoEntrar).click()]);
  await page.waitForTimeout(1000);

  if (page.url().includes("Login.aspx")) {
    throw new ErroEmissaoNota("Login nao confirmado -- confira DF_LOGIN/DF_SENHA no .env.");
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

/** Abre o menu lateral e navega ate o formulario de nova nota, que carrega dentro de um iframe. */
export async function abrirFormularioNovaNota(page) {
  await page.locator(MENU.grupoNotaEletronica).first().click();
  await page.waitForTimeout(500);

  await Promise.all([page.waitForLoadState("networkidle"), page.locator(MENU.linkNovaNota).click()]);
  await page.waitForTimeout(1500);

  const frame = page.frames().find((f) => f.url().includes("NotaNacional.aspx"));
  if (!frame) throw new ErroEmissaoNota("Nao encontrei o iframe da Nova Nota Eletronica.");
  await frame.waitForLoadState("networkidle").catch(() => {});
  return frame;
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
async function preencherFormulario(frame, linha) {
  const dados = mapearDadosDaPlanilha(linha);

  if (!dados.cnpjCliente) throw new ErroEmissaoNota("Linha sem CNPJ CLIENTE preenchido.");
  if (!dados.descricaoServico) throw new ErroEmissaoNota("Linha sem DESCRIÇÃO preenchida.");
  if (!dados.valorServico) throw new ErroEmissaoNota("Linha sem VALOR CONTABIL preenchido.");

  // cascata de selects -- cada um so populatriz as opcoes depois que o anterior e escolhido
  await frame.selectOption(FORMULARIO_NOTA.ddlAtivMunicipal, VALORES_FIXOS.atividadeMunicipal);
  await frame.waitForTimeout(1200);
  await frame.selectOption(FORMULARIO_NOTA.ddlTrbNacional, VALORES_FIXOS.tributacaoNacional);
  await frame.waitForTimeout(1200);
  await frame.selectOption(FORMULARIO_NOTA.ddlNBS, VALORES_FIXOS.nbs);
  await frame.waitForTimeout(1200);
  await frame.selectOption(FORMULARIO_NOTA.ddlTribISSQN, VALORES_FIXOS.tribISSQN);
  await frame.waitForTimeout(1500);
  await frame.selectOption(FORMULARIO_NOTA.ddlRegimeEspecial, VALORES_FIXOS.regimeEspecial);
  await frame.waitForTimeout(500);
  await frame.selectOption(FORMULARIO_NOTA.ddlSitTribFederal, VALORES_FIXOS.situacaoTributariaPisCofins);
  await frame.waitForTimeout(500);

  await frame.fill(FORMULARIO_NOTA.descricaoServico, dados.descricaoServico);
  await frame.fill(FORMULARIO_NOTA.valorServico, String(dados.valorServico));

  // CNPJ do tomador -- ao sair do campo, o site auto-preenche razao social e endereco
  await frame.fill(FORMULARIO_NOTA.cnpjCliente, dados.cnpjCliente);
  await frame.locator(FORMULARIO_NOTA.cnpjCliente).press("Tab");
  await frame.waitForTimeout(2000);

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
export async function emitirNota(page, linha, numeroLinha, { dryRun = false } = {}) {
  const frame = await abrirFormularioNovaNota(page);
  await preencherFormulario(frame, linha);

  if (dryRun) {
    const caminhoPrint = path.join(PASTA_SCREENSHOTS, `dry_run_linha_${numeroLinha}.png`);
    await page.screenshot({ path: caminhoPrint, fullPage: true });
    return `[DRY-RUN] formulario preenchido, screenshot em ${caminhoPrint}`;
  }

  await frame.locator(ACOES.botaoGravar).click();
  await frame.waitForTimeout(1500);

  // modal perguntando se quer assinar com certificado digital -- escolher "Nao"
  await frame.locator(ACOES.modalAssinatura_botaoNao).click();
  await frame.waitForTimeout(1000);

  await Promise.all([
    frame.waitForLoadState("networkidle").catch(() => {}),
    frame.locator(ACOES.botaoGravarFinal).click(),
  ]);
  await frame.waitForTimeout(2000);

  try {
    await frame.waitForSelector(ACOES.numeroNotaGerada, { timeout: 20000 });
  } catch (err) {
    const caminhoPrint = path.join(PASTA_SCREENSHOTS, `erro_linha_${numeroLinha}.png`);
    await page.screenshot({ path: caminhoPrint, fullPage: true });
    throw new ErroEmissaoNota(
      `Nao foi possivel confirmar a emissao da nota (linha ${numeroLinha}). Screenshot salvo em ${caminhoPrint}.`
    );
  }

  const numeroNota = await frame.locator(ACOES.numeroNotaGerada).innerText();
  return numeroNota.trim();
}

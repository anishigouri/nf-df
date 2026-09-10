// Diagnostico pontual: reproduz o preenchimento ate a cascata de tributacao
// pra uma linha especifica (sem clicar em Gravar) e imprime as opcoes REAIS
// que o site carregou em #ddlTipoRetencao, em vez de so tentar selecionar
// "1" as cegas -- linhas 34 e 368 falham nesse select ha 3 tentativas
// seguidas (incluindo fora de lote grande, sessao ja logada), entao pode ser
// que o valor fixo "1" (Nao Retido) simplesmente nao exista pra esse
// tomador, nao um problema de timing.
import { chromium } from "playwright";
import { abrirFormularioNovaNota } from "./src/roboDf.js";
import { FORMULARIO_NOTA, VALORES_FIXOS } from "./src/seletores.js";

const cnpjTomador = process.argv[2];
if (!cnpjTomador) {
  console.error("Uso: node diagnostico_cascata.mjs <cnpj-tomador>");
  process.exit(1);
}

const browser = await chromium.connectOverCDP("http://localhost:9222");
const context = browser.contexts()[0];
const page = context.pages()[0];

const frame = await abrirFormularioNovaNota(page);
console.log("[diag] formulario aberto");

await frame.fill(FORMULARIO_NOTA.cnpjCliente, cnpjTomador);
await frame.locator(FORMULARIO_NOTA.cnpjCliente).press("Tab");
await frame.waitForLoadState("networkidle").catch(() => {});
await frame.waitForTimeout(2000);

const razaoSocial = await frame.locator(FORMULARIO_NOTA.razaoSocialCliente).inputValue();
console.log("[diag] razao social tomador:", JSON.stringify(razaoSocial));

await frame.fill(FORMULARIO_NOTA.descricaoServico, "TESTE DIAGNOSTICO");
await frame.fill(FORMULARIO_NOTA.valorServico, "166,02");
await frame.locator(FORMULARIO_NOTA.valorServico).press("Tab");
await frame.waitForLoadState("networkidle").catch(() => {});
await frame.waitForTimeout(1500);

async function selecionar(seletor, valor) {
  await frame.selectOption(seletor, valor);
  await frame.waitForLoadState("networkidle").catch(() => {});
  await frame.waitForTimeout(1000);
}

await selecionar(FORMULARIO_NOTA.ddlAtivMunicipal, VALORES_FIXOS.atividadeMunicipal);
await selecionar(FORMULARIO_NOTA.ddlTrbNacional, VALORES_FIXOS.tributacaoNacional);
await selecionar(FORMULARIO_NOTA.ddlNBS, VALORES_FIXOS.nbs);
await selecionar(FORMULARIO_NOTA.ddlTribISSQN, VALORES_FIXOS.tribISSQN);
await selecionar(FORMULARIO_NOTA.ddlRegimeEspecial, VALORES_FIXOS.regimeEspecial);

console.log("[diag] cascata ate Regime Especial preenchida, inspecionando #ddlTipoRetencao...");

const infoSelect = await frame.locator(FORMULARIO_NOTA.ddlTipoRetencaoISSQN).evaluate((el) => ({
  disabled: el.disabled,
  value: el.value,
  opcoes: Array.from(el.options).map((o) => ({ value: o.value, texto: o.text })),
}));
console.log("[diag] #ddlTipoRetencao:", JSON.stringify(infoSelect, null, 2));

// tambem inspeciona o Municipio Incidencia (pode indicar regra diferente pra
// tomador no mesmo municipio do prestador)
const municipioIncidencia = await frame.locator("#ddlCidadeIncidencia, select[id*='Incidencia']").first().evaluate((el) => el ? { id: el.id, value: el.value } : null).catch(() => null);
console.log("[diag] municipio incidencia:", JSON.stringify(municipioIncidencia));

await browser.close();
console.log("[diag] concluido (nada foi gravado)");

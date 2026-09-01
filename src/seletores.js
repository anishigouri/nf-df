/**
 * Seletores e valores fixos do site iss.fazenda.df.gov.br, mapeados em 31/08/2026
 * navegando de verdade pelo fluxo real (login -> selecionar empresa -> Nota
 * Eletrônica -> Nova Nota Eletrônica).
 */

export const LOGIN = {
  campoUsuario: "#txtLogin",
  // a "senha" no site e um teclado virtual: cada botao (id btn1..btn5) sempre
  // digita o proprio indice (1..5), independente de onde voce clica nele --
  // ver mapearTecladoSenha() em roboDf.js
  botaoEntrar: "#btnAcessar",
};

export const EMPRESAS = {
  tabela: "#dgEmpresas",
  linkPaginaTexto: (numero) => String(numero),
};

export const POPUP_CADASTRO = {
  botaoCancelar: "text=Cancelar",
};

export const MENU = {
  grupoNotaEletronica: "text=Nota Eletrônica",
  linkNovaNota: "a:has-text('Nova Nota Eletrônica')",
  nomeFrame: "iframe", // window.frames['iframe'] -- a nota abre dentro de um <iframe name="iframe">
};

// valores fixos, sempre os mesmos pra toda nota (conforme especificado pelo usuario)
export const VALORES_FIXOS = {
  atividadeMunicipal: "3101", // 31.01 - Servicos tecnicos em telecomunicacoes e congeneres
  tributacaoNacional: "310104", // Servicos tecnicos em telecomunicacoes e congeneres
  nbs: "114150000", // unica opcao disponivel apos escolher a tributacao nacional acima
  tribISSQN: "17", // Operacao tributavel
  regimeEspecial: "0", // Nenhum
  situacaoTributariaPisCofins: "00", // 00 - Nenhum

  // confirmado no HTML real do formulario em 01/09/2026 (ver FORMULARIO_NOTA
  // abaixo): ambos ja vem com essa opcao pre-selecionada por padrao assim
  // que a cascata Ativ.Municipal/Trib.Nacional/NBS/Trib.ISSQN e escolhida --
  // selecionar de novo aqui e so uma garantia explicita.
  tipoRetencaoISSQN: "1", // Nao Retido
  tipoRetencaoPisCofinsCsll: "0", // PIS/COFINS/CSLL Nao Retidos
};

export const FORMULARIO_NOTA = {
  // cascata: precisa selecionar nesta ordem, esperando cada combo seguinte carregar
  ddlAtivMunicipal: "#ddlAtivMunicipal",
  ddlTrbNacional: "#ddlTrbNacional",
  ddlNBS: "#ddlNBS",
  ddlTribISSQN: "#ddlTribISSQN",
  ddlRegimeEspecial: "#ddlRegimeEspecial",
  // "Tipo de Retencao do ISSQN" -- vem DEPOIS de Regime Especial na pagina
  // real (confirmado no HTML mandado pelo usuario em 01/09/2026). So tem uma
  // opcao (a que queremos) depois que Ativ.Municipal/Trib.Nacional/NBS/
  // Trib.ISSQN/Regime Especial sao escolhidos, ja vem pre-selecionada, mas
  // selecionamos explicito mesmo assim. Selecionar antes de Regime Especial
  // faz a opcao nunca aparecer e o selectOption trava em timeout.
  ddlTipoRetencaoISSQN: "#ddlTipoRetencao",
  ddlSitTribFederal: "#ddlSitTribFederal",
  // "Tipo de Retencao do PIS/COFINS/CSLL" -- campo distinto de
  // ddlSitTribFederal, fica escondido (div#divTipoRetFederal) ate
  // ddlSitTribFederal ser escolhido (confirmado pelo usuario em 01/09/2026).
  ddlTipoRetencaoPisCofinsCsll: "#ddlTipoRetFederal",

  // dados da nota
  descricaoServico: "#txtDescServicos",
  valorServico: "#txtTotalServicos",
  // fica no topo do formulario (fora da cascata de tributacao), formato
  // DD/MM/AAAA -- confirmado no HTML real do formulario em 01/09/2026.
  dataCompetencia: "#txtDataCompetencia",

  // tomador (cliente) -- preencher so o CNPJ; nome/endereco sao auto-preenchidos
  // pelo proprio site ao sair do campo (blur/tab)
  cnpjCliente: "#txtCpfCnpjTom",
};

// Modal "Atencao" que o site abre quando o Gravar e recusado por campo
// obrigatorio nao preenchido (confirmado por screenshot em 01/09/2026 --
// aparenta ficar na pagina principal, cobrindo ate o menu lateral, entao
// provavelmente NAO fica dentro do iframe da nota). TODO: seletores a
// confirmar -- ainda sem acesso a uma sessao logada pra inspecionar o DOM
// real do modal.
export const MODAL_ATENCAO = {
  seletor: 'text=Atenção',
  botaoOk: 'button:has-text("OK"), a:has-text("OK"), input[value="OK"]',
};

export const ACOES = {
  // o botao visivel "Gravar" tem id btnAssinar e abre um modal perguntando se
  // quer assinar com certificado digital
  botaoGravar: "#btnAssinar",
  // Ainda nao confirmado num Gravar real. Lista de seletores CSS (Playwright
  // trata "," como "ou") restrita a botao/link/input -- um "text=Nao" solto
  // ja bateu numa <option> de outro combobox que tambem tinha "Nao" no meio
  // do texto (invisivel, travava o click em timeout). Se ainda assim nao
  // bater, emitirNota() em roboDf.js aborta ANTES de gravar de verdade e
  // tira screenshot do modal real pra corrigir aqui.
  modalAssinatura_botaoNao: 'button:has-text("Não"), a:has-text("Não"), input[value="Não"]',
  // apos escolher "Nao" no modal, este e o botao que efetivamente grava a nota
  botaoGravarFinal: "#btnGravarAssinado",
  // Ainda sem seletor confirmado -- emitirNota() sempre tira screenshot e
  // salva o texto da pagina depois de gravar de verdade, entao mesmo sem
  // bater aqui a evidencia fica salva pra confirmar o numero manualmente.
  numeroNotaGerada: "#TODO_numero_nota_gerada",
};

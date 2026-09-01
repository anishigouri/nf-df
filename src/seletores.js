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
};

export const FORMULARIO_NOTA = {
  // cascata: precisa selecionar nesta ordem, esperando cada combo seguinte carregar
  ddlAtivMunicipal: "#ddlAtivMunicipal",
  ddlTrbNacional: "#ddlTrbNacional",
  ddlNBS: "#ddlNBS",
  ddlTribISSQN: "#ddlTribISSQN",
  ddlRegimeEspecial: "#ddlRegimeEspecial",
  ddlSitTribFederal: "#ddlSitTribFederal",

  // dados da nota
  descricaoServico: "#txtDescServicos",
  valorServico: "#txtTotalServicos",

  // tomador (cliente) -- preencher so o CNPJ; nome/endereco sao auto-preenchidos
  // pelo proprio site ao sair do campo (blur/tab)
  cnpjCliente: "#txtCpfCnpjTom",
};

export const ACOES = {
  // o botao visivel "Gravar" tem id btnAssinar e abre um modal perguntando se
  // quer assinar com certificado digital
  botaoGravar: "#btnAssinar",
  // Ainda nao confirmado num Gravar real -- melhor palpite, no mesmo padrao
  // que ja funciona pro popup de cadastro (POPUP_CADASTRO.botaoCancelar).
  // Se nao bater, emitirNota() em roboDf.js aborta ANTES de gravar de
  // verdade e tira screenshot do modal real pra corrigir aqui.
  modalAssinatura_botaoNao: "text=Não",
  // apos escolher "Nao" no modal, este e o botao que efetivamente grava a nota
  botaoGravarFinal: "#btnGravarAssinado",
  // Ainda sem seletor confirmado -- emitirNota() sempre tira screenshot e
  // salva o texto da pagina depois de gravar de verdade, entao mesmo sem
  // bater aqui a evidencia fica salva pra confirmar o numero manualmente.
  numeroNotaGerada: "#TODO_numero_nota_gerada",
};

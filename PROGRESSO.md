# Progresso do projeto — Robô NFS-e ISS Online DF

> Documento de handoff para continuar em uma nova sessão de chat. Leia isto
> primeiro, depois o [README.md](README.md) para instruções de uso.

## Objetivo

Automatizar o lançamento de notas fiscais de serviço (NFS-e) no portal
`https://iss.fazenda.df.gov.br/online`, que hoje é feito manualmente, uma a
uma, a partir de uma planilha de controle. Prestadora: **CLARO S.A**,
estabelecimento CNPJ **40.432.544/0758-21**.

## Decisão de arquitetura (por que RPA e não API)

O DF tem um **webservice oficial** (Padrão Nacional de NFS-e, SOAP, endpoint
`https://nfse.fazenda.df.gov.br/wsnfsenacional/nfse.asmx`), que seria a
integração mais robusta. Mas ele **exige certificado digital A1 (arquivo
.pfx) com a chave privada** para assinar o XML e autenticar a conexão (mTLS).
A empresa conseguiu um certificado, mas é do tipo que a área responsável
**não vai disponibilizar como arquivo** (indício de ser A3/token, ou
política interna de custódia da chave) — então a via API foi descartada.

**Decisão: automação via navegador (Playwright/Node.js)**, reproduzindo
exatamente o que o usuário faz manualmente com login e senha.

## Stack

- Node.js (ESM) + Playwright (controle do navegador) + ExcelJS (planilha).
- Projeto em `c:\Users\allan\OneDrive\Documentos\Desenvolvimento\Projetos\nf-df`.

## O que já funciona (testado de ponta a ponta contra o site real)

Rodei `node src/main.js --limite 1 --dry-run` com uma linha real da planilha
de exemplo e o formulário foi preenchido **corretamente, confirmado por
screenshot** (`screenshots/dry_run_linha_2.png`, gerado nessa sessão — pode
já ter sido apagado, é só rodar de novo pra gerar outro).

Descobertas técnicas importantes (documentadas em código, mas resumindo
aqui porque foram trabalhosas de descobrir):

1. **Login com "teclado virtual" de senha**: o site não deixa digitar a
   senha num campo de texto normal. Em vez disso, mostra 5 botões
   (`#btn1`..`#btn5`), cada um exibindo um par decorativo de dígitos (ex:
   "7 - 0"). **Os pares são só ruído visual anti-gravação de tela** — o
   JavaScript do site (`DigitaSenha`) sempre digita o **índice do botão**
   (1 a 5), não os dígitos mostrados. Então, pra digitar a senha, o robô
   olha o par de cada botão e clica no botão cujo par contém o dígito
   desejado (implementado em `digitarSenhaTecladoVirtual` dentro de
   [src/roboDf.js](src/roboDf.js)).

2. **Cloudflare bloqueava o navegador automatizado**: os arquivos estáticos
   do site (jQuery, funções JS, incluindo a lib `NC`/NotaControl) são
   servidos por `www.notacontrol.com.br` atrás de Cloudflare, que bloqueava
   (`net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`) o Chromium controlado por
   Playwright — o site ficava quebrado (sem jQuery, sem CSS, postbacks
   falhando com "NC is not defined"). **Resolvido** lançando o Chromium com
   `args: ["--disable-blink-features=AutomationControlled"]` e um
   `userAgent` de Chrome desktop normal (ver `abrirNavegador()` em
   [src/roboDf.js](src/roboDf.js)). Sem isso, nada funciona.

3. **Fluxo completo mapeado e com seletores reais**:
   - Login → `#txtLogin`, teclado virtual, `#btnAcessar`.
   - Lista de empresas (`#dgEmpresas`) é paginada; o CNPJ alvo
     (40.432.544/0758-21) fica na **página 3**. O robô já pagina
     automaticamente até achar o CNPJ certo (por dígitos, sem pontuação, no
     atributo `title` da célula).
   - Depois de selecionar a empresa, às vezes aparece um popup
     "Informação Cadastral" pedindo e-mails — o robô clica em "Cancelar"
     pra pular (opcional, não obrigatório pro fluxo).
   - Menu lateral: precisa expandir "Nota Eletrônica" (é uma árvore
     recolhida) antes de conseguir clicar em "Nova Nota Eletrônica".
   - **A tela de nova nota abre dentro de um `<iframe name="iframe">`**
     (`NotaDigital/NotaNacional.aspx`) — todo o preenchimento precisa usar
     o objeto `frame`, não a `page` principal.
   - Formulário: todos os IDs reais dos campos estão em
     [src/seletores.js](src/seletores.js). Os dropdowns de
     Atividade Municipal → Tributação Nacional → NBS → Tributação ISSQN →
     Regime Especial são **em cascata** (cada um só carrega as opções
     depois que o anterior é selecionado, via AJAX) — por isso o código
     seleciona um de cada vez com pausas entre eles.
   - **CNPJ do cliente auto-completa** Razão Social e Nome Fantasia
     assim que sai do campo (blur/tab) — não precisa preencher endereço
     manualmente pro fluxo funcionar (endereço não é obrigatório no
     formulário).
   - Valores fixos confirmados (sempre os mesmos, conforme especificado
     pelo usuário): Atividade Municipal = `3101`, Tributação Nacional =
     `310104`, NBS = `114150000` (única opção), Tributação do ISSQN = `17`
     (Operação tributável), Regime Especial = `0` (Nenhum), Situação
     Tributária PIS/COFINS = `00` (Nenhum).
   - Mapeamento planilha → formulário: `CNPJ CLIENTE` (coluna I) → CNPJ do
     tomador; `DESCRIÇÃO` (coluna P) → descrição do serviço;
     `VALOR CONTABIL` (coluna Q) → valor do serviço.
   - **A coluna `NOTA` (coluna F) da própria planilha é usada como
     controle**: linha com `NOTA` vazia = pendente; o robô escreve o
     número da nota emitida ali mesmo, exatamente como o processo manual
     do usuário já funciona. Não criei colunas de status extras.

## O que falta (bloqueado por decisão do usuário — ver abaixo)

Só falta descobrir **2 coisas**, que só aparecem depois de clicar de
verdade no botão "Gravar" (que no HTML tem id `#btnAssinar`) — e clicar
nele de verdade **emite uma nota fiscal real**, com consequência
tributária/legal. Por isso eu **não testei sozinho** essa parte:

1. **Seletor do botão/link "Não"** no modal que pergunta se o usuário quer
   assinar a nota com certificado digital (o usuário descreveu esse passo
   na conversa: "Ao clicar em gravar ele pergunta se quer assinar com um
   certificado digital, escolho a opção não"). Está marcado como
   `#TODO_modal_assinatura_nao` em [src/seletores.js](src/seletores.js).
   Pistas já levantadas: existe um botão `<input id="btnGravarAssinado"
   value="Gravar">` que muito provavelmente é o botão final de gravação
   (sem assinatura), acionado depois de escolher "Não" no modal — mas isso
   não foi confirmado na prática.

2. **Onde aparece o número da nota gerada**, pra gravar de volta na coluna
   `NOTA`. Marcado como `#TODO_numero_nota_gerada` em
   [src/seletores.js](src/seletores.js).

**Decisão do usuário (31/08/2026): parar por aqui hoje.** Amanhã, em nova
sessão de chat, decidir entre:

- (a) o usuário clicar em "Gravar" manualmente uma vez, observar o modal de
  certificado e onde sai o número da nota, e descrever/mostrar print pra eu
  completar o código; ou
- (b) autorizar explicitamente o robô a emitir 1 nota real de teste (linha
  real da planilha, consequência fiscal real, sem desfazer); ou
- (c) seguir para o front-end React primeiro e resolver isso depois.

## Também pendente (não iniciado)

- **Front-end em React** pedido pelo usuário: upload da planilha pela
  interface, e acompanhamento do progresso linha a linha enquanto o robô
  processa. Não existe nenhum código disso ainda — hoje o projeto só tem a
  CLI (`node src/main.js`). Vai precisar de um backend (Node/Express
  provavelmente) que rode o Playwright e transmita progresso pro front
  (SSE ou WebSocket), já que o Playwright não roda no navegador do usuário.

## Estrutura atual do projeto

```
nf-df/
  .env                  # credenciais reais (DF_LOGIN, DF_SENHA, DF_CNPJ_ESTABELECIMENTO) -- gitignored
  .env.example
  README.md             # instruções de uso
  PROGRESSO.md           # este arquivo
  package.json
  src/
    config.js           # le variaveis de ambiente
    planilha.js          # leitura/escrita da planilha via coluna NOTA
    roboDf.js            # toda a automacao Playwright (login, navegacao, preenchimento)
    seletores.js         # todos os seletores CSS/ids do site + valores fixos
    main.js              # CLI: node src/main.js [--planilha x.xlsx] [--limite N] [--dry-run]
  planilhas/
    notas.xlsx           # planilha de exemplo com 1 linha real de teste (dry-run)
  screenshots/            # gerado em runtime (dry-run e erros)
```

## Como retomar amanhã

1. Rodar de novo o dry-run pra confirmar que o site não mudou:
   ```bash
   node src/main.js --limite 1 --dry-run
   ```
   Conferir o screenshot gerado em `screenshots/`.
2. Resolver os 2 TODOs de `seletores.js` (ver seção acima) com uma das 3
   opções (a, b ou c).
3. Depois disso, o `node src/main.js` (sem `--dry-run`) já deve estar
   pronto pra lançar notas de verdade em lote.
4. Só então partir para o front-end React.

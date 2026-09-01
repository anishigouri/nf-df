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

- Backend: Node.js (ESM) + Playwright (controle do navegador) + ExcelJS
  (planilha) + Express (API REST + upload + Server-Sent Events).
- Frontend: React + Vite, tema dark, tela de login própria.
- Projeto em `c:\Users\allan.nishigouri_koi\Documents\Desenvolvimento\nf-df`.

## Fluxo único (sem CLI)

O projeto já teve uma CLI (`node src/main.js`) além do front-end web, mas
ela foi **removida em 01/09/2026 a pedido do usuário** pra não manter dois
caminhos fazendo a mesma coisa. Hoje existe só um fluxo, tudo pelo
navegador:

1. Abrir o front-end (`npm start` na raiz + `npm run dev` em `client/`, ou
   só `npm start` depois de `npm run build` em `client/`).
2. Tela de login: usuário digita o login e a senha do próprio ISS Online DF
   (não é uma conta separada do app). Fica só em `sessionStorage` do
   navegador — nunca em disco, nunca em `.env`. Enviado pro backend só no
   momento de iniciar um processamento.
3. Upload da planilha `.xlsx`.
4. Configurar `dry-run`/limite e iniciar — acompanhamento linha a linha em
   tempo real via SSE, com download da planilha atualizada ao final.

Se o login for recusado pelo site, o backend identifica isso (classe
`CredenciaisInvalidasError` em [src/roboDf.js](src/roboDf.js)) e o
front-end derruba a sessão automaticamente, voltando pra tela de login com
o erro.

## O que já funciona (testado de ponta a ponta contra o site real)

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
     do usuário já funciona.

4. **Front-end React completo**: tela de login, upload por drag-and-drop,
   configuração (dry-run/limite), progresso em tempo real via SSE (stepper,
   barra de progresso, stat cards, lista de linhas animada) e download da
   planilha atualizada. Tema dark com Space Grotesk/Inter/JetBrains Mono.

## O que falta (bloqueado por decisão do usuário)

Só falta descobrir **2 coisas**, que só aparecem depois de clicar de
verdade no botão "Gravar" (que no HTML tem id `#btnAssinar`) — e clicar
nele de verdade **emite uma nota fiscal real**, com consequência
tributária/legal. Por isso ainda não foi testado:

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

Opções pra resolver (mesmas de antes, sem novidade):

- (a) o usuário clicar em "Gravar" manualmente uma vez no site, observar o
  modal de certificado e onde sai o número da nota, e descrever/mostrar
  print pra completar o código; ou
- (b) autorizar explicitamente o robô a emitir 1 nota real de teste (linha
  real da planilha, consequência fiscal real, sem desfazer), rodando com
  `DF_HEADLESS=false` pra acompanhar.

## Estrutura atual do projeto

```
nf-df/
  .env                    # DF_CNPJ_ESTABELECIMENTO, DF_HEADLESS, DF_DELAY_MS -- gitignored
  .env.example
  README.md               # instrucoes de uso
  PROGRESSO.md             # este arquivo
  package.json             # "postinstall" (chromium) e "start" (sobe o servidor)
  src/
    config.js             # le variaveis de ambiente
    planilha.js            # leitura/escrita da planilha via coluna NOTA
    roboDf.js              # toda a automacao Playwright (login, navegacao, preenchimento)
    seletores.js           # todos os seletores CSS/ids do site + valores fixos
    processarLote.js       # login -> seleciona estabelecimento -> loop de emissao, com callback de progresso
  server/
    index.js               # app Express, serve a API e o build do front em producao
    rotas.js                # /api/upload, /api/jobs/:id, /api/jobs/:id/iniciar, /eventos (SSE), /planilha
    gerenciadorJobs.js      # estado em memoria dos jobs (um por vez)
  client/                  # front-end React (Vite)
    src/App.jsx             # fluxo completo: login -> upload -> configurar -> progresso
    src/TelaLogin.jsx       # tela de login (login/senha do ISS Online DF)
    src/index.css           # tema dark
  planilhas/
    notas.xlsx              # planilha de exemplo com 1 linha real de teste (dry-run)
  uploads/                  # planilhas enviadas pelo front-end -- gerado em runtime, gitignored
  screenshots/              # gerado em runtime (dry-run e erros)
```

## Como retomar

1. `npm install` na raiz e `cd client && npm install`.
2. Rodar `npm start` (raiz) e `npm run dev` (`client/`), abrir
   `http://localhost:5173`, logar e rodar um dry-run pra confirmar que o
   site não mudou. Conferir o screenshot gerado em `screenshots/`.
3. Resolver os 2 TODOs de `seletores.js` (ver seção "O que falta" acima)
   com a opção (a) ou (b).
4. Depois disso, o fluxo web (sem `dry-run`) já deve estar pronto pra
   lançar notas de verdade em lote.

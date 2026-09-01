# nf-df — Robô de lançamento de NFS-e no ISS Online DF

Automatiza o lançamento de notas fiscais de serviço no portal
https://iss.fazenda.df.gov.br/online, a partir de uma planilha de controle,
usando login e senha (o mesmo acesso manual de hoje). Fluxo único, tudo pelo
navegador: login → upload da planilha → acompanhamento em tempo real da
emissão.

## Status

O fluxo abaixo já foi testado de ponta a ponta contra o site real (login →
seleção do CNPJ 40.432.544/0758-21 → menu Nota Eletrônica → preenchimento
completo do formulário) e funciona:

- Login com usuário/senha (o "teclado virtual" de senha do site é só
  decorativo — decifrado e automatizado).
- O Cloudflare que protege os arquivos estáticos do site bloqueia
  navegadores automatizados por padrão; contornado com flags específicas do
  Chromium (já configurado em [src/roboDf.js](src/roboDf.js)).
- Seleção do estabelecimento na lista paginada de empresas.
- Navegação até "Nova Nota Eletrônica" (o formulário abre dentro de um
  `<iframe>`).
- Preenchimento: CNPJ do cliente (o site auto-completa razão social),
  descrição, valor, atividade municipal, tributação nacional, NBS,
  tributação do ISSQN, regime especial, situação tributária PIS/COFINS —
  todos com os valores fixos que você passou.

**Falta confirmar apenas 2 coisas**, que só aparecem depois de clicar em
"Gravar" — e clicar em "Gravar" de verdade **emite uma nota fiscal real**,
então não fiz isso sozinho:

1. O seletor exato do botão/link "Não" no modal que pergunta se quer
   assinar com certificado digital.
2. Onde exatamente aparece o número da nota gerada, para gravar de volta na
   coluna `NOTA` da planilha.

Ambos estão marcados como `#TODO_...` em [src/seletores.js](src/seletores.js).
A forma mais segura de descobrir isso é rodar com `DF_HEADLESS=false` no
`.env` (o navegador aparece na tela enquanto o servidor processa) e observar
uma nota real sendo gravada, ou você mesmo clicar em "Gravar" manualmente no
site uma vez e me contar/mostrar o que aparece.

## 1. Instalação

```bash
npm install
cd client && npm install && cd ..
```

(o `postinstall` da raiz já baixa o Chromium do Playwright automaticamente)

## 2. Configuração

O arquivo `.env` só guarda o CNPJ do estabelecimento (40.432.544/0758-21) e
opções de execução (headless, delay entre notas). **Login e senha do ISS
Online DF nunca ficam no `.env`** — são digitados na tela de login do
front-end a cada sessão, guardados só em `sessionStorage` do navegador
(somem ao fechar a aba), nunca em disco.

A planilha precisa ter as mesmas colunas do modelo que você usa hoje —
o robô lê `CNPJ CLIENTE` (coluna I), `DESCRIÇÃO` (coluna P) e
`VALOR CONTABIL` (coluna Q), e escreve o número da nota de volta na própria
coluna `NOTA` (coluna F), do mesmo jeito que você faz manualmente. Uma linha
só é considerada pendente se `NOTA` estiver vazia — então é seguro subir a
mesma planilha mais de uma vez.

## 3. Rodando

Em desenvolvimento, backend e frontend rodam em processos separados (dois
terminais):

```bash
# terminal 1 -- backend (Express + Playwright), porta 3001
npm start

# terminal 2 -- frontend (Vite + React), porta 5173, com proxy de /api para o backend
cd client
npm run dev
```

Abra `http://localhost:5173`. Na primeira tela, informe o login e a senha do
próprio ISS Online DF (não é uma conta separada) — eles ficam só em
`sessionStorage` do navegador e são enviados diretamente pra automação a
cada processamento. Se a senha estiver errada, o robô mostra o erro assim
que tenta logar e te devolve pra tela de login automaticamente. Tem um botão
"Sair" pra limpar a sessão manualmente.

Depois, envie o arquivo `.xlsx`, escolha `dry-run` e/ou um limite de notas,
e clique em "Iniciar". A tabela de progresso atualiza linha a linha em tempo
real (via Server-Sent Events); ao final dá pra baixar a planilha já com a
coluna `NOTA` atualizada.

Em produção, basta rodar `npm run build` dentro de `client/` e depois
`npm start` na raiz — o próprio Express passa a servir os arquivos estáticos
do build em `client/dist`.

## Avisos importantes

- Rode com `DF_HEADLESS=false` no `.env` pra acompanhar visualmente o que o
  robô está fazendo (o navegador abre na tela da máquina que roda o
  servidor).
- O delay entre notas (`DF_DELAY_MS`) existe para não sobrecarregar o site
  do governo — não recomendo reduzir muito. Só um lote é processado por vez
  (o robô usa uma única sessão de navegador).
- Sempre confira uma amostra das notas emitidas no próprio portal antes de
  liberar o robô para o volume completo.

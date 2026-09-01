# nf-df — Robô de lançamento de NFS-e no ISS Online DF

Automatiza o lançamento de notas fiscais de serviço no portal
https://iss.fazenda.df.gov.br/online, a partir de uma planilha de controle,
usando login e senha (o mesmo acesso manual de hoje).

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
A forma mais segura de descobrir isso é você rodar **uma única nota real**
comigo observando (`DF_HEADLESS=false`), ou você mesmo clicar em "Gravar"
manualmente uma vez e me contar/mostrar o que aparece.

## 1. Instalação

```bash
npm install
```

(o `postinstall` já baixa o Chromium do Playwright automaticamente)

## 2. Configuração

O arquivo `.env` já está configurado com login, senha e o CNPJ do
estabelecimento (40.432.544/0758-21). Ajuste `DF_PLANILHA_PATH` se sua
planilha estiver em outro lugar.

A planilha precisa ter as mesmas colunas do modelo que você usa hoje —
o robô lê `CNPJ CLIENTE` (coluna I), `DESCRIÇÃO` (coluna P) e
`VALOR CONTABIL` (coluna Q), e escreve o número da nota de volta na própria
coluna `NOTA` (coluna F), do mesmo jeito que você faz manualmente.

## 3. Rodando

Sempre em modo `--dry-run` primeiro e com `--limite` pequeno — ele preenche
tudo, tira um screenshot em `screenshots/` e **não** clica em Gravar:

```bash
node src/main.js --limite 1 --dry-run
```

Depois de resolver os 2 TODOs pendentes (veja "Status" acima), rodar de
verdade:

```bash
node src/main.js --limite 1
```

E depois, para processar tudo que estiver com `NOTA` vazia na planilha:

```bash
node src/main.js
```

Uma linha só é considerada pendente se a coluna `NOTA` estiver vazia — então
é seguro rodar o script várias vezes sobre a mesma planilha.

## Avisos importantes

- Rode com `DF_HEADLESS=false` no `.env` no início para acompanhar
  visualmente o que o robô está fazendo.
- O delay entre notas (`DF_DELAY_MS`) existe para não sobrecarregar o site
  do governo — não recomendo reduzir muito nem rodar várias instâncias em
  paralelo.
- Sempre confira uma amostra das notas emitidas no próprio portal antes de
  liberar o robô para o volume completo.

## Próximos passos (não implementado ainda)

- Front-end em React para upload da planilha e acompanhamento linha a linha
  do progresso da emissão.

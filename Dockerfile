# Imagem oficial do Playwright: ja vem com Chromium e todas as bibliotecas
# de sistema necessarias (libnss3, libatk, libgbm, etc.) e roda como usuario
# nao-root, entao o sandbox do Chromium funciona sem precisar de --no-sandbox.
#
# A tag da imagem PRECISA bater com a versao do pacote "playwright" instalado
# (ver package-lock.json -> node_modules/playwright -> "version"). Se atualizar
# o playwright no package.json, atualize essa tag junto.
FROM mcr.microsoft.com/playwright:v1.62.1-jammy

WORKDIR /app

# Dependencias do backend primeiro (cache de layer do Docker)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Dependencias do front-end
COPY client/package.json client/package-lock.json client/
RUN npm ci --prefix client

# Resto do codigo-fonte
COPY . .

# Build do React (gera client/dist, servido pelo Express em producao)
RUN npm run build --prefix client

ENV NODE_ENV=production

# O Render injeta a variavel PORT em runtime -- server/index.js ja le
# process.env.PORT, entao nao precisamos fixar um valor aqui.
CMD ["npm", "start"]

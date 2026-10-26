# Servidor de juego (Colyseus + API) para producción.
#   docker build -t mystery-action-server .
#   docker run -p 2567:2567 --env-file deploy/.env -v mystery-data:/data mystery-action-server
# Lo usan deploy/docker-compose.yml (VPS) y deploy/fly.toml (Fly.io).
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=2567 \
    DATA_DIR=/data \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app

# 1) Dependencias de producción del servidor (con package-lock.json si existe: versiones exactas)
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --workspace server --include-workspace-root=false; \
    else npm install --omit=dev --workspace server --include-workspace-root=false; fi \
 && npm cache clean --force

# 2) Código: reglas compartidas, servidor y migraciones. Se comprueba que las reglas generadas
#    corresponden al prototipo (si no, falla la construcción: ejecuta `npm run split` y vuelve a subir).
COPY version.json ./
COPY prototype/ prototype/
COPY tools/split-prototype.mjs tools/
COPY shared/ shared/
COPY client/index.html client/
COPY client/public/ client/public/
COPY server/src/ server/src/
COPY server/db/ server/db/
COPY server/scripts/ server/scripts/
RUN node tools/split-prototype.mjs --check \
 && mkdir -p /data && chown node:node /data

# 3) Sin privilegios de administrador; los datos (SQLite y secreto) en el volumen /data
USER node
VOLUME ["/data"]
EXPOSE 2567
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||2567)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/src/index.js"]

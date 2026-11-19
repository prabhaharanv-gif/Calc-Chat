# Gamaroon: relay server (Express + Socket.IO) that also serves the web app. Build context = repository root.
# Everything lives in RAM: no volumes and no database are needed, and only ONE instance may run.

# 1) build the web app. Same-origin build (no VITE_SERVER_URL): the page talks to the server that serves it.
FROM node:20-slim AS web
WORKDIR /web
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# 2) the server (the server looks for the web app in ../client/dist)
FROM node:20-slim
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/index.js server/privacy.html ./
COPY --from=web /web/dist /app/client/dist

# The platform's public HTTP port must match PORT (Northflank: add port 4000, protocol HTTP, public)
ENV NODE_ENV=production PORT=4000 HOST=0.0.0.0
EXPOSE 4000
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]

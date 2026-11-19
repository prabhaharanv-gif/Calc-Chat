# Gamaroon relay server (Express + Socket.IO). Build context = repository root.
# Everything lives in RAM: no volumes and no database are needed, and only ONE instance may run.
FROM node:20-slim

WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY server/index.js server/privacy.html ./

# The platform's public HTTP port must match PORT (Northflank: add port 4000, protocol HTTP, public)
ENV NODE_ENV=production PORT=4000 HOST=0.0.0.0
EXPOSE 4000
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]

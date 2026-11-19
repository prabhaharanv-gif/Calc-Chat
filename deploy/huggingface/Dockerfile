# Gamaroon relay server for Hugging Face Spaces (Docker SDK). Build context = the generated "space" folder.
FROM node:20-slim

WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY server/index.js server/privacy.html ./

# Spaces route traffic to app_port (7860) and run containers as a non-root user
ENV NODE_ENV=production PORT=7860 HOST=0.0.0.0
EXPOSE 7860
USER node
CMD ["node", "index.js"]

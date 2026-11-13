# Imagen de RutaTours: Node 22 + frontend estático servido por Express
FROM node:22-alpine

WORKDIR /app

# Zonas horarias para TZ (America/Caracas)
RUN apk add --no-cache tzdata
ENV NODE_ENV=production

# Dependencias primero (se reutiliza la capa mientras package-lock no cambie)
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev && npm cache clean --force

COPY . .
RUN mkdir -p uploads && chown -R node:node uploads

# Sin privilegios de root dentro del contenedor
USER node

# Dentro del contenedor escucha en todas las interfaces; Docker publica el puerto solo en 127.0.0.1
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/configuracion >/dev/null || exit 1

CMD ["node", "backend/server.js"]

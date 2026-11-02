FROM node:20-alpine

WORKDIR /app

# Copy relay application files
COPY package.json ./
COPY server.mjs ./
COPY channels.json* ./
COPY channels.example.json ./
COPY data/ ./data/
COPY worker/ ./worker/

ENV PORT=8090
ENV HOST=0.0.0.0

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8090/health || exit 1

CMD ["node", "server.mjs"]


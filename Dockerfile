FROM node:20-slim
WORKDIR /app

# Prevent glibc memory fragmentation (OOM Fix)
ENV MALLOC_ARENA_MAX=2
ENV PYTHONUNBUFFERED=1
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Drop to non-root user
RUN groupadd -r appgroup && useradd -r -g appgroup appuser
USER appuser

EXPOSE 3001
CMD ["node", "server/index.cjs"]

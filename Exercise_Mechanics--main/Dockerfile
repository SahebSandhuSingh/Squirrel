# ---- Stage 1: build the React SPA ----
FROM node:22-slim AS frontend
WORKDIR /build/frontend-react
COPY frontend-react/package.json frontend-react/package-lock.json ./
RUN npm ci
COPY frontend-react/ ./
# vite outDir is ../frontend-dist (vite.config.ts) -> /build/frontend-dist
RUN npm run build

# ---- Stage 2: Python runtime ----
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY --from=frontend /build/frontend-dist ./frontend-dist
RUN mkdir -p /app/data/users
ENV PORT=8000
EXPOSE 8000
CMD uvicorn backend.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*' --workers 1

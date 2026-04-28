# Entangled Body

초기 개발 환경이 비어 있어서, 최소 실행 가능한 세팅을 추가했습니다.

## Quick Start

```bash
npm run setup
npm run dev
```

- API: `http://localhost:8000`
- Health: `http://localhost:8000/health`
- Quantum Health: `http://localhost:8000/quantum/health`

## Docker

```bash
docker compose up --build
```

## 현재 포함된 세팅

- FastAPI 앱 엔트리 (`apps/api/main.py`)
- Quantum 라우트 기본 엔드포인트 (`apps/api/routes/quantum.py`)
- Python 의존성 (`apps/api/requirements.txt`)
- 설치/개발 스크립트 (`scripts/setup.sh`, `scripts/dev.sh`)
- 루트 npm 스크립트 (`package.json`)
- API용 Docker Compose (`docker-compose.yml`)

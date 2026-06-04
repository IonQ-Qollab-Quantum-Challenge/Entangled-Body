# Development Guide

This guide contains the local setup, run commands, API examples, test commands, and configuration details that were previously mixed into the root README.

## Prerequisites

- Node.js compatible with the repository lockfile and scripts.
- npm.
- Python 3.11 or newer.
- Docker and Docker Compose, if running the containerized stack.

## Installation

Install Node dependencies, create the Python virtual environment, and install backend dependencies:

```bash
npm run setup
```

The setup script:

- Runs `npm install`.
- Creates `.venv` if it does not exist.
- Installs `apps/api/requirements.txt` into the virtual environment.

## Run Both Apps

```bash
npm run dev
```

This starts:

- FastAPI on `http://localhost:8000`
- Next.js on `http://localhost:3000`

The dev script also attempts to free ports `3000` and `8000` before starting.

## Run Services Separately

Frontend only:

```bash
npm run web:dev
```

Backend only:

```bash
npm run api:dev
```

## Build and Type Check

Build the Next.js app:

```bash
npm run build
```

Run TypeScript checking:

```bash
npm run typecheck
```

## Docker Compose

Run the local web and API containers:

```bash
docker compose up --build
```

Docker Compose exposes:

- Web: `http://localhost:3000`
- API: `http://localhost:8000`

The web container sets `API_PROXY_TARGET=http://api:8000` so `/api/*` requests are proxied to the API service.

## Environment Variables

Backend environment values can live in either the repo-root `.env` or `apps/api/.env`. Process environment variables take precedence, and `apps/api/.env` is loaded after the repo-root file.

Create a local API env file:

```bash
cp apps/api/.env.example apps/api/.env
```

Use real values only in local, uncommitted env files:

```text
IONQ_API_KEY=
IONQ_BACKEND=ionq_simulator
IONQ_SIMULATOR_BACKEND=ionq_simulator
IONQ_QPU_BACKEND=qpu.forte-enterprise-1
IONQ_ENABLE_HARDWARE=false
IONQ_TIMEOUT_SECONDS=120
API_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://entangledbody.com
```

IonQ hardware execution only submits to a QPU when `IONQ_API_KEY` is set and `IONQ_ENABLE_HARDWARE=true`. Otherwise, IonQ requests return an Aer fallback payload with `fallbackReason`.

Frontend environment variables:

```text
NEXT_PUBLIC_API_BASE_URL=/api
NEXT_PUBLIC_QUANTUM_REQUEST_TIMEOUT_MS=300000
NEXT_PUBLIC_QUANTUM_FALLBACK_ON_HTTP_ERRORS=false
```

Set `NEXT_PUBLIC_QUANTUM_FALLBACK_ON_HTTP_ERRORS=true` only when a demo should use bundled local samples even after backend HTTP errors. Keep it false while debugging so API 4xx/5xx responses surface in the UI.

For local development without the Next.js rewrite, point the browser directly at the API:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

## API Endpoints

Health checks:

```text
GET http://localhost:8000/health
GET http://localhost:8000/quantum/health
```

Quantum data:

```text
GET  http://localhost:8000/quantum/precomputed
POST http://localhost:8000/quantum/measure
```

Local Aer request:

```bash
curl -X POST http://localhost:8000/quantum/measure \
  -H "Content-Type: application/json" \
  -d '{"region":"torso","interaction":"click","shots":128,"backend":"aer","seed":42}'
```

IonQ simulator request:

```bash
curl -X POST http://localhost:8000/quantum/measure \
  -H "Content-Type: application/json" \
  -d '{"region":"rightHand","interaction":"click","shots":128,"backend":"ionq_simulator"}'
```

IonQ hardware request:

```bash
IONQ_ENABLE_HARDWARE=true python -m uvicorn main:app --host 0.0.0.0 --port 8000

curl -X POST http://localhost:8000/quantum/measure \
  -H "Content-Type: application/json" \
  -d '{"region":"leftFoot","interaction":"click","shots":128,"backend":"ionq_hardware"}'
```

## Testing

Run backend smoke tests:

```bash
cd apps/api
../../.venv/bin/python -m unittest tests.smoke_quantum_backends -q
```

The smoke tests cover:

- Aer response contract.
- IonQ simulator fallback behavior.
- Hardware safety gate.
- Environment loading behavior.
- API key redaction from health responses.

The real IonQ hardware test is skipped by default. To submit an actual IonQ QPU job, opt in explicitly:

```bash
cd apps/api
IONQ_API_KEY=your-ionq-api-key \
IONQ_ENABLE_HARDWARE=true \
RUN_IONQ_HARDWARE_TEST=true \
../../.venv/bin/python -m unittest tests.smoke_quantum_backends.IonQHardwareIntegrationTests.test_real_ionq_hardware_execution_when_explicitly_enabled -q
```

Frontend automated tests are not currently documented.

## Available npm Scripts

- `npm run setup`: install Node dependencies, create `.venv`, and install Python API dependencies.
- `npm run dev`: run the API and web app together.
- `npm run web:dev`: run the Next.js frontend only.
- `npm run api:dev`: run the FastAPI backend only.
- `npm run build`: build the Next.js app.
- `npm run typecheck`: run TypeScript type checking.

## Interaction Model

- Hover performs weak measurement behavior in measurement mode and local node inspection in inspect mode.
- Click inspects a selected node in inspect mode.
- Hold or global collapse triggers the stronger measurement path in measurement mode.
- The frontend maps returned region and node states into activation, coherence, displacement, entanglement links, and collapse animation state.

## Tile and Surface Sampling

The frontend loads `/models/astronaut_rigged_and_animated.glb`, traverses mesh geometry, samples surface points with `MeshSurfaceSampler`, and renders a translucent body with surface particles and a fixed quantum node graph. Region assignment uses fixed node mappings and spatial/model context in the frontend.

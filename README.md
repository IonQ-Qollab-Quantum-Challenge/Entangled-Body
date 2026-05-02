# Entangled Body

Entangled Body is a separated frontend/backend prototype for rendering a GLB body as a tile cloud and driving the interaction state with quantum measurement data.

## Architecture

- `apps/web`: Next.js frontend with React Three Fiber and Three.js.
- `apps/api`: FastAPI backend with Qiskit Aer simulator code.
- `apps/api/data/precomputed_samples.json`: weak measurement samples used by hover interactions.
- `apps/web/public/models/astronaut_rigged_and_animated.glb`: source model sampled into render tiles.

## Run the Frontend

```bash
npm install
npm run dev
```

Frontend URL:

```text
http://localhost:3000
```

Set `NEXT_PUBLIC_API_BASE_URL` if the API is not running on `http://localhost:8000`.

## Run Frontend + Backend Together

```bash
npm run dev:all
```

- Frontend (3D astronaut model): `http://localhost:3000`
- Backend API JSON: `http://localhost:8000`

If you open port `8000`, you will see API JSON (health/docs), not the 3D scene.

## Run the Backend

```bash
cd apps/api
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Backend URLs:

- `GET http://localhost:8000/health`
- `GET http://localhost:8000/quantum/health`
- `GET http://localhost:8000/quantum/precomputed`
- `POST http://localhost:8000/quantum/measure`

## Interaction Model

- Hover performs a weak measurement by reading precomputed quantum samples from `/quantum/precomputed`.
- Click performs a strong measurement by calling `/quantum/measure`, which runs a 6-qubit Qiskit Aer circuit.
- Hold triggers global collapse in the frontend, moving all tiles from scattered positions to the sampled body surface.

## Tile Sampling

The frontend loads the GLB from `/models/astronaut_rigged_and_animated.glb`, traverses mesh geometry, samples surface points with `MeshSurfaceSampler`, and converts those points into tile records. Region assignment prefers mesh names such as head, torso, arm, or leg. If the mesh name is not useful, the sampler falls back to spatial classification using vertical position for head/torso/legs and horizontal position for left/right.

## Quantum Mapping

The backend simulator returns counts and the dominant bitstring. `quantum/mapper.py` converts counts into per-region values:

- `activation`: how strongly tiles cluster and glow.
- `coherence`: how much noise is reduced.
- `displacement`: a signed visual offset for measurement response.

The frontend `mapQuantumToBody.ts` normalizes that JSON into body region state and entanglement links for the tile renderer.

## Docker

```bash
docker compose up --build
```

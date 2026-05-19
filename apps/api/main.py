from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config.env import load_env_files
from routes.quantum import router as quantum_router

load_env_files()

app = FastAPI(title="Entangled Body API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "api"}


@app.get("/api/health")
def api_health() -> dict:
    return health()


app.include_router(quantum_router)
app.include_router(quantum_router, prefix="/api")

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config.env import load_env_files
from routes.quantum import router as quantum_router

load_env_files()

app = FastAPI(title="Entangled Body API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "API_CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000,https://entangledbody.com",
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "api", "deployment": "api-auto-deploy-test"}


@app.get("/api/health")
def api_health() -> dict:
    return health()


app.include_router(quantum_router)
app.include_router(quantum_router, prefix="/api")

from fastapi import APIRouter

router = APIRouter(prefix="/quantum", tags=["quantum"])


@router.get("/health")
def quantum_health() -> dict:
    return {
        "ok": True,
        "mode": "simulator",
        "ionq_configured": False,
    }


@router.get("/precomputed")
def get_precomputed_sample() -> dict:
    return {
        "source": "placeholder",
        "message": "Precomputed dataset is not generated yet.",
        "items": [],
    }

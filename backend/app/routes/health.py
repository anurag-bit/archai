from fastapi import APIRouter
from services.vector_store import get_embeddings

router = APIRouter()

@router.get("/api/health")
async def health_check():
    embeddings = get_embeddings()
    embeddings._get_underlying()  # Ensure underlying is resolved/checked
    
    degraded = getattr(embeddings, "degraded", False)
    status = "ok"
    details = {}
    if degraded:
        status = "degraded"
        details["embeddings"] = "Using FNV-1a local deterministic token hashing fallback (LocalHuggingFaceEmbeddings failed to load)"
        
    return {
        "status": status,
        "service": "archai-backend",
        "details": details
    }

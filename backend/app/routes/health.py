from fastapi import APIRouter
from services.vector_store import get_embeddings, get_chroma_client

router = APIRouter()

@router.get("/api/health")
async def health_check():
    embeddings = get_embeddings()
    if hasattr(embeddings, "ensure_loaded"):
        embeddings.ensure_loaded()
    
    degraded = getattr(embeddings, "degraded", False)
    status = "ok"
    details = {}
    if degraded:
        status = "degraded"
        details["embeddings"] = "Using FNV-1a local deterministic token hashing fallback (LocalHuggingFaceEmbeddings failed to load)"

    # Verify Chroma connectivity
    try:
        client = get_chroma_client()
        client.heartbeat()
    except Exception as e:
        status = "degraded" if status == "ok" else status
        details["chroma"] = f"Unreachable: {str(e)}"
        
    return {
        "status": status,
        "service": "archai-backend",
        "details": details
    }

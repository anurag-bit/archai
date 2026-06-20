import uuid
import traceback
from fastapi import APIRouter, HTTPException, Query
from services.vector_store import similarity_search_with_score

router = APIRouter()

@router.get("/api/search")
async def search_endpoint(
    q: str = Query(..., description="Query text"),
    k: int = Query(5, description="Number of results to retrieve")
):
    try:
        k = min(k, 20)
        results = similarity_search_with_score(q, k)

        formatted_results = []
        for doc, score in results:
            formatted_results.append({
                "content": doc.page_content,
                "metadata": doc.metadata,
                "score": round(score, 4),
                "relevance": "high" if score >= 0.8 else "medium" if score >= 0.5 else "low"
            })

        return {
            "query": q,
            "count": len(formatted_results),
            "results": formatted_results
        }
    except Exception as e:
        request_id = str(uuid.uuid4())
        print(f"[Request {request_id}] Search error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={"error": "An internal error occurred", "requestId": request_id}
        )

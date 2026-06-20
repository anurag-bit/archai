import uuid
import hashlib
import traceback
from typing import List
from fastapi import APIRouter, HTTPException
from schemas.ingest import IngestRequest, DocumentInput
from services.vector_store import add_documents
from langchain_core.documents import Document

router = APIRouter()

@router.post("/api/ingest")
async def ingest_endpoint(req: IngestRequest):
    try:
        MAX_DOCUMENTS = 100
        MAX_CONTENT_LENGTH = 50_000

        if not req.documents:
            raise HTTPException(status_code=400, detail="documents array is required")

        if len(req.documents) > MAX_DOCUMENTS:
            raise HTTPException(
                status_code=400,
                detail=f"Maximum {MAX_DOCUMENTS} documents per request"
            )

        docs = []
        for idx, doc_input in enumerate(req.documents):
            # Resolve document content and metadata
            if isinstance(doc_input, str):
                content = doc_input
                meta = (req.metadata[idx] if req.metadata and idx < len(req.metadata) else {}) or {}
            else:
                content = doc_input.content
                meta = doc_input.metadata or {}
                # Add default or merged metadata
                req_meta = (req.metadata[idx] if req.metadata and idx < len(req.metadata) else {}) or {}
                meta = {**meta, **req_meta}

            if len(content) > MAX_CONTENT_LENGTH:
                raise HTTPException(
                    status_code=400,
                    detail=f"Document exceeds maximum length of {MAX_CONTENT_LENGTH} characters"
                )

            # Ensure source: api is set
            meta["source"] = meta.get("source", "api")
            docs.append(Document(page_content=content, metadata=meta))

        # Generate deterministic doc IDs from content
        ids = []
        for idx, doc in enumerate(docs):
            content_hash = hashlib.sha256(doc.page_content.encode("utf-8")).hexdigest()[:12]
            ids.append(f"doc_{content_hash}_{idx}")

        add_documents(docs, ids=ids)

        return {
            "success": True,
            "message": f"Ingested {len(docs)} documents",
            "count": len(docs)
        }
    except HTTPException:
        raise
    except Exception as e:
        request_id = str(uuid.uuid4())
        print(f"[Request {request_id}] Ingest error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={"error": "An internal error occurred", "requestId": request_id}
        )

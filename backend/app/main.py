import os
import sys
import uuid
import hashlib
import traceback
from typing import List, Dict, Any, Union, Optional

# Add the directory containing main.py to Python's sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from contextlib import asynccontextmanager
from fastapi import FastAPI, Form, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from services.vector_store import (
    add_documents,
    similarity_search_with_score,
    sweep_temporary_chunks,
    get_embeddings,
    start_sweep_scheduler
)
from services.design_generator import generate_system_design
from utils.pdf_parser import extract_pdf_text
from langchain_core.documents import Document
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

CHAT_RESPONSE_PROMPT_TEMPLATE = ChatPromptTemplate.from_messages([
    ("system", (
        "You are a helpful AI assistant. Answer the question using the provided context.\n"
        "If the context doesn't contain relevant information, say so clearly.\n"
        "Be concise and cite the document sources when helpful."
    )),
    ("human", "Context:\n{context}\n\nQuestion: {question}")
])

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    try:
        get_embeddings()
        sweep_temporary_chunks()
        start_sweep_scheduler()
    except Exception as e:
        print(f"Warning: Startup check failed: {e}")
    yield
    # Shutdown logic (if any) goes here

app = FastAPI(title="Archai Backend", version="1.0.0", lifespan=lifespan)

# Enable CORS for ease of development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic schemas for request validation
class ChatRequest(BaseModel):
    question: str
    k: int = 3
    temperature: float = 0.0

class DocumentInput(BaseModel):
    content: str
    metadata: Optional[Dict[str, Any]] = None

class IngestRequest(BaseModel):
    documents: List[Union[str, DocumentInput]]
    metadata: Optional[List[Dict[str, Any]]] = None

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "archai-backend"}

@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest):
    try:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")

        # Retrieve relevant docs
        results = similarity_search_with_score(req.question, k=req.k)
        retrieved_docs = [doc for doc, _ in results]

        # Build context
        context_parts = []
        for idx, doc in enumerate(retrieved_docs):
            source = doc.metadata.get("source", "unknown")
            context_parts.append(f"[Document {idx + 1} - {source}]\n{doc.page_content}")
        context = "\n\n".join(context_parts)

        # Initialize OpenAI Chat Model
        model_name = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        model = ChatOpenAI(
            model=model_name,
            temperature=req.temperature,
            openai_api_key=api_key,
            request_timeout=60
        )

        chain = CHAT_RESPONSE_PROMPT_TEMPLATE | model
        response = await chain.ainvoke({
            "context": context,
            "question": req.question
        })

        return {
            "answer": response.content,
            "documents": [
                {
                    "content": doc.page_content,
                    "metadata": doc.metadata
                }
                for doc in retrieved_docs
            ],
            "model": model_name
        }
    except Exception as e:
        request_id = str(uuid.uuid4())
        print(f"[Request {request_id}] Chat error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={"error": "An internal error occurred", "requestId": request_id}
        )

@app.post("/api/design")
async def design_endpoint(
    requirements: str = Form(""),
    document: Optional[UploadFile] = File(None),
    tech_stack: str = Form(""),
    design_principles: str = Form(""),
    security_protocols: str = Form(""),
):
    try:
        MAX_FILE_SIZE = 10 * 1024 * 1024 # 10MB
        document_text = requirements.strip()

        if document and document.filename:
            # Read file bytes
            file_bytes = await document.read()
            if len(file_bytes) > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"File exceeds maximum size of {MAX_FILE_SIZE / 1024 / 1024} MB."
                )

            # Extract text
            filename_lower = document.filename.lower()
            if filename_lower.endswith(".pdf") or document.content_type == "application/pdf":
                uploaded_text = extract_pdf_text(file_bytes)
            else:
                uploaded_text = file_bytes.decode("utf-8", errors="ignore").strip()

            if uploaded_text:
                document_text = "\n\n".join(filter(None, [requirements, uploaded_text]))

        if not document_text:
            raise HTTPException(
                status_code=400,
                detail="Add a requirements document or paste requirement text before generating."
            )

        result = await generate_system_design(
            document_text,
            tech_stack=tech_stack,
            design_principles=design_principles,
            security_protocols=security_protocols,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        request_id = str(uuid.uuid4())
        print(f"[Request {request_id}] Design generation error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={"error": "An internal error occurred", "requestId": request_id}
        )

@app.post("/api/ingest")
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

@app.get("/api/search")
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

if __name__ == "__main__":
    import uvicorn
    import hashlib
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

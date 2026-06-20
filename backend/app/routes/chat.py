import os
import uuid
import traceback
from fastapi import APIRouter, HTTPException
from schemas.chat import ChatRequest
from services.vector_store import similarity_search_with_score
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from core.config import OPENAI_MODEL

router = APIRouter()

CHAT_RESPONSE_PROMPT_TEMPLATE = ChatPromptTemplate.from_messages([
    ("system", (
        "You are a helpful AI assistant. Answer the question using the provided context.\n"
        "If the context doesn't contain relevant information, say so clearly.\n"
        "Be concise and cite the document sources when helpful."
    )),
    ("human", "Context:\n{context}\n\nQuestion: {question}")
])

@router.post("/api/chat")
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
        model = ChatOpenAI(
            model=OPENAI_MODEL,
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
            "model": OPENAI_MODEL
        }
    except Exception as e:
        request_id = str(uuid.uuid4())
        print(f"[Request {request_id}] Chat error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={"error": "An internal error occurred", "requestId": request_id}
        )

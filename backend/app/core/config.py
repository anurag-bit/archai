import os
from dotenv import load_dotenv

# Load env variables on startup
load_dotenv()

# App environment configuration
PORT = int(os.getenv("PORT", "8080"))
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Z.ai (Zhipu AI) configuration
_zai_key_raw = os.getenv("ZAI_API_KEY") or os.getenv("ZHIPUAI_API_KEY") or os.getenv("ZHIPU_API_KEY") or ""
ZAI_API_KEY = _zai_key_raw.strip() or None

_zai_base_raw = os.getenv("ZAI_API_BASE") or os.getenv("ZHIPUAI_API_BASE") or os.getenv("ZHIPU_API_BASE") or ""
ZAI_API_BASE = _zai_base_raw.strip() or "https://api.z.ai/api/coding/paas/v4/"

_zai_model_raw = os.getenv("ZAI_MODEL") or ""
ZAI_MODEL = _zai_model_raw.strip() or "glm-4.7-flash"

# Vector store configuration
CHROMA_HOST = os.getenv("CHROMA_HOST", "127.0.0.1")
CHROMA_PORT = int(os.getenv("CHROMA_PORT", "8000"))
CHROMA_COLLECTION = os.getenv("CHROMA_COLLECTION", "documents")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")

# RAG & LLM parameters
MAX_CHUNK_SIZE = int(os.getenv("MAX_CHUNK_SIZE", "2800"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "320"))
MAX_QA_RETRIES = int(os.getenv("MAX_QA_RETRIES", "5"))
MAX_CONCURRENT_MODULES = int(os.getenv("MAX_CONCURRENT_MODULES", "4"))

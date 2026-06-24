import os
import logging
import warnings

# Suppress Hugging Face Hub unauthenticated rate-limit warnings programmatically
logging.getLogger("huggingface_hub").setLevel(logging.ERROR)
warnings.filterwarnings("ignore", message=".*unauthenticated requests.*")

import math
import re
import unicodedata
from typing import List
from langchain_core.embeddings import Embeddings

EMBEDDING_DIMENSION = 384

def hash_token(value: str) -> int:
    """
    32-bit FNV-1a hash matching TypeScript implementation.
    """
    hash_val = 2166136261
    for char in value:
        hash_val ^= ord(char)
        hash_val = (hash_val * 16777619) & 0xFFFFFFFF
    return hash_val

def tokenize(text: str) -> List[str]:
    """
    Tokenizes text matching the TypeScript implementation.
    """
    normalized = unicodedata.normalize("NFKC", text).lower()
    tokens = re.split(r'[^a-z0-9]+', normalized)
    return [t for t in tokens if len(t) > 1]

def add_token(vector: List[float], token: str, weight: float) -> None:
    index = hash_token(token) % EMBEDDING_DIMENSION
    vector[index] += weight

def normalize_vector(vector: List[float]) -> List[float]:
    magnitude = sum(val * val for val in vector)
    magnitude = math.sqrt(magnitude)
    if magnitude == 0:
        return vector
    return [val / magnitude for val in vector]

def embed_text(text: str) -> List[float]:
    """
    Computes deterministic local embedding vector for text.
    """
    vector = [0.0] * EMBEDDING_DIMENSION
    tokens = tokenize(text)
    
    for idx, token in enumerate(tokens):
        weight = 1.0 + math.log1p(len(token))
        add_token(vector, token, weight)
        if idx + 1 < len(tokens):
            add_token(vector, f"{token}_{tokens[idx + 1]}", weight * 0.75)
            
    characters = unicodedata.normalize("NFKC", text).lower()
    characters = re.sub(r'\s+', ' ', characters)
    for idx in range(len(characters) - 2):
        add_token(vector, characters[idx:idx + 3], 0.25)
        
    return normalize_vector(vector)

class LocalDeterministicEmbeddings(Embeddings):
    """
    LangChain Embeddings implementation for deterministic offline word-hashing embeddings.
    """
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [embed_text(t) for t in texts]

    def embed_query(self, text: str) -> List[float]:
        return embed_text(text)

logger = logging.getLogger(__name__)

class LocalHuggingFaceEmbeddings(Embeddings):
    """
    Tries to load local HuggingFace embeddings (e.g. BAAI/bge-small-en-v1.5) via sentence-transformers,
    falling back to LocalDeterministicEmbeddings if it fails to import or load.
    """
    def __init__(self):
        self._underlying = None
        self.degraded = False

    def _get_underlying(self) -> Embeddings:
        if self._underlying is None:
            try:
                from langchain_huggingface import HuggingFaceEmbeddings
                
                # Check for locally downloaded model first
                base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                local_model_path = os.path.join(base_dir, "local_models", "bge-small-en-v1.5")
                
                if os.path.isdir(local_model_path):
                    model_name = local_model_path
                    model_kwargs = {'device': 'cpu', 'local_files_only': True}
                    print(f"✓ Loading local offline HuggingFace embeddings model from: {model_name}")
                else:
                    model_name = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
                    model_kwargs = {'device': 'cpu'}
                    print(f"✓ Loading local HuggingFace embeddings model: {model_name}")

                self._underlying = HuggingFaceEmbeddings(
                    model_name=model_name,
                    model_kwargs=model_kwargs,
                    encode_kwargs={'normalize_embeddings': True}
                )
                self.degraded = False
            except Exception as e:
                logger.warning(
                    f"⚠️ EM-DEGRADED: Falling back to offline deterministic embeddings after failed load: {e}. "
                    "This may severely impact retrieval/RAG quality!"
                )
                self.degraded = True
                self._underlying = LocalDeterministicEmbeddings()
        return self._underlying

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return self._get_underlying().embed_documents(texts)

    def embed_query(self, text: str) -> List[float]:
        return self._get_underlying().embed_query(text)

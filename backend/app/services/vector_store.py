import os
import time
import chromadb
import threading
from typing import List, Dict, Any, Tuple, Optional
from services.embeddings import LocalHuggingFaceEmbeddings
from langchain_core.documents import Document

# Global cache variables
_embeddings = None
_chroma_client = None

def get_embeddings() -> LocalHuggingFaceEmbeddings:
    global _embeddings
    if _embeddings is None:
        _embeddings = LocalHuggingFaceEmbeddings()
    return _embeddings

def get_chroma_client() -> chromadb.HttpClient:
    global _chroma_client
    if _chroma_client is None:
        host = os.getenv("CHROMA_HOST", "127.0.0.1")
        port = int(os.getenv("CHROMA_PORT", "8000"))
        _chroma_client = chromadb.HttpClient(host=host, port=port)
    return _chroma_client

def get_collection():
    client = get_chroma_client()
    collection_name = os.getenv("CHROMA_COLLECTION", "documents")
    return client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"}
    )

def score_from_distance(distance: Optional[float]) -> float:
    if distance is None:
        return 0.0
    # Cosine distance ranges from 0 to 2.
    # We map it to a score between -1 and 1.
    return max(-1.0, min(1.0, 1.0 - distance))

def index_chunks_to_chroma(
    document_id: str,
    chunks: List[Dict[str, Any]],
    phase: str,
    request_id: str
) -> None:
    """
    Indexes chunks into Chroma for a specific document, phase, and request.
    Each chunk in the input list should have 'index' and 'text'.
    Optionally includes 'module' metadata for domain-driven retrieval.
    """
    try:
        collection = get_collection()
        embeddings = get_embeddings()

        ids = [f"{document_id}_{request_id}_chunk_{chunk['index']}" for chunk in chunks]
        documents = [chunk['text'] for chunk in chunks]
        metadatas = [
            {
                "documentId": document_id,
                "chunkIndex": chunk['index'],
                "phase": phase,
                "requestId": request_id,
                "temporary": True,
                "createdAt": int(time.time() * 1000),
                "module": chunk.get('module', 'Core System')
            }
            for chunk in chunks
        ]

        vectors = embeddings.embed_documents(documents)

        collection.upsert(
            ids=ids,
            embeddings=vectors,
            documents=documents,
            metadatas=metadatas
        )
    except Exception as e:
        print(f"Error indexing chunks to Chroma: {e}")
        raise

def query_chroma_for_chunks(
    document_id: str,
    query_text: str,
    phase: str,
    request_id: str,
    n_results: int = 8,
    module_name: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Queries Chroma for relevant chunks using phase-specific query text.
    Optionally filters by module name for domain-driven retrieval.
    """
    try:
        collection = get_collection()
        embeddings = get_embeddings()
        query_embedding = embeddings.embed_query(query_text)

        where_clause = {
            "$and": [
                {"documentId": {"$eq": document_id}},
                {"phase": {"$eq": phase}},
                {"requestId": {"$eq": request_id}}
            ]
        }
        
        if module_name:
            where_clause["$and"].append({"module": {"$eq": module_name}})

        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            where=where_clause
        )

        chunks = []
        if results and results.get("documents") and len(results["documents"]) > 0:
            docs = results["documents"][0]
            distances = results["distances"][0] if results.get("distances") else []
            metadatas = results["metadatas"][0] if results.get("metadatas") else []
            for idx, doc in enumerate(docs):
                if not doc:
                    continue
                distance = distances[idx] if idx < len(distances) else None
                score = score_from_distance(distance)

                metadata = metadatas[idx] if idx < len(metadatas) else {}
                chunk_index = metadata.get("chunkIndex", idx)

                chunks.append({
                    "index": chunk_index,
                    "text": doc,
                    "score": score,
                    "module": metadata.get("module", "Core System")
                })
        return chunks
    except Exception as e:
        print(f"Error querying Chroma for chunks: {e}")
        raise

def clear_chroma_chunks(document_id: str, phase: str, request_id: str) -> None:
    """
    Clears session chunks for a specific document, phase, and request.
    """
    try:
        collection = get_collection()
        collection.delete(
            where={
                "$and": [
                    {"documentId": {"$eq": document_id}},
                    {"phase": {"$eq": phase}},
                    {"requestId": {"$eq": request_id}}
                ]
            }
        )
    except Exception as e:
        print(f"Error clearing Chroma chunks: {e}")

def sweep_temporary_chunks() -> None:
    """
    Deletes temporary chunks older than one hour.
    """
    try:
        client = get_chroma_client()
        collection_name = os.getenv("CHROMA_COLLECTION", "documents")
        
        # Safely verify collection exists
        collections = client.list_collections()
        if not any(col.name == collection_name for col in collections):
            return

        collection = client.get_collection(name=collection_name)
        one_hour_ago = int((time.time() - 3600) * 1000)

        collection.delete(
            where={
                "$and": [
                    {"temporary": {"$eq": True}},
                    {"createdAt": {"$lt": one_hour_ago}}
                ]
            }
        )
        print("✓ Swept temporary Chroma chunks successfully")
    except Exception as e:
        print(f"Chroma temporary sweep skipped or failed: {e}")

def start_sweep_scheduler(interval_seconds: int = 1800) -> None:
    """
    Starts a background daemon thread that sweeps temporary chunks periodically.
    """
    def run_sweep():
        while True:
            time.sleep(interval_seconds)
            try:
                sweep_temporary_chunks()
            except Exception as e:
                print(f"Periodic sweep failed: {e}")
            
    thread = threading.Thread(target=run_sweep, daemon=True)
    thread.start()

def add_documents(
    documents: List[Document],
    ids: Optional[List[str]] = None
) -> List[str]:
    """
    Adds standard documents to the primary vector store.
    """
    collection = get_collection()
    embeddings = get_embeddings()

    texts = [doc.page_content for doc in documents]
    embeddings_list = embeddings.embed_documents(texts)
    
    if not ids:
        ids = [f"doc_{int(time.time() * 1000)}_{i}" for i in range(len(documents))]

    # Flatten metadata values to string, int, float, or bool
    flat_metadatas = []
    for doc in documents:
        flat_meta = {}
        for k, v in (doc.metadata or {}).items():
            if isinstance(v, (str, int, float, bool)):
                flat_meta[k] = v
            else:
                flat_meta[k] = str(v)
        flat_metadatas.append(flat_meta)

    collection.upsert(
        ids=ids,
        embeddings=embeddings_list,
        documents=texts,
        metadatas=flat_metadatas
    )
    return ids

def similarity_search_with_score(
    query: str,
    k: int = 5
) -> List[Tuple[Document, float]]:
    """
    Performs similarity search with cosine similarity scores.
    """
    collection = get_collection()
    embeddings = get_embeddings()
    query_embedding = embeddings.embed_query(query)

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=k,
        where={"temporary": {"$ne": True}}
    )

    output = []
    if results and results.get("documents") and len(results["documents"]) > 0:
        docs = results["documents"][0]
        distances = results["distances"][0] if results.get("distances") else []
        metadatas = results["metadatas"][0] if results.get("metadatas") else []

        for idx, doc in enumerate(docs):
            if not doc:
                continue
            distance = distances[idx] if idx < len(distances) else None
            score = score_from_distance(distance)
            metadata = metadatas[idx] if idx < len(metadatas) else {}
            
            output.append((
                Document(page_content=doc, metadata=metadata),
                score
            ))
    return output

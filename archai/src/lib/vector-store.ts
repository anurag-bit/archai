import { Document } from "@langchain/core/documents";
import { ChromaVectorStore, createChromaVectorStore } from "./chroma-vectorstore";
const COLLECTION_NAME = process.env.CHROMA_COLLECTION || "documents";

let vectorStoreInstance: ChromaVectorStore | null = null;

/**
 * Get or initialize vector store
 */
export async function getVectorStore(): Promise<ChromaVectorStore> {
  if (vectorStoreInstance) {
    return vectorStoreInstance;
  }

  vectorStoreInstance = await createChromaVectorStore(COLLECTION_NAME);
  return vectorStoreInstance;
}

/**
 * Add documents to vector store
 */
export async function addDocuments(docs: Document[]): Promise<void> {
  const store = await getVectorStore();
  await store.addDocuments(docs);
}

/**
 * Similarity search in vector store
 */
export async function similaritySearch(
  query: string,
  k: number = 5
): Promise<Document[]> {
  const store = await getVectorStore();
  return store.similaritySearch(query, k);
}

/**
 * Similarity search with scores
 */
export async function similaritySearchWithScore(
  query: string,
  k: number = 5
): Promise<[Document, number][]> {
  const store = await getVectorStore();
  return store.similaritySearchWithScore(query, k);
}

/**
 * Get retriever for use in chains
 */
export async function getRetriever(k: number = 3) {
  const store = await getVectorStore();
  return store.asRetriever({
    k,
    searchType: "similarity",
  });
}

import { ChromaClient } from "chromadb";
import { getEmbeddings } from "./embeddings";

type Chunk = {
  index: number;
  text: string;
  score: number;
};

// Singleton instance of Chroma client
let chromaClient: ChromaClient | null = null;

function getChromaClient(): ChromaClient {
  if (!chromaClient) {
    chromaClient = new ChromaClient({
      host: process.env.CHROMA_HOST || "localhost",
      port: parseInt(process.env.CHROMA_PORT || "8000"),
    });
  }
  return chromaClient;
}

async function getCollection(phase: "analysis" | "dataModel" | "architecture") {
  const client = getChromaClient();
  return client.getOrCreateCollection({
    name: `design_${phase}`,
    metadata: { type: "design_chunks", "hnsw:space": "cosine" },
  });
}

function scoreFromDistance(distance: number | null | undefined): number {
  if (distance === null || distance === undefined) {
    return 0;
  }

  return Math.max(0, 1 - distance);
}

/**
 * Indexes chunks into a Chroma collection for a specific document and phase.
 * @param documentId Unique identifier for the document
 * @param chunks Array of chunks to index
 * @param phase Design phase (analysis, dataModel, or architecture)
 */
export async function indexChunksToChroma(
  documentId: string,
  chunks: Chunk[],
  phase: "analysis" | "dataModel" | "architecture"
): Promise<void> {
  try {
    const collection = await getCollection(phase);
    const embeddings = await getEmbeddings();

    // Prepare data for upsert
    const ids = chunks.map((chunk) => `${documentId}_chunk_${chunk.index}`);
    const documents = chunks.map((chunk) => chunk.text);
    const metadatas = chunks.map((chunk) => ({
      documentId,
      chunkIndex: chunk.index,
      phase,
    }));
    const vectors = await embeddings.embedDocuments(documents);

    // Upsert chunks into Chroma
    await collection.upsert({
      ids,
      embeddings: vectors,
      documents,
      metadatas,
    });
  } catch (error) {
    console.error("Error indexing chunks to Chroma:", error);
    throw error;
  }
}

/**
 * Query Chroma collection for relevant chunks based on query text.
 * @param documentId Unique identifier for the document
 * @param queryText Text to search for
 * @param phase Design phase to query
 * @param nResults Number of results to return
 * @returns Array of relevant chunks with similarity scores
 */
export async function queryChromaForChunks(
  documentId: string,
  queryText: string,
  phase: "analysis" | "dataModel" | "architecture",
  nResults: number = 8
): Promise<Chunk[]> {
  try {
    const collection = await getCollection(phase);
    const embeddings = await getEmbeddings();
    const queryEmbedding = await embeddings.embedQuery(queryText);

    // Query the collection
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults,
      where: { documentId },
    });

    // Transform results back to Chunk format
    const chunks: Chunk[] = [];
    if (
      results.documents &&
      results.documents.length > 0 &&
      results.distances &&
      results.distances.length > 0
    ) {
      results.documents[0].forEach((doc, idx) => {
        // Skip if document is null or empty
        if (!doc || typeof doc !== "string") {
          return;
        }

        const distance = results.distances![0][idx];
        const score = scoreFromDistance(distance);

        // Extract chunk index from metadata if available
        const metadata = results.metadatas?.[0]?.[idx];
        const chunkIndex =
          typeof metadata === "object" && metadata && "chunkIndex" in metadata
            ? (metadata.chunkIndex as number)
            : idx;

        chunks.push({
          index: chunkIndex,
          text: doc,
          score,
        });
      });
    }

    return chunks;
  } catch (error) {
    console.error("Error querying Chroma:", error);
    throw error;
  }
}

/**
 * Clear all chunks for a specific document from a Chroma collection.
 * @param documentId Unique identifier for the document
 * @param phase Design phase to clear
 */
export async function clearChromaChunks(
  documentId: string,
  phase: "analysis" | "dataModel" | "architecture"
): Promise<void> {
  try {
    const client = getChromaClient();
    const collection = await client.getCollection({
      name: `design_${phase}`,
    });

    // Delete all chunks for this document
    await collection.delete({
      where: { documentId },
    });
  } catch (error) {
    console.error("Error clearing Chroma chunks:", error);
    // Silently fail if collection doesn't exist
  }
}

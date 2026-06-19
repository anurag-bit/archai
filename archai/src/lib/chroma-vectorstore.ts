import { ChromaClient } from "chromadb";
import { VectorStore } from "@langchain/core/vectorstores";
import { Embeddings } from "@langchain/core/embeddings";
import { Document, DocumentInterface } from "@langchain/core/documents";
import { getEmbeddings } from "./embeddings";

const COLLECTION_METADATA = {
  "hnsw:space": "cosine",
} as const;

function flattenMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, string | number | boolean> {
  const flatMeta: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(metadata || {})) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      flatMeta[key] = value;
    } else {
      flatMeta[key] = String(value);
    }
  }

  return flatMeta;
}

function scoreFromDistance(distance: number | null | undefined): number {
  if (distance === null || distance === undefined) {
    return 0;
  }

  return Math.max(0, 1 - distance);
}

/**
 * LangChain VectorStore implementation using ChromaDB as backend.
 */
export class ChromaVectorStore extends VectorStore {
  private chromaClient: ChromaClient;
  private collectionName: string;

  private async getCollection() {
    return this.chromaClient.getOrCreateCollection({
      name: this.collectionName,
      metadata: COLLECTION_METADATA,
    });
  }

  static lc_name() {
    return "ChromaVectorStore";
  }

  _vectorstoreType() {
    return "chroma";
  }

  async similaritySearchVectorWithScore(
    query: number[],
    k: number = 8
  ): Promise<[DocumentInterface, number][]> {
    const collection = await this.getCollection();

    const results = await collection.query({
      queryEmbeddings: [query],
      nResults: k,
    });

    const output: [DocumentInterface, number][] = [];

    if (results.documents && results.documents[0]) {
      results.documents[0].forEach((doc, idx) => {
        if (!doc || typeof doc !== "string") {
          return;
        }

        const distance = results.distances?.[0]?.[idx];
        const score = scoreFromDistance(distance);

        const metadata = results.metadatas?.[0]?.[idx];
        const document = new Document({
          pageContent: doc,
          metadata: {
            ...(typeof metadata === "object" && metadata ? metadata : {}),
          },
        });

        output.push([document, score]);
      });
    }

    return output;
  }

  constructor(config: {
    chromaClient: ChromaClient;
    embeddings: Embeddings;
    collectionName?: string;
  }) {
    super(config.embeddings, {});
    this.chromaClient = config.chromaClient;
    this.collectionName = config.collectionName || "documents";
  }

  async addDocuments(
    documents: Document[],
    options?: { ids?: string[] }
  ): Promise<string[]> {
    const texts = documents.map((doc) => doc.pageContent);
    const embeddings = await this.embeddings.embedDocuments(texts);
    const collection = await this.getCollection();

    const ids = options?.ids || documents.map((_, i) => `doc_${Date.now()}_${i}`);
    const metadatas = documents.map((doc) => flattenMetadata(doc.metadata));

    await collection.upsert({
      ids,
      embeddings,
      documents: texts,
      metadatas,
    });

    return ids;
  }

  async similaritySearchWithScore(
    query: string,
    k: number = 8
  ): Promise<[Document, number][]> {
    const queryEmbedding = await this.embeddings.embedQuery(query);
    const collection = await this.getCollection();

    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: k,
    });

    const output: [Document, number][] = [];

    if (results.documents && results.documents[0]) {
      results.documents[0].forEach((doc, idx) => {
        if (!doc || typeof doc !== "string") {
          return;
        }

        const distance = results.distances?.[0]?.[idx];
        const score = scoreFromDistance(distance);

        const metadata = results.metadatas?.[0]?.[idx];
        const document = new Document({
          pageContent: doc,
          metadata: {
            ...(typeof metadata === "object" && metadata ? metadata : {}),
          },
        });

        output.push([document, score]);
      });
    }

    return output;
  }

  async addVectors(
    vectors: number[][],
    documents: Document[],
    options?: { ids?: string[] }
  ): Promise<string[]> {
    const collection = await this.getCollection();

    const ids = options?.ids || documents.map((_, i) => `doc_${Date.now()}_${i}`);
    const texts = documents.map((doc) => doc.pageContent);
    const metadatas = documents.map((doc) => flattenMetadata(doc.metadata));

    await collection.upsert({
      ids,
      embeddings: vectors,
      documents: texts,
      metadatas,
    });

    return ids;
  }

  async delete(options?: { ids: string[] }): Promise<void> {
    if (!options?.ids || options.ids.length === 0) {
      return;
    }

    try {
      const collection = await this.chromaClient.getCollection({
        name: this.collectionName,
      });
      await collection.delete({ ids: options.ids });
    } catch (error) {
      console.warn(
        `Could not delete documents from collection ${this.collectionName}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  static async fromDocuments(
    docs: Document[],
    embeddings: Embeddings,
    config: {
      chromaClient: ChromaClient;
      collectionName?: string;
    }
  ): Promise<ChromaVectorStore> {
    const vectorStore = new ChromaVectorStore({
      ...config,
      embeddings,
    });
    await vectorStore.addDocuments(docs);
    return vectorStore;
  }
}

/**
 * Singleton: Initialize ChromaDB client.
 */
let chromaClientInstance: ChromaClient | null = null;

export function getChromaClient(): ChromaClient {
  if (!chromaClientInstance) {
    const host = process.env.CHROMA_HOST || "localhost";
    const port = parseInt(process.env.CHROMA_PORT || "8000", 10);
    chromaClientInstance = new ChromaClient({
      host,
      port,
    });
  }
  return chromaClientInstance;
}

/**
 * Create a ChromaVectorStore for a specific phase.
 */
export async function createChromaVectorStore(
  collectionName: string = "documents"
): Promise<ChromaVectorStore> {
  const chromaClient = getChromaClient();
  const embeddings = await getEmbeddings();

  return new ChromaVectorStore({
    chromaClient,
    embeddings,
    collectionName,
  });
}

import { Embeddings } from "@langchain/core/embeddings";

export const EMBEDDING_DIMENSION = 384;
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "BAAI/bge-small-en-v1.5";

let embeddingsInstance: Embeddings | null = null;

function hashToken(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function tokenize(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function addToken(vector: number[], token: string, weight: number) {
  const index = hashToken(token) % EMBEDDING_DIMENSION;
  vector[index] += weight;
}

function normalizeVector(vector: number[]): number[] {
  let magnitude = 0;

  for (const value of vector) {
    magnitude += value * value;
  }

  magnitude = Math.sqrt(magnitude);

  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
}

function embedText(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  const tokens = tokenize(text);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const weight = 1 + Math.log1p(token.length);

    addToken(vector, token, weight);

    if (index + 1 < tokens.length) {
      addToken(vector, `${token}_${tokens[index + 1]}`, weight * 0.75);
    }
  }

  const characters = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ");

  for (let index = 0; index + 2 < characters.length; index += 1) {
    addToken(vector, characters.slice(index, index + 3), 0.25);
  }

  return normalizeVector(vector);
}

function createOfflineEmbeddings(): Embeddings {
  return {
    embedDocuments: async (texts: string[]): Promise<number[][]> => {
      return texts.map((text) => embedText(text));
    },
    embedQuery: async (text: string): Promise<number[]> => {
      return embedText(text);
    },
  } as Embeddings;
}

async function createHuggingFaceEmbeddings(): Promise<Embeddings> {
  const { HuggingFaceTransformersEmbeddings } = await import(
    "@langchain/community/embeddings/huggingface_transformers"
  );

  const embeddings = new HuggingFaceTransformersEmbeddings({
    model: EMBEDDING_MODEL,
  });

  await embeddings.embedQuery("warmup");
  return embeddings;
}

/**
 * Get or initialize the shared embeddings instance.
 */
export async function getEmbeddings(): Promise<Embeddings> {
  if (embeddingsInstance) {
    return embeddingsInstance;
  }

  try {
    embeddingsInstance = await createHuggingFaceEmbeddings();
    console.log(`✓ Using Hugging Face embeddings (${EMBEDDING_MODEL})`);
    return embeddingsInstance;
  } catch (error) {
    console.warn(
      `Falling back to offline deterministic embeddings after failed load of ${EMBEDDING_MODEL}:`,
      error instanceof Error ? error.message : String(error)
    );
  }

  embeddingsInstance = createOfflineEmbeddings();
  console.log(`✓ Using offline deterministic embeddings (${EMBEDDING_DIMENSION} dims)`);
  return embeddingsInstance;
}

/**
 * Initialize embeddings (call this during app startup for validation).
 */
export async function initializeEmbeddings(): Promise<void> {
  const embeddings = await getEmbeddings();
  await embeddings.embedQuery("initialization test");
  console.log("✓ Embeddings initialized successfully");
}
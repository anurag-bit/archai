const dimension = 384;
const embeddingModel = process.env.EMBEDDING_MODEL || "BAAI/bge-small-en-v1.5";

function hashToken(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function tokenize(text) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function embedText(text) {
  const vector = new Array(dimension).fill(0);
  const tokens = tokenize(text);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const weight = 1 + Math.log1p(token.length);
    vector[hashToken(token) % dimension] += weight;

    if (index + 1 < tokens.length) {
      vector[hashToken(`${token}_${tokens[index + 1]}`) % dimension] += weight * 0.75;
    }
  }

  let magnitude = 0;
  for (const value of vector) {
    magnitude += value * value;
  }

  magnitude = Math.sqrt(magnitude);
  return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
}

async function cacheModel() {
  console.log(`Preparing embedding model (${embeddingModel})...`);

  try {
    const { HuggingFaceTransformersEmbeddings } = await import(
      "@langchain/community/embeddings/huggingface_transformers"
    );

    const embeddings = new HuggingFaceTransformersEmbeddings({
      model: embeddingModel,
    });

    await embeddings.embedQuery("cache warming");
    console.log(`✓ Cached Hugging Face embeddings (${embeddingModel}).`);
    return;
  } catch (error) {
    console.warn(
      `Could not download ${embeddingModel}, continuing with offline fallback:`,
      error instanceof Error ? error.message : String(error)
    );
  }

  const vector = embedText("cache warming");

  if (vector.length !== dimension) {
    console.error(`Failed to initialize offline embeddings: expected ${dimension} dimensions, got ${vector.length}`);
    process.exit(1);
  }

  console.log(`✓ Offline embeddings ready (${dimension} dims).`);
}

cacheModel().catch((error) => {
  console.error("Failed to initialize offline embeddings:", error);
  process.exit(1);
});
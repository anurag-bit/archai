# LangChain + Chroma RAG Setup for Archai

This document covers the complete RAG (Retrieval-Augmented Generation) setup using LangChain, Chroma, and Google Gemini.

## Architecture

```
Next.js (Frontend/API)
   ↓
LangChain (Orchestration)
   ↓
Embedding Model (Local HuggingFace)
   ↓
ChromaDB (Vector Storage)
   ↓
Retriever
   ↓
LLM (Gemini for responses)
```

## Setup Steps

### 1. Install Dependencies

The required packages are already in `package.json`:

- `@langchain/google-genai` - Google Gemini integration
- `@langchain/community` - Additional loaders and tools
- `@langchain/core` - Core LangChain utilities
- `chromadb` - Vector database client
- `@xenova/transformers` - Local HuggingFace embeddings

```bash
pnpm install
```

### 2. Environment Variables

Create `.env.local`:

```env
# Google Gemini API (for chat responses only)
GOOGLE_API_KEY=your_google_api_key

# ChromaDB
CHROMA_URL=http://localhost:8000
CHROMA_COLLECTION=documents
```

**Get your Google API Key:**
1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key
3. Set `GOOGLE_API_KEY` in `.env.local`

**Note:** Embeddings run locally with no API keys needed!

### 3. Start ChromaDB

ChromaDB is already running in Docker:

```bash
docker run -d \
  --name chromadb \
  -p 8000:8000 \
  -v ./chroma-data:/chroma/chroma \
  chromadb/chroma
```

Check status:

```bash
curl http://localhost:8000/api/v1/heartbeat
```

## API Endpoints

### POST /api/ingest

Ingest documents into the vector store.

**Request:**

```json
{
  "documents": [
    "Next.js is a full-stack React framework.",
    "LangChain helps build AI applications."
  ],
  "metadata": [
    { "source": "docs", "page": 1 },
    { "source": "docs", "page": 2 }
  ]
}
```

**Response:**

```json
{
  "success": true,
  "message": "Ingested 2 documents",
  "count": 2
}
```

### GET /api/search

Search for similar documents.

**Request:**

```
GET /api/search?q=What%20is%20LangChain&k=5
```

**Response:**

```json
{
  "query": "What is LangChain?",
  "count": 2,
  "results": [
    {
      "content": "LangChain helps build AI applications.",
      "metadata": { "source": "docs" },
      "score": 0.8234
    }
  ]
}
```

### POST /api/chat

Full RAG chat endpoint - retrieves documents and generates answer.

**Request:**

```json
{
  "question": "What is LangChain?",
  "k": 3,
  "temperature": 0
}
```

**Response:**

```json
{
  "answer": "LangChain is a framework for developing applications powered by language models...",
  "documents": [
    {
      "content": "LangChain helps build AI applications.",
      "metadata": { "source": "docs" }
    }
  ],
  "model": "gemini-1.5-flash"
}
```

## File Structure

```
src/
├── lib/
│   ├── embedding.ts         # Embedding model configuration (HuggingFace/Google/Ollama)
│   ├── vector-store.ts      # Chroma vector store utilities
│   ├── text-splitter.ts     # Document chunking for production
│   ├── chroma-vectorstore.ts # Custom VectorStore implementation
│   └── design-generator.ts  # Existing design generation logic
├── app/
│   └── api/
│       ├── ingest/route.ts  # Ingest documents
│       ├── search/route.ts  # Similarity search
│       ├── chat/route.ts    # RAG chat endpoint with Gemini
│       └── design/route.ts  # Existing design endpoint
```

## Usage Examples

### Example 1: Ingest Documents

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "documents": [
      "Next.js is a React framework for production.",
      "LangChain simplifies LLM application development."
    ]
  }'
```

### Example 2: Search Documents

```bash
curl "http://localhost:3000/api/search?q=React%20framework&k=3"
```

### Example 3: RAG Query

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is Next.js?",
    "k": 3,
    "temperature": 0
  }'
```

## Production Best Practices

### 1. Document Chunking

For large documents (PDFs, books), use text splitting:

```typescript
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { splitDocuments } from "@/lib/text-splitter";

const loader = new PDFLoader("document.pdf");
const docs = await loader.load();
const chunks = await splitDocuments(docs, {
  chunkSize: 1000,
  chunkOverlap: 200,
});
await addDocuments(chunks);
```

### 2. Embedding Models

The system uses **mixedbread-ai/mxbai-embed-large-v1** via local Transformers.js for all embedding operations.

#### mixedbread-ai/mxbai-embed-large-v1 (Local - Primary)

- **Model:** `Xenova/mxbai-embed-large-v1` (via Transformers.js)
- **Provider:** Local inference (no API calls)
- **Cost:** Free, runs on your machine
- **Quality:** Excellent, 1024 dimensions
- **Speed:** Fast CPU inference
- **Setup:** Automatic with `@xenova/transformers` package
- **Pros:** 
  - No API keys needed
  - Works offline
  - No rate limits
  - Complete privacy
  - First run downloads ~500MB model (cached locally)

### 3. Retriever Settings

Adjust `k` (number of documents to retrieve):

- **Low k (1-2):** Fast, precise answers for factual queries
- **Medium k (3-5):** Balanced, default for most use cases
- **High k (7-10):** Comprehensive, for research or complex questions

### 4. Temperature Settings

For RAG responses:

- **temperature: 0** - Deterministic, best for factual Q&A
- **temperature: 0.3-0.5** - Balanced, good for most applications
- **temperature: 0.7+** - Creative, for brainstorming or creative content

### 5. Metadata Tagging

Add rich metadata for filtering and tracking:

```typescript
const doc = new Document({
  pageContent: "...",
  metadata: {
    source: "pdf",
    filename: "design-guide.pdf",
    page: 42,
    author: "John Doe",
    created_at: new Date().toISOString(),
  },
});
```

## Troubleshooting

### ChromaDB Connection Error

```
Error: Failed to connect to http://localhost:8000
```

**Fix:** Start ChromaDB:

```bash
docker run -d --name chromadb -p 8000:8000 chromadb/chroma
```

### Missing HuggingFace API Key

```
Error: HUGGINGFACE_API_KEY not set
```

**Fix:** Get your token from [HuggingFace Settings](https://huggingface.co/settings/tokens) and set it in `.env.local`

### Missing Google API Key

```
Error: GOOGLE_API_KEY not set
```

**Fix:** Get your key from [Google AI Studio](https://aistudio.google.com/app/apikey) and set it in `.env.local` (needed for chat endpoint)

## Next Steps

1. **Add PDF upload:** Use `PDFLoader` from LangChain
2. **Implement filters:** Add metadata filtering to searches
3. **Add reranking:** Use `CohereRerank` for better relevance
4. **Implement caching:** Cache embeddings for frequently asked questions
5. **Add monitoring:** Track query performance and user feedback

## References

- [LangChain Docs](https://js.langchain.com/)
- [Chroma Docs](https://docs.trychroma.com/)
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)

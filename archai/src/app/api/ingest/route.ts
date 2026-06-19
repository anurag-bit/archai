import { Document } from "@langchain/core/documents";
import { createHash } from "crypto";
import { getVectorStore } from "@/lib/vector-store";

const MAX_DOCUMENTS = 100;
const MAX_CONTENT_LENGTH = 50_000;

function generateDocId(content: string, index: number): string {
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 12);
  return `doc_${hash}_${index}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { documents, metadata } = body;

    if (!documents || !Array.isArray(documents)) {
      return Response.json(
        { error: "documents array is required" },
        { status: 400 }
      );
    }

    if (documents.length > MAX_DOCUMENTS) {
      return Response.json(
        { error: `Maximum ${MAX_DOCUMENTS} documents per request` },
        { status: 400 }
      );
    }

    const docs: Document[] = documents.map(
      (doc: string | { content: string; metadata?: Record<string, unknown> }, idx: number) => {
        if (typeof doc === "string") {
          return new Document({
            pageContent: doc,
            metadata: {
              ...(metadata?.[idx] || {}),
              source: "api",
            },
          });
        }

        return new Document({
          pageContent: doc.content,
          metadata: {
            ...(doc.metadata || {}),
            ...(metadata?.[idx] || {}),
            source: "api",
          },
        });
      }
    );

    for (const doc of docs) {
      if (doc.pageContent.length > MAX_CONTENT_LENGTH) {
        return Response.json(
          { error: `Document exceeds maximum length of ${MAX_CONTENT_LENGTH} characters` },
          { status: 400 }
        );
      }
    }

    const ids = docs.map((doc, idx) => generateDocId(doc.pageContent, idx));
    const store = await getVectorStore();
    await store.addDocuments(docs, { ids });

    return Response.json({
      success: true,
      message: `Ingested ${docs.length} documents`,
      count: docs.length,
    });
  } catch (error) {
    console.error("Ingest error:", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Example usage:
 *
 * POST /api/ingest
 * {
 *   "documents": [
 *     "Next.js is a full-stack React framework.",
 *     "LangChain helps build AI applications."
 *   ],
 *   "metadata": [
 *     { "source": "docs", "page": 1 },
 *     { "source": "docs", "page": 2 }
 *   ]
 * }
 */

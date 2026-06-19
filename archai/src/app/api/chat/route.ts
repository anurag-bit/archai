import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { getRetriever } from "@/lib/vector-store";

export async function POST(req: Request) {
  try {
    if (!process.env.GOOGLE_API_KEY) {
      return Response.json(
        { error: "GOOGLE_API_KEY not configured" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { question, k = 3, temperature = 0 } = body;

    if (!question) {
      return Response.json(
        { error: "question field is required" },
        { status: 400 }
      );
    }

    // Initialize Gemini LLM
    const model = new ChatGoogleGenerativeAI({
      model: "gemini-1.5-flash",
      temperature,
      apiKey: process.env.GOOGLE_API_KEY,
    });

    // Get retriever
    const retriever = await getRetriever(k);

    // Retrieve relevant documents
    const retrievedDocs = await retriever.invoke(question);

    // Build context
    const context = retrievedDocs
      .map((doc, i) => {
        const source = doc.metadata?.source || "unknown";
        return `[Document ${i + 1} - ${source}]\n${doc.pageContent}`;
      })
      .join("\n\n");

    // Create prompt
    const systemPrompt = `You are a helpful AI assistant. Answer the question using the provided context. 
If the context doesn't contain relevant information, say so clearly.
Be concise and cite the document sources when helpful.`;

    const userPrompt = `Context:
${context}

Question: ${question}`;

    // Get response
    const response = await model.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    return Response.json({
      answer: response.content,
      documents: retrievedDocs.map((doc) => ({
        content: doc.pageContent,
        metadata: doc.metadata,
      })),
      model: "gemini-1.5-flash",
    });
  } catch (error) {
    console.error("Chat error:", error);
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
 * POST /api/chat
 * {
 *   "question": "What is LangChain?",
 *   "k": 3,
 *   "temperature": 0
 * }
 *
 * Response:
 * {
 *   "answer": "LangChain is...",
 *   "documents": [
 *     {
 *       "content": "LangChain helps build AI applications.",
 *       "metadata": { "source": "docs" }
 *     }
 *   ],
 *   "model": "gemini-1.5-flash"
 * }
 */

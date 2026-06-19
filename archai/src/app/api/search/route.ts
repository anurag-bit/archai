import { similaritySearchWithScore } from "@/lib/vector-store";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = url.searchParams.get("q");
    const k = parseInt(url.searchParams.get("k") || "5", 10);

    if (!query) {
      return Response.json(
        { error: "query parameter (q) is required" },
        { status: 400 }
      );
    }

    const results = await similaritySearchWithScore(query, Math.min(k, 20));

    return Response.json({
      query,
      count: results.length,
      results: results.map(([doc, score]) => ({
        content: doc.pageContent,
        metadata: doc.metadata,
        score: parseFloat(score.toFixed(4)),
        relevance: score >= 0.8 ? "high" : score >= 0.5 ? "medium" : "low",
      })),
    });
  } catch (error) {
    console.error("Search error:", error);
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
 * GET /api/search?q=What%20is%20LangChain&k=5
 *
 * Response:
 * {
 *   "query": "What is LangChain?",
 *   "count": 2,
 *   "results": [
 *     {
 *       "content": "LangChain helps build AI applications.",
 *       "metadata": { "source": "docs" },
 *       "score": 0.8234
 *     }
 *   ]
 * }
 */

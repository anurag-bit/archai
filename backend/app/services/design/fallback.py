import time
import re
from typing import Dict, Any
from services.design.helpers import normalize_text, detect_domain_hints, compact_summary
from services.design.nodes.extractor import split_document

def generate_fallback_design(document_text: str, document_id: str) -> Dict[str, Any]:
    normalized = normalize_text(document_text)
    domain_hints = detect_domain_hints(normalized)
    summary = compact_summary(normalized)
    fallback_chunks = split_document(normalized)[:8]

    assumptions = [
        f"The product is closest to: {', '.join(domain_hints)}." if domain_hints
        else "The system is a standard web application with authenticated users.",
        "A relational database is needed for core business data.",
        "Notifications and background work should run off the request path.",
    ]
    open_questions = [
        "What are the expected traffic, latency, and availability targets?",
        "Which external integrations are required for the first release?",
        "Should the product support multi-tenancy, role-based access, or SSO?",
    ]
    highlights = []
    for chunk in fallback_chunks:
        snippet = re.sub(r'\s+', ' ', chunk["text"])[:220]
        dots = "..." if len(chunk["text"]) > 220 else ""
        highlights.append(f"Chunk {chunk['index'] + 1} | score {chunk['score']}: {snippet}{dots}")

    return {
        "projectSummary":        summary or "No summary available — review the uploaded document.",
        "assumptions":           assumptions,
        "openQuestions":         open_questions,
        "retrievalHighlights":   highlights,
        "dataModelMarkdown":     "## Fallback\n*Design generation encountered an error. Please retry.*",
        "systemDesignMarkdown":  "## Fallback\n*Design generation encountered an error. Please retry.*",
        "selectedChunkCount":    len(fallback_chunks),
        "documentLength":        len(normalized),
        "generatedAt":           time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "documentText":          normalized,
        "retrievedChunks":       fallback_chunks,
    }

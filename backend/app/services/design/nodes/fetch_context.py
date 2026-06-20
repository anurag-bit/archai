from services.vector_store import query_chroma_for_chunks
from services.design.helpers import format_chunks_as_context
from services.design.state import ModuleGraphState

async def fetch_context_node(state: ModuleGraphState) -> dict:
    """
    Retrieve Chroma chunks that are relevant to the current module.
    Sets state['module_context'], state['module_chunks'].
    """
    module = state["current_module"]
    print(f"[fetch_context_node] Fetching context for module: {module}")

    doc_id     = state["document_id"]
    request_id = state["request_id"]

    # Try module-scoped query first, then broad fallback
    chunks = query_chroma_for_chunks(
        doc_id, module, "domain_design", request_id, n_results=15, module_name=module
    )
    if not chunks:
        chunks = query_chroma_for_chunks(
            doc_id, module, "domain_design", request_id, n_results=15
        )

    context = format_chunks_as_context(chunks)
    print(f"[fetch_context_node] Retrieved {len(chunks)} chunks for '{module}'")

    # Return only the keys this node sets — LangGraph merges the rest
    return {
        "module_context": context,
        "module_chunks":  chunks,
        "dba_draft":      {},
        "qa_feedback":    "",
        "qa_retries":     0,
        "api_design":     {},
    }

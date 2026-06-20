import os
import re
import time
import uuid
import json
import asyncio
from typing import List, Dict, Any, Optional
from langgraph.graph import StateGraph, END

from services.vector_store import (
    index_chunks_to_chroma,
    clear_chroma_chunks,
)
from services.design.state import GraphState, ModuleGraphState
from services.design.helpers import (
    normalize_text,
    generate_document_id,
    compact_summary,
    detect_domain_hints,
)
from services.design.fallback import generate_fallback_design
from services.design.reduce import generate_global_architecture
from services.design.nodes import (
    extract_modules,
    split_document,
    fetch_context_node,
    dba_agent_node,
    qa_agent_node,
    api_agent_node,
    lld_agent_node,
    save_module_design_node,
)
from core.config import MAX_QA_RETRIES, MAX_CONCURRENT_MODULES

# ─────────────────────────── Routing logic ───────────────────────────────────

def decide_after_qa(state: ModuleGraphState) -> str:
    """
    Route to 'api_agent' on PASS, back to 'dba_agent' on failure.
    Cap retries at MAX_QA_RETRIES to avoid infinite loops.
    """
    if state["qa_feedback"] == "PASS":
        return "api_agent"
    retries = state.get("qa_retries", 0)
    if retries >= MAX_QA_RETRIES:
        print(f"[decide_after_qa] Max QA retries reached for '{state['current_module']}' — proceeding anyway")
        return "api_agent"
    return "dba_agent"


# ─────────────────────────── Graph compilation ───────────────────────────────

def _build_module_graph() -> StateGraph:
    graph = StateGraph(ModuleGraphState)

    # Register nodes
    graph.add_node("fetch_context",      fetch_context_node)
    graph.add_node("dba_agent",          dba_agent_node)
    graph.add_node("qa_agent",           qa_agent_node)
    graph.add_node("api_agent",          api_agent_node)
    graph.add_node("lld_agent",          lld_agent_node)
    graph.add_node("save_module_design", save_module_design_node)

    # Fixed edges
    graph.set_entry_point("fetch_context")
    graph.add_edge("fetch_context",  "dba_agent")
    graph.add_edge("dba_agent",      "qa_agent")
    graph.add_edge("api_agent",      "lld_agent")
    graph.add_edge("lld_agent",      "save_module_design")
    graph.add_edge("save_module_design", END)

    # Conditional edges
    graph.add_conditional_edges(
        "qa_agent",
        decide_after_qa,
        {"api_agent": "api_agent", "dba_agent": "dba_agent"},
    )

    return graph


# Compiled app — reused across requests
_module_workflow_app = _build_module_graph().compile()

# ─────────────────────────── Markdown renderer ───────────────────────────────

def _build_data_model_markdown(domain_designs: List[Dict[str, Any]]) -> str:
    sections = ["# Domain-Specific Data Models\n"]

    for d in domain_designs:
        module = d.get("module", "Unknown Module")
        design = d.get("design", {})
        lines  = [f"---\n\n## {module}\n"]
        rich   = design.get("raw_json", design)

        comp_check = rich.get("compliance_check")
        api_comp_check = rich.get("api_compliance_check")
        if comp_check:
            lines.append(f"> **Database Compliance:** {comp_check}\n\n")
        if api_comp_check:
            lines.append(f"> **API Compliance:** {api_comp_check}\n\n")

        if "data_model" in rich:
            dm = rich["data_model"]

            mermaid_er = dm.get("mermaid_er", "").strip()
            if mermaid_er:
                lines += ["### ER Diagram\n", f"```mermaid\n{mermaid_er}\n```\n"]

            tables = dm.get("tables", [])
            if tables:
                lines.append("### Tables\n")
                for tbl in tables:
                    tbl_name = tbl.get("table_name", "unnamed")
                    tbl_desc = tbl.get("description", "")
                    lines.append(f"#### `{tbl_name}`\n")
                    if tbl_desc:
                        lines.append(f"{tbl_desc}\n")
                    cols = tbl.get("columns", [])
                    if cols:
                        lines += [
                            "| Column | Type | Constraints | Justification |",
                            "|--------|------|-------------|---------------|",
                        ]
                        for col in cols:
                            lines.append(
                                f"| `{col.get('name','')}` | `{col.get('type','')}` "
                                f"| {col.get('constraints','')} "
                                f"| {col.get('justification','').replace('|','\\|')} |"
                            )
                        lines.append("")
                    idxs = tbl.get("indexes", [])
                    if idxs:
                        lines.append("**Indexes:** " + ", ".join(f"`{i}`" for i in idxs) + "\n")

            rules = rich.get("business_rules", [])
            if rules:
                lines += [
                    "### Business Rules\n",
                    "| Rule ID | Description | SRS Reference |",
                    "|---------|-------------|---------------|",
                ]
                for rule in rules:
                    lines.append(
                        f"| {rule.get('rule_id','')} "
                        f"| {rule.get('description','').replace('|','\\|')} "
                        f"| {rule.get('srs_reference','')} |"
                    )
                lines.append("")

            apis = rich.get("apis", [])
            if apis:
                lines += [
                    "### API Endpoints\n",
                    "| Method | Path | Description | SRS Reference |",
                    "|--------|------|-------------|---------------|",
                ]
                for api in apis:
                    lines.append(
                        f"| `{api.get('method','')}` | `{api.get('path','')}` "
                        f"| {api.get('description','').replace('|','\\|')} "
                        f"| {api.get('srs_reference','')} |"
                    )
                lines.append("")

            dfd_mermaid = design.get("dfd_mermaid", "").strip()
            if dfd_mermaid:
                lines += ["### Data Flow Diagram (Level 1)\n", f"```mermaid\n{dfd_mermaid}\n```\n"]

            component_mermaid = design.get("component_mermaid", "").strip()
            if component_mermaid:
                lines += ["### Low-Level Component Diagram\n", f"```mermaid\n{component_mermaid}\n```\n"]

            workflows = rich.get("workflows", [])
            if workflows:
                lines.append("### Workflows\n")
                for wf in workflows:
                    wf_name = wf.get("workflow_name", "Unnamed Workflow")
                    wf_ref  = wf.get("srs_reference", "")
                    ref_str = f" *(SRS: {wf_ref})*" if wf_ref else ""
                    lines.append(f"#### {wf_name}{ref_str}\n")
                    states = wf.get("states", [])
                    if states:
                        lines.append("**States:** " + " → ".join(f"`{s}`" for s in states) + "\n")
                    transitions = wf.get("transitions", [])
                    if transitions:
                        lines += [
                            "| From | To | Trigger | API Endpoint |",
                            "|------|----|---------|--------------|",
                        ]
                        for tr in transitions:
                            lines.append(
                                f"| `{tr.get('from','')}` | `{tr.get('to','')}` "
                                f"| {tr.get('trigger','').replace('|','\\|')} "
                                f"| `{tr.get('api_endpoint','')}` |"
                            )
                        lines.append("")
        else:
            # Legacy flat fallback
            mermaid = design.get("er_diagram_mermaid", "").strip()
            if mermaid:
                lines += ["### ER Diagram\n", f"```mermaid\n{mermaid}\n```\n"]
            ddl = design.get("sql_ddl", "").strip()
            if ddl:
                lines += ["### SQL DDL\n", f"```sql\n{ddl}\n```\n"]
            for ep in design.get("api_endpoints", []):
                lines.append(f"- `{ep}`")

        sections.append("\n".join(lines))

    return "\n".join(sections)


# ─────────────────────────── Public entry point ──────────────────────────────

async def generate_system_design(
    document_text: str,
    tech_stack: str = "",
    design_principles: str = "",
    security_protocols: str = "",
    open_questions_answers: str = "",
) -> Dict[str, Any]:
    """
    Main entry point called by the FastAPI /api/design route.

    1. Normalises the document and computes a stable document_id.
    2. Checks a local JSON cache; returns it immediately on a hit.
    3. Indexes the document into Chroma.
    4. Runs the LangGraph MAS workflow for every module.
    5. Runs the global architecture reduce step.
    6. Writes the result to the cache and returns it.
    """
    normalized  = normalize_text(document_text)
    cache_input = f"{normalized}||{tech_stack.strip()}||{design_principles.strip()}||{security_protocols.strip()}||{open_questions_answers.strip()}"
    document_id = generate_document_id(cache_input)
    request_id  = str(uuid.uuid4())

    # ── Cache lookup ────────────────────────────────────────────────────────
    cache_dir  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "cache")
    os.makedirs(cache_dir, exist_ok=True)
    cache_path = os.path.join(cache_dir, f"{document_id}.json")

    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                cached = json.load(f)
            cached["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            print(f"✓ Returning cached design for document: {document_id}")
            return cached
        except Exception as e:
            print(f"Cache read failed for {document_id}: {e}")

    try:
        # ── Index chunks using REGEX only (no LLM call here!) ──────────────
        print("Indexing document chunks into Chroma...")
        prelim_modules = re.findall(
            r'\d+\.\s*Module\s*Name\s*-\s*([^\n]+)', normalized, re.IGNORECASE
        )
        chunks = split_document(normalized, prelim_modules or None)
        index_chunks_to_chroma(document_id, chunks, "domain_design", request_id)
        print(f"Indexed {len(chunks)} chunks into Chroma")

        # ── Run LangGraph MAS workflow (Parallel Processing) ──────────────────
        print("Starting Parallel LangGraph MAS workflow...")
        
        # Build a combined constraints string for the extractor
        extractor_constraints = f"Tech Stack: {tech_stack}\nDesign: {design_principles}\nSecurity: {security_protocols}"
        modules = await extract_modules(normalized, constraints=extractor_constraints)

        sem = asyncio.Semaphore(MAX_CONCURRENT_MODULES)
        print(f"Executing module designs in parallel (concurrency limit: {MAX_CONCURRENT_MODULES})...")

        async def run_module_workflow(module_name: str) -> Dict[str, Any]:
            async with sem:
                initial_state: ModuleGraphState = {
                    "normalized_text": normalized,
                    "document_id":     document_id,
                    "request_id":      request_id,
                    "current_module":  module_name,
                    "module_context":  "",
                    "module_chunks":   [],
                    "dba_draft":       {},
                    "qa_feedback":     "",
                    "qa_retries":      0,
                    "api_design":      {},
                    "lld_design":      {},
                    "module_design":   None,
                    # Architecture constraints
                    "tech_stack":          tech_stack,
                    "design_principles":   design_principles,
                    "security_protocols":  security_protocols,
                    "open_questions_answers": open_questions_answers,
                }
                final_state = await _module_workflow_app.ainvoke(initial_state)
                return final_state.get("module_design") or {}

        tasks = [run_module_workflow(m) for m in modules]
        raw_designs = await asyncio.gather(*tasks)
        domain_designs = [d for d in raw_designs if d]
        print(f"LangGraph workflow complete. {len(domain_designs)} modules processed.")

        # ── Phase 2 (Reduce): Global architecture ──────────────────────────
        print("Generating production-grade global architecture...")
        arch_res = await generate_global_architecture(
            domain_designs,
            tech_stack=tech_stack,
            design_principles=design_principles,
            security_protocols=security_protocols
        )

        # ── Assemble retrieved chunks for highlights ────────────────────────
        all_chunks: Dict[int, Dict[str, Any]] = {}
        for d in domain_designs:
            for chunk in d.get("selected_chunks", []):
                all_chunks[chunk["index"]] = chunk
        retrieved_chunks = sorted(all_chunks.values(), key=lambda c: c["index"])

        highlights = []
        for chunk in retrieved_chunks[:10]:
            snippet     = re.sub(r'\s+', ' ', chunk["text"])[:220]
            dots        = "..." if len(chunk["text"]) > 220 else ""
            module_info = f" [{chunk.get('module', 'Unknown')}]" if "module" in chunk else ""
            highlights.append(
                f"Chunk {chunk['index'] + 1}{module_info} | score {chunk['score']}: {snippet}{dots}"
            )

        # ── Build final response ────────────────────────────────────────────
        result = {
            "projectSummary":       f"Domain-driven design for {len(modules)} modules: {', '.join(modules)}",
            "assumptions": [
                "Each module is designed independently to ensure comprehensive coverage.",
                "Global architecture provides integration patterns between modules.",
                "Database schemas are normalised per module with cross-module relationships.",
            ],
            "openQuestions": [
                "What are the specific data-flow requirements between modules?",
                "Are there shared entities that need to be normalised across module boundaries?",
                "What are the transactional consistency requirements across module boundaries?",
            ],
            "retrievalHighlights":  highlights,
            "dataModelMarkdown":    _build_data_model_markdown(domain_designs),
            "systemDesignMarkdown": arch_res["architecture_markdown"],
            "selectedChunkCount":   len(retrieved_chunks),
            "documentLength":       len(normalized),
            "generatedAt":          time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "documentText":         normalized,
            "retrievedChunks":      retrieved_chunks,
            "modules":              modules,
            "domainDesigns":        domain_designs,
        }

        # ── Write to cache ──────────────────────────────────────────────────
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            print(f"✓ Cached design for document: {document_id}")
        except Exception as e:
            print(f"Cache write failed for {document_id}: {e}")

        return result

    except Exception as e:
        import traceback
        print(f"Design generation error: {e}")
        traceback.print_exc()
        return generate_fallback_design(normalized, document_id)

    finally:
        try:
            clear_chroma_chunks(document_id, "domain_design", request_id)
        except Exception:
            pass

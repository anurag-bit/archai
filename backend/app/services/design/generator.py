import os
import re
import time
import uuid
import json
import asyncio
from typing import List, Dict, Any, Optional
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

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
    get_chat_model,
    format_chunks_as_context,
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
    Route to 'api_agent' on PASS, human_input_node on failure if retries >= MAX_QA_RETRIES,
    else back to 'dba_agent' on failure.
    """
    if state["qa_feedback"] == "PASS":
        return "api_agent"
    retries = state.get("qa_retries", 0)
    if retries >= MAX_QA_RETRIES:
        print(f"[decide_after_qa] Max QA retries reached for '{state['current_module']}' — interrupting for human input")
        return "human_input_node"
    return "dba_agent"


async def human_input_node(state: ModuleGraphState) -> dict:
    """
    Dummy node that gets called when resuming from an interrupt.
    The user's instructions will have been written to state['qa_feedback'] via aupdate_state.
    We just reset qa_retries so the DBA agent has a fresh set of retries for this new instruction.
    """
    print(f"[human_input_node] Resuming execution for '{state['current_module']}' with human instruction: {state.get('qa_feedback')}")
    return {"qa_retries": 0}


# ─────────────────────────── Graph compilation ───────────────────────────────

def _build_module_graph() -> StateGraph:
    graph = StateGraph(ModuleGraphState)

    # Register nodes
    graph.add_node("fetch_context",      fetch_context_node)
    graph.add_node("dba_agent",          dba_agent_node)
    graph.add_node("qa_agent",           qa_agent_node)
    graph.add_node("human_input_node",   human_input_node)
    graph.add_node("api_agent",          api_agent_node)
    graph.add_node("lld_agent",          lld_agent_node)
    graph.add_node("save_module_design", save_module_design_node)

    # Fixed edges
    graph.set_entry_point("fetch_context")
    graph.add_edge("fetch_context",  "dba_agent")
    graph.add_edge("dba_agent",      "qa_agent")
    graph.add_edge("human_input_node", "dba_agent")
    graph.add_edge("api_agent",      "lld_agent")
    graph.add_edge("lld_agent",      "save_module_design")
    graph.add_edge("save_module_design", END)

    # Conditional edges
    graph.add_conditional_edges(
        "qa_agent",
        decide_after_qa,
        {
            "api_agent": "api_agent", 
            "dba_agent": "dba_agent", 
            "human_input_node": "human_input_node"
        },
    )

    return graph


# Initialize checkpointer memory saver for Human in the loop (HITL)
memory = MemorySaver()

# Compiled app — compiled with MemorySaver checkpointer and configured to interrupt before human_input_node
_module_workflow_app = _build_module_graph().compile(
    checkpointer=memory,
    interrupt_before=["human_input_node"]
)

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
                config = {"configurable": {"thread_id": f"{document_id}_{module_name}"}}
                final_state = await _module_workflow_app.ainvoke(initial_state, config)
                return final_state

        tasks = [run_module_workflow(m) for m in modules]
        final_states = await asyncio.gather(*tasks)
        
        domain_designs = []
        interrupted_modules = []
        interrupted_details = {}
        
        for state in final_states:
            m = state.get("current_module")
            design = state.get("module_design")
            if design:
                domain_designs.append(design)
            else:
                interrupted_modules.append(m)
                interrupted_details[m] = {
                    "dba_draft": state.get("dba_draft"),
                    "qa_feedback": state.get("qa_feedback"),
                }
        
        print(f"LangGraph workflow complete. {len(domain_designs)} completed, {len(interrupted_modules)} interrupted.")

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

        # Handle interrupts
        if interrupted_modules:
            result = {
                "status": "interrupted",
                "documentId": document_id,
                "projectSummary": f"Domain-driven design for {len(modules)} modules: {', '.join(modules)} (interrupted)",
                "assumptions": [
                    "Each module is designed independently to ensure comprehensive coverage.",
                    "Global architecture provides integration patterns between modules.",
                    "Database schemas are normalised per module with cross-module relationships.",
                ],
                "openQuestions": [],
                "retrievalHighlights": highlights,
                "documentText": normalized,
                "modules": modules,
                "domainDesigns": domain_designs,
                "interruptedModules": interrupted_modules,
                "interruptedModuleDetails": interrupted_details,
                "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                # Constraints
                "techStack":            tech_stack,
                "designPrinciples":     design_principles,
                "securityProtocols":    security_protocols,
                "openQuestionsAnswers": open_questions_answers,
            }
            # Write to cache
            try:
                with open(cache_path, "w", encoding="utf-8") as f:
                    json.dump(result, f, ensure_ascii=False, indent=2)
                print(f"✓ Cached interrupted design for document: {document_id}")
            except Exception as e:
                print(f"Cache write failed for {document_id}: {e}")
            return result

        # ── Phase 2 (Reduce): Global architecture ──────────────────────────
        print("Generating production-grade global architecture...")
        arch_res = await generate_global_architecture(
            domain_designs,
            tech_stack=tech_stack,
            design_principles=design_principles,
            security_protocols=security_protocols
        )

        # ── Build final response ────────────────────────────────────────────
        result = {
            "status": "completed",
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
            "terraformCode":        arch_res["terraform_code"],
            "openapiSpec":          arch_res.get("openapi_spec", ""),
            "selectedChunkCount":   len(retrieved_chunks),
            "documentLength":       len(normalized),
            "generatedAt":          time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "documentText":         normalized,
            "retrievedChunks":      retrieved_chunks,
            "modules":              modules,
            "domainDesigns":        domain_designs,
            "documentId":           document_id,
            # Constraints cached for single-module regeneration
            "techStack":            tech_stack,
            "designPrinciples":     design_principles,
            "securityProtocols":    security_protocols,
            "openQuestionsAnswers": open_questions_answers,
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

async def regenerate_module_design(document_id: str, module_name: str) -> Dict[str, Any]:
    """
    Re-runs the LangGraph design workflow just for one module, updates the cache,
    and re-generates the global architecture and OpenAPI/Terraform configurations.
    """
    cache_dir  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "cache")
    cache_path = os.path.join(cache_dir, f"{document_id}.json")
    if not os.path.exists(cache_path):
        raise ValueError("Design not found")

    with open(cache_path, "r", encoding="utf-8") as f:
        cached_result = json.load(f)

    domain_designs = cached_result.get("domainDesigns", [])
    design_to_replace = next((d for d in domain_designs if d.get("module") == module_name), None)
    if not design_to_replace:
        raise ValueError(f"Module '{module_name}' not found in cached design")

    # Retrieve constraints and inputs from cached JSON
    normalized_text = cached_result.get("documentText", "")
    tech_stack = cached_result.get("techStack", "")
    design_principles = cached_result.get("designPrinciples", "")
    security_protocols = cached_result.get("securityProtocols", "")
    open_questions_answers = cached_result.get("openQuestionsAnswers", "")
    request_id = str(uuid.uuid4())

    # Temporarily index document chunks to Chroma for semantic queries by the node
    prelim_modules = re.findall(
        r'\d+\.\s*Module\s*Name\s*-\s*([^\n]+)', normalized_text, re.IGNORECASE
    )
    chunks = split_document(normalized_text, prelim_modules or None)
    index_chunks_to_chroma(document_id, chunks, "domain_design", request_id)

    try:
        # Run module graph JUST for this module
        initial_state = {
            "normalized_text": normalized_text,
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
            "tech_stack":          tech_stack,
            "design_principles":   design_principles,
            "security_protocols":  security_protocols,
            "open_questions_answers": open_questions_answers,
        }
        final_state = await _module_workflow_app.ainvoke(initial_state)
        new_design = final_state.get("module_design")
        if not new_design:
            raise ValueError(f"Failed to generate design for module '{module_name}'")

        # Replace the old module design
        for i, d in enumerate(domain_designs):
            if d.get("module") == module_name:
                domain_designs[i] = new_design
                break

        # Re-generate global architecture (since a module design has changed)
        arch_res = await generate_global_architecture(
            domain_designs,
            tech_stack=tech_stack,
            design_principles=design_principles,
            security_protocols=security_protocols
        )

        # Update cache values
        cached_result["domainDesigns"] = domain_designs
        cached_result["dataModelMarkdown"] = _build_data_model_markdown(domain_designs)
        cached_result["systemDesignMarkdown"] = arch_res["architecture_markdown"]
        cached_result["terraformCode"] = arch_res["terraform_code"]
        cached_result["openapiSpec"] = arch_res.get("openapi_spec", "")
        cached_result["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        # Write to cache
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(cached_result, f, ensure_ascii=False, indent=2)

        return cached_result

    finally:
        try:
            clear_chroma_chunks(document_id, "domain_design", request_id)
        except Exception:
            pass


async def _update_mermaid_er(old_mermaid: str, tables: List[Dict[str, Any]]) -> str:
    """
    Given the updated tables JSON and the old Mermaid ER diagram,
    queries the LLM to generate an updated Mermaid ER diagram.
    """
    from langchain_core.messages import SystemMessage, HumanMessage
    
    system_message = (
        "You are a Database Diagram Specialist. Your job is to generate a valid Mermaid erDiagram syntax "
        "string based on a JSON list of tables (which contain column names, types, and constraints) and the "
        "existing relations or ER diagram.\n"
        "Follow these rules strictly:\n"
        "1. Start the diagram with: erDiagram\n"
        "2. Do NOT use commas between attribute lines.\n"
        "3. Do NOT use commas at the end of attribute lines.\n"
        "4. Format each entity exactly like this:\n"
        "   ENTITY_NAME {\n"
        "       type name PK/FK\n"
        "       type name\n"
        "   }\n"
        "5. Keep the relationships in the ER diagram: format them like: ENTITY_A ||--o{ ENTITY_B : relationship_name\n"
        "6. Do NOT invent new relationships that aren't justified, but ensure key relationships are captured.\n"
        "7. Output ONLY the raw Mermaid diagram string (no markdown block, no comments, no prose)."
    )
    user_prompt = (
        f"EXISTING MERMAID DIAGRAM:\n{old_mermaid}\n\n"
        f"UPDATED TABLES JSON:\n{json.dumps(tables, indent=2)}\n\n"
        "Generate the updated erDiagram syntax:"
    )
    try:
        model = get_chat_model(temperature=0.0)
        response = await model.ainvoke([
            SystemMessage(content=system_message),
            HumanMessage(content=user_prompt)
        ])
        content = response.content.strip()
        if content.startswith("```mermaid"):
            content = content[10:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        return content.strip()
    except Exception as e:
        print(f"Failed to generate ER diagram: {e}")
        return old_mermaid


async def apply_schema_patch(
    document_id: str,
    module_name: str,
    new_tables: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Applies manual patches to a module's database tables, regenerates the ER diagram,
    re-runs the API and LLD agents, and updates the global architecture.
    """
    cache_dir  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "cache")
    cache_path = os.path.join(cache_dir, f"{document_id}.json")
    if not os.path.exists(cache_path):
        raise ValueError("Design not found")

    with open(cache_path, "r", encoding="utf-8") as f:
        cached_result = json.load(f)

    domain_designs = cached_result.get("domainDesigns", [])
    design_to_replace = next((d for d in domain_designs if d.get("module") == module_name), None)
    if not design_to_replace:
        raise ValueError(f"Module '{module_name}' not found in cached design")

    # Extract existing details
    design = design_to_replace.get("design", {})
    raw_json = design.get("raw_json", {})
    selected_chunks = design_to_replace.get("selected_chunks", [])
    
    # Update tables
    if "data_model" not in raw_json:
        raw_json["data_model"] = {}
    raw_json["data_model"]["tables"] = new_tables

    # Update Mermaid ER diagram
    old_mermaid = raw_json["data_model"].get("mermaid_er", "")
    new_mermaid = await _update_mermaid_er(old_mermaid, new_tables)
    raw_json["data_model"]["mermaid_er"] = new_mermaid

    module_context = format_chunks_as_context(selected_chunks)

    # Build ModuleGraphState for running api_agent & lld_agent
    state = {
        "normalized_text": cached_result.get("documentText", ""),
        "document_id":     document_id,
        "request_id":      str(uuid.uuid4()),
        "current_module":  module_name,
        "module_context":  module_context,
        "module_chunks":   selected_chunks,
        "dba_draft":       raw_json,
        "qa_feedback":     "PASS",
        "qa_retries":      0,
        "api_design":      {},
        "lld_design":      {},
        "tech_stack":          cached_result.get("techStack", ""),
        "design_principles":   cached_result.get("designPrinciples", ""),
        "security_protocols":  cached_result.get("securityProtocols", ""),
        "open_questions_answers": cached_result.get("openQuestionsAnswers", ""),
    }

    # Run API Agent node
    api_res = await api_agent_node(state)
    state["api_design"] = api_res["api_design"]

    # Run LLD Agent node
    lld_res = await lld_agent_node(state)
    state["lld_design"] = lld_res["lld_design"]

    # Run Save Module Design Logic to compile final module design entry
    from services.design.nodes.save_module_design import generate_ddl_from_tables, sanitize_mermaid_er
    
    merged = {**raw_json}
    merged["apis"] = state["api_design"].get("apis", [])
    merged["workflows"] = state["api_design"].get("workflows", [])
    merged["compliance_check"] = raw_json.get("compliance_check", "")
    merged["api_compliance_check"] = state["api_design"].get("compliance_check", "")

    sql_ddl = generate_ddl_from_tables(new_tables)
    api_endpoints = [
        f"{a.get('method','GET').upper()} {a.get('path','')} - {a.get('description','')}"
        for a in merged.get("apis", []) if isinstance(a, dict) and a.get("path")
    ]
    
    sanitized_mermaid = sanitize_mermaid_er(new_mermaid, new_tables)
    merged["data_model"]["mermaid_er"] = sanitized_mermaid

    new_design_to_replace = {
        "module": module_name,
        "design": {
            "er_diagram_mermaid": sanitized_mermaid,
            "sql_ddl":            sql_ddl,
            "api_endpoints":      api_endpoints,
            "dfd_mermaid":        state["lld_design"].get("dfd_mermaid", ""),
            "component_mermaid":  state["lld_design"].get("component_mermaid", ""),
            "raw_json":           merged,
        },
        "selected_chunks": selected_chunks,
    }

    # Replace the old module design
    for i, d in enumerate(domain_designs):
        if d.get("module") == module_name:
            domain_designs[i] = new_design_to_replace
            break

    # Re-generate global architecture (since a module design has changed)
    arch_res = await generate_global_architecture(
        domain_designs,
        tech_stack=state["tech_stack"],
        design_principles=state["design_principles"],
        security_protocols=state["security_protocols"]
    )

    # Update cache values
    cached_result["domainDesigns"] = domain_designs
    cached_result["dataModelMarkdown"] = _build_data_model_markdown(domain_designs)
    cached_result["systemDesignMarkdown"] = arch_res["architecture_markdown"]
    cached_result["terraformCode"] = arch_res["terraform_code"]
    cached_result["openapiSpec"] = arch_res.get("openapi_spec", "")
    cached_result["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    # Write to cache
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(cached_result, f, ensure_ascii=False, indent=2)

    return cached_result


async def resume_module_design(
    document_id: str,
    module_name: str,
    instruction: str
) -> Dict[str, Any]:
    """
    Resumes a paused module design workflow using checkpointer thread state.
    Updates thread state with the developer's instructions and resumes execution.
    If all modules are successfully completed, compiles global architecture and returns final response.
    """
    cache_dir  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "cache")
    cache_path = os.path.join(cache_dir, f"{document_id}.json")
    if not os.path.exists(cache_path):
        raise ValueError("Design not found")

    with open(cache_path, "r", encoding="utf-8") as f:
        cached_result = json.load(f)

    # 1. Update checkpointer state with user instruction & reset retries
    config = {"configurable": {"thread_id": f"{document_id}_{module_name}"}}
    await _module_workflow_app.aupdate_state(
        config,
        {
            "qa_feedback": f"HUMAN INSTRUCTION: {instruction}",
            "qa_retries": 0
        }
    )

    # 2. Resume graph execution from pause point
    final_state = await _module_workflow_app.ainvoke(None, config)
    new_design = final_state.get("module_design")

    # 3. Handle results
    domain_designs = cached_result.get("domainDesigns", [])
    interrupted_modules = cached_result.get("interruptedModules", [])
    interrupted_details = cached_result.get("interruptedModuleDetails", {})

    if new_design:
        # Module completed!
        if module_name in interrupted_modules:
            interrupted_modules.remove(module_name)
        if module_name in interrupted_details:
            del interrupted_details[module_name]

        # Overwrite or append
        existing_idx = next((i for i, d in enumerate(domain_designs) if d.get("module") == module_name), -1)
        if existing_idx != -1:
            domain_designs[existing_idx] = new_design
        else:
            domain_designs.append(new_design)
    else:
        # Still interrupted (failed QA audits again)
        interrupted_details[module_name] = {
            "dba_draft": final_state.get("dba_draft"),
            "qa_feedback": final_state.get("qa_feedback"),
        }

    # 4. Check if all modules are completed now
    if not interrupted_modules:
        print("All modules completed. Generating global architecture...")
        arch_res = await generate_global_architecture(
            domain_designs,
            tech_stack=cached_result.get("techStack", ""),
            design_principles=cached_result.get("designPrinciples", ""),
            security_protocols=cached_result.get("securityProtocols", "")
        )

        cached_result["status"] = "completed"
        cached_result["domainDesigns"] = domain_designs
        cached_result["dataModelMarkdown"] = _build_data_model_markdown(domain_designs)
        cached_result["systemDesignMarkdown"] = arch_res["architecture_markdown"]
        cached_result["terraformCode"] = arch_res["terraform_code"]
        cached_result["openapiSpec"] = arch_res.get("openapi_spec", "")
        if "interruptedModules" in cached_result:
            del cached_result["interruptedModules"]
        if "interruptedModuleDetails" in cached_result:
            del cached_result["interruptedModuleDetails"]
    else:
        # Still interrupted (either this one failed again or others are pending)
        cached_result["status"] = "interrupted"
        cached_result["domainDesigns"] = domain_designs
        cached_result["interruptedModules"] = interrupted_modules
        cached_result["interruptedModuleDetails"] = interrupted_details

    cached_result["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    # Write to cache
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(cached_result, f, ensure_ascii=False, indent=2)

    return cached_result

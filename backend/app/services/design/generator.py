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
    frontend_agent_node,
    save_module_design_node,
    generate_pm_plan,
)
from core.config import MAX_QA_RETRIES, MAX_CONCURRENT_MODULES
import logging
logger = logging.getLogger(__name__)



# ─────────────────────────── Graph compilation ───────────────────────────────

def module_router_node(state: ModuleGraphState) -> dict:
    """
    Router node that acts as the entry point for module workflows.
    Allows routing directly to DBA agent on human refinement instruction.
    """
    return {}


def route_from_router(state: ModuleGraphState) -> str:
    if state.get("qa_retries", 0) >= MAX_QA_RETRIES:
        logger.info(f"[router] MAX QA RETRIES ({MAX_QA_RETRIES}) reached. Force-accepting.")
        return "save"

    feedback = state.get("qa_feedback") or ""
    if feedback.startswith("HUMAN INSTRUCTION:"):
        logger.info(f"[router] Routing directly to dba_agent (Refinement Mode)")
        return "dba_agent"
    logger.info(f"[router] Routing to fetch_context (Initial Build Mode)")
    return "fetch_context"


def _build_module_graph() -> StateGraph:
    graph = StateGraph(ModuleGraphState)

    # Register nodes
    graph.add_node("router",             module_router_node)
    graph.add_node("fetch_context",      fetch_context_node)
    graph.add_node("dba_agent",          dba_agent_node)
    graph.add_node("api_agent",          api_agent_node)
    graph.add_node("qa_agent",           qa_agent_node)
    graph.add_node("lld_agent",          lld_agent_node)
    graph.add_node("frontend_agent",     frontend_agent_node)
    graph.add_node("save_module_design", save_module_design_node)

    # Entry and conditional edges
    graph.set_entry_point("router")
    graph.add_conditional_edges(
        "router",
        route_from_router,
        {
            "fetch_context": "fetch_context",
            "dba_agent": "dba_agent",
            "save": "save_module_design"
        }
    )

    # Sequential dependencies
    graph.add_edge("fetch_context",  "dba_agent")
    graph.add_edge("dba_agent",      "api_agent")
    
    # ── FAN-OUT: these three run concurrently ──
    graph.add_edge("api_agent",      "qa_agent")
    graph.add_edge("api_agent",      "lld_agent")
    graph.add_edge("api_agent",      "frontend_agent")
    
    # ── FAN-IN: wait for all three, then save ──
    graph.add_edge("qa_agent",       "save_module_design")
    graph.add_edge("lld_agent",      "save_module_design")
    graph.add_edge("frontend_agent", "save_module_design")
    
    graph.add_edge("save_module_design", END)

    return graph


# Initialize persistent checkpointer dynamic saver using Valkey (DB 1)
from services.valkey import DynamicSaver
checkpointer = DynamicSaver(
    valkey_url=f"redis://{core.config.VALKEY_HOST}:{core.config.VALKEY_PORT}/1"
)

# Compiled app
_module_workflow_app = _build_module_graph().compile(
    checkpointer=checkpointer
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

            db_type = dm.get("database_type", "postgres").lower()
            tables = dm.get("tables", [])
            if tables:
                if db_type == "mongodb":
                    lines.append("### Collections\n")
                elif db_type == "neo4j":
                    lines.append("### Graph Nodes & Edges\n")
                else:
                    lines.append("### Tables\n")
                for tbl in tables:
                    tbl_name = tbl.get("table_name", "unnamed")
                    tbl_desc = tbl.get("description", "")
                    if db_type == "mongodb":
                        lines.append(f"#### Collection: `{tbl_name}`\n")
                    elif db_type == "neo4j":
                        lines.append(f"#### Node Label: `{tbl_name}`\n")
                    else:
                        lines.append(f"#### Table: `{tbl_name}`\n")
                    if tbl_desc:
                        lines.append(f"{tbl_desc}\n")
                    cols = tbl.get("columns", [])
                    if cols:
                        if db_type == "mongodb":
                            lines += [
                                "| Field | Type | Constraints | Justification |",
                                "|-------|------|-------------|---------------|",
                            ]
                        elif db_type == "neo4j":
                            lines += [
                                "| Property | Type | Constraints | Justification |",
                                "|----------|------|-------------|---------------|",
                            ]
                        else:
                            lines += [
                                "| Column | Type | Constraints | Justification |",
                                "|--------|------|-------------|---------------|",
                            ]
                        for col in cols:
                            justification = col.get('justification', '').replace('|', '\\|')
                            lines.append(
                                f"| `{col.get('name','')}` | `{col.get('type','')}` "
                                f"| {col.get('constraints','')} "
                                f"| {justification} |"
                            )
                        lines.append("")
                    idxs = tbl.get("indexes", [])
                    if idxs:
                        if db_type == "mongodb":
                            lines.append("**Collection Indexes:** " + ", ".join(f"`{i}`" for i in idxs) + "\n")
                        elif db_type == "neo4j":
                            lines.append("**Node Constraints / Indexes:** " + ", ".join(f"`{i}`" for i in idxs) + "\n")
                        else:
                            lines.append("**Indexes:** " + ", ".join(f"`{i}`" for i in idxs) + "\n")

            rules = rich.get("business_rules", [])
            if rules:
                lines += [
                    "### Business Rules\n",
                    "| Rule ID | Description | SRS Reference |",
                    "|---------|-------------|---------------|",
                ]
                for rule in rules:
                    description = rule.get('description', '').replace('|', '\\|')
                    lines.append(
                        f"| {rule.get('rule_id','')} "
                        f"| {description} "
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
                    description = api.get('description', '').replace('|', '\\|')
                    lines.append(
                        f"| `{api.get('method','')}` "
                        f"| `{api.get('path','')}` "
                        f"| {description} "
                        f"| {api.get('srs_reference','')} |"
                    )
                lines.append("")

            dfd_mermaid = design.get("dfd_mermaid", "").strip()
            if dfd_mermaid:
                lines += ["### Data Flow Diagram (Level 1)\n", f"```mermaid\n{dfd_mermaid}\n```\n"]

            component_mermaid = design.get("component_mermaid", "").strip()
            if component_mermaid:
                lines += ["### Low-Level Component Diagram\n", f"```mermaid\n{component_mermaid}\n```\n"]

            use_flow_mermaid = design.get("use_flow_mermaid", "").strip()
            if use_flow_mermaid:
                lines += ["### User Flow Diagram\n", f"```mermaid\n{use_flow_mermaid}\n```\n"]

            actor_mermaid = design.get("actor_mermaid", "").strip()
            if actor_mermaid:
                lines += ["### User Actor Diagram\n", f"```mermaid\n{actor_mermaid}\n```\n"]


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
                            trigger = tr.get('trigger', '').replace('|', '\\|')
                            lines.append(
                                f"| `{tr.get('from','')}` "
                                f"| `{tr.get('to','')}` "
                                f"| {trigger} "
                                f"| `{tr.get('api_endpoint','')}` |"
                            )
                        lines.append("")

            test_strategy = rich.get("test_strategy", {})
            if test_strategy:
                lines.append("### QA & Test Strategy\n")
                if test_strategy.get("bdd_scenarios"):
                    lines += ["#### BDD Gherkin Scenarios\n", f"{test_strategy['bdd_scenarios']}\n"]
                if test_strategy.get("test_pyramid"):
                    lines += ["#### Test Pyramid Plan\n", f"{test_strategy['test_pyramid']}\n"]
                if test_strategy.get("load_testing"):
                    lines += ["#### Load Testing Strategy\n", f"{test_strategy['load_testing']}\n"]
            
            # Append Schema Diff if present
            diff_md = rich.get("schema_diff", {}).get("markdown", "")
            diff_mermaid = rich.get("schema_diff", {}).get("mermaid_er", "")
            if diff_md:
                lines += ["### Schema Revision Diff\n", f"{diff_md}\n\n"]
            if diff_mermaid:
                lines += ["### Schema Diff ER Visualization\n", f"```mermaid\n{diff_mermaid}\n```\n"]
        else:
            # Legacy flat fallback
            mermaid = design.get("er_diagram_mermaid", "").strip()
            if mermaid:
                lines += ["### ER Diagram\n", f"```mermaid\n{mermaid}\n```\n"]
            ddl = design.get("sql_ddl", "").strip()
            if ddl:
                db_type = rich.get("data_model", {}).get("database_type", "postgres").lower()
                if db_type == "mongodb":
                    lines += ["### MongoDB Collections & Indexes\n", f"```javascript\n{ddl}\n```\n"]
                elif db_type == "neo4j":
                    lines += ["### Neo4j Cypher DDL\n", f"```cypher\n{ddl}\n```\n"]
                else:
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
    cloud_provider: str = "aws",
):
    """
    Main entry point called by the FastAPI /api/design route. Streams progress events using SSE.
    """
    normalized  = normalize_text(document_text)
    cache_input = f"{normalized}||{tech_stack.strip()}||{design_principles.strip()}||{security_protocols.strip()}||{open_questions_answers.strip()}||{cloud_provider.strip()}"
    document_id = generate_document_id(cache_input)
    request_id  = str(uuid.uuid4())

    # ── Cache lookup ────────────────────────────────────────────────────────
    from services.valkey import get_cached_design, set_cached_design
    cached = get_cached_design(document_id)
    if cached:
        cached["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        yield {"phase": "done", "status": "complete", "data": cached}
        return

    try:
        # ── Index chunks using REGEX only (no LLM call here!) ──────────────
        yield {"phase": "extraction", "status": "started"}
        logger.info("Indexing document chunks into Chroma...")
        prelim_modules = re.findall(
            r'\d+\.\s*Module\s*Name\s*-\s*([^\n]+)', normalized, re.IGNORECASE
        )
        chunks = split_document(normalized, prelim_modules or None)
        index_chunks_to_chroma(document_id, chunks, "domain_design", request_id)
        logger.info(f"Indexed {len(chunks)} chunks into Chroma")

        # ── Run LangGraph MAS workflow (Parallel Processing) ──────────────────
        logger.info("Starting Parallel LangGraph MAS workflow...")
        
        # Build a combined constraints string for the extractor
        extractor_constraints = f"Tech Stack: {tech_stack}\nDesign: {design_principles}\nSecurity: {security_protocols}"
        modules = await extract_modules(normalized, constraints=extractor_constraints)
        yield {"phase": "extraction", "status": "complete", "data": {"modules": modules, "count": len(modules)}}

        sem = asyncio.Semaphore(MAX_CONCURRENT_MODULES)
        logger.info(f"Executing module designs in parallel (concurrency limit: {MAX_CONCURRENT_MODULES})...")

        queue = asyncio.Queue()
        active_tasks = len(modules)

        async def run_module_workflow(module_name: str):
            nonlocal active_tasks
            try:
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
                        "frontend_design": {},
                        "test_strategy":   {},
                        "module_design":   None,
                        # Architecture constraints
                        "tech_stack":          tech_stack,
                        "design_principles":   design_principles,
                        "security_protocols":  security_protocols,
                        "open_questions_answers": open_questions_answers,
                        "cloud_provider":      cloud_provider,
                    }
                    config = {"configurable": {"thread_id": f"{document_id}_{module_name}"}}
                    
                    # Stream updates at the node level
                    async for chunk in _module_workflow_app.astream(initial_state, config, stream_mode="updates"):
                        for node_name in chunk.keys():
                            await queue.put({
                                "phase": "module_node",
                                "status": "complete",
                                "data": {
                                    "module": module_name,
                                    "node": node_name
                                }
                            })
                    
                    # Graph finished, retrieve final state from checkpointer
                    final_state = await _module_workflow_app.get_state(config)
                    design = final_state.values.get("module_design")
                    
                    if design:
                        await queue.put({
                            "phase": "module",
                            "status": "complete",
                            "data": design
                        })
                    else:
                        await queue.put({
                            "phase": "module",
                            "status": "interrupted",
                            "data": {
                                "module_name": module_name,
                                "dba_draft": final_state.values.get("dba_draft"),
                                "qa_feedback": final_state.values.get("qa_feedback")
                            }
                        })
            except Exception as e:
                logger.error(f"Error in module workflow for '{module_name}': {e}")
                await queue.put({
                    "phase": "module",
                    "status": "interrupted",
                    "data": {
                        "module_name": module_name,
                        "dba_draft": {},
                        "qa_feedback": f"Execution error: {str(e)}"
                    }
                })
            finally:
                active_tasks -= 1
                if active_tasks == 0:
                    await queue.put(None) # Sentinel to stop reading the queue

        # Start tasks concurrently
        for m in modules:
            asyncio.create_task(run_module_workflow(m))

        domain_designs = []
        interrupted_modules = []
        interrupted_details = {}

        while True:
            event = await queue.get()
            if event is None:
                break
            
            if event["phase"] == "module":
                m = event["data"]["module"] if "module" in event["data"] else event["data"]["module_name"]
                if event["status"] == "complete":
                    domain_designs.append(event["data"])
                elif event["status"] == "interrupted":
                    interrupted_modules.append(m)
                    interrupted_details[m] = {
                        "dba_draft": event["data"].get("dba_draft", {}),
                        "qa_feedback": event["data"].get("qa_feedback", "")
                    }
            
            yield event
        
        logger.info(f"LangGraph workflow complete. {len(domain_designs)} completed, {len(interrupted_modules)} interrupted.")

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
                "cloudProvider":        cloud_provider,
            }
            set_cached_design(document_id, result)
            yield {"phase": "done", "status": "interrupted", "data": result}
            return

        # ── Phase 2 (Reduce): Global architecture & PM project plan ─────────
        logger.info("Generating production-grade global architecture and PM project plan...")
        yield {"phase": "architecture", "status": "started"}
        yield {"phase": "pm_plan", "status": "started"}
        
        arch_task = asyncio.create_task(generate_global_architecture(
            domain_designs,
            tech_stack=tech_stack,
            design_principles=design_principles,
            security_protocols=security_protocols,
            cloud_provider=cloud_provider
        ))
        pm_task = asyncio.create_task(generate_pm_plan(
            domain_designs,
            tech_stack=tech_stack,
            design_principles=design_principles,
            security_protocols=security_protocols
        ))
        
        arch_res, pm_res = await asyncio.gather(arch_task, pm_task)
        
        yield {"phase": "architecture", "status": "complete", "data": arch_res}
        yield {"phase": "pm_plan", "status": "complete", "data": pm_res}

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
            "devopsArtifacts":      arch_res.get("devops_artifacts", {}),
            "projectPlan":          pm_res,
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
            "cloudProvider":        cloud_provider,
        }

        set_cached_design(document_id, result)

        yield {"phase": "done", "status": "complete", "data": result}

    except Exception as e:
        import traceback
        logger.error(f"Design generation error: {e}")
        traceback.print_exc()
        fallback = generate_fallback_design(normalized, document_id)
        yield {"phase": "done", "status": "error", "data": fallback, "error": str(e)}

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
    from services.valkey import get_cached_design, set_cached_design
    cached_result = get_cached_design(document_id)
    if not cached_result:
        raise ValueError("Design not found")

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
    cloud_provider = cached_result.get("cloudProvider", "aws")
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
            "frontend_design": {},
            "test_strategy":   {},
            "module_design":   None,
            "tech_stack":          tech_stack,
            "design_principles":   design_principles,
            "security_protocols":  security_protocols,
            "open_questions_answers": open_questions_answers,
            "cloud_provider":      cloud_provider,
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

        # Re-generate global architecture and PM plan (since a module design has changed)
        arch_task = generate_global_architecture(
            domain_designs,
            tech_stack=tech_stack,
            design_principles=design_principles,
            security_protocols=security_protocols,
            cloud_provider=cloud_provider
        )
        pm_task = generate_pm_plan(
            domain_designs,
            tech_stack=tech_stack,
            design_principles=design_principles,
            security_protocols=security_protocols
        )
        arch_res, pm_res = await asyncio.gather(arch_task, pm_task)

        # Update cache values
        cached_result["domainDesigns"] = domain_designs
        cached_result["dataModelMarkdown"] = _build_data_model_markdown(domain_designs)
        cached_result["systemDesignMarkdown"] = arch_res["architecture_markdown"]
        cached_result["terraformCode"] = arch_res["terraform_code"]
        cached_result["openapiSpec"] = arch_res.get("openapi_spec", "")
        cached_result["devopsArtifacts"] = arch_res.get("devops_artifacts", {})
        cached_result["projectPlan"] = pm_res
        cached_result["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        set_cached_design(document_id, cached_result)

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
        logger.error(f"Failed to generate ER diagram: {e}")
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
    from services.valkey import get_cached_design, set_cached_design
    cached_result = get_cached_design(document_id)
    if not cached_result:
        raise ValueError("Design not found")

    domain_designs = cached_result.get("domainDesigns", [])
    design_to_replace = next((d for d in domain_designs if d.get("module") == module_name), None)
    if not design_to_replace:
        raise ValueError(f"Module '{module_name}' not found in cached design")

    # Extract existing details
    design = design_to_replace.get("design", {})
    raw_json = design.get("raw_json", {})
    selected_chunks = design_to_replace.get("selected_chunks", [])
    
    # Track old tables for computing diff
    old_tables = list(raw_json.get("data_model", {}).get("tables", []))
    
    # Update tables
    if "data_model" not in raw_json:
        raw_json["data_model"] = {}
    raw_json["data_model"]["tables"] = new_tables

    # Update Mermaid ER diagram
    old_mermaid = raw_json["data_model"].get("mermaid_er", "")
    new_mermaid = await _update_mermaid_er(old_mermaid, new_tables)
    raw_json["data_model"]["mermaid_er"] = new_mermaid

    module_context = format_chunks_as_context(selected_chunks)

    # Build ModuleGraphState for running api_agent, qa_agent & lld_agent
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
        "frontend_design": {},
        "test_strategy":   {},
        "tech_stack":          cached_result.get("techStack", ""),
        "design_principles":   cached_result.get("designPrinciples", ""),
        "security_protocols":  cached_result.get("securityProtocols", ""),
        "open_questions_answers": cached_result.get("openQuestionsAnswers", ""),
        "cloud_provider":      cached_result.get("cloudProvider", "aws"),
    }

    # Run API Agent node
    api_res = await api_agent_node(state)
    state["api_design"] = api_res["api_design"]

    # Run QA Agent node (Test Strategy)
    qa_res = await qa_agent_node(state)
    state["test_strategy"] = qa_res["test_strategy"]

    # Run LLD Agent node
    lld_res = await lld_agent_node(state)
    state["lld_design"] = lld_res["lld_design"]

    # Run Frontend Agent node
    frontend_res = await frontend_agent_node(state)
    state["frontend_design"] = frontend_res["frontend_design"]

    # Run Save Module Design Logic to compile final module design entry
    from services.design.nodes.save_module_design import generate_ddl_from_tables, sanitize_mermaid_er, compute_schema_diff
    
    # Compute schema diff
    db_type = raw_json.get("data_model", {}).get("database_type", "postgres")
    diff_res = compute_schema_diff(old_tables, new_tables, db_type=db_type)
    if diff_res.get("markdown"):
        raw_json["schema_diff"] = diff_res
        
    merged = {**raw_json}
    merged["apis"] = state["api_design"].get("apis", [])
    merged["workflows"] = state["api_design"].get("workflows", [])
    merged["compliance_check"] = raw_json.get("compliance_check", "")
    merged["api_compliance_check"] = state["api_design"].get("compliance_check", "")
    merged["test_strategy"] = state["test_strategy"]

    db_type = raw_json.get("data_model", {}).get("database_type", "postgres")
    sql_ddl = generate_ddl_from_tables(new_tables, db_type=db_type)
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
            "use_flow_mermaid":   state["lld_design"].get("use_flow_mermaid", ""),
            "actor_mermaid":      state["lld_design"].get("actor_mermaid", ""),
            "frontend_design":    state.get("frontend_design") or {},
            "test_strategy":      state.get("test_strategy") or {},
            "schema_diff_markdown": merged.get("schema_diff", {}).get("markdown", ""),
            "schema_diff_mermaid":  merged.get("schema_diff", {}).get("mermaid_er", ""),
            "raw_json":           merged,
        },

        "selected_chunks": selected_chunks,
    }

    # Replace the old module design
    for i, d in enumerate(domain_designs):
        if d.get("module") == module_name:
            domain_designs[i] = new_design_to_replace
            break

    # Re-generate global architecture and PM plan (since a module design has changed)
    arch_task = generate_global_architecture(
        domain_designs,
        tech_stack=state["tech_stack"],
        design_principles=state["design_principles"],
        security_protocols=state["security_protocols"],
        cloud_provider=state["cloud_provider"]
    )
    pm_task = generate_pm_plan(
        domain_designs,
        tech_stack=state["tech_stack"],
        design_principles=state["design_principles"],
        security_protocols=state["security_protocols"]
    )
    arch_res, pm_res = await asyncio.gather(arch_task, pm_task)

    # Update cache values
    cached_result["domainDesigns"] = domain_designs
    cached_result["dataModelMarkdown"] = _build_data_model_markdown(domain_designs)
    cached_result["systemDesignMarkdown"] = arch_res["architecture_markdown"]
    cached_result["terraformCode"] = arch_res["terraform_code"]
    cached_result["openapiSpec"] = arch_res.get("openapi_spec", "")
    cached_result["devopsArtifacts"] = arch_res.get("devops_artifacts", {})
    cached_result["projectPlan"] = pm_res
    cached_result["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    set_cached_design(document_id, cached_result)

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
    from services.valkey import get_cached_design, set_cached_design
    cached_result = get_cached_design(document_id)
    if not cached_result:
        raise ValueError("Design not found")

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
        logger.info("All modules completed. Generating global architecture and PM plan...")
        arch_task = generate_global_architecture(
            domain_designs,
            tech_stack=cached_result.get("techStack", ""),
            design_principles=cached_result.get("designPrinciples", ""),
            security_protocols=cached_result.get("securityProtocols", ""),
            cloud_provider=cached_result.get("cloudProvider", "aws")
        )
        pm_task = generate_pm_plan(
            domain_designs,
            tech_stack=cached_result.get("techStack", ""),
            design_principles=cached_result.get("designPrinciples", ""),
            security_protocols=cached_result.get("securityProtocols", "")
        )
        arch_res, pm_res = await asyncio.gather(arch_task, pm_task)

        cached_result["status"] = "completed"
        cached_result["domainDesigns"] = domain_designs
        cached_result["dataModelMarkdown"] = _build_data_model_markdown(domain_designs)
        cached_result["systemDesignMarkdown"] = arch_res["architecture_markdown"]
        cached_result["terraformCode"] = arch_res["terraform_code"]
        cached_result["openapiSpec"] = arch_res.get("openapi_spec", "")
        cached_result["devopsArtifacts"] = arch_res.get("devops_artifacts", {})
        cached_result["projectPlan"] = pm_res
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

    set_cached_design(document_id, cached_result)

    return cached_result


async def parse_refinement_intent(message: str, modules: List[str]) -> Optional[str]:
    """
    Parses the user message using LLM to identify which module is being targetted.
    Returns the exact module name from `modules` list if matched, else None.
    """
    if not modules:
        return None
        
    from langchain_core.messages import SystemMessage, HumanMessage
    
    model = get_chat_model(temperature=0.0)
    
    modules_list_str = "\n".join([f"{i+1}. {m}" for i, m in enumerate(modules)])
    prompt = (
        "You are an intent routing model.\n"
        "Your task is to identify which software module the user wants to refine based on their message.\n\n"
        f"Available modules:\n{modules_list_str}\n\n"
        f"User message: \"{message}\"\n\n"
        "Output ONLY the index number of the matched module (e.g., '1', '2', etc.). "
        "If the message does not target any specific module from the list, output 'None'. "
        "Do not include any explanation, quotes, or extra characters."
    )
    
    try:
        response = await model.ainvoke([
            SystemMessage(content="You are an expert router. Output only the matched module index or 'None'."),
            HumanMessage(content=prompt)
        ])
        content = response.content.strip().replace('"', '').replace("'", "")
        
        if content.isdigit():
            idx = int(content) - 1
            if 0 <= idx < len(modules):
                return modules[idx]
        
        # Fuzzy match LLM text response if it didn't output an index
        content_lower = content.lower()
        for m in modules:
            if m.lower() in content_lower or content_lower in m.lower():
                return m
    except Exception as e:
        logger.error(f"[router] LLM invocation failed during intent parsing: {e}")

    # Fallback to direct keyword search in the user's original message
    msg_lower = message.lower()
    for m in modules:
        # Strip common words like 'module' or 'management' to find core words
        core_terms = [t for t in m.lower().replace("module", "").replace("management", "").split() if len(t) > 2]
        if any(term in msg_lower for term in core_terms):
            logger.info(f"[router] Fallback matched module '{m}' based on keywords in user message")
            return m
            
    return None


async def refine_system_design(
    document_id: str,
    message: str
) -> Dict[str, Any]:
    """
    Parses user message to find the target module, runs refinement graph flow,
    OR applies global architecture refinement if no module is matched.
    """
    from services.valkey import get_cached_design, set_cached_design
    cached_result = get_cached_design(document_id)
    if not cached_result:
        raise ValueError("Design not found")

    modules = cached_result.get("modules", [])
    target_module = await parse_refinement_intent(message, modules)
    
    domain_designs = cached_result.get("domainDesigns", [])
    tech_stack = cached_result.get("techStack", "")
    design_principles = cached_result.get("designPrinciples", "")
    security_protocols = cached_result.get("securityProtocols", "")
    cloud_provider = cached_result.get("cloudProvider", "aws")

    # ─── GLOBAL REFINEMENT (No specific module matched) ───
    if not target_module:
        logger.info(f"[refine] No specific module matched. Applying global refinement: '{message}'")
        
        # Run global architecture generation with the refinement instruction
        arch_res = await generate_global_architecture(
            domain_designs,
            tech_stack=tech_stack,
            design_principles=design_principles,
            security_protocols=security_protocols,
            cloud_provider=cloud_provider,
            refinement_instruction=message  # Pass the user's instruction here!
        )

        # Update cache values (keep old openapi_spec since modules didn't change)
        cached_result["systemDesignMarkdown"] = arch_res["architecture_markdown"]
        cached_result["terraformCode"] = arch_res["terraform_code"]
        cached_result["devopsArtifacts"] = arch_res.get("devops_artifacts", {})
        cached_result["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        set_cached_design(document_id, cached_result)

        return cached_result

    # ─── MODULE-SPECIFIC REFINEMENT (Module matched) ───
    logger.info(f"[refine] Module '{target_module}' matched. Applying module refinement.")
    
    # Find the target module design
    module_design_entry = next((d for d in domain_designs if d.get("module") == target_module), None)
    if not module_design_entry:
        raise ValueError(f"Module '{target_module}' design not found in cache.")

    # Retrieve existing state values
    open_questions_answers = cached_result.get("openQuestionsAnswers", "")
    
    # Re-construct ModuleGraphState
    raw_json = module_design_entry["design"].get("raw_json", {})
    selected_chunks = module_design_entry.get("selected_chunks", [])
    module_context = format_chunks_as_context(selected_chunks)
    
    initial_state: ModuleGraphState = {
        "normalized_text": cached_result.get("documentText", ""),
        "document_id":     document_id,
        "request_id":      str(uuid.uuid4()),
        "current_module":  target_module,
        "module_context":  module_context,
        "module_chunks":   selected_chunks,
        "dba_draft":       raw_json,
        "qa_feedback":     f"HUMAN INSTRUCTION: {message}",
        "qa_retries":      0,
        "api_design":      {},
        "lld_design":      {},
        "frontend_design": {},
        "test_strategy":   {},
        "module_design":   None,
        "tech_stack":          tech_stack,
        "design_principles":   design_principles,
        "security_protocols":  security_protocols,
        "open_questions_answers": open_questions_answers,
        "cloud_provider":      cloud_provider,
    }

    config = {"configurable": {"thread_id": f"{document_id}_{target_module}"}}
    
    # Run the graph
    final_state = await _module_workflow_app.ainvoke(initial_state, config)
    new_design = final_state.get("module_design")
    if not new_design:
        raise ValueError(f"Failed to refine module '{target_module}'")

    # Replace the old module design
    for i, d in enumerate(domain_designs):
        if d.get("module") == target_module:
            domain_designs[i] = new_design
            break

    # Re-generate global architecture and PM plan (since a module design changed)
    arch_task = generate_global_architecture(
        domain_designs,
        tech_stack=tech_stack,
        design_principles=design_principles,
        security_protocols=security_protocols,
        cloud_provider=cloud_provider
    )
    pm_task = generate_pm_plan(
        domain_designs,
        tech_stack=tech_stack,
        design_principles=design_principles,
        security_protocols=security_protocols
    )
    arch_res, pm_res = await asyncio.gather(arch_task, pm_task)

    # Update cache values
    cached_result["domainDesigns"] = domain_designs
    cached_result["dataModelMarkdown"] = _build_data_model_markdown(domain_designs)
    cached_result["systemDesignMarkdown"] = arch_res["architecture_markdown"]
    cached_result["terraformCode"] = arch_res["terraform_code"]
    cached_result["openapiSpec"] = arch_res.get("openapi_spec", "")
    cached_result["devopsArtifacts"] = arch_res.get("devops_artifacts", {})
    cached_result["projectPlan"] = pm_res
    cached_result["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    set_cached_design(document_id, cached_result)

    return cached_result

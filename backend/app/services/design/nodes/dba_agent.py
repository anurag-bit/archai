import json
from typing import List, Dict, Any
from langchain_core.messages import HumanMessage, SystemMessage
from services.design.helpers import get_chat_model, parse_llm_json, invoke_with_retry_and_validation
from services.design.validators import validate_dba_draft
from services.design.state import GraphState
from services.design.nodes.save_module_design import compute_schema_diff
import logging
logger = logging.getLogger(__name__)



_DBA_SYSTEM = (
    "You are a Principal Database Architect (Schema Architect Agent). "
    "Your job is to choose the most suitable database engine (PostgreSQL, MongoDB, or Neo4j) "
    "and produce an exhaustive, production-ready schema grounded STRICTLY in the SRS context provided. "
    "Database Selection Guide:\n"
    "1. Neo4j: Choose for modules requiring high-read graph structures (e.g. social connections, follower networks, recommendation engines, complex hierarchies).\n"
    "2. MongoDB: Choose for modules requiring flexible, nested document storage, unstructured metadata, catalogs, or high-write semi-structured logs.\n"
    "3. PostgreSQL: Choose as the default database engine for all other relational or transactional database requirements.\n"
    "You MUST design a schema/model that captures 100% of the capabilities described in the SRS. "
    "Do not omit any feature. "
    "Output ONLY valid JSON — no markdown fences, no prose."
)

_DBA_PROMPT = """\
You are designing the "{MODULE_NAME}" module.

### ZERO-TOLERANCE DIRECTIVES
1. NO ABBREVIATIONS — list every field required by the SRS; never write "...", "etc.", or "similar fields".
2. EXHAUSTIVE ENUMS — capture exact status values in SQL ENUM or CHECK constraints.
3. TRACEABILITY — every column must cite the SRS line that requires it in "justification".
4. BUSINESS RULES — capture exact mathematical or logical constraints.
5. COMPLETENESS — Generate ALL tables/collections/nodes required by the SRS context. A typical module requires 10-20 tables. Do not stop at 5-6 tables. 
   - If the SRS describes a workflow, create a table to track its state.
   - If the SRS describes a sub-entity (e.g., "follow-up actions", "documents", "siblings"), create a table/collection for it.
6. SRS MAPPING — Ensure EVERY feature, capability, and workflow described in the SRS context is represented as a table, column, or enum. If a capability is missing, the QA agent will reject the draft.
7. INDEXES — For any performance index required, you MUST output index definitions compatible with the selected database (e.g. standard SQL index/constraint, Mongo createIndex statement, or Cypher index/constraint query).
8. DATABASE ENGINE SELECTION — You MUST choose `mongodb` if the module requires flexible document catalogs, unstructured metadata, or high-write semi-structured logs. You MUST choose `neo4j` if the module requires follower networks, recommendations, or complex hierarchies. Otherwise, default to `postgres`. State your rationale in compliance_check.

{CONSTRAINTS}

### PRIOR QA FEEDBACK (if any)
{QA_FEEDBACK}

### CRITICAL MERMAID FORMATTING RULES (READ CAREFULLY)
When generating the "mermaid_er" string, you MUST follow these rules:
- Do NOT use commas between attribute lines.
- Do NOT use commas at the end of attribute lines.
- Format attributes exactly like this:
  USER {{
    uuid id PK
    string name
    string email
  }}
- Relationships must look exactly like this: USER ||--o{{ ORDER : places

### OUTPUT SCHEMA (strict JSON, no extras)
{{
  "module_name": "{MODULE_NAME}",
  "compliance_check": "Brief confirmation stating how the Tech Stack, Design Patterns, and Security constraints were applied, explaining why the chosen database engine was selected.",
  "business_rules": [
    {{"rule_id": "BR_001", "description": "...", "srs_reference": "..."}}
  ],
  "data_model": {{
    "database_type": "postgres or mongodb or neo4j",
    "mermaid_er": "erDiagram\\n  ...",
    "tables": [
      {{
        "table_name": "...",
        "description": "...",
        "columns": [
          {{"name": "...", "type": "...", "constraints": "...", "justification": "..."}}
        ],
        "indexes": ["..."]
      }}
    ]
  }}
}}

### SRS CONTEXT FOR {MODULE_NAME}
{CONTEXT}"""


async def dba_agent_node(state: GraphState) -> dict:
    """
    Schema Architect Agent (The DBA).
    Designs tables, ERD, and business rules for the current module.

    On first attempt: generates the full schema using the standard prompt.
    On retries: uses a TARGETED PATCH prompt that tells the LLM to output
    only the fixed/new tables, which are then programmatically merged into
    the existing draft — preventing the "whack-a-mole" regression loop.

    Returns only the keys it modifies (partial dict — LangGraph best practice).
    """
    module   = state["current_module"]
    feedback = state.get("qa_feedback", "")

    # Increment retry counter here (inside the node) if we are looping back from QA
    retries = state.get("qa_retries", 0)
    if feedback and feedback != "PASS":
        retries += 1

    from services.design.helpers import build_constraints_block
    constraints_block = build_constraints_block(
        state,
        tech_stack_template="- TECH STACK: You MUST use {tech_stack} (However, you may override the database engine and choose MongoDB or Neo4j if specified in the Database Selection Guide for this module's specific needs).\n",
        design_template="- DESIGN PATTERNS: You MUST implement {design_principles}.\n",
        security_template="- SECURITY: You MUST enforce {security_protocols}.\n"
    )

    logger.info(f"[dba_agent_node] Designing schema for '{module}' (attempt {retries + 1})")

    # ── DYNAMIC PROMPT: targeted patch on retries, full prompt on first attempt ──
    if (retries > 0 or "HUMAN INSTRUCTION" in feedback) and feedback:
        system_message = (
            "You are a Principal Database Architect performing a TARGETED PATCH. "
            "The QA agent found specific errors in your previous draft. "
            "You MUST output a valid JSON object with a \"data_model\" key containing a \"tables\" array, "
            "but you only need to include the NEW or MODIFIED tables that fix the QA feedback. "
            "Do NOT rewrite the entire schema. Just output the corrected tables inside the standard JSON structure. "
            "CRITICAL: Do NOT use commas between Mermaid erDiagram attribute lines.\n\n"
            "IMPORTANT: If the QA feedback mentions a missing many-to-many relationship, "
            "you MUST create a NEW junction table (e.g., student_program_interests) to resolve it. "
            "Do NOT just add a column to the parent table.\n\n"
            "NAMING: Name junction tables descriptively using the pattern "
            "<ENTITY_A>_<ENTITY_B> (e.g., PROSPECTIVE_STUDENT_PROGRAM, STUDENT_COURSE). "
            "Include at minimum: a surrogate PK, FK to entity A, FK to entity B, "
            "and any columns explicitly mentioned in the QA feedback."
        )
        user_prompt = (
            f"QA FEEDBACK TO FIX:\n{feedback}\n\n"
            f"{constraints_block}\n\n"
            f"CURRENT SCHEMA (for reference — do NOT copy unchanged tables into your output):\n"
            f"{json.dumps(state['dba_draft'], indent=2)}\n\n"
            f"ORIGINAL SRS CONTEXT:\n{state['module_context']}\n\n"
            f"Output the corrected JSON containing ONLY the fixed or new tables."
        )
    else:
        # First attempt: use the standard full prompt
        system_message = _DBA_SYSTEM
        user_prompt = _DBA_PROMPT.format(
            MODULE_NAME  = module,
            QA_FEEDBACK  = "None — this is your first attempt.",
            CONTEXT      = state["module_context"],
            CONSTRAINTS  = constraints_block,
        )

    model    = get_chat_model(temperature=0.05)
    new_draft = await invoke_with_retry_and_validation(
        model=model,
        messages=[
            SystemMessage(content=system_message),
            HumanMessage(content=user_prompt),
        ],
        validator=validate_dba_draft
    )

    # ── PROGRAMMATIC MERGE — prevents whack-a-mole regressions ───────────────
    # If this is a retry, merge the patched tables into the old complete draft
    # instead of replacing the whole thing (which causes regressions).
    is_patch = retries > 0 and bool(state.get("dba_draft"))
    if is_patch and "data_model" in new_draft:
        old_draft  = state["dba_draft"]
        old_tables = old_draft.get("data_model", {}).get("tables", [])
        new_tables = new_draft.get("data_model", {}).get("tables", [])

        if old_tables and new_tables:
            # Build a dict of old tables keyed by table_name
            tables_dict = {t.get("table_name"): t for t in old_tables if isinstance(t, dict)}

            # Overwrite old tables with fixed ones, or add brand-new ones
            for new_t in new_tables:
                if not isinstance(new_t, dict) or not new_t.get("table_name"):
                    continue
                t_name = new_t["table_name"]
                if t_name not in tables_dict:
                    tables_dict[t_name] = new_t
                else:
                    # Column-level merge to preserve old columns if LLM emitted a partial table
                    old_t = tables_dict[t_name]
                    merged_t = {**old_t, **{k: v for k, v in new_t.items() if k != "columns"}}
                    
                    old_cols = {c.get("name"): c for c in old_t.get("columns", []) if isinstance(c, dict)}
                    for new_c in new_t.get("columns", []):
                        if isinstance(new_c, dict) and new_c.get("name"):
                            old_cols[new_c["name"]] = new_c
                    merged_t["columns"] = list(old_cols.values())
                    tables_dict[t_name] = merged_t

            # Reconstruct the complete, merged draft (preserving new top-level keys like module_name if changed)
            merged_draft = {**old_draft, **{k: v for k, v in new_draft.items() if k not in ["data_model", "business_rules"]}}
            merged_draft["data_model"] = {**old_draft.get("data_model", {})}
            merged_draft["data_model"]["tables"] = list(tables_dict.values())

            # Compute schema diff
            db_type = old_draft.get("data_model", {}).get("database_type", "postgres")
            diff_res = compute_schema_diff(old_tables, list(tables_dict.values()), db_type=db_type)
            if diff_res.get("markdown"):
                merged_draft["schema_diff"] = diff_res

            # Update business rules if the patch included new ones
            if new_draft.get("business_rules"):
                existing_rules = {r.get("rule_id"): r for r in old_draft.get("business_rules", []) if isinstance(r, dict)}
                for rule in new_draft["business_rules"]:
                    if isinstance(rule, dict) and rule.get("rule_id"):
                        existing_rules[rule["rule_id"]] = rule
                merged_draft["business_rules"] = list(existing_rules.values())

            # Debug: show merged table names for visibility
            merged_table_names = [t.get("table_name") for t in merged_draft.get("data_model", {}).get("tables", [])]
            logger.info(f"[dba_agent_node] 🔍 Merged table names: {merged_table_names}")

            logger.info(f"[dba_agent_node] ✅ Merged {len(new_tables)} patched table(s) into existing {len(old_tables)}-table draft")
            return {"dba_draft": merged_draft, "qa_retries": retries}

    # First attempt or merge not applicable — return the full new draft
    logger.info(f"[dba_agent_node] Schema draft ready for '{module}'")
    return {"dba_draft": new_draft, "qa_retries": retries}

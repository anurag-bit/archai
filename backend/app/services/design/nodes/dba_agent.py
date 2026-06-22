import json
from typing import List, Dict, Any
from langchain_core.messages import HumanMessage, SystemMessage
from services.design.helpers import get_chat_model, parse_llm_json
from services.design.state import GraphState

_DBA_SYSTEM = (
    "You are a Principal Database Architect (Schema Architect Agent). "
    "Your sole job is to produce an exhaustive, production-ready PostgreSQL schema "
    "grounded STRICTLY in the SRS context provided. "
    "You MUST design a schema that captures 100% of the capabilities described in the SRS. "
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
5. COMPLETENESS — Generate ALL tables required by the SRS context. A typical module requires 10-20 tables. Do not stop at 5-6 tables. 
   - If the SRS describes a workflow, create a table to track its state.
   - If the SRS describes a sub-entity (e.g., "follow-up actions", "documents", "siblings"), create a table for it.
6. SRS MAPPING — Ensure EVERY feature, capability, and workflow described in the SRS context is represented as a table, column, or enum. If a capability is missing, the QA agent will reject the draft.

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
  "compliance_check": "Brief confirmation stating how the Tech Stack, Design Patterns, and Security constraints were applied.",
  "business_rules": [
    {{"rule_id": "BR_001", "description": "...", "srs_reference": "..."}}
  ],
  "data_model": {{
    "mermaid_er": "erDiagram\\n  ...",
    "tables": [
      {{
        "table_name": "...",
        "description": "...",
        "columns": [
          {{"name": "...", "type": "...", "constraints": "...", "justification": "..."}}
        ],
        "indexes": ["idx_..."]
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

    # Build constraint block from user-supplied architecture constraints
    constraints_block = "### STRICT ARCHITECTURAL CONSTRAINTS\n"
    if state.get("tech_stack"):
        constraints_block += f"- TECH STACK: You MUST use {state['tech_stack']}.\n"
    if state.get("design_principles"):
        constraints_block += f"- DESIGN PATTERNS: You MUST implement {state['design_principles']}.\n"
    if state.get("security_protocols"):
        constraints_block += f"- SECURITY: You MUST enforce {state['security_protocols']}.\n"
    if state.get("open_questions_answers"):
        constraints_block += f"- USER CLARIFICATIONS (ANSWERS TO OPEN QUESTIONS):\n{state['open_questions_answers']}\n"
    if constraints_block == "### STRICT ARCHITECTURAL CONSTRAINTS\n":
        constraints_block = ""  # nothing supplied — omit the section entirely

    print(f"[dba_agent_node] Designing schema for '{module}' (attempt {retries + 1})")

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
    response = await model.ainvoke([
        SystemMessage(content=system_message),
        HumanMessage(content=user_prompt),
    ])
    new_draft = parse_llm_json(response.content)

    # ── PROGRAMMATIC MERGE — prevents whack-a-mole regressions ───────────────
    # If this is a retry, merge the patched tables into the old complete draft
    # instead of replacing the whole thing (which causes regressions).
    if retries > 0 and state.get("dba_draft") and "data_model" in new_draft:
        old_draft  = state["dba_draft"]
        old_tables = old_draft.get("data_model", {}).get("tables", [])
        new_tables = new_draft.get("data_model", {}).get("tables", [])

        if old_tables and new_tables:
            # Build a dict of old tables keyed by table_name
            tables_dict = {t.get("table_name"): t for t in old_tables if isinstance(t, dict)}

            # Overwrite old tables with fixed ones, or add brand-new ones
            for new_t in new_tables:
                if isinstance(new_t, dict) and new_t.get("table_name"):
                    tables_dict[new_t["table_name"]] = new_t

            # Reconstruct the complete, merged draft
            merged_draft = {**old_draft}
            if "compliance_check" in new_draft:
                merged_draft["compliance_check"] = new_draft["compliance_check"]
            merged_draft["data_model"] = {**old_draft.get("data_model", {})}
            merged_draft["data_model"]["tables"] = list(tables_dict.values())

            # Update business rules if the patch included new ones
            if new_draft.get("business_rules"):
                existing_rules = {r.get("rule_id"): r for r in old_draft.get("business_rules", []) if isinstance(r, dict)}
                for rule in new_draft["business_rules"]:
                    if isinstance(rule, dict) and rule.get("rule_id"):
                        existing_rules[rule["rule_id"]] = rule
                merged_draft["business_rules"] = list(existing_rules.values())

            # Debug: show merged table names for visibility
            merged_table_names = [t.get("table_name") for t in merged_draft.get("data_model", {}).get("tables", [])]
            print(f"[dba_agent_node] 🔍 Merged table names: {merged_table_names}")

            print(f"[dba_agent_node] ✅ Merged {len(new_tables)} patched table(s) into existing {len(old_tables)}-table draft")
            return {"dba_draft": merged_draft, "qa_retries": retries}

    # First attempt or merge not applicable — return the full new draft
    print(f"[dba_agent_node] Schema draft ready for '{module}'")
    return {"dba_draft": new_draft, "qa_retries": retries}

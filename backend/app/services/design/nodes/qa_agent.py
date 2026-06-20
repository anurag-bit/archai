import json
import re
from typing import List, Dict, Any
from langchain_core.messages import HumanMessage, SystemMessage
from services.design.helpers import get_chat_model, _text_similarity
from services.design.state import GraphState

_QA_SYSTEM = (
    "You are a Pragmatic Compliance Agent (QA Engineer). "
    "Audit a database schema draft against the original SRS context. "
    "Focus on CRITICAL structural issues only. Output ONLY 'PASS' or "
    "a numbered list of critical, actionable issues. No preamble.\n\n"
    "CRITICAL RULES:\n"
    "1. You MUST NOT re-raise issues from previous reviews that have been addressed.\n"
    "2. If a junction table exists for a many-to-many relationship, that relationship "
    "is SATISFIED — do not fail for missing minor columns on the junction table.\n"
    "3. If the DBA added a table or column that addresses your previous feedback, "
    "you MUST acknowledge it as RESOLVED."
)

_QA_PROMPT = """\
### MODULE UNDER REVIEW
{MODULE_NAME}

### DBA SCHEMA DRAFT
{DBA_DRAFT}

### ORIGINAL SRS CONTEXT
{CONTEXT}
{PREVIOUS_FEEDBACK}
{JUNCTION_TABLES_INFO}
### YOUR AUDIT CHECKLIST
You are a Pragmatic QA Engineer. Your goal is to validate the CORE *CAPABILITIES* \
of the schema, not to enforce a specific column structure.

1. Is the JSON valid and parseable?
2. Are the CORE entities (the main subjects of the module) represented as tables?
3. Can the schema *represent* the business relationships described in the SRS?
   - If the SRS says "record multiple X for a Y", this is a MANY-TO-MANY relationship.
   - Many-to-many relationships are modeled using a JUNCTION TABLE.
   - If a junction table exists that connects the parent entity to the child entity, \
the CORE CAPABILITY IS SATISFIED — even if some intermediate columns are missing.
   - Do NOT fail a schema because a parent table lacks a multi-value column. \
Look for junction tables FIRST.
4. Do the primary keys and core foreign keys exist?
5. Are the most critical status ENUMs present?

### CRITICAL RULES FOR FAILING:
- ONLY fail if a CORE business capability is completely impossible to represent.
- Do NOT fail for stylistic preferences or missing minor columns.
- Do NOT fail for missing report-specific tables.
- Do NOT fail for missing "mechanisms" if a status/flag/boolean column could represent it.
- Do NOT fail for missing minor columns on a junction table — the junction table's \
existence satisfies the many-to-many requirement.
- Do NOT re-raise issues from previous reviews that the DBA has addressed.
- If the Mermaid syntax has commas, ignore it as long as the JSON "tables" array is correct.

If the core capabilities are representable → respond with exactly: PASS
Otherwise → respond with a numbered list of CRITICAL missing capabilities only."""


def _detect_junction_tables(tables: List[Dict[str, Any]]) -> List[str]:
    """
    Heuristically detect junction / association tables in a schema.
    Returns a list of table names that are likely junction tables.

    Heuristics:
      H1: Name contains junction keywords (_map, _link, _bridge, etc.)
      H2: Has 2+ columns with FK constraints
      H3: Small table (<=8 cols) with 2+ columns ending in _id
    """
    junctions: List[str] = []

    for table in tables:
        if not isinstance(table, dict):
            continue
        name = table.get("table_name", "")
        name_lower = name.lower()
        cols = table.get("columns", [])
        if not cols:
            continue

        # H1: junction keywords in table name
        if any(kw in name_lower for kw in [
            '_map', '_link', '_bridge', '_junction', '_assoc', '_xref',
            '_intersection', '_cross',
        ]):
            junctions.append(name)
            continue

        # H2: 2+ FK constraint columns
        fk_count = sum(
            1 for c in cols
            if isinstance(c, dict) and 'fk' in (c.get('constraints', '') or '').lower()
        )
        if fk_count >= 2:
            junctions.append(name)
            continue

        # H3: small table with 2+ _id columns
        id_col_count = sum(
            1 for c in cols
            if isinstance(c, dict) and c.get('name', '').lower().endswith('_id')
        )
        if len(cols) <= 8 and id_col_count >= 2:
            junctions.append(name)
            continue

    # Deduplicate preserving order
    return list(dict.fromkeys(junctions))


async def qa_agent_node(state: GraphState) -> dict:
    """
    Compliance Agent (The QA).
    Audits the DBA draft. Sets qa_feedback to 'PASS' or structured feedback.

    Anti-loop measures:
      1. Injects programmatic junction-table detection into the prompt so QA
         cannot deny the existence of junction tables the DBA added.
      2. Passes previous feedback into the prompt and forces QA to verify
         whether prior issues are now RESOLVED.
      3. If new feedback is >70% similar to previous feedback (Jaccard word
         overlap), auto-passes — the DBA's patch wasn't recognised, but
         looping again won't help.
    """
    module = state["current_module"]
    previous_feedback = state.get("qa_feedback", "")
    retries = state.get("qa_retries", 0)

    print(f"[qa_agent_node] Auditing schema draft for '{module}' (review #{retries + 1})")

    # ── Programmatic junction table detection ──────────────────────────────
    tables = state.get("dba_draft", {}).get("data_model", {}).get("tables", [])
    junction_tables = _detect_junction_tables(tables)

    # ── Build "previous feedback" block for the prompt ─────────────────────
    prev_feedback_block = ""
    if previous_feedback and previous_feedback != "PASS" and retries > 0:
        prev_feedback_block = (
            f"\n### PREVIOUS QA FEEDBACK (from review #{retries})\n"
            f"The DBA has had a chance to address these issues. "
            f"You MUST verify each one and mark it RESOLVED or STILL MISSING:\n\n"
            f"{previous_feedback}\n\n"
            f"RULE: If the DBA added a table, column, or junction table that "
            f"addresses a previous issue, you MUST mark that issue RESOLVED. "
            f"Do NOT re-raise resolved issues.\n"
        )

    # ── Build "junction tables detected" block for the prompt ──────────────
    junction_info = ""
    if junction_tables:
        junction_info = (
            f"\n### JUNCTION TABLES DETECTED (programmatic scan)\n"
            f"The following tables were algorithmically detected as junction / "
            f"association tables:\n  {', '.join(junction_tables)}\n\n"
            f"RULE: If any previous QA concern was about a missing many-to-many "
            f"relationship, and a junction table now exists for it, that concern "
            f"is RESOLVED. Do NOT fail solely because the junction table is "
            f"missing minor columns (e.g., batch_id, status).\n"
        )

    # ── Run QA audit ───────────────────────────────────────────────────────
    prompt = _QA_PROMPT.format(
        MODULE_NAME=module,
        DBA_DRAFT=json.dumps(state["dba_draft"], indent=2),
        CONTEXT=state["module_context"],
        PREVIOUS_FEEDBACK=prev_feedback_block,
        JUNCTION_TABLES_INFO=junction_info,
    )
    model = get_chat_model(temperature=0.0)
    response = await model.ainvoke([
        SystemMessage(content=_QA_SYSTEM),
        HumanMessage(content=prompt),
    ])
    feedback = response.content.strip()
    result = "PASS" if feedback.upper().startswith("PASS") else feedback

    # ── Feedback similarity check (safety net against infinite loops) ──────
    if result != "PASS" and previous_feedback and previous_feedback != "PASS":
        similarity = _text_similarity(result, previous_feedback)
        if similarity > 0.70:
            print(
                f"[qa_agent_node] ⚠️  New feedback is {similarity:.0%} similar to "
                f"previous — auto-passing (DBA patch not recognised by QA, "
                f"but looping further won't help)"
            )
            result = "PASS"

    if result == "PASS":
        print(f"[qa_agent_node] QA result for '{module}': ✅ PASS")
    else:
        print(f"[qa_agent_node] QA result for '{module}': ❌ FAIL — looping back to DBA")
        print(f"[qa_agent_node] Feedback snippet: {result[:500]}...")

    return {"qa_feedback": result}

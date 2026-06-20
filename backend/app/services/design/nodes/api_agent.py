import json
from langchain_core.messages import HumanMessage, SystemMessage
from services.design.helpers import get_chat_model, parse_llm_json
from services.design.state import GraphState

_API_SYSTEM = (
    "You are an API Engineer Agent (The Backend Dev). "
    "Given an approved database schema, design REST API endpoints and state-machine workflows. "
    "Output ONLY valid JSON — no markdown fences, no prose."
)

_API_PROMPT = """\
### MODULE
{MODULE_NAME}

### APPROVED DB SCHEMA
{DBA_DRAFT}

### SRS CONTEXT
{CONTEXT}

{CONSTRAINTS}

### OUTPUT SCHEMA (strict JSON)
{{
  "compliance_check": "Brief confirmation stating how the Tech Stack, Design Patterns, and Security constraints were applied in the API design.",
  "apis": [
    {{
      "method": "GET|POST|PUT|PATCH|DELETE",
      "path": "/api/v1/...",
      "description": "...",
      "request_body":  {{"field": "type"}},
      "response_body": {{"field": "type"}},
      "srs_reference": "..."
    }}
  ],
  "workflows": [
    {{
      "workflow_name": "...",
      "srs_reference": "...",
      "states": ["STATE_A", "STATE_B"],
      "transitions": [
        {{
          "from": "STATE_A",
          "to": "STATE_B",
          "trigger": "...",
          "api_endpoint": "PATCH /api/v1/.../{{id}}/action"
        }}
      ]
    }}
  ]
}}

### DIRECTIVES
- Every table in the schema must have at minimum a GET (list) and POST (create) endpoint.
- Every status field must have a PATCH endpoint covering each allowed transition.
- Workflows must mirror exact state machines described in the SRS (not invented ones).
- srs_reference must cite the SRS section, not a column name.
- All endpoints must respect the tech stack and security constraints above."""


async def api_agent_node(state: GraphState) -> dict:
    """
    API Engineer Agent (The Backend Dev).
    Designs endpoints and state-machine workflows based on the approved DB schema.
    Returns only the keys it modifies (partial dict — LangGraph best practice).
    """
    module = state["current_module"]
    print(f"[api_agent_node] Designing API layer for '{module}'")

    # Build constraint block from user-supplied architecture constraints
    constraints_block = "### STRICT ARCHITECTURAL CONSTRAINTS\n"
    if state.get("tech_stack"):
        constraints_block += f"- TECH STACK: All endpoints and middleware MUST align with {state['tech_stack']}.\n"
    if state.get("design_principles"):
        constraints_block += f"- DESIGN PATTERNS: Route design MUST follow {state['design_principles']}.\n"
    if state.get("security_protocols"):
        constraints_block += f"- SECURITY: Every endpoint MUST enforce {state['security_protocols']} (auth guards, rate limiting, input validation).\n"
    if state.get("open_questions_answers"):
        constraints_block += f"- USER CLARIFICATIONS (ANSWERS TO OPEN QUESTIONS):\n{state['open_questions_answers']}\n"
    if constraints_block == "### STRICT ARCHITECTURAL CONSTRAINTS\n":
        constraints_block = ""  # nothing supplied — omit the section entirely

    prompt = _API_PROMPT.format(
        MODULE_NAME = module,
        DBA_DRAFT   = json.dumps(state["dba_draft"], indent=2),
        CONTEXT     = state["module_context"],
        CONSTRAINTS = constraints_block,
    )
    model    = get_chat_model(temperature=0.05)
    response = await model.ainvoke([
        SystemMessage(content=_API_SYSTEM),
        HumanMessage(content=prompt),
    ])
    api_design = parse_llm_json(response.content)
    print(f"[api_agent_node] API design ready for '{module}'")

    # Return ONLY the key we are updating
    return {"api_design": api_design}

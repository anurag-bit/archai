import json
from langchain_core.messages import HumanMessage, SystemMessage
from services.design.helpers import get_chat_model, parse_llm_json, invoke_with_retry_and_validation
from services.design.validators import validate_api_design
from services.design.state import GraphState
import logging
logger = logging.getLogger(__name__)



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
    logger.info(f"[api_agent_node] Designing API layer for '{module}'")

    from services.design.helpers import build_constraints_block
    constraints_block = build_constraints_block(
        state,
        tech_stack_template="- TECH STACK: All endpoints and middleware MUST align with {tech_stack}.\n",
        design_template="- DESIGN PATTERNS: Route design MUST follow {design_principles}.\n",
        security_template="- SECURITY: Every endpoint MUST enforce {security_protocols} (auth guards, rate limiting, input validation).\n"
    )
    prompt = _API_PROMPT.format(
        MODULE_NAME = module,
        DBA_DRAFT   = json.dumps(state["dba_draft"], indent=2),
        CONTEXT     = state["module_context"],
        CONSTRAINTS = constraints_block,
    )
    model    = get_chat_model(temperature=0.05)
    api_design = await invoke_with_retry_and_validation(
        model=model,
        messages=[
            SystemMessage(content=_API_SYSTEM),
            HumanMessage(content=prompt),
        ],
        validator=validate_api_design
    )
    logger.info(f"[api_agent_node] API design ready for '{module}'")

    # Return ONLY the key we are updating
    return {"api_design": api_design}

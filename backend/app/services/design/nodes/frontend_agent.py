import json
from langchain_core.messages import HumanMessage, SystemMessage
from services.design.helpers import get_chat_model, invoke_with_retry_and_validation
from services.design.validators import validate_frontend_design
from services.design.state import GraphState

_FRONTEND_SYSTEM = (
    "You are a Frontend Architect Agent (The UI/UX Dev). "
    "Given a database schema, APIs, and the SRS context for a specific module, "
    "design a modern, comprehensive frontend architecture. "
    "Output ONLY valid JSON — no markdown fences, no prose."
)

_FRONTEND_PROMPT = """\
### MODULE
{MODULE_NAME}

### APPROVED DB SCHEMA
{DBA_DRAFT}

### APPROVED API ENDPOINTS
{API_DESIGN}

### SRS CONTEXT
{CONTEXT}

{CONSTRAINTS}

### YOUR TASK
Design the frontend architecture for this module. Output strict JSON with the following structure:
{{
  "component_tree_mermaid": "graph TD\\n ...(Mermaid syntax for component tree tree structure)...",
  "state_management": "Detailed state management recommendation (e.g. Zustand, Redux, Context API) and strategy description...",
  "routing_structure": "File-based routes structure (e.g., Next.js pages or App router paths) mapping routes to APIs and components...",
  "wireframe_descriptions": [
    {{
      "view_name": "...",
      "layout_description": "..."
    }}
  ]
}}

### RULES FOR COMPONENT HIERARCHY DIAGRAM (MERMAID):
- Use Mermaid `graph TD`.
- Map the UI views to sub-components (e.g. DashboardView --> Header, MetricCards, ActivityFeed).
- Follow clean React/Vue component decomposition best practices.
- Ensure nodes have readable names and standard Mermaid connections.

### RULES FOR STATE MANAGEMENT:
- Provide an explicit recommendation (e.g. Zustand, Redux, or Vuex/Pinia if Vue stack is preferred).
- Describe what is kept in global state (e.g. user authentication, selected items) vs local state (e.g. form inputs, loading flags).

### RULES FOR ROUTING STRUCTURE:
- List the routes relevant for this module.
- Map each route to the API endpoint(s) called on page load or action.
"""

async def frontend_agent_node(state: GraphState) -> dict:
    """
    Frontend Architect Agent (The UI/UX Dev).
    Designs component hierarchy diagrams, state management, routes, and wireframes.
    Returns only the keys it modifies.
    """
    module = state["current_module"]
    print(f"[frontend_agent_node] Designing frontend architecture for '{module}'")

    # Build constraint block from user-supplied architecture constraints
    constraints_block = "### STRICT ARCHITECTURAL CONSTRAINTS\n"
    if state.get("tech_stack"):
        constraints_block += f"- TECH STACK: All components and routing MUST align with {state['tech_stack']}.\n"
    if state.get("design_principles"):
        constraints_block += f"- DESIGN PATTERNS: UI design MUST follow {state['design_principles']}.\n"
    if state.get("security_protocols"):
        constraints_block += f"- SECURITY: The client-side application MUST enforce {state['security_protocols']} (e.g., token-based auth, route guards, XSS protection).\n"
    if state.get("open_questions_answers"):
        constraints_block += f"- USER CLARIFICATIONS (ANSWERS TO OPEN QUESTIONS):\n{state['open_questions_answers']}\n"
    if constraints_block == "### STRICT ARCHITECTURAL CONSTRAINTS\n":
        constraints_block = ""

    prompt = _FRONTEND_PROMPT.format(
        MODULE_NAME = module,
        DBA_DRAFT   = json.dumps(state["dba_draft"], indent=2),
        API_DESIGN  = json.dumps(state["api_design"], indent=2),
        CONTEXT     = state["module_context"],
        CONSTRAINTS = constraints_block,
    )

    model = get_chat_model(temperature=0.05)
    frontend_design = await invoke_with_retry_and_validation(
        model=model,
        messages=[
            SystemMessage(content=_FRONTEND_SYSTEM),
            HumanMessage(content=prompt),
        ],
        validator=validate_frontend_design
    )
    print(f"[frontend_agent_node] Frontend architecture ready for '{module}'")

    return {"frontend_design": frontend_design}

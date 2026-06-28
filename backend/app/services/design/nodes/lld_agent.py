import json
from langchain_core.messages import HumanMessage, SystemMessage
from services.design.helpers import get_chat_model, parse_llm_json, invoke_with_retry_and_validation
from services.design.validators import validate_lld_design
from services.design.state import GraphState

_LLD_SYSTEM = (
    "You are a Low-Level System Design Engineer. "
    "Given an approved database schema and API endpoints for a specific module, "
    "your job is to generate a Level 1 Data Flow Diagram (DFD), a Low-Level Component Diagram, "
    "a User Flow Diagram, and a User Actor / Use Case Diagram. "
    "Output ONLY valid JSON with Mermaid syntax."
)

_LLD_PROMPT = """\
### MODULE
{MODULE_NAME}

### APPROVED DB SCHEMA
{DBA_DRAFT}

### APPROVED API ENDPOINTS
{API_DESIGN}

### YOUR TASK
Generate the low-level design diagrams for this module. Output strict JSON with the following structure:
{{
  "dfd_mermaid": "graph TD\\n ...(Mermaid syntax for Level 1 DFD)...",
  "component_mermaid": "graph TD\\n ...(Mermaid syntax for Component Diagram)...",
  "use_flow_mermaid": "graph TD\\n ...(Mermaid syntax for User Flow Diagram)...",
  "actor_mermaid": "graph TD\\n ...(Mermaid syntax for User Actor / Use Case Diagram)..."
}}

### RULES FOR DATA FLOW DIAGRAM (DFD):
- Use Mermaid `graph TD`.
- Use standard DFD shapes. ALWAYS provide a unique alphanumeric node identifier/ID before the shape. For example:
  - External Entities: `ClientUser[/Client User/]` or `Admin[/Admin/]`
  - Processes: `P1((Validate Input))` or `P2((Calculate Total))`
  - Data Stores: `DbUsers[(PostgreSQL Table: users)]` or `Cache[(Redis Cache)]`
- Never write shapes like `[/Client User/]` or `((Process))` directly as a statement or link. Always declare them with a node identifier first, and then link them using their node identifiers (e.g. `ClientUser --> P1`, `P1 --> DbUsers`).
- Show how data enters the module from the API Gateway, flows through processes, and is saved/updated in the Database.

### RULES FOR COMPONENT DIAGRAM (LLD):
- Use Mermaid `graph TD`.
- Show the internal layers of this module:
  - `Controller` (handles HTTP requests from API Gateway)
  - `Service` (business logic)
  - `Repository` (database queries)
- Show the flow: Controller --> Service --> Repository --> Database
- Link the specific tables from the schema to the Repository layer.
- Ensure all nodes are named using alphanumeric characters (e.g. `ClientUser`, `TblUsers`). Never use slashes in node names (e.g. do NOT write `/Client User/` or `UserRepo -- TblUsers`).
- CRITICAL: Ensure every arrow/link has both a source and a target node. Do NOT leave any arrow dangling (e.g. `D -->|table|` without a target node is invalid). Every node must be properly declared and linked.

### RULES FOR USER FLOW DIAGRAM:
- Use Mermaid `graph TD` or `graph LR`.
- Map out the step-by-step user interaction sequence:
  - Starting user action (e.g., "Click Submit")
  - UI State transitions and screen views (e.g., "Render Dashboard", "Show Error Toast")
  - Client-side validation, API requests, and success/error decision logic.
- Ensure all nodes are clearly named and linked.

### RULES FOR USER ACTOR / USE CASE DIAGRAM:
- Use Mermaid `graph TD` or `graph LR`.
- Identify the actors (e.g., standard user, system administrator, backend scheduler) and map them to their primary use cases or functions within this module.
- Declaring actors as nodes: `UserActor["Actor: Standard User"]`
- Declaring use cases as rounded nodes: `UC_Login("(Use Case: Login)")`
- Connect actors to their respective use cases: `UserActor --> UC_Login`
"""

async def lld_agent_node(state: GraphState) -> dict:
    """Generates DFD and Component diagrams for the module."""
    module = state["current_module"]
    print(f"[lld_agent_node] Designing LLD/DFD for '{module}'")

    prompt = _LLD_PROMPT.format(
        MODULE_NAME=module,
        DBA_DRAFT=json.dumps(state["dba_draft"], indent=2),
        API_DESIGN=json.dumps(state["api_design"], indent=2)
    )
    
    model = get_chat_model(temperature=0.05)
    lld_design = await invoke_with_retry_and_validation(
        model=model,
        messages=[
            SystemMessage(content=_LLD_SYSTEM),
            HumanMessage(content=prompt)
        ],
        validator=validate_lld_design
    )
    print(f"[lld_agent_node] LLD/DFD ready for '{module}'")

    return {"lld_design": lld_design}

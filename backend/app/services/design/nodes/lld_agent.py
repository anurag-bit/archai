import json
from langchain_core.messages import HumanMessage, SystemMessage
from services.design.helpers import get_chat_model, parse_llm_json
from services.design.state import GraphState

_LLD_SYSTEM = (
    "You are a Low-Level System Design Engineer. "
    "Given an approved database schema and API endpoints for a specific module, "
    "your job is to generate a Level 1 Data Flow Diagram (DFD) and a Low-Level Component Diagram. "
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
  "component_mermaid": "graph TD\\n ...(Mermaid syntax for Component Diagram)..."
}}

### RULES FOR DATA FLOW DIAGRAM (DFD):
- Use Mermaid `graph TD`.
- Use standard DFD shapes: 
  - `[/External Entity/]` (e.g., Client, Admin)
  - `((Process))` (e.g., Validate Input, Calculate Total)
  - `[(Data Store)]` (e.g., PostgreSQL Table, Redis Cache)
- Show how data enters the module from the API Gateway, flows through processes, and is saved/updated in the Database.

### RULES FOR COMPONENT DIAGRAM (LLD):
- Use Mermaid `graph TD`.
- Show the internal layers of this module:
  - `Controller` (handles HTTP requests from API Gateway)
  - `Service` (business logic)
  - `Repository` (database queries)
- Show the flow: Controller --> Service --> Repository --> Database
- Link the specific tables from the schema to the Repository layer.
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
    response = await model.ainvoke([
        SystemMessage(content=_LLD_SYSTEM),
        HumanMessage(content=prompt)
    ])
    
    lld_design = parse_llm_json(response.content)
    print(f"[lld_agent_node] LLD/DFD ready for '{module}'")

    return {"lld_design": lld_design}

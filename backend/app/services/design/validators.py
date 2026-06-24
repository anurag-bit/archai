from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

# --- DBA Models ---
class DBAColumn(BaseModel):
    name: str
    type: str
    constraints: Optional[str] = ""
    justification: Optional[str] = ""

class DBATable(BaseModel):
    table_name: str
    description: Optional[str] = ""
    columns: List[DBAColumn]
    indexes: Optional[List[str]] = []

class DBADraftModel(BaseModel):
    tables: List[DBATable]
    relationships: Optional[List[str]] = []

class DBABusinessRule(BaseModel):
    rule_id: str
    description: str

class DBADraft(BaseModel):
    compliance_check: Optional[str] = ""
    data_model: DBADraftModel
    business_rules: Optional[List[DBABusinessRule]] = []

# --- API Models ---
class APIEndpoint(BaseModel):
    method: str
    path: str
    description: Optional[str] = ""
    request_body: Optional[Any] = None
    response_body: Optional[Any] = None
    srs_reference: Optional[str] = ""

class APITransition(BaseModel):
    from_state: str = Field(alias="from")
    to: str
    trigger: Optional[str] = ""
    api_endpoint: Optional[str] = ""

    class Config:
        populate_by_name = True
        allow_population_by_field_name = True

class APIWorkflow(BaseModel):
    workflow_name: str
    srs_reference: Optional[str] = ""
    states: List[str]
    transitions: List[APITransition]

class APIDesign(BaseModel):
    compliance_check: Optional[str] = ""
    apis: List[APIEndpoint]
    workflows: Optional[List[APIWorkflow]] = []

# --- LLD Models ---
class LLDDesign(BaseModel):
    dfd_mermaid: str
    component_mermaid: str

# --- Frontend Models ---
class WireframeDescription(BaseModel):
    view_name: str
    layout_description: str

class FrontendDesign(BaseModel):
    component_tree_mermaid: str
    state_management: str
    routing_structure: str
    wireframe_descriptions: List[WireframeDescription]


# --- Validator Functions ---

def validate_dba_draft(draft: dict) -> dict:
    """Validate that LLM output is structured correctly as a DBA draft/patch."""
    if not isinstance(draft, dict):
        raise ValueError("DBA draft is not a dictionary")
    
    # If it is a targeted retry/patch, it may only include 'data_model' without the root fields
    if "data_model" in draft:
        DBADraftModel(**draft["data_model"])
    elif "tables" in draft:
        # Retry sometimes outputs tables directly
        DBADraftModel(tables=draft["tables"])
    else:
        raise ValueError("Invalid DBA draft structure: missing 'data_model' or 'tables' array")
    return draft


def validate_api_design(design: dict) -> dict:
    """Validate that LLM output conforms to the API design schema."""
    if not isinstance(design, dict) or "apis" not in design:
        raise ValueError("Invalid API design structure: missing 'apis' array")
    APIDesign(**design)
    return design


def validate_lld_design(design: dict) -> dict:
    """Validate that LLM output contains valid LFD and component Mermaid definitions."""
    if not isinstance(design, dict) or "dfd_mermaid" not in design or "component_mermaid" not in design:
        raise ValueError("Invalid LLD design structure: missing 'dfd_mermaid' or 'component_mermaid'")
    LLDDesign(**design)
    return design


def validate_frontend_design(design: dict) -> dict:
    """Validate that LLM output conforms to the Frontend design schema."""
    if not isinstance(design, dict) or "component_tree_mermaid" not in design or "state_management" not in design or "routing_structure" not in design or "wireframe_descriptions" not in design:
        raise ValueError("Invalid Frontend design structure: missing required keys")
    FrontendDesign(**design)
    return design


# --- Test Strategy Models ---
class TestStrategy(BaseModel):
    bdd_scenarios: str
    test_pyramid: str
    load_testing: str


def validate_test_strategy(design: dict) -> dict:
    """Validate that LLM output conforms to the Test Strategy schema."""
    if not isinstance(design, dict) or "bdd_scenarios" not in design or "test_pyramid" not in design or "load_testing" not in design:
        raise ValueError("Invalid Test Strategy structure: missing required keys")
    TestStrategy(**design)
    return design

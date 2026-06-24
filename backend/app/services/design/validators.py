from pydantic import BaseModel, Field, model_validator, field_validator, ConfigDict
from typing import List, Dict, Any, Optional
import json

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

    @field_validator('request_body', 'response_body', mode='before')
    @classmethod
    def flatten_dict_list(cls, v):
        """LLMs often return [{"key": "val"}] instead of {"key": "val"}. Fix it automatically."""
        if isinstance(v, list):
            merged = {}
            for item in v:
                if isinstance(item, dict):
                    merged.update(item)
            return merged
        return v

class APITransition(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    
    from_state: str = Field(alias="from")
    to: str
    trigger: Optional[str] = ""
    api_endpoint: Optional[str] = ""

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

    @model_validator(mode="before")
    @classmethod
    def serialize_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "state_management" in data and not isinstance(data["state_management"], str):
                data["state_management"] = json.dumps(data["state_management"], indent=2)
            if "routing_structure" in data and not isinstance(data["routing_structure"], str):
                data["routing_structure"] = json.dumps(data["routing_structure"], indent=2)
        return data

# --- Validator Functions ---

def validate_dba_draft(draft: dict) -> dict:
    if not isinstance(draft, dict):
        raise ValueError("DBA draft is not a dictionary")
    if "data_model" in draft:
        DBADraftModel(**draft["data_model"])
    elif "tables" in draft:
        DBADraftModel(tables=draft["tables"])
    else:
        raise ValueError("Invalid DBA draft structure: missing 'data_model' or 'tables' array")
    return draft

def validate_api_design(design: dict) -> dict:
    if not isinstance(design, dict) or "apis" not in design:
        raise ValueError("Invalid API design structure: missing 'apis' array")
    return APIDesign(**design).model_dump(by_alias=True)

def validate_lld_design(design: dict) -> dict:
    if not isinstance(design, dict) or "dfd_mermaid" not in design or "component_mermaid" not in design:
        raise ValueError("Invalid LLD design structure: missing 'dfd_mermaid' or 'component_mermaid'")
    return LLDDesign(**design).model_dump(by_alias=True)

def validate_frontend_design(design: dict) -> dict:
    if not isinstance(design, dict) or "component_tree_mermaid" not in design or "state_management" not in design or "routing_structure" not in design or "wireframe_descriptions" not in design:
        raise ValueError("Invalid Frontend design structure: missing required keys")
    return FrontendDesign(**design).model_dump(by_alias=True)

# --- Test Strategy Models ---
class TestStrategy(BaseModel):
    bdd_scenarios: str
    test_pyramid: str
    load_testing: str

    @model_validator(mode="before")
    @classmethod
    def serialize_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for field in ["bdd_scenarios", "test_pyramid", "load_testing"]:
                if field in data and not isinstance(data[field], str):
                    data[field] = json.dumps(data[field], indent=2)
        return data

def validate_test_strategy(design: dict) -> dict:
    if not isinstance(design, dict) or "bdd_scenarios" not in design or "test_pyramid" not in design or "load_testing" not in design:
        raise ValueError("Invalid Test Strategy structure: missing required keys")
    return TestStrategy(**design).model_dump(by_alias=True)

# --- DevOps Models ---
class DevOpsArtifacts(BaseModel):
    dockerfile: str
    docker_compose: str
    ci_cd_pipeline: str
    k8s_config: str

    @model_validator(mode="before")
    @classmethod
    def serialize_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for field in ["dockerfile", "docker_compose", "ci_cd_pipeline", "k8s_config"]:
                if field in data and not isinstance(data[field], str):
                    data[field] = json.dumps(data[field], indent=2)
        return data

def validate_devops_artifacts(design: dict) -> dict:
    """Validate that LLM output conforms to the DevOps artifacts schema."""
    if not isinstance(design, dict) or "dockerfile" not in design or "docker_compose" not in design or "ci_cd_pipeline" not in design or "k8s_config" not in design:
        raise ValueError("Invalid DevOps artifacts structure: missing required keys")
    return DevOpsArtifacts(**design).model_dump(by_alias=True)


# --- Product Manager (Tech Lead) Project Plan Models ---
class ProjectPlan(BaseModel):
    effort_estimation: str
    sprint_breakdown: str
    dependency_graph: str
    risk_register: str

    @model_validator(mode="before")
    @classmethod
    def serialize_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for field in ["effort_estimation", "sprint_breakdown", "dependency_graph", "risk_register"]:
                if field in data and not isinstance(data[field], str):
                    data[field] = json.dumps(data[field], indent=2)
        return data

def validate_project_plan(plan: dict) -> dict:
    """Validate that LLM output conforms to the Project Plan schema."""
    if not isinstance(plan, dict) or "effort_estimation" not in plan or "sprint_breakdown" not in plan or "dependency_graph" not in plan or "risk_register" not in plan:
        raise ValueError("Invalid Project Plan structure: missing required keys (effort_estimation, sprint_breakdown, dependency_graph, risk_register)")
    return ProjectPlan(**plan).model_dump(by_alias=True)


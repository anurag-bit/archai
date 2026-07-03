import json
from typing import List, Dict, Any
from langchain_core.messages import HumanMessage, SystemMessage
from services.design.helpers import get_chat_model, invoke_with_retry_and_validation
from services.design.validators import validate_project_plan
import logging
logger = logging.getLogger(__name__)



_PM_SYSTEM = (
    "You are a Product Manager & Technical Lead Agent.\n"
    "Your job is to convert the generated module designs (schemas, APIs, workflows, and test strategies) "
    "of a software system into a highly detailed, actionable development plan and roadmap.\n\n"
    "You MUST analyze the complexity, tables, APIs, and workflows across all modules to estimate effort "
    "and plan sprints.\n\n"
    "Your output MUST be a valid JSON object containing exactly the following four keys:\n"
    "1. 'effort_estimation': A Markdown string detailing the effort estimation (story points or man-hours) "
    "broken down by module in a clear table, explaining the rationale based on database tables, API endpoint count, "
    "and workflow complexity.\n"
    "2. 'sprint_breakdown': A Markdown string mapping out 2-week sprints. Group tables, APIs, and workflows "
    "into logical sprints (e.g., Sprint 1: Auth & User Management, Sprint 2: Core Domain Models). Specify goals and deliverables for each sprint.\n"
    "3. 'dependency_graph': A valid Mermaid flow diagram (graph TD) showing the dependency relationships and build order of modules "
    "(e.g., `Auth --> Billing`). Use clean and correct Mermaid syntax.\n"
    "4. 'risk_register': A Markdown table outlining identified technical risks (e.g., performance issues, locking contention, "
    "integration risks, data consistency, security vulnerabilities), and mapping them to Likelihood (Low/Medium/High), "
    "Impact (Low/Medium/High), and specific Mitigation Strategies.\n\n"
    "Output ONLY the JSON object. Do not include markdown formatting or extra text outside the JSON."
)

_PM_PROMPT = """\
### TECHNICAL CONSTRAINTS
- Tech Stack: {TECH_STACK}
- Design Principles: {DESIGN_PRINCIPLES}
- Security Protocols: {SECURITY_PROTOCOLS}

### SYSTEM MODULES
{MODULE_DESIGNS_SUMMARY}

### YOUR TASK
Generate the development plan and roadmap. Ensure the Mermaid dependency graph is syntactically correct and links all modules.
"""

async def generate_pm_plan(
    domain_designs: List[Dict[str, Any]],
    tech_stack: str = "",
    design_principles: str = "",
    security_protocols: str = ""
) -> Dict[str, Any]:
    """
    PM Agent / Tech Lead role.
    Aggregates all module designs, performs complexity analysis, estimates story points,
    builds dependency graphs, timelines, and registers risks.
    """
    logger.info(f"[pm_agent] Generating project plan and roadmap for {len(domain_designs)} modules...")

    # Build a summary of each module's size & complexity to feed into the PM prompt
    summaries = []
    for d in domain_designs:
        module = d.get("module", "Unknown Module")
        design = d.get("design", {})
        rich = design.get("raw_json", design)
        
        tables = rich.get("data_model", {}).get("tables", [])
        table_names = [t.get("table_name", "?") for t in tables]
        
        apis = rich.get("apis", [])
        api_paths = [f"{a.get('method', 'GET')} {a.get('path', '')}" for a in apis]
        
        workflows = rich.get("workflows", [])
        wf_names = [w.get("workflow_name", "?") for w in workflows]
        
        test_strat = rich.get("test_strategy", {})
        
        summary = (
            f"Module: {module}\n"
            f"- Tables ({len(tables)}): {', '.join(table_names)}\n"
            f"- API Endpoints ({len(apis)}):\n  " + "\n  ".join(api_paths[:10]) + ("\n  ... (and more)" if len(api_paths) > 10 else "") + "\n"
            f"- Workflows ({len(workflows)}): {', '.join(wf_names)}\n"
        )
        summaries.append(summary)

    modules_summary_str = "\n---\n".join(summaries)

    prompt = _PM_PROMPT.format(
        TECH_STACK=tech_stack or "Standard modern stack (Python, FastAPI, PostgreSQL, Redis)",
        DESIGN_PRINCIPLES=design_principles or "Domain-Driven Design (DDD)",
        SECURITY_PROTOCOLS=security_protocols or "Standard security protocols (JWT, TLS, RLS)",
        MODULE_DESIGNS_SUMMARY=modules_summary_str
    )

    model = get_chat_model(temperature=0.2, fast=True)
    plan_result = await invoke_with_retry_and_validation(
        model=model,
        messages=[
            SystemMessage(content=_PM_SYSTEM),
            HumanMessage(content=prompt),
        ],
        validator=validate_project_plan
    )
    
    logger.info("[pm_agent] Project plan generation complete.")
    return plan_result

import json
from langchain_core.messages import HumanMessage, SystemMessage
from services.design.helpers import get_chat_model, invoke_with_retry_and_validation
from services.design.validators import validate_test_strategy
from services.design.state import GraphState
import logging
logger = logging.getLogger(__name__)



_QA_SYSTEM = (
    "You are an SDET & Test Strategy Agent (The QA Lead).\n"
    "Your role is to design the testing strategy and generate BDD test cases for a system module.\n"
    "You are given the API design (including paths, methods, request/response bodies), the database schema, "
    "and workflows for the current module.\n"
    "Your output MUST be a valid JSON object containing exactly three keys: 'bdd_scenarios', 'test_pyramid', and 'load_testing'. "
    "Output ONLY the JSON object. Do not include markdown formatting or extra text outside the JSON."
)

_QA_PROMPT = """\
### MODULE UNDER DESIGN
{MODULE_NAME}

### DATABASE SCHEMA
{DBA_DRAFT}

### API DESIGN & WORKFLOWS
{API_DESIGN}

### TECHNICAL CONSTRAINTS & CONTEXT
{CONSTRAINTS}

### YOUR TASK
Generate a comprehensive testing strategy and BDD test cases for this module.
Output strict JSON with the following structure:
{{
  "bdd_scenarios": "Markdown string containing BDD Gherkin Scenarios (Feature, Scenario, Given, When, Then) mapping to the API workflows.",
  "test_pyramid": "Markdown string explaining the Test Pyramid Plan, detailing the breakdown for Unit, Integration, and E2E testing.",
  "load_testing": "Markdown string defining the Load Testing Strategy, including K6 or JMeter profiles and metrics for critical endpoints (e.g., 'Test POST /orders at 500 RPS')."
}}

### GUIDELINES:
1. BDD Gherkin Scenarios:
   - Must cover all API workflows and core state transitions defined in the API design.
   - Use standard Gherkin keywords: Feature, Scenario, Given, When, Then.
2. Test Pyramid Plan:
   - Breakdown unit tests (isolated component logic/validation), integration tests (API endpoints calling the database/repos), and E2E tests (flows across the whole module).
3. Load Testing Strategy:
   - Provide concrete parameters (e.g., target RPS, virtual users, duration) for critical endpoints.
   - Provide snippet example of a K6 load test script or a detailed JMeter configuration profile.
"""


async def qa_agent_node(state: GraphState) -> dict:
    """
    SDET / Test Strategy Agent (The QA Lead).
    Designs BDD scenarios, Test Pyramid plans, and Load testing profiles.
    Returns only the keys it modifies.
    """
    module = state["current_module"]
    logger.info(f"[qa_agent_node] Designing test strategy and BDD cases for '{module}'")

    from services.design.helpers import build_constraints_block
    constraints_block = build_constraints_block(
        state,
        tech_stack_template="- TECH STACK: All testing tools and scripts MUST align with {tech_stack}.\n",
        design_template="- DESIGN PATTERNS: Test structuring MUST follow {design_principles}.\n",
        security_template="- SECURITY: Test verification must ensure security protocols like {security_protocols} are satisfied.\n"
    )

    prompt = _QA_PROMPT.format(
        MODULE_NAME=module,
        DBA_DRAFT=json.dumps(state.get("dba_draft", {}), indent=2),
        API_DESIGN=json.dumps(state.get("api_design", {}), indent=2),
        CONSTRAINTS=constraints_block,
    )

    model = get_chat_model(temperature=0.05)
    test_strategy = await invoke_with_retry_and_validation(
        model=model,
        messages=[
            SystemMessage(content=_QA_SYSTEM),
            HumanMessage(content=prompt),
        ],
        validator=validate_test_strategy
    )
    logger.info(f"[qa_agent_node] Test strategy ready for '{module}'")

    return {"test_strategy": test_strategy}

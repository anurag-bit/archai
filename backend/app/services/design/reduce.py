from typing import List, Dict, Any
import re
from langchain_core.messages import HumanMessage, SystemMessage
from services.design.helpers import get_chat_model

_ARCHITECT_SYSTEM = (
    "You are a Principal Cloud Solutions Architect. "
    "Your job is to design a production-grade, highly available, and scalable system architecture "
    "based on the module summaries provided. "
    "You MUST go beyond basic CRUD APIs and design for real-world production concerns: "
    "caching, asynchronous processing, observability, security, and CI/CD."
)

_ARCHITECT_PROMPT = """\
### SYSTEM CONTEXT
The software system consists of the following {MODULE_COUNT} modules:
{MODULE_SUMMARIES}

### STRICT ARCHITECTURAL CONSTRAINTS PROVIDED BY USER
- Tech Stack: {TECH_STACK}
- Design Patterns: {DESIGN_PRINCIPLES}
- Security: {SECURITY_PROTOCOLS}

### YOUR TASK
Design the comprehensive, production-grade architecture. You MUST output a detailed Markdown document with the following distinct sections. Do not skip any section.

#### 1. High-Level Microservices Architecture Diagram
Generate a Mermaid `graph TD` flowchart showing the complete request lifecycle AND inter-service communication.
CRITICAL RULES FOR MERMAID:
- DO NOT use generic labels. You MUST use the technologies specified in the Tech Stack ({TECH_STACK}) to label the nodes (e.g., `Client[Next.js Frontend]`, `Service[Golang Microservice]`).
- **SECURITY PERIMETER:** You MUST include a Web Application Firewall (WAF) and an API Gateway node. 
- **AUTH FLOW:** Show the API Gateway validating JWTs against an Auth Service before routing to internal modules.
- Map out the specific modules generated in Phase 1 as separate nodes.
- Use solid lines (`-->`) for synchronous calls and dashed lines (`-.->`) for asynchronous/event-driven communication (Queue).

#### 2. Network Architecture & Topology Diagram (CRITICAL)
Generate a Mermaid `graph TD` flowchart specifically mapping the Network Topology.
CRITICAL RULES FOR MERMAID:
- Use `subgraph` to clearly define network boundaries.
- Create a `subgraph "Cloud Provider VPC"` containing all resources.
- Inside the VPC, create `subgraph "Public Subnets"` and `subgraph "Private Subnets"`.
- **Public Subnet:** Must contain the Load Balancer (ALB/NLB) and NAT Gateway.
- **Private Subnet:** Must contain the Application Nodes (EKS/GKE worker nodes), the Database (PostgreSQL), and the Cache/Queue (Redis/SQS).
- Show traffic flow: `Internet --> IGW --> ALB --> Private Subnet Nodes`.
- Show egress flow: `Private Subnet Nodes --> NAT Gateway --> IGW --> Internet`.
- Label nodes with specific tech (e.g., `ALB[AWS Application Load Balancer]`).

#### 3. Network Configuration & Routing
- **VPC & Subnets:** Specify the IP range strategy (e.g., 10.0.0.0/16 VPC, 10.0.1.0/24 Public, 10.0.2.0/24 Private).
- **Security Groups (SGs):** List the specific SGs and their inbound/outbound rules (e.g., `ALB-SG` allows 443 Inbound from Internet; `App-SG` allows 8080 Inbound only from `ALB-SG`; `DB-SG` allows 5432 Inbound only from `App-SG`).
- **Routing Tables:** Explain how traffic is routed (Public routes to IGW, Private routes to NAT).

#### 4. Infrastructure & Compute Layer
- Specify the containerization and hosting strategy (e.g., Docker, AWS EKS).
- Discuss auto-scaling policies based on CPU/Memory/Request count.

#### 5. Data Layer & Caching
- Specify the primary database setup (e.g., PostgreSQL with Read Replicas).
- **Caching Strategy:** Identify which specific modules/tables need caching and specify the technology and invalidation strategy.
- **Search Engine:** Propose Elasticsearch/OpenSearch if complex querying is needed.

#### 6. Asynchronous Processing & Queuing System
- **Queue Technology:** Recommend RabbitMQ, AWS SQS, or Apache Kafka.
- **Event-Driven Workflows:** List at least 3 cross-module workflows that must be asynchronous.
- **Background Workers:** Specify how workers consume these queues.

#### 7. Security & Compliance Architecture (CRITICAL)
You MUST explicitly address how the system enforces the user's specific security protocols: {SECURITY_PROTOCOLS}.
- **Network Security:** WAF rules (SQLi, XSS), DDoS protection (AWS Shield).
- **Application Security:** Rate Limiting (Redis-backed at API Gateway), Backend Only Abstraction.
- **Identity & Access Management (IAM):** Detail the RBAC implementation. How are JWT tokens issued, validated, and scoped?
- **Data Security:** Encryption at rest (KMS) and in transit (TLS 1.3). Column-level encryption for PII.

#### 8. Threat Model & Mitigations (STRIDE)
Provide a Markdown table mapping the STRIDE threat model to specific architectural mitigations:
| Threat Type | Example Scenario | Architectural Mitigation |
|---|---|---|
| Spoofing | ... | ... |
| Tampering | ... | ... |
| Repudiation | ... | ... |
| Information Disclosure | ... | ... |
| Denial of Service | ... | ... |
| Elevation of Privilege | ... | ... |

#### 9. Observability (Logging, Monitoring, Tracing)
- **Centralized Logging:** Propose ELK/Datadog. Specify that auth failures and rate-limit hits MUST be logged.
- **Metrics & Monitoring:** Prometheus/Grafana alerting thresholds.
- **Distributed Tracing:** Jaeger/OpenTelemetry for tracing requests across microservices.

#### 10. CI/CD Pipeline
- Propose a GitOps workflow (GitHub Actions / GitLab CI).
- Pipeline stages: Lint -> Test -> Build Docker Image -> Deploy to Staging -> Integration Tests -> Production Deploy.
- Discuss database migration strategies (e.g., Alembic zero-downtime migrations).
"""

async def generate_terraform_code(architecture_markdown: str) -> str:
    """Translate system architecture design into valid, runnable AWS Terraform main.tf code."""
    model = get_chat_model(temperature=0.1)
    prompt = (
        "You are an expert Cloud Infrastructure Engineer and Terraform specialist.\n"
        "Convert this architecture into a valid Terraform main.tf file using AWS provider modules.\n"
        "Output ONLY valid Terraform HCL code. Do NOT wrap it in any explanations.\n\n"
        f"### ARCHITECTURE SPECIFICATION:\n{architecture_markdown}"
    )
    response = await model.ainvoke([
        SystemMessage(content="You are a DevOps engineer writing Terraform code. Only return valid Terraform HCL code. Do not include markdown wraps or explanations."),
        HumanMessage(content=prompt)
    ])
    content = response.content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```[a-zA-Z]*\n", "", content)
        content = re.sub(r"\n```$", "", content)
    return content.strip()

async def generate_openapi_spec(domain_designs: List[Dict[str, Any]]) -> str:
    """Generate a single valid OpenAPI 3.0.0 YAML specification combining all modules' API endpoints."""
    api_summaries = []
    for d in domain_designs:
        module = d.get("module", "?")
        design = d.get("design", {})
        rich = design.get("raw_json", design)
        apis = rich.get("apis", [])
        for api in apis:
            api_summaries.append(
                f"Module: {module} | Method: {api.get('method')} | Path: {api.get('path')} | Description: {api.get('description')}"
            )
    
    if not api_summaries:
        for d in domain_designs:
            module = d.get("module", "?")
            design = d.get("design", {})
            eps = design.get("api_endpoints", [])
            for ep in eps:
                api_summaries.append(f"Module: {module} | Endpoint: {ep}")

    model = get_chat_model(temperature=0.1)
    prompt = (
        "You are an expert API Architect.\n"
        "Generate a valid OpenAPI 3.0.0 spec in YAML format combining the following API endpoints from all modules.\n"
        "Ensure the paths, methods, descriptions, and basic parameters (e.g. {id}) are correctly structured.\n"
        "Output ONLY valid YAML. Do NOT wrap in explanations or markdown backticks.\n\n"
        f"### API ENDPOINTS:\n" + "\n".join(api_summaries)
    )
    
    response = await model.ainvoke([
        SystemMessage(content="You are an API design tool. Only return valid OpenAPI 3.0 YAML spec. Do not include markdown wraps or explanations."),
        HumanMessage(content=prompt)
    ])
    content = response.content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```[a-zA-Z]*\n", "", content)
        content = re.sub(r"\n```$", "", content)
    return content.strip()

async def generate_global_architecture(
    domain_designs: List[Dict[str, Any]],
    tech_stack: str = "",
    design_principles: str = "",
    security_protocols: str = ""
) -> Dict[str, Any]:
    """Combine all module designs into a cohesive, production-grade architecture."""
    parts = []
    for d in domain_designs:
        module = d.get("module", "?")
        design = d.get("design", {})
        rich   = design.get("raw_json", design)
        if "data_model" in rich:
            table_names    = ", ".join(t["table_name"] for t in rich["data_model"].get("tables", []))
            api_count      = len(rich.get("apis", []))
            parts.append(
                f"- {module}: {api_count} endpoints, tables: [{table_names}]"
            )
        else:
            parts.append(f"- {module}: {len(design.get('api_endpoints', []))} endpoints")

    model = get_chat_model(temperature=0.2)
    response = await model.ainvoke([
        SystemMessage(content=_ARCHITECT_SYSTEM),
        HumanMessage(content=_ARCHITECT_PROMPT.format(
            MODULE_COUNT=len(domain_designs),
            MODULE_SUMMARIES="\n".join(parts),
            TECH_STACK=tech_stack or "Standard modern stack (Python, PostgreSQL, Redis)",
            DESIGN_PRINCIPLES=design_principles or "Standard microservices/domain-driven design",
            SECURITY_PROTOCOLS=security_protocols or "Standard security protocols (TLS, RBAC, Encryption at Rest)"
        )),
    ])
    
    arch_markdown = response.content.strip()
    terraform_code = await generate_terraform_code(arch_markdown)
    openapi_spec = await generate_openapi_spec(domain_designs)
    
    return {
        "architecture_markdown": arch_markdown, 
        "terraform_code": terraform_code,
        "openapi_spec": openapi_spec,
        "module_count": len(domain_designs)
    }

from typing import List, Dict, Any
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
Design the comprehensive production architecture. You MUST output a detailed Markdown document with the following distinct sections. Do not skip any section.

#### 1. High-Level Microservices Architecture Diagram
Generate a Mermaid `graph TD` flowchart showing the complete request lifecycle AND inter-service communication.
CRITICAL RULES FOR MERMAID:
- DO NOT use a single generic "Microservices" block. 
- Map out the specific modules generated in Phase 1 as separate nodes.
- If a User/Auth module exists, show the API Gateway delegating authentication to it before routing to core modules (e.g., API_Gateway -->|Validate JWT| Auth_Module).
- Show the API Gateway routing requests to the specific modules.
- Use solid lines (`-->`) for synchronous calls (Client -> Gateway -> Module -> Database).
- Use dashed lines (`-.->`) for asynchronous/event-driven communication.
- Include nodes for: Client, API Gateway, Auth_Module, other individual Modules, PostgreSQL, Redis Cache, and the Message Queue.

#### 2. Infrastructure & Compute Layer
- Specify the containerization strategy (e.g., Docker, Kubernetes, ECS).
- Specify how the application is hosted (e.g., AWS App Runner, GKE, EKS).
- Discuss auto-scaling policies based on CPU/Memory/Request count.

#### 3. Data Layer & Caching
- Specify the primary database setup (e.g., PostgreSQL with Read Replicas).
- **Caching Strategy:** Identify which specific modules/tables need caching and specify the caching technology (Redis/Memcached) and invalidation strategy.
- **Search Engine:** If the system requires complex querying, propose Elasticsearch or OpenSearch.

#### 4. Asynchronous Processing & Queuing System
Identify long-running or background tasks and map them to a Message Queue architecture:
- **Queue Technology:** Recommend RabbitMQ, AWS SQS, or Apache Kafka.
- **Event-Driven Workflows:** List at least 3 cross-module workflows that must be asynchronous (e.g., "When Order is placed -> Queue event -> Inventory updates -> Invoice generates").
- **Background Workers:** Specify how workers consume these queues.

#### 5. Observability (Logging, Monitoring, Tracing)
- **Centralized Logging:** Propose an ELK stack or Datadog. Specify exactly what must be logged.
- **Metrics & Monitoring:** Propose Prometheus and Grafana. Specify the alerting thresholds.
- **Distributed Tracing:** Propose Jaeger or OpenTelemetry to trace requests across microservices.

#### 6. Security Layer
- **Network Security:** VPC setup, Private Subnets for DB/Queues, Public Subnets for Load Balancers.
- **Application Security:** How API Gateway handles Rate Limiting and JWT validation.
- **Data Security:** Encryption at rest (KMS) and in transit (TLS 1.3). How PII is encrypted at the column level.

#### 7. CI/CD Pipeline
- Propose a GitOps workflow (GitHub Actions / GitLab CI).
- Specify the pipeline stages: Lint -> Test -> Build Docker Image -> Deploy to Staging -> Integration Tests -> Production Deploy.
- Discuss database migration strategies (e.g., Alembic zero-downtime migrations).
"""

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
    
    return {
        "architecture_markdown": response.content.strip(), 
        "module_count": len(domain_designs)
    }

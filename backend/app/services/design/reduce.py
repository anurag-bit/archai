from typing import List, Dict, Any
import asyncio
import re
from langchain_core.messages import HumanMessage, SystemMessage
from services.design.helpers import get_chat_model, invoke_with_retry_and_validation
from services.design.validators import validate_devops_artifacts

_ARCHITECT_SYSTEM = (
    "You are a Principal Cloud Solutions Architect. "
    "Your job is to design a production-grade, highly available, and scalable system architecture "
    "based on the module summaries provided. "
    "You MUST go beyond basic CRUD APIs and design for real-world production concerns: "
    "caching, asynchronous processing, observability, security, and CI/CD. "
    "CRITICAL: You must use back-of-the-envelope calculations to justify your architecture decisions."
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

#### 0. Capacity Planning & Architecture Decision (CRITICAL)
Before designing the architecture, perform back-of-the-envelope calculations based on the SRS context. 
- **User Base:** Estimate Daily Active Users (DAU) and Peak Concurrent Users. State your assumptions.
- **Traffic Estimation:** Calculate Peak Requests Per Second (RPS). (Assume a user makes 10-20 requests/day, peak traffic = 2x average). Identify Read:Write ratio (e.g., 80:20).
- **Storage Estimation:** Estimate data generated per user/object. Calculate 1-year and 3-year storage requirements.
- **Network Bandwidth:** Estimate peak bandwidth in Gbps based on RPS and average payload size.
- **Architecture Decision:** Based on the calculated scale, complexity, and domain boundaries, explicitly state whether a **Monolithic**, **Modular Monolith**, or **Microservices** architecture is the best fit. 
  - If RPS < 500 and team is small, strongly consider Modular Monolith.
  - If RPS > 5000 or domains have vastly different scaling needs, use Microservices.
  - Provide a 2-sentence rationale for your choice.

#### 1. High-Level System Architecture Diagram
Generate a Mermaid `graph TD` flowchart showing the complete request lifecycle AND inter-service communication.
CRITICAL RULES FOR MERMAID:
- DO NOT use generic labels. You MUST use the technologies specified in the Tech Stack ({TECH_STACK}) to label the nodes.
- **SECURITY PERIMETER:** You MUST include a Web Application Firewall ({WAF_NAME}) and an API Gateway node. 
- **AUTH FLOW:** Show the API Gateway validating JWTs against an Auth Service before routing to internal modules.
- Map out the specific modules generated in Phase 1 as separate nodes (if Microservices) or as internal modules (if Monolith).
- Use solid lines (`-->`) for synchronous calls and dashed lines (`-.->`) for asynchronous/event-driven communication (Queue).
- CRITICAL MERMAID SAFETY RULES: ALWAYS wrap node text labels in double quotes. Example: `Client["Next.js Frontend App"]`. ALWAYS define subgraphs with an ID and a quoted title. Example: `subgraph VPC["Cloud Provider VPC"]`.

#### 2. Network Architecture & Topology Diagram (CRITICAL)
Generate a Mermaid `graph TD` flowchart specifically mapping the Network Topology.
CRITICAL RULES FOR MERMAID:
- Use `subgraph` to clearly define network boundaries.
- Create a `subgraph VPC["{VPC_NAME}"]` containing all resources.
- Inside the network subnet structure, create `subgraph PubSub["Public Subnets"]` and `subgraph PrivSub["Private Subnets"]`.
- **Public Subnet:** Must contain the {LB_NAME} and {NAT_NAME}.
- **Private Subnet:** Must contain the Application Nodes ({COMPUTE_LABEL}), the Database (PostgreSQL), and the Cache/Queue (Redis/{QUEUE_TECH}).
- Show traffic flow: `Internet --> {IGW_NAME} --> {FLOW_LB} --> Private Subnet Nodes`.
- Show egress flow: `Private Subnet Nodes --> {NAT_NAME} --> {IGW_NAME} --> Internet`.
- Label nodes with specific tech (e.g., `{LB_LABEL}`).

#### 3. Network Configuration & Routing
- **VPC & Subnets:** Specify the IP range strategy (e.g., 10.0.0.0/16 VPC, 10.0.1.0/24 Public, 10.0.2.0/24 Private).
- **Security & Firewall Rules ({SG_LABEL}):** List the specific rules and their inbound/outbound setup.
- **Routing Tables:** Explain how traffic is routed (Public routes to {IGW_NAME}, Private routes to {NAT_NAME}).

#### 4. Infrastructure & Compute Layer
- Specify the containerization and hosting strategy (e.g., Docker, {HOSTING_STRATEGY}).
- Discuss auto-scaling policies based on the RPS calculated in Section 0.

#### 5. Data Layer & Caching
- Specify the primary database setup (e.g., PostgreSQL with Read Replicas if Read QPS is high).
- **Caching Strategy:** Identify which specific modules/tables need caching and specify the technology and invalidation strategy.
- **Search Engine:** Propose Elasticsearch/OpenSearch if complex querying is needed.

#### 6. Asynchronous Processing & Queuing System
- **Queue Technology:** Recommend RabbitMQ, {QUEUE_TECH}, or Apache Kafka.
- **Event-Driven Workflows:** List at least 3 cross-module workflows that must be asynchronous.
- **Background Workers:** Specify how workers consume these queues.

#### 7. Security & Compliance Architecture (CRITICAL)
You MUST explicitly address how the system enforces the user's specific security protocols: {SECURITY_PROTOCOLS}.
- **Network Security:** WAF rules (SQLi, XSS), DDoS protection ({SHIELD_NAME}).
- **Application Security:** Rate Limiting (Redis-backed at API Gateway), Backend Only Abstraction.
- **Identity & Access Management (IAM):** Detail the RBAC implementation.
- **Data Security:** Encryption at rest ({KMS_NAME}) and in transit (TLS 1.3). Column-level encryption for PII.

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
- **Metrics & Monitoring:** Prometheus/Grafana alerting thresholds based on RPS.
- **Distributed Tracing:** Jaeger/OpenTelemetry for tracing requests across services.

#### 10. CI/CD Pipeline
- Propose a GitOps workflow (GitHub Actions / GitLab CI).
- Pipeline stages: Lint -> Test -> Build Docker Image -> Deploy to Staging -> Integration Tests -> Production Deploy.
- Discuss database migration strategies (e.g., Alembic zero-downtime migrations).
"""


def detect_cloud_provider(tech_stack: str) -> str:
    lower = tech_stack.lower() if tech_stack else ""
    if "gcp" in lower or "google cloud" in lower:
        return "gcp"
    elif "azure" in lower or "microsoft azure" in lower:
        return "azure"
    else:
        return "aws"  # Default fallback


def get_cloud_specific_terms(provider: str) -> dict:
    if provider == "gcp":
        return {
            "vpc": "Cloud Provider VPC Network (Google Cloud)",
            "load_balancer": "Cloud Load Balancing",
            "nat_gateway": "Cloud NAT",
            "internet_gateway": "Cloud Router / Internet Gateway",
            "compute_label": "Google Kubernetes Engine (GKE) worker nodes",
            "lb_label": "GLB[GCP Cloud Load Balancer]",
            "flow_lb": "GLB",
            "shield": "Google Cloud Armor (DDoS Protection)",
            "waf": "Cloud Armor",
            "sg_label": "VPC Firewall Rules",
            "hosting_strategy": "Google Kubernetes Engine (GKE)",
            "queue_tech": "Cloud Pub/Sub",
            "kms_name": "Cloud KMS",
        }
    elif provider == "azure":
        return {
            "vpc": "Cloud Provider Virtual Network (Azure VNet)",
            "load_balancer": "Azure Application Gateway / Load Balancer",
            "nat_gateway": "Azure NAT Gateway",
            "internet_gateway": "Azure Edge Internet Access",
            "compute_label": "Azure Kubernetes Service (AKS) agent nodes",
            "lb_label": "ALB[Azure Application Gateway]",
            "flow_lb": "ALB",
            "shield": "Azure DDoS Protection Plan",
            "waf": "Azure WAF",
            "sg_label": "Network Security Groups (NSGs)",
            "hosting_strategy": "Azure Kubernetes Service (AKS)",
            "queue_tech": "Service Bus Queue",
            "kms_name": "Azure Key Vault",
        }
    else:
        # Default: AWS
        return {
            "vpc": "Cloud Provider VPC (AWS VPC)",
            "load_balancer": "Application Load Balancer (ALB)",
            "nat_gateway": "NAT Gateway",
            "internet_gateway": "Internet Gateway (IGW)",
            "compute_label": "AWS EKS worker nodes",
            "lb_label": "ALB[AWS Application Load Balancer]",
            "flow_lb": "ALB",
            "shield": "AWS Shield (DDoS Protection)",
            "waf": "AWS WAF",
            "sg_label": "Security Groups (SGs)",
            "hosting_strategy": "AWS EKS",
            "queue_tech": "AWS SQS",
            "kms_name": "AWS KMS",
        }


def validate_and_format_terraform_code(hcl_content: str) -> str:
    """
    Validates and formats Terraform code using a sandboxed Docker container.
    Returns:
        - If valid: formatted HCL code
        - If invalid: HCL code prepended with clear validation errors
    """
    import os
    import uuid
    import shutil
    import subprocess
    import json

    current_dir = os.path.dirname(os.path.abspath(__file__))
    tf_temp_dir = os.path.join(current_dir, ".tf_temp")
    os.makedirs(tf_temp_dir, exist_ok=True)
    
    run_id = str(uuid.uuid4())
    run_dir = os.path.join(tf_temp_dir, run_id)
    os.makedirs(run_dir, exist_ok=True)
    
    main_tf_path = os.path.join(run_dir, "main.tf")
    with open(main_tf_path, "w", encoding="utf-8") as f:
        f.write(hcl_content)
        
    try:
        # 1. Run terraform init
        init_cmd = [
            "docker", "run", "--rm",
            "-v", f"{run_dir}:/workspace",
            "-w", "/workspace",
            "hashicorp/terraform:1.9.8",
            "init", "-backend=false"
        ]
        init_res = subprocess.run(init_cmd, capture_output=True, text=True, timeout=60)
        
        # 2. Run terraform fmt -check
        fmt_check_cmd = [
            "docker", "run", "--rm",
            "-v", f"{run_dir}:/workspace",
            "-w", "/workspace",
            "hashicorp/terraform:1.9.8",
            "fmt", "-check"
        ]
        fmt_check_res = subprocess.run(fmt_check_cmd, capture_output=True, text=True, timeout=30)
        
        if fmt_check_res.returncode != 0:
            # Code is not formatted correctly, let's run terraform fmt to auto-format it!
            fmt_cmd = [
                "docker", "run", "--rm",
                "-v", f"{run_dir}:/workspace",
                "-w", "/workspace",
                "hashicorp/terraform:1.9.8",
                "fmt"
            ]
            subprocess.run(fmt_cmd, capture_output=True, text=True, timeout=30)
            
        # Read the formatted (or original if fmt failed) HCL content back
        with open(main_tf_path, "r", encoding="utf-8") as f:
            formatted_content = f.read()
            
        # 3. Run terraform validate -json
        validate_cmd = [
            "docker", "run", "--rm",
            "-v", f"{run_dir}:/workspace",
            "-w", "/workspace",
            "hashicorp/terraform:1.9.8",
            "validate", "-json"
        ]
        validate_res = subprocess.run(validate_cmd, capture_output=True, text=True, timeout=30)
        
        # Parse the validation JSON output
        try:
            val_data = json.loads(validate_res.stdout.strip())
            is_valid = val_data.get("valid", False)
            diagnostics = val_data.get("diagnostics", [])
        except Exception:
            is_valid = (validate_res.returncode == 0)
            diagnostics = []
            
        if not is_valid:
            error_msgs = []
            if diagnostics:
                for diag in diagnostics:
                    severity = diag.get("severity", "error").upper()
                    summary = diag.get("summary", "Unknown Error")
                    detail = diag.get("detail", "")
                    line_num = diag.get("range", {}).get("start", {}).get("line", "?")
                    error_msgs.append(f"- [{severity}] Line {line_num}: {summary}\n  Details: {detail}")
            else:
                stderr_clean = validate_res.stderr.strip() or validate_res.stdout.strip()
                if stderr_clean:
                    error_msgs.append(stderr_clean)
                else:
                    error_msgs.append("Unknown validation failure.")
                    
            errors_str = "\n".join(error_msgs)
            
            warning_banner = (
                "/*\n"
                "========================================================================\n"
                "⚠️ WARNING: TERRAFORM VALIDATION FAILED!\n"
                "========================================================================\n"
                "The generated HCL code contains syntax or semantic errors.\n"
                "Please review the errors below:\n\n"
                f"{errors_str}\n"
                "========================================================================\n"
                "*/\n\n"
            )
            return warning_banner + formatted_content
            
        return formatted_content
        
    except subprocess.TimeoutExpired as te:
        return f"/*\n⚠️ Validation Timeout: Terraform validation timed out ({te.timeout}s).\n*/\n\n" + hcl_content
    except Exception as e:
        return f"/*\n⚠️ Validation Helper Error: Failed to run validation ({str(e)}).\n*/\n\n" + hcl_content
    finally:
        # Clean up temporary run directory
        try:
            shutil.rmtree(run_dir)
        except Exception:
            pass


async def generate_terraform_code(architecture_markdown: str, provider: str = "aws") -> str:
    """Translate system architecture design into valid, runnable Terraform main.tf code for the target provider."""
    model = get_chat_model(temperature=0.1, fast=True)
    prompt = (
        "You are an expert Cloud Infrastructure Engineer and Terraform specialist.\n"
        f"Convert this architecture into a valid Terraform main.tf file using {provider.upper()} provider modules.\n"
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
    
    hcl_content = content.strip()
    validated_content = await asyncio.to_thread(validate_and_format_terraform_code, hcl_content)
    return validated_content


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

    model = get_chat_model(temperature=0.1, fast=True)
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
    content = content.strip()
    
    import yaml
    try:
        yaml.safe_load(content)
    except yaml.YAMLError as e:
        content = f"# ⚠️ Invalid OpenAPI YAML: {e}\n\n{content}"
        
    return content


_DEVOPS_SYSTEM = (
    "You are an expert DevOps and Release Engineer.\n"
    "Your job is to generate production-grade deployment configurations and CI/CD pipelines.\n"
    "Based on the tech stack and the system architecture, you must generate a single JSON document structure containing:\n"
    "1. dockerfile: A production-grade multi-stage Dockerfile.\n"
    "2. docker_compose: A docker-compose.yml file for local development including DB, Redis, and App services.\n"
    "3. ci_cd_pipeline: GitHub Actions or GitLab CI YAML pipeline (Lint -> Test -> Build -> Deploy).\n"
    "4. k8s_config: Kubernetes Deployment and Service YAML configurations (or a Helm Chart structure).\n"
    "Output ONLY a valid JSON object containing these four keys: 'dockerfile', 'docker_compose', 'ci_cd_pipeline', 'k8s_config'."
)

_DEVOPS_PROMPT = """\
### TECH STACK
{TECH_STACK}

### SYSTEM ARCHITECTURE
{ARCHITECTURE_MARKDOWN}

### YOUR TASK
Generate the release/deployment configurations and pipeline structure for this system.
Output strict JSON with the following structure:
{{
  "dockerfile": "Multi-stage Dockerfile code...",
  "docker_compose": "docker-compose.yml configuration code...",
  "ci_cd_pipeline": "GitHub Actions or GitLab CI YAML configuration...",
  "k8s_config": "Kubernetes Deployment & Service YAML configuration or Helm chart breakdown..."
}}

### GUIDELINES:
1. Dockerfile:
   - Use multi-stage builds to optimize size and security (e.g., build stage and runner stage with minimal base images).
   - Follow best practices: non-root user, proper directories, cache package installations.
2. Docker Compose:
   - Define services for the app container, database (matching tech stack, e.g., Postgres), cache/queue (e.g., Redis/RabbitMQ), and configure ports and environment variables.
3. CI/CD Pipeline:
   - Create a clean workflow with stages: Lint (code format checks), Test (run tests), Build (build and push docker images), and Deploy (deployment template to staging/production).
4. Kubernetes Config:
   - Provide clean Deployment and Service resources. Include resource limits, readiness/liveness probes, env variables, and cluster IP / LoadBalancer services.
"""


async def generate_devops_pipeline(tech_stack: str, architecture_markdown: str) -> dict:
    """Generate DevOps deployment artifacts (Dockerfile, Docker Compose, CI/CD, Kubernetes)."""
    model = get_chat_model(temperature=0.1, fast=True)
    prompt = _DEVOPS_PROMPT.format(
        TECH_STACK=tech_stack,
        ARCHITECTURE_MARKDOWN=architecture_markdown
    )
    devops = await invoke_with_retry_and_validation(
        model=model,
        messages=[
            SystemMessage(content=_DEVOPS_SYSTEM),
            HumanMessage(content=prompt),
        ],
        validator=validate_devops_artifacts
    )
    return devops


async def generate_global_architecture(
    domain_designs: List[Dict[str, Any]],
    tech_stack: str = "",
    design_principles: str = "",
    security_protocols: str = "",
    cloud_provider: str = "aws",
    refinement_instruction: str = ""  # Make sure this is here if you added it from the previous step
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
            parts.append(f"- {module}: {api_count} endpoints, tables: [{table_names}]")
        else:
            parts.append(f"- {module}: {len(design.get('api_endpoints', []))} endpoints")

    provider = (cloud_provider or "").lower().strip()
    if provider not in ("aws", "gcp", "azure"):
        provider = detect_cloud_provider(tech_stack)
    terms = get_cloud_specific_terms(provider)

    model = get_chat_model(temperature=0.2)
    
    # Format prompt with BotE parameters
    arch_prompt_content = _ARCHITECT_PROMPT.format(
        MODULE_COUNT=len(domain_designs),
        MODULE_SUMMARIES="\n".join(parts),
        TECH_STACK=tech_stack or f"Standard modern stack (Python, PostgreSQL, Redis) running on {provider.upper()}",
        DESIGN_PRINCIPLES=design_principles or "Standard microservices/domain-driven design",
        SECURITY_PROTOCOLS=security_protocols or "Standard security protocols (TLS, RBAC, Encryption at Rest)",
        VPC_NAME=terms["vpc"],
        LB_NAME=terms["load_balancer"],
        NAT_NAME=terms["nat_gateway"],
        IGW_NAME=terms["internet_gateway"],
        COMPUTE_LABEL=terms["compute_label"],
        LB_LABEL=terms["lb_label"],
        FLOW_LB=terms["flow_lb"],
        SHIELD_NAME=terms["shield"],
        WAF_NAME=terms["waf"],
        SG_LABEL=terms["sg_label"],
        HOSTING_STRATEGY=terms["hosting_strategy"],
        QUEUE_TECH=terms["queue_tech"],
        KMS_NAME=terms["kms_name"]
    )

    # Append refinement instruction if provided
    if refinement_instruction:
        arch_prompt_content += f"\n\n### HUMAN REFINEMENT INSTRUCTION (CRITICAL)\n{refinement_instruction}\n"
    
    # 1. Create async tasks
    arch_task = asyncio.create_task(model.ainvoke([
        SystemMessage(content=_ARCHITECT_SYSTEM),
        HumanMessage(content=arch_prompt_content)
    ]))
    
    if not refinement_instruction:
        openapi_task = asyncio.create_task(generate_openapi_spec(domain_designs))
        arch_response, openapi_spec = await asyncio.gather(arch_task, openapi_task)
    else:
        arch_response = await arch_task
        openapi_spec = None

    arch_markdown = arch_response.content.strip()
    
    # 3. Kick off Terraform and DevOps in parallel
    terraform_task = asyncio.create_task(generate_terraform_code(arch_markdown, provider))
    devops_task = asyncio.create_task(generate_devops_pipeline(
        tech_stack=tech_stack or f"Standard modern stack (Python, PostgreSQL, Redis) running on {provider.upper()}",
        architecture_markdown=arch_markdown
    ))

    terraform_code, devops_artifacts = await asyncio.gather(terraform_task, devops_task)
    
    return {
        "architecture_markdown": arch_markdown, 
        "terraform_code": terraform_code,
        "openapi_spec": openapi_spec,
        "devops_artifacts": devops_artifacts,
        "module_count": len(domain_designs)
    }

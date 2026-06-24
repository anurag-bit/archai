# Archai 🌟

**Archai** is an agentic AI system design workspace that transforms product requirement briefs (PRDs) or Software Requirement Specifications (SRSs) into production-grade system architectures, database schemas, API specs, and Infrastructure as Code (IaC) instantly.

It leverages an OpenAI-backed parallel Multi-Agent System (MAS) orchestrated via **LangGraph**, combined with **ChromaDB** for local vector search (RAG) and interactive Human-in-the-Loop (HITL) schema refinement.

---

## 🏗️ Architecture & Pipeline Flow

Archai splits the architecture generation into two major phases: **Parallel Map (Module Level)** and **Reduce (Global Level)**.

```mermaid
graph TD
    A[Upload SRS / PRD & Constraints] --> B[Local Document Indexer]
    B --> C[(Chroma DB)]
    A --> D[Module Extractor]
    D -->|Parallel Jobs| E[LangGraph MAS Module workflow]
    
    subgraph LangGraph MAS Workflow (Per Module)
        E --> F[Fetch Context from Chroma]
        F --> G[DBA Agent: Draft Database Schema]
        G --> H[QA Agent: Audit Schema & Constraints]
        H -->|Fail & Max Retries| I[HITL: Human-in-the-Loop Interruption]
        I -->|Developer Instruction| G
        H -->|Pass / QA Approved| J[API Agent: Design REST Endpoints]
        J --> K[LLD Agent: Generate ERD & Component Diagrams]
        K --> L[Save Module Design]
    end
    
    L --> M[Reduce Phase: Global Architecture Synthesizer]
    M --> N[Output Panel]
    
    subgraph Output Specs
        N --> O[Global System Architecture Markdown]
        N --> P[OpenAPI 3.0 Specs]
        N --> Q[Terraform IaC Code]
        N --> R[SQL DDL & ER Diagrams]
    end
```

---

## ✨ Key Features

- **Semantic Document Indexing (RAG)**: Automatically chunks and indexes uploaded documents (PDFs, text) locally using `BAAI/bge-small-en-v1.5` embeddings and ChromaDB.
- **Parallel Multi-Agent Orchestration**: LangGraph coordinates multiple Specialized Agents running concurrently for each system module:
  - 🗄️ **DBA Agent**: Normalizes database tables, columns, indexes, and constraints.
  - 🔍 **QA Agent**: Audits module database schemas against system design principles.
  - 🛑 **Human-in-the-Loop Interruption**: If compliance fails repeatedly, execution pauses, enabling developers to feed manual instructions directly from the UI.
  - 🌐 **API Agent**: Maps REST endpoints and complex multi-state workflows.
  - 📊 **LLD Agent**: Generates Level-1 Data Flow Diagrams (DFD) and Low-Level Component Diagrams in Mermaid syntax.
- **Global Synthesis (Reduce)**: Automatically merges independent modules into an integrated system architecture document, a single OpenAPI 3.0 specification, and Terraform configuration files.
- **Interactive Workspace & Schema Editor**:
  - Live preview of service flows and components.
  - Direct patching/editing of database schema tables from the UI with auto-regenerated ER diagrams and APIs.
  - Real-time chat console over the ingested SRS document context.

---

## 📁 Repository Structure

```text
archai/
├── archai/               # Next.js Frontend
│   ├── src/
│   │   ├── app/          # App Router (pages & proxy endpoints)
│   │   └── components/   # Modular React Components
│   └── package.json
└── backend/              # FastAPI Backend
    ├── app/
    │   ├── core/         # Config and Settings
    │   ├── routes/       # API endpoints (design, chat, search, ingest)
    │   ├── schemas/      # Pydantic data schemas
    │   └── services/     # LangGraph workflows, vector store & embeddings
    └── requirements.txt
```

---

## 🛠️ Prerequisites

Make sure you have the following installed:
- **Node.js** (v18.x or higher)
- **Python** (v3.10 or higher)
- **pnpm** (or npm / yarn)
- **Chroma DB** (running locally on port 8000)

---

## 🚀 Getting Started

### 1. Run Chroma DB
You can spin up Chroma DB using Docker:
```bash
docker run -d -p 8000:8000 chromadb/chroma
```
Or run it locally if you have Chroma installed via python:
```bash
chroma run --host 127.0.0.1 --port 8000
```

### 2. Set Up the Backend
1. Navigate to the `backend/` directory.
2. Create a virtual environment and activate it:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows use `venv\Scripts\activate`
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file in the `backend/` directory:
   ```env
   OPENAI_API_KEY=your_openai_api_key
   OPENAI_MODEL=gpt-4o-mini
   CHROMA_HOST=127.0.0.1
   CHROMA_PORT=8000
   ```
5. Run the FastAPI development server:

   You can start the backend by executing the entry point python file:
   ```bash
   python app/main.py
   ```
   
   Alternatively, you can run it directly using Uvicorn:
   ```bash
   uvicorn app.main:app --host 127.0.0.1 --port 8080 --reload
   ```

6. Verify that the backend is running correctly:
   - Check the health status at `http://127.0.0.1:8080/api/health` (it should return `{"status":"ok","service":"archai-backend"}`).
   - View the interactive Swagger API documentation at `http://127.0.0.1:8080/docs`.

### 3. Set Up the Frontend
1. Navigate to the `archai/` directory.
2. Install dependencies:
   ```bash
   pnpm install
   # or: npm install
   ```
3. Create a `.env` file in the `archai/` directory:
   ```env
   GEMINI_API_KEY=your_gemini_api_key
   NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8080
   ```
4. Start the Next.js development server:
   ```bash
   pnpm dev
   # or: npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 💡 Technologies Used

### Frontend
- **Framework**: Next.js 16 (App Router), React 19
- **Styling**: Tailwind CSS v4, PostCSS
- **Markdown & Highlighting**: React Markdown, Rehype Highlight, Remark GFM
- **Diagrams**: Mermaid.js (for ERDs, component maps, and DFDs)

### Backend
- **Framework**: FastAPI (Python)
- **Agent Orchestration**: LangGraph, LangChain
- **LLM Integrations**: OpenAI GPT models
- **Vector DB**: ChromaDB
- **Embeddings**: BAAI/bge-small-en-v1.5 (run locally via HuggingFace Sentence Transformers)
- **PDF Extraction**: PyPDF

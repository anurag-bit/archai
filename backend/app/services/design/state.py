from typing import List, Dict, Any, Optional
from typing_extensions import TypedDict

class GraphState(TypedDict):
    # inputs
    normalized_text: str          # full SRS text (normalised)
    document_id:     str          # SHA-256 fingerprint of doc
    request_id:      str          # UUID for this run (ties Chroma records)

    # module iteration
    modules:         List[str]    # all modules extracted in Phase 0
    module_index:    int          # current position in `modules`

    # per-module working state
    current_module:  str          # name of the module being processed
    module_context:  str          # Chroma-retrieved context for current module
    module_chunks:   List[Dict[str, Any]]  # raw chunks for this module

    dba_draft:       Dict[str, Any]        # JSON output from DBA agent
    qa_feedback:     str                   # "PASS" or structured feedback text
    qa_retries:      int                   # retry counter for QA->DBA loop

    api_design:      Dict[str, Any]        # JSON output from API agent
    lld_design:      Dict[str, Any]        # JSON output containing LLD/DFD diagrams
    frontend_design: Dict[str, Any]        # JSON output containing frontend architecture design
    test_strategy:   Dict[str, Any]        # JSON output containing BDD, Test Pyramid, Load testing

    # accumulator
    domain_designs:  List[Dict[str, Any]]  # finished per-module designs

    # architecture constraints
    tech_stack:          str   # e.g. "PostgreSQL, FastAPI, Redis"
    design_principles:   str   # e.g. "CQRS, Event Sourcing"
    security_protocols:  str   # e.g. "Row-Level Security, AES-256 at rest"
    open_questions_answers: str # user responses to open questions


class ModuleGraphState(TypedDict):
    # inputs
    normalized_text: str          # full SRS text (normalised)
    document_id:     str          # SHA-256 fingerprint of doc
    request_id:      str          # UUID for this run (ties Chroma records)

    # working state
    current_module:  str          # name of the module being processed
    module_context:  str          # Chroma-retrieved context for current module
    module_chunks:   List[Dict[str, Any]]  # raw chunks for this module

    dba_draft:       Dict[str, Any]        # JSON output from DBA agent
    qa_feedback:     str                   # "PASS" or structured feedback text
    qa_retries:      int                   # retry counter for QA->DBA loop

    api_design:      Dict[str, Any]        # JSON output from API agent
    lld_design:      Dict[str, Any]        # JSON output containing LLD/DFD diagrams
    frontend_design: Dict[str, Any]        # JSON output containing frontend architecture design
    test_strategy:   Dict[str, Any]        # JSON output containing BDD, Test Pyramid, Load testing

    # output
    module_design:   Optional[Dict[str, Any]]  # final design for this module

    # architecture constraints
    tech_stack:          str   # e.g. "PostgreSQL, FastAPI, Redis"
    design_principles:   str   # e.g. "CQRS, Event Sourcing"
    security_protocols:  str   # e.g. "Row-Level Security, AES-256 at rest"
    open_questions_answers: str # user responses to open questions

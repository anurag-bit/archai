import re
from typing import List, Dict, Any
from services.design.state import ModuleGraphState

def generate_ddl_from_tables(tables: List[Dict[str, Any]]) -> str:
    if not tables:
        return "-- No tables specified"
    ddl_parts = []
    for table in tables:
        if not isinstance(table, dict):
            continue
        table_name  = table.get("table_name", "")
        desc        = table.get("description", "")
        columns     = table.get("columns", [])
        indexes     = table.get("indexes", [])
        table_ddl   = []
        if desc:
            table_ddl.append(f"-- Description: {desc}")
        table_ddl.append(f"CREATE TABLE {table_name} (")
        col_defs = []
        for col in columns:
            if not isinstance(col, dict):
                continue
            col_def = f"    {col.get('name','')} {col.get('type','')}"
            if col.get("constraints"):
                col_def += f" {col['constraints']}"
            if col.get("justification"):
                col_def += f", -- SRS: {col['justification'].replace('\n',' ').strip()}"
            else:
                col_def += ","
            col_defs.append(col_def)
        if col_defs:
            last = col_defs[-1]
            if last.endswith(","):
                col_defs[-1] = last[:-1]
            elif ", -- SRS:" in last:
                col_defs[-1] = last.replace(", -- SRS:", " -- SRS:", 1)
        table_ddl.append("\n".join(col_defs))
        table_ddl.append(");")
        for idx in indexes:
            if not isinstance(idx, str):
                continue
            idx = idx.strip()
            if not idx:
                continue
            if idx.lower().startswith("create "):
                table_ddl.append(idx if idx.endswith(";") else idx + ";")
            else:
                col_name = "id"
                for col in sorted(columns, key=lambda c: len(c.get("name", "")), reverse=True):
                    if isinstance(col, dict):
                        cn = col.get("name", "")
                        idx_clean = idx.lower()
                        if idx_clean.startswith("idx_"):
                            idx_clean = idx_clean[4:]
                        if cn and cn.lower() in idx_clean:
                            col_name = cn
                            break
                table_ddl.append(f"CREATE INDEX {idx} ON {table_name}({col_name});")
        ddl_parts.append("\n".join(table_ddl))
    return "\n\n".join(ddl_parts)


def sanitize_mermaid_er(mermaid_er: str, tables: List[Dict[str, Any]]) -> str:
    """
    Sanitize entity names in Mermaid ER Diagram to prevent parsing errors
    due to reserved keywords (like 'CLASS', 'class', etc.).
    """
    if not mermaid_er:
        return "erDiagram"

    reserved_keywords = {
        "class", "CLASS", "title", "state", "graph", "relation", "entity", "classdiagram", "erdiagram",
        "style", "link", "callback", "click"
    }

    # Extract all table names
    table_names = []
    for table in tables:
        if isinstance(table, dict) and table.get("table_name"):
            table_names.append(table["table_name"])

    # Sort by length descending to replace longer names first
    table_names.sort(key=len, reverse=True)

    sanitized = mermaid_er
    for name in table_names:
        if name.lower() in reserved_keywords:
            # Replace with word boundary to avoid partial replacements
            pattern = re.compile(rf"\b{re.escape(name)}\b")
            sanitized = pattern.sub(f'"{name}"', sanitized)

    return sanitized


async def save_module_design_node(state: ModuleGraphState) -> dict:
    """
    Merges the DBA schema + API design into a single module entry,
    and saves it to state['module_design'].
    """
    module = state["current_module"]
    print(f"[save_module_design_node] Saving completed design for '{module}'")

    dba    = state["dba_draft"]
    api    = state["api_design"]

    # Merge api keys into the dba dict so the output has one unified object
    merged = {**dba}
    merged["apis"]      = api.get("apis",      dba.get("apis", []))
    merged["workflows"] = api.get("workflows",  dba.get("workflows", []))
    merged["compliance_check"] = dba.get("compliance_check", "")
    merged["api_compliance_check"] = api.get("compliance_check", "")

    tables       = merged.get("data_model", {}).get("tables", [])
    sql_ddl      = generate_ddl_from_tables(tables)
    api_endpoints = [
        f"{a.get('method','GET').upper()} {a.get('path','')} - {a.get('description','')}"
        for a in merged.get("apis", []) if isinstance(a, dict) and a.get("path")
    ]

    # Sanitize mermaid ER diagram to wrap reserved keywords in double quotes
    raw_mermaid = merged.get("data_model", {}).get("mermaid_er", "erDiagram")
    sanitized_mermaid = sanitize_mermaid_er(raw_mermaid, tables)
    if "data_model" in merged:
        merged["data_model"]["mermaid_er"] = sanitized_mermaid

    lld = state.get("lld_design") or {}

    domain_entry = {
        "module": module,
        "design": {
            "er_diagram_mermaid": sanitized_mermaid,
            "sql_ddl":            sql_ddl,
            "api_endpoints":      api_endpoints,
            "dfd_mermaid":        lld.get("dfd_mermaid", ""),
            "component_mermaid":  lld.get("component_mermaid", ""),
            "raw_json":           merged,
        },
        "selected_chunks": state.get("module_chunks", []),
    }

    return {
        "module_design": domain_entry
    }

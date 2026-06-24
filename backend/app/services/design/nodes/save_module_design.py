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
    due to reserved keywords, special characters in tables/columns,
    invalid relationship syntax, or unterminated block brackets.
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

    # 1. Standardize line endings and strip
    lines = [line.strip() for line in mermaid_er.replace("\r\n", "\n").split("\n")]
    
    brace_depth = 0
    sanitized_lines = []

    for line in lines:
        if not line:
            sanitized_lines.append("")
            continue
            
        # Ignore comments
        if line.startswith("%%"):
            sanitized_lines.append(line)
            continue

        # Handle block delimiters
        if "{" in line:
            brace_depth += 1
        if "}" in line:
            brace_depth -= 1

        # Check if this is a relationship line
        # Relationship lines typically contain relation operators: ||, |o, o{, }o, --, ..
        is_relationship = False
        for op in ["|o", "o|", "||", "o{", "}o", "-->", "->", "--"]:
            if op in line and ":" in line:
                is_relationship = True
                break
                
        if is_relationship:
            # Fix invalid relationship arrows (like -> or --> or --)
            line = re.sub(r'\s+-[->]\s+', ' ||--o{ ', line)
            line = re.sub(r'(?<![|o{}])--(?![|o{}])', '||--o{', line)
            
            # Normalize table/entity names: replace hyphens with underscores outside the label/comment
            parts = line.split(":", 1)
            struct_part = parts[0]
            label_part = ":" + parts[1] if len(parts) > 1 else ""
            
            struct_part = re.sub(r'\b([a-zA-Z_][a-zA-Z0-9_-]*)\b', lambda m: m.group(1).replace("-", "_"), struct_part)
            line = struct_part + label_part
            
        elif brace_depth > 0 and "{" not in line:
            # Inside an entity block: clean column type and name.
            # valid attribute line: type name [PK/FK] ["comment"]
            parts = line.split('"', 1)
            attrs_part = parts[0].strip()
            comment_part = ' "' + parts[1] if len(parts) > 1 else ""
            
            tokens = attrs_part.split()
            if len(tokens) >= 2:
                col_type = tokens[0]
                keys = []
                col_name_parts = []
                for tok in tokens[1:]:
                    if tok.upper() in ["PK", "FK"]:
                        keys.append(tok.upper())
                    else:
                        col_name_parts.append(tok)
                
                col_name = "_".join(col_name_parts).replace("-", "_")
                if not col_name:
                    col_name = "column_name"
                    
                key_str = " " + " ".join(keys) if keys else ""
                line = f"    {col_type} {col_name}{key_str}{comment_part}"
            else:
                line = "    " + line.replace("-", "_")
                
        else:
            # Table definition header, e.g., "prospect-student {"
            line = re.sub(r'\b([a-zA-Z_][a-zA-Z0-9_-]*)\b', lambda m: m.group(1).replace("-", "_"), line)

        # Wrap reserved keywords in quotes where appropriate
        # Wait, for simple keywords in the header definition
        for name in table_names:
            if name.lower() in reserved_keywords:
                pattern = re.compile(rf"\b{re.escape(name)}\b")
                line = pattern.sub(f'"{name}"', line)

        sanitized_lines.append(line)

    # 3. Close any unterminated braces
    while brace_depth > 0:
        sanitized_lines.append("}")
        brace_depth -= 1

    return "\n".join(sanitized_lines)


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

    test_strategy = state.get("test_strategy") or {}
    merged["test_strategy"] = test_strategy

    lld = state.get("lld_design") or {}
    frontend = state.get("frontend_design") or {}

    domain_entry = {
        "module": module,
        "design": {
            "er_diagram_mermaid": sanitized_mermaid,
            "sql_ddl":            sql_ddl,
            "api_endpoints":      api_endpoints,
            "dfd_mermaid":        lld.get("dfd_mermaid", ""),
            "component_mermaid":  lld.get("component_mermaid", ""),
            "frontend_design":    frontend,
            "test_strategy":      test_strategy,
            "raw_json":           merged,
        },
        "selected_chunks": state.get("module_chunks", []),
    }

    return {
        "module_design": domain_entry
    }

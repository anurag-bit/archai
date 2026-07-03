import re
from typing import List, Dict, Any
from services.design.state import ModuleGraphState
import logging
logger = logging.getLogger(__name__)



def generate_ddl_from_tables(tables: List[Dict[str, Any]], db_type: str = "postgres") -> str:
    if not tables:
        return "-- No tables specified"
    db_type_lower = db_type.lower().strip()
    ddl_parts = []
    
    if db_type_lower == "mongodb":
        for table in tables:
            if not isinstance(table, dict):
                continue
            collection_name = table.get("table_name", "")
            desc = table.get("description", "")
            columns = table.get("columns", [])
            indexes = table.get("indexes", [])
            
            mongo_parts = []
            if desc:
                mongo_parts.append(f"// Description: {desc}")
            mongo_parts.append(f"db.createCollection(\"{collection_name}\");")
            
            for col in columns:
                if not isinstance(col, dict):
                    continue
                col_name = col.get("name", "")
                constraints = col.get("constraints", "") or ""
                justification = col.get("justification", "")
                
                is_unique = "unique" in constraints.lower() or "primary key" in constraints.lower()
                is_indexed = is_unique or "index" in constraints.lower()
                
                if justification:
                    clean_just = justification.replace('\n', ' ').strip()
                    comment = f" // SRS: {clean_just}"
                else:
                    comment = ""
                if is_unique:
                    mongo_parts.append(f"db.{collection_name}.createIndex({{ \"{col_name}\": 1 }}, {{ unique: true }});{comment}")
                elif is_indexed:
                    mongo_parts.append(f"db.{collection_name}.createIndex({{ \"{col_name}\": 1 }});{comment}")
                    
            for idx in indexes:
                if not isinstance(idx, str) or not idx.strip():
                    continue
                idx_clean = idx.strip()
                if "createindex" in idx_clean.lower():
                    mongo_parts.append(idx_clean if idx_clean.endswith(";") else idx_clean + ";")
                else:
                    mongo_parts.append(f"db.{collection_name}.createIndex({{ \"{idx_clean}\": 1 }});")
            ddl_parts.append("\n".join(mongo_parts))
            
    elif db_type_lower == "neo4j":
        for table in tables:
            if not isinstance(table, dict):
                continue
            node_label = table.get("table_name", "")
            desc = table.get("description", "")
            columns = table.get("columns", [])
            indexes = table.get("indexes", [])
            
            cypher_parts = []
            if desc:
                cypher_parts.append(f"// Description: {desc}")
                
            for col in columns:
                if not isinstance(col, dict):
                    continue
                col_name = col.get("name", "")
                constraints = col.get("constraints", "") or ""
                justification = col.get("justification", "")
                
                is_unique = "unique" in constraints.lower() or "primary key" in constraints.lower()
                is_indexed = is_unique or "index" in constraints.lower()
                
                if justification:
                    clean_just = justification.replace('\n', ' ').strip()
                    comment = f" // SRS: {clean_just}"
                else:
                    comment = ""
                if is_unique:
                    cypher_parts.append(f"CREATE CONSTRAINT FOR (n:{node_label}) REQUIRE n.{col_name} IS UNIQUE;{comment}")
                elif is_indexed:
                    cypher_parts.append(f"CREATE INDEX FOR (n:{node_label}) ON (n.{col_name});{comment}")
                    
            for idx in indexes:
                if not isinstance(idx, str) or not idx.strip():
                    continue
                idx_clean = idx.strip()
                if "constraint" in idx_clean.lower() or "index" in idx_clean.lower():
                    cypher_parts.append(idx_clean if idx_clean.endswith(";") else idx_clean + ";")
                else:
                    cypher_parts.append(f"CREATE INDEX FOR (n:{node_label}) ON (n.{idx_clean});")
            ddl_parts.append("\n".join(cypher_parts))
            
    else:
        # Postgres default
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
                if "justification" in col and col["justification"]:
                    clean_justification = col['justification'].replace('\n', ' ').strip()
                    col_def += f", -- SRS: {clean_justification}"
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

        # Check if this is a relationship line
        # Relationship lines typically contain relation operators: ||, |o, o{, }o, --, ..
        is_relationship = False
        for op in ["|o", "o|", "||", "o{", "}o", "-->", "->", "--"]:
            if op in line and ":" in line:
                is_relationship = True
                break

        # Handle block delimiters
        if not is_relationship:
            if "{" in line:
                brace_depth += 1
            if "}" in line:
                brace_depth -= 1
                
        if is_relationship:
            # Split first to avoid mangling the label side
            parts = line.split(":", 1)
            struct_part = parts[0]
            label_part = ":" + parts[1] if len(parts) > 1 else ""

            # Fix invalid relationship arrows (like -> or --> or --) ONLY in struct_part
            struct_part = re.sub(r'\s+-[->]\s+', ' ||--o{ ', struct_part)
            struct_part = re.sub(r'(?<![|o{}])--(?![|o{}])', '||--o{', struct_part)
            
            # Normalize table/entity names: replace hyphens with underscores outside the label/comment
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
    logger.info(f"[save_module_design_node] Saving completed design for '{module}'")

    dba    = state["dba_draft"]
    api    = state["api_design"]

    # Merge api keys into the dba dict so the output has one unified object
    merged = {**dba}
    merged["apis"]      = api.get("apis",      dba.get("apis", []))
    merged["workflows"] = api.get("workflows",  dba.get("workflows", []))
    merged["compliance_check"] = dba.get("compliance_check", "")
    merged["api_compliance_check"] = api.get("compliance_check", "")

    tables       = merged.get("data_model", {}).get("tables", [])
    db_type      = merged.get("data_model", {}).get("database_type", "postgres")
    sql_ddl      = generate_ddl_from_tables(tables, db_type=db_type)
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
            "use_flow_mermaid":   lld.get("use_flow_mermaid", ""),
            "actor_mermaid":      lld.get("actor_mermaid", ""),
            "frontend_design":    frontend,
            "test_strategy":      test_strategy,
            "schema_diff_markdown": dba.get("schema_diff", {}).get("markdown", ""),
            "schema_diff_mermaid":  dba.get("schema_diff", {}).get("mermaid_er", ""),
            "raw_json":           merged,
        },
        "selected_chunks": state.get("module_chunks", []),
    }


    return {
        "module_design": domain_entry
    }


def compute_schema_diff(old_tables: List[Dict[str, Any]], new_tables: List[Dict[str, Any]], db_type: str = "postgres") -> Dict[str, str]:
    """
    Compares the old schema with the incoming patch schema and generates
    a markdown diff table and a highlighted Mermaid ER diagram.
    """
    if not old_tables:
        return {"markdown": "", "mermaid_er": ""}
        
    old_dict = {t.get("table_name"): t for t in old_tables if isinstance(t, dict)}
    
    diff_records = []
    # Track which tables/columns are added/modified for Mermaid highlighting
    added_tables = set()
    modified_tables = set()
    added_columns = {} # table -> set(cols)
    modified_columns = {} # table -> set(cols)

    for new_t in new_tables:
        if not isinstance(new_t, dict):
            continue
        t_name = new_t.get("table_name", "")
        if not t_name:
            continue
            
        if t_name not in old_dict:
            diff_records.append((t_name, "*all*", "Added Table", f"New collection/table '{t_name}' created."))
            added_tables.add(t_name)
            added_columns[t_name] = {c.get("name") for c in new_t.get("columns", []) if isinstance(c, dict)}
        else:
            old_t = old_dict[t_name]
            old_cols = {c.get("name"): c for c in old_t.get("columns", []) if isinstance(c, dict)}
            new_cols = new_t.get("columns", [])
            
            table_modified = False
            t_added_cols = set()
            t_mod_cols = set()
            
            for c in new_cols:
                if not isinstance(c, dict):
                    continue
                c_name = c.get("name", "")
                if not c_name:
                    continue
                    
                if c_name not in old_cols:
                    diff_records.append((t_name, c_name, "Added Column", f"Column '{c_name}' added to table."))
                    t_added_cols.add(c_name)
                    table_modified = True
                else:
                    old_c = old_cols[c_name]
                    type_changed = c.get("type") != old_c.get("type")
                    
                    new_const = str(c.get("constraints") or "").lower().strip()
                    old_const = str(old_c.get("constraints") or "").lower().strip()
                    const_changed = new_const != old_const
                    
                    if type_changed or const_changed:
                        details = []
                        if type_changed:
                            details.append(f"Type changed from '{old_c.get('type')}' to '{c.get('type')}'")
                        if const_changed:
                            details.append(f"Constraints changed from '{old_c.get('constraints')}' to '{c.get('constraints')}'")
                        diff_records.append((t_name, c_name, "Modified Column", "; ".join(details)))
                        t_mod_cols.add(c_name)
                        table_modified = True
                        
            if table_modified:
                modified_tables.add(t_name)
                if t_added_cols:
                    added_columns[t_name] = t_added_cols
                if t_mod_cols:
                    modified_columns[t_name] = t_mod_cols

    if not diff_records:
        return {"markdown": "", "mermaid_er": ""}
        
    # Generate Markdown Table
    md_lines = [
        "| Table/Collection | Column/Field | Action | Details |",
        "| :--- | :--- | :--- | :--- |"
    ]
    for t, c, act, det in diff_records:
        action_bold = f"**{act}**"
        if "Added" in act:
            action_bold = f"🟢 **{act}**"
        elif "Modified" in act:
            action_bold = f"🟡 **{act}**"
        md_lines.append(f"| `{t}` | `{c}` | {action_bold} | {det} |")
    markdown_diff = "\n".join(md_lines)
    
    # Generate Highlighted Mermaid ER Diagram
    mermaid_lines = ["erDiagram"]
    for t_name in (added_tables | modified_tables):
        # Find the source data block
        t_data = next((t for t in new_tables if isinstance(t, dict) and t.get("table_name") == t_name), None)
        if not t_data:
            continue
            
        t_label = t_name
        if t_name in added_tables:
            t_label = f"{t_name}_NEW"
        else:
            t_label = f"{t_name}_MODIFIED"
            
        mermaid_lines.append(f"    {t_label} {{")
        for col in t_data.get("columns", []):
            if not isinstance(col, dict):
                continue
            c_name = col.get("name", "")
            c_type = col.get("type", "string").replace(" ", "_")
            c_cons = col.get("constraints") or ""
            
            suffix = ""
            if t_name in added_tables:
                suffix = " \"[NEW]\""
            elif t_name in added_columns and c_name in added_columns[t_name]:
                suffix = " \"[NEW]\""
            elif t_name in modified_columns and c_name in modified_columns[t_name]:
                suffix = " \"[MODIFIED]\""
                
            pk_fk = ""
            if "primary key" in c_cons.lower():
                pk_fk = " PK"
            elif "foreign key" in c_cons.lower():
                pk_fk = " FK"
                
            mermaid_lines.append(f"        {c_type} {c_name}{pk_fk}{suffix}")
        mermaid_lines.append("    }")
        
    mermaid_er = "\n".join(mermaid_lines)
    return {"markdown": markdown_diff, "mermaid_er": mermaid_er}

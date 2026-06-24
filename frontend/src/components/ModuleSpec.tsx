import React, { useState } from "react";
import { MermaidRenderer } from "@/components/MermaidRenderer";

type DomainDesign = {
  module: string;
  status?: "completed" | "interrupted";
  design: {
    er_diagram_mermaid?: string;
    sql_ddl?: string;
    api_endpoints?: string[];
    dfd_mermaid?: string;
    component_mermaid?: string;
    frontend_design?: {
      component_tree_mermaid: string;
      state_management: any;
      routing_structure: any;
      wireframe_descriptions: Array<{
        view_name: string;
        layout_description: string;
      }>;
    };
    test_strategy?: {
      bdd_scenarios?: any;
      test_pyramid?: any;
      load_testing?: any;
    };
    raw_json?: any;
  };
  error?: string;
};

interface ModuleSpecProps {
  activeDesign: DomainDesign;
  documentId?: string;
  isRegenerating?: boolean;
  onRegenerateModule?: (moduleName: string) => void;
  onPatchSchema?: (moduleName: string, newTables: any[]) => Promise<void>;
  isPatching?: boolean;
  onResumeDesign?: (moduleName: string, instruction: string) => Promise<void>;
  isResuming?: boolean;
  activeTab?: string;
}

export function ModuleSpec({
  activeDesign,
  documentId,
  isRegenerating,
  onRegenerateModule,
  onPatchSchema,
  isPatching,
  onResumeDesign,
  isResuming,
  activeTab = "database",
}: ModuleSpecProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleOpenEditModal = () => {
    const currentTables = activeDesign.design?.raw_json?.data_model?.tables || [];
    setJsonText(JSON.stringify(currentTables, null, 2));
    setValidationError(null);
    setIsEditModalOpen(true);
  };

  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setJsonText(value);
    try {
      if (!value.trim()) {
        setValidationError("JSON cannot be empty");
        return;
      }
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) {
        setValidationError("Root must be a JSON array of tables");
        return;
      }
      setValidationError(null);
    } catch (err: any) {
      setValidationError(err.message || "Invalid JSON syntax");
    }
  };

  const handleSavePatch = async () => {
    if (validationError || !onPatchSchema) return;
    try {
      const parsed = JSON.parse(jsonText);
      await onPatchSchema(activeDesign.module, parsed);
      setIsEditModalOpen(false);
    } catch (err: any) {
      setValidationError(err.message || "Failed to parse and save schema patch");
    }
  };

  const [instructionText, setInstructionText] = useState("");

  const handleResume = async () => {
    if (!instructionText.trim() || !onResumeDesign) return;
    await onResumeDesign(activeDesign.module, instructionText);
    setInstructionText("");
  };

  const sql = activeDesign.design?.sql_ddl || "";
  const isInterrupted = activeDesign.status === "interrupted";

  if (isInterrupted) {
    return (
      <div className="flex-1 min-w-0 flex flex-col gap-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white leading-tight">{activeDesign.module}</h2>
            <div className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold mt-1">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span>
              <span>Design Paused for Human Feedback</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onPatchSchema && (
              <button
                type="button"
                disabled={isPatching || isResuming}
                onClick={handleOpenEditModal}
                className="text-[10px] bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-white px-2.5 py-1.5 rounded-lg border border-cyan-500/20 transition flex items-center gap-1.5 cursor-pointer font-semibold"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span>Edit Schema JSON</span>
              </button>
            )}
          </div>
        </div>

        {/* Audit Failure Feedback */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Audit Feedback from QA Agent</h4>
          <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-5 text-rose-300 text-xs leading-6 font-mono max-h-[220px] overflow-y-auto whitespace-pre-wrap select-all">
            {activeDesign.error || "The schema design failed validation but no detailed error was provided."}
          </div>
        </div>

        {/* Human Instruction Guidance Form */}
        <div className="bg-slate-900/30 border border-white/5 rounded-2xl p-5 sm:p-6 space-y-4 shadow-inner relative">
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Guide the Generator</h4>
            <p className="text-[11px] text-slate-500 leading-4">
              Enter natural language instructions to tell the Database Agent how to fix this schema (e.g. <i>"Add a junction table called student_fee_discounts to link student and discounts"</i>).
            </p>
          </div>

          <textarea
            value={instructionText}
            onChange={(e) => setInstructionText(e.target.value)}
            disabled={isResuming}
            placeholder="Type your design instructions here..."
            className="w-full min-h-[100px] rounded-xl border border-white/10 bg-slate-950/60 p-4 text-xs leading-6 text-slate-100 outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 resize-none placeholder:text-slate-650"
          />

          <div className="flex justify-end">
            <button
              type="button"
              disabled={isResuming || !instructionText.trim()}
              onClick={handleResume}
              className="px-5 py-2.5 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-500/10"
            >
              {isResuming ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Resuming execution...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Resume Graph Execution</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Option to Edit JSON Schema directly */}
        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 px-1">
          <svg className="w-4 h-4 text-cyan-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Alternatively, click the <b>Edit Schema JSON</b> button in the top right to patch the schema manually.</span>
        </div>

        {/* Include Edit Schema Modal so it is accessible from here too */}
        {isEditModalOpen && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col p-6 shadow-2xl overflow-hidden">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
                <div>
                  <h3 className="text-base font-bold text-white">Edit Schema JSON: {activeDesign.module}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Customize database tables structure and properties manually.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Warning Message Banner */}
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl p-3 text-xs mb-4 flex items-start gap-2.5">
                <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <span className="font-bold">Guidelines:</span> Must be a valid JSON array of table objects. Modify existing columns or tables directly. Once saved, the AI will re-align all REST APIs and flow diagrams automatically to match these changes.
                </div>
              </div>

              {/* Textarea Code Editor */}
              <div className="flex-1 min-h-0 relative mb-4">
                <textarea
                  value={jsonText}
                  onChange={handleJsonChange}
                  spellCheck={false}
                  className="w-full h-full min-h-[300px] rounded-xl border border-white/10 bg-slate-950 p-4 text-xs font-mono text-slate-200 outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 resize-none overflow-y-auto"
                />
              </div>

              {/* Footer with actions and status */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/10 pt-4">
                <div className="flex items-center gap-2 text-xs">
                  {validationError ? (
                    <div className="flex items-center gap-1.5 text-rose-450 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-lg">
                      <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                      <span className="font-medium truncate max-w-[300px] sm:max-w-[450px]">
                        {validationError}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-emerald-450 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                      <span className="font-medium">JSON schema is valid</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!!validationError || isPatching}
                    onClick={handleSavePatch}
                    className="w-full sm:w-auto px-5 py-2 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    {isPatching ? (
                      <>
                        <svg className="w-3.5 h-3.5 animate-spin text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Saving Patches...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Save Patches</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    );
  }
  const apis = (activeDesign.design?.api_endpoints || []).join("\n");

  const handleCopySpec = async () => {
    try {
      let content = `# ${activeDesign.module}\n\n## SQL DDL\n\`\`\`sql\n${sql}\n\`\`\`\n\n## API Endpoints\n${apis}`;
      if (activeDesign.design?.dfd_mermaid) {
        content += `\n\n## Data Flow Diagram (Level 1)\n\`\`\`mermaid\n${activeDesign.design.dfd_mermaid}\n\`\`\``;
      }
      if (activeDesign.design?.component_mermaid) {
        content += `\n\n## Low-Level Component Diagram\n\`\`\`mermaid\n${activeDesign.design.component_mermaid}\n\`\`\``;
      }
      if (activeDesign.design?.frontend_design) {
        const fd = activeDesign.design.frontend_design;
        content += `\n\n## Frontend Architecture`;
        if (fd.component_tree_mermaid) {
          content += `\n\n### Component Hierarchy Diagram\n\`\`\`mermaid\n${fd.component_tree_mermaid}\n\`\`\``;
        }
        if (fd.state_management) {
          content += `\n\n### State Management\n${typeof fd.state_management === "object" ? JSON.stringify(fd.state_management, null, 2) : fd.state_management}`;
        }
        if (fd.routing_structure) {
          content += `\n\n### Routing Structure\n${typeof fd.routing_structure === "object" ? JSON.stringify(fd.routing_structure, null, 2) : fd.routing_structure}`;
        }
        if (fd.wireframe_descriptions && fd.wireframe_descriptions.length > 0) {
          content += `\n\n### Wireframes\n`;
          fd.wireframe_descriptions.forEach(wf => {
            content += `#### ${wf.view_name}\n${wf.layout_description}\n\n`;
          });
        }
      }
      if (activeDesign.design?.test_strategy) {
        const ts = activeDesign.design.test_strategy;
        content += `\n\n## QA & Test Strategy`;
        if (ts.bdd_scenarios) {
          content += `\n\n### BDD Gherkin Scenarios\n${typeof ts.bdd_scenarios === "object" ? JSON.stringify(ts.bdd_scenarios, null, 2) : ts.bdd_scenarios}`;
        }
        if (ts.test_pyramid) {
          content += `\n\n### Test Pyramid Plan\n${typeof ts.test_pyramid === "object" ? JSON.stringify(ts.test_pyramid, null, 2) : ts.test_pyramid}`;
        }
        if (ts.load_testing) {
          content += `\n\n### Load Testing Strategy\n${typeof ts.load_testing === "object" ? JSON.stringify(ts.load_testing, null, 2) : ts.load_testing}`;
        }
      }
      await navigator.clipboard.writeText(content);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <div className="flex-1 min-w-0 flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white leading-tight">{activeDesign.module}</h2>
          <p className="text-xs text-slate-500 mt-1">
            {activeTab === "database" && "Database and API Specification"}
            {activeTab === "frontend" && "Frontend UI Component and Routing Architecture"}
            {activeTab === "testing" && "Quality Assurance and Testing Strategy"}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {onPatchSchema && (
            <button
              type="button"
              disabled={isPatching || isRegenerating}
              onClick={handleOpenEditModal}
              className="text-[10px] bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-white px-2.5 py-1.5 rounded-lg border border-cyan-500/20 transition flex items-center gap-1.5 cursor-pointer font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span>Edit Schema</span>
            </button>
          )}

          {onRegenerateModule && documentId && (
            <button
              type="button"
              disabled={isRegenerating}
              onClick={() => onRegenerateModule(activeDesign.module)}
              className="text-[10px] bg-white/5 hover:bg-white/10 text-slate-350 hover:text-white px-2.5 py-1.5 rounded-lg border border-white/5 transition flex items-center gap-1.5 cursor-pointer font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isRegenerating ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Regenerating...</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3" />
                  </svg>
                  <span>Regenerate Module</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleCopySpec}
            className="text-[10px] bg-white/5 hover:bg-white/10 text-slate-350 hover:text-white px-2.5 py-1.5 rounded-lg border border-white/5 transition flex items-center gap-1.5 cursor-pointer font-semibold"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
            Copy Module Spec
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {activeTab === "database" && (
          <>
            {/* ER Diagram Section */}
            {activeDesign.design?.er_diagram_mermaid && (
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Entity Relationship Diagram</h4>
                <div className="bg-slate-900/30 border border-white/5 rounded-2xl p-4 overflow-x-auto flex justify-center">
                  <MermaidRenderer chart={activeDesign.design.er_diagram_mermaid} />
                </div>
              </div>
            )}

            {/* Data Flow Diagram Section */}
            {activeDesign.design?.dfd_mermaid && (
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Data Flow Diagram (Level 1)</h4>
                <div className="bg-slate-900/30 border border-white/5 rounded-2xl p-4 overflow-x-auto flex justify-center">
                  <MermaidRenderer chart={activeDesign.design.dfd_mermaid} />
                </div>
              </div>
            )}

            {/* Low-Level Component Diagram Section */}
            {activeDesign.design?.component_mermaid && (
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Low-Level Component Diagram</h4>
                <div className="bg-slate-900/30 border border-white/5 rounded-2xl p-4 overflow-x-auto flex justify-center">
                  <MermaidRenderer chart={activeDesign.design.component_mermaid} />
                </div>
              </div>
            )}

            {/* SQL DDL Code block */}
            {activeDesign.design?.sql_ddl && (
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">PostgreSQL DDL</h4>
                <pre className="text-xs text-slate-350 leading-5 whitespace-pre-wrap font-mono p-4 bg-slate-950/80 border border-white/5 rounded-2xl max-h-[350px] overflow-y-auto select-all">
                  {activeDesign.design.sql_ddl}
                </pre>
              </div>
            )}

            {/* API Endpoints with badges */}
            {activeDesign.design?.api_endpoints && activeDesign.design.api_endpoints.length > 0 && (
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  API Endpoints ({activeDesign.design.api_endpoints.length})
                </h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {activeDesign.design.api_endpoints.map((endpoint, i) => {
                    const match = endpoint.match(/^([A-Z]+)\s+(.+)$/);
                    const method = match ? match[1] : "GET";
                    const path = match ? match[2] : endpoint;
                    
                    let badgeColor = "bg-sky-500/10 text-sky-400 border-sky-500/20";
                    if (method === "POST") badgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                    if (method === "PUT" || method === "PATCH") badgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                    if (method === "DELETE") badgeColor = "bg-rose-500/10 text-rose-400 border-rose-500/20";
                    
                    return (
                      <div
                        key={i}
                        className="bg-slate-900/30 border border-white/5 rounded-xl p-3 flex items-center gap-3 font-mono text-[11px] hover:border-white/10 transition"
                      >
                        <span className={`px-2 py-0.5 rounded border text-[9px] font-bold ${badgeColor}`}>{method}</span>
                        <span className="text-slate-300 truncate select-all">{path}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === "frontend" && (
          <>
            {activeDesign.design?.frontend_design && (Object.keys(activeDesign.design.frontend_design).length > 0) ? (
              <div className="space-y-6">
                {/* Component Tree Diagram */}
                {activeDesign.design.frontend_design.component_tree_mermaid && (
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Component Hierarchy Diagram</h4>
                    <div className="bg-slate-900/30 border border-white/5 rounded-2xl p-4 overflow-x-auto flex justify-center">
                      <MermaidRenderer chart={activeDesign.design.frontend_design.component_tree_mermaid} />
                    </div>
                  </div>
                )}

                {/* State Management Strategy */}
                {activeDesign.design.frontend_design.state_management && (
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">State Management Strategy</h4>
                    <pre className="text-xs text-slate-350 leading-5 whitespace-pre-wrap font-mono p-4 bg-slate-950/80 border border-white/5 rounded-2xl max-h-[300px] overflow-y-auto">
                      {typeof activeDesign.design.frontend_design.state_management === "object"
                        ? JSON.stringify(activeDesign.design.frontend_design.state_management, null, 2)
                        : activeDesign.design.frontend_design.state_management}
                    </pre>
                  </div>
                )}

                {/* Routing Structure */}
                {activeDesign.design.frontend_design.routing_structure && (
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Routing Structure</h4>
                    <pre className="text-xs text-slate-355 leading-5 whitespace-pre-wrap font-mono p-4 bg-slate-950/80 border border-white/5 rounded-2xl max-h-[250px] overflow-y-auto">
                      {typeof activeDesign.design.frontend_design.routing_structure === "object"
                        ? JSON.stringify(activeDesign.design.frontend_design.routing_structure, null, 2)
                        : activeDesign.design.frontend_design.routing_structure}
                    </pre>
                  </div>
                )}

                {/* Wireframe Descriptions */}
                {activeDesign.design.frontend_design.wireframe_descriptions && activeDesign.design.frontend_design.wireframe_descriptions.length > 0 && (
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Wireframe & Layout Descriptions</h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {activeDesign.design.frontend_design.wireframe_descriptions.map((wf, idx) => (
                        <div key={idx} className="bg-slate-900/30 border border-white/5 rounded-2xl p-4 hover:border-white/10 transition flex flex-col gap-1.5">
                          <h5 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 border-b border-white/5 pb-2">
                            <span className="w-1.5 h-1.5 bg-violet-400 rounded-full" />
                            {wf.view_name}
                          </h5>
                          <p className="text-[11px] text-slate-400 leading-5 whitespace-pre-line flex-1">{wf.layout_description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl">
                <p className="text-sm text-slate-400">No frontend design is available for this module.</p>
              </div>
            )}
          </>
        )}

        {activeTab === "testing" && (
          <>
            {activeDesign.design?.test_strategy && (Object.keys(activeDesign.design.test_strategy).length > 0) ? (
              <div className="space-y-6">
                {/* BDD Gherkin Scenarios */}
                {activeDesign.design.test_strategy.bdd_scenarios && (
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">BDD Gherkin Scenarios</h4>
                    <pre className="text-xs text-slate-350 leading-5 whitespace-pre-wrap font-mono p-4 bg-slate-950/80 border border-white/5 rounded-2xl max-h-[300px] overflow-y-auto">
                      {typeof activeDesign.design.test_strategy.bdd_scenarios === "object"
                        ? JSON.stringify(activeDesign.design.test_strategy.bdd_scenarios, null, 2)
                        : activeDesign.design.test_strategy.bdd_scenarios}
                    </pre>
                  </div>
                )}

                {/* Test Pyramid Plan */}
                {activeDesign.design.test_strategy.test_pyramid && (
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Test Pyramid Plan</h4>
                    <div className="bg-slate-900/30 border border-white/5 rounded-2xl p-5 text-xs text-slate-300 leading-6 font-sans whitespace-pre-line">
                      {typeof activeDesign.design.test_strategy.test_pyramid === "object"
                        ? JSON.stringify(activeDesign.design.test_strategy.test_pyramid, null, 2)
                        : activeDesign.design.test_strategy.test_pyramid}
                    </div>
                  </div>
                )}

                {/* Load Testing Strategy */}
                {activeDesign.design.test_strategy.load_testing && (
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Load Testing Strategy</h4>
                    <pre className="text-xs text-slate-350 leading-5 whitespace-pre-wrap font-mono p-4 bg-slate-950/80 border border-white/5 rounded-2xl max-h-[300px] overflow-y-auto">
                      {typeof activeDesign.design.test_strategy.load_testing === "object"
                        ? JSON.stringify(activeDesign.design.test_strategy.load_testing, null, 2)
                        : activeDesign.design.test_strategy.load_testing}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl">
                <p className="text-sm text-slate-400">No QA test strategy is available for this module.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>

      {/* Edit Schema Modal Overlay */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col p-6 shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
              <div>
                <h3 className="text-base font-bold text-white">Edit Schema JSON: {activeDesign.module}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Customize database tables structure and properties manually.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Warning Message Banner */}
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl p-3 text-xs mb-4 flex items-start gap-2.5">
              <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <span className="font-bold">Guidelines:</span> Must be a valid JSON array of table objects. Modify existing columns or tables directly. Once saved, the AI will re-align all REST APIs and flow diagrams automatically to match these changes.
              </div>
            </div>

            {/* Textarea Code Editor */}
            <div className="flex-1 min-h-0 relative mb-4">
              <textarea
                value={jsonText}
                onChange={handleJsonChange}
                spellCheck={false}
                className="w-full h-full min-h-[300px] rounded-xl border border-white/10 bg-slate-950 p-4 text-xs font-mono text-slate-200 outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 resize-none overflow-y-auto"
              />
            </div>

            {/* Footer with actions and status */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/10 pt-4">
              <div className="flex items-center gap-2 text-xs">
                {validationError ? (
                  <div className="flex items-center gap-1.5 text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-lg">
                    <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                    <span className="font-medium truncate max-w-[300px] sm:max-w-[450px]">
                      {validationError}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-emerald-450 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                    <span className="font-medium">JSON schema is valid</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!!validationError || isPatching}
                  onClick={handleSavePatch}
                  className="w-full sm:w-auto px-5 py-2 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {isPatching ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Saving Patches...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Save Patches</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}

import React, { useRef } from "react";

interface DocumentUploadProps {
  selectedFile: File | null;
  onFileDrop: (e: React.DragEvent) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearFile: () => void;
}

export function DocumentUpload({
  selectedFile,
  onFileDrop,
  onFileChange,
  onClearFile,
}: DocumentUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
        Upload SRS Document
      </label>
      
      <div
        onDragOver={handleDragOver}
        onDrop={onFileDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center gap-3 min-h-[140px] ${
          selectedFile
            ? "border-cyan-400/40 bg-cyan-400/5 shadow-inner"
            : "border-white/10 bg-slate-950/40 hover:border-cyan-400/30 hover:bg-slate-950/60"
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={onFileChange}
          accept=".txt,.md,.pdf,.json,.csv"
          className="hidden"
        />
        
        {selectedFile ? (
          <div className="flex flex-col items-center gap-2 w-full">
            <div className="w-9 h-9 rounded-full bg-cyan-400/10 flex items-center justify-center border border-cyan-400/20">
              <svg className="w-4.5 h-4.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold text-slate-200 truncate max-w-[200px] mx-auto">
                {selectedFile.name}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClearFile();
              }}
              className="mt-1.5 text-[10px] font-semibold text-rose-400 hover:text-rose-350 hover:underline px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 transition cursor-pointer"
            >
              Remove File
            </button>
          </div>
        ) : (
          <>
            <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
              <svg className="w-4.5 h-4.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-200">
                Drag & drop file here, or click to browse
              </span>
              <span className="text-[10px] text-slate-500 block mt-1">
                Supports PDF, MD, TXT, CSV, or JSON (max 10MB)
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { createRequire } from "module";
import path from "path";
import { PDFParse } from "pdf-parse";

import { generateSystemDesign } from "@/lib/design-generator";

export const runtime = "nodejs";

// Initialize the PDFParse worker path for server-side execution under Next.js/Turbopack
try {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const pdfParsePath = require.resolve("pdf-parse");
  const pdfParseRequire = createRequire(pdfParsePath);
  const workerPath = pdfParseRequire.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  PDFParse.setWorker(workerPath);
} catch (error) {
  console.error("Failed to initialize PDFParse worker path:", error);
}

async function extractPdfText(file: File) {
  const parser = new PDFParse({ data: Buffer.from(await file.arrayBuffer()) });

  try {
    const result = await parser.getText();
    return result.text.trim();
  } finally {
    await parser.destroy();
  }
}

async function extractDocumentText(file: File) {
  const fileName = file.name.toLowerCase();

  if (file.type === "application/pdf" || fileName.endsWith(".pdf")) {
    return extractPdfText(file);
  }

  return file.text();
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const requirements = String(formData.get("requirements") ?? "").trim();
    const document = formData.get("document");

    let documentText = requirements;

    if (document instanceof File && document.size > 0) {
      const uploadedText = (await extractDocumentText(document)).trim();
      documentText = [requirements, uploadedText].filter(Boolean).join("\n\n");
    }

    if (!documentText) {
      return Response.json(
        { error: "Add a requirements document or paste requirement text before generating." },
        { status: 400 }
      );
    }

    const result = await generateSystemDesign(documentText);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate system design.";
    return Response.json({ error: message }, { status: 500 });
  }
}
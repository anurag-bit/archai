import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";

/**
 * Split documents with proper chunking strategy
 * Useful for processing large documents like PDFs
 */
export async function splitDocuments(
  documents: Document[],
  options?: {
    chunkSize?: number;
    chunkOverlap?: number;
  }
): Promise<Document[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: options?.chunkSize || 1000,
    chunkOverlap: options?.chunkOverlap || 200,
  });

  return splitter.splitDocuments(documents);
}

/**
 * Split raw text into chunks
 */
export async function splitText(
  text: string,
  options?: {
    chunkSize?: number;
    chunkOverlap?: number;
  }
): Promise<string[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: options?.chunkSize || 1000,
    chunkOverlap: options?.chunkOverlap || 200,
  });

  return splitter.splitText(text);
}

/**
 * Process PDF files (requires @langchain/community)
 * Usage: pnpm add @langchain/community
 *
 * Example:
 * import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
 * const loader = new PDFLoader("file.pdf");
 * const docs = await loader.load();
 * const split = await splitDocuments(docs);
 */

/**
 * Recommended chunking strategy:
 * - Small documents: 500 chars, 100 overlap
 * - Medium documents: 1000 chars, 200 overlap
 * - Large documents: 2000 chars, 400 overlap
 */

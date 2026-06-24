from pypdf import PdfReader
import io

def extract_pdf_text(file_bytes: bytes) -> str:
    """
    Extracts text from PDF bytes up to a limit of 100 pages to avoid DoS,
    enforcing character limits per page (50KB) and total (1MB) to prevent OOM.
    """
    MAX_PAGE_CHARS = 50 * 1024
    MAX_TOTAL_CHARS = 1024 * 1024
    
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        max_pages = min(len(reader.pages), 100)
        pages_text = []
        total_chars = 0
        
        for i in range(max_pages):
            page_text = reader.pages[i].extract_text()
            if page_text:
                # Limit single page text length
                if len(page_text) > MAX_PAGE_CHARS:
                    page_text = page_text[:MAX_PAGE_CHARS] + "\n[Page text truncated due to size limit]"
                
                # Check cumulative character limit
                if total_chars + len(page_text) > MAX_TOTAL_CHARS:
                    remaining_budget = MAX_TOTAL_CHARS - total_chars
                    if remaining_budget > 0:
                        pages_text.append(page_text[:remaining_budget] + "\n[Document text truncated due to global size limit]")
                    break
                
                pages_text.append(page_text)
                total_chars += len(page_text)
                
        return "\n\n".join(pages_text).strip()
    except Exception as e:
        raise ValueError(f"Failed to parse PDF file: {str(e)}")

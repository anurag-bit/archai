from pypdf import PdfReader
import io

def extract_pdf_text(file_bytes: bytes) -> str:
    """
    Extracts text from PDF bytes up to a limit of 100 pages to avoid DoS.
    """
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        max_pages = min(len(reader.pages), 100)
        pages_text = []
        for i in range(max_pages):
            page_text = reader.pages[i].extract_text()
            if page_text:
                pages_text.append(page_text)
        return "\n\n".join(pages_text).strip()
    except Exception as e:
        raise ValueError(f"Failed to parse PDF file: {str(e)}")

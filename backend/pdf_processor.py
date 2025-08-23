import PyPDF2
from typing import List, Dict, Any
import os
import logging


logger = logging.getLogger(__name__)


class PDFProcessor:
    def __init__(self):
        # No heavy init required; kept for parity/extension
        pass

    def extract_pages(self, pdf_path: str) -> List[Dict[str, Any]]:
        """Extract text from all pages of a PDF file with robust guards.

        - Normalizes None text to empty string
        - Attempts to handle encrypted PDFs (empty-password try)
        - Emits basic metadata logs (filename, page count)
        """
        pages: List[Dict[str, Any]] = []
        filename = os.path.basename(pdf_path)

        try:
            with open(pdf_path, "rb") as file:
                pdf_reader = PyPDF2.PdfReader(file)

                # Handle encryption (best-effort empty password attempt)
                if getattr(pdf_reader, "is_encrypted", False):
                    try:
                        # PyPDF2 returns an int in some versions; nonzero indicates success
                        result = pdf_reader.decrypt("")  # type: ignore[attr-defined]
                        logger.info(
                            f"PDF '{filename}' was encrypted; attempted empty-password decrypt (result={result})."
                        )
                    except Exception as dec_err:
                        raise Exception(
                            f"PDF '{filename}' is encrypted and cannot be processed without a password: {dec_err}"
                        )

                total_pages = len(pdf_reader.pages)
                logger.info(f"Extracting PDF '{filename}' with {total_pages} pages…")

                total_chars = 0
                for page_num, page in enumerate(pdf_reader.pages):
                    # None-text guard
                    try:
                        text = page.extract_text() or ""
                    except Exception as page_err:
                        raise Exception(
                            f"Failed to extract text from page {page_num + 1} of '{filename}': {page_err}"
                        )
                    total_chars += len(text)
                    pages.append(
                        {
                            "page_number": page_num + 1,
                            "text": text,
                            "char_count": len(text),
                        }
                    )

                logger.info(
                    f"Completed extraction for '{filename}': pages={total_pages}, total_chars={total_chars}"
                )

        except Exception as e:
            raise Exception(f"Error extracting text from PDF '{filename}': {str(e)}")

        return pages

    def get_page_chunks(self, pages: List[Dict], chunk_size: int = 20):
        """Split pages into chunks of specified size"""
        chunks = []
        for i in range(0, len(pages), chunk_size):
            chunk = pages[i:i + chunk_size]
            chunks.append(chunk)
        return chunks

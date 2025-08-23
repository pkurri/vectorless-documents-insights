from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from typing import List
import json
import tempfile
import os
import asyncio

from models import (
    ChatRequest,
    UploadResponse,
    DocumentData,
    DocumentPage,
)
from pdf_processor import PDFProcessor
from llm_service import LLMService
from pydantic import BaseModel
from document_processor import DocumentProcessor
from smb.SMBConnection import SMBConnection

app = FastAPI(title="Document Chatbot API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
        "http://localhost:3004",
        "http://localhost:3005",
    ],  # Next.js dev server on various ports
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
pdf_processor = PDFProcessor()
llm_service = LLMService()

# Shared config for local scanning
DEFAULT_SCAN_EXTS = [".pdf", ".docx", ".pptx", ".xlsx", ".csv"]
BASE_SCAN_DIR = os.getenv("SCAN_BASE_DIR", os.getcwd())


class ScanFolderRequest(BaseModel):
    path: str
    recurse: bool = True
    maxFiles: int = 100
    extensions: list[str] | None = None


class SMBScanRequest(BaseModel):
    server: str  # hostname or IP
    share: str   # SMB share name
    path: str = "/"  # path within the share
    username: str
    password: str
    port: int = 445
    clientName: str = "vectorless-client"
    serverName: str | None = None
    domain: str | None = None
    useNTLMv2: bool = True
    recurse: bool = True
    maxFiles: int = 100
    extensions: list[str] | None = None


@app.post("/upload", response_model=UploadResponse)
async def upload_documents(
    files: List[UploadFile] = File(...), description: str = Form(...)
):
    """Process PDF documents and return extracted text to client"""

    if len(files) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 documents allowed")

    # Validate file types
    for file in files:
        if not file.filename.endswith(".pdf"):
            raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    # Process files and extract text
    documents = []
    for i, file in enumerate(files):
        # Create temporary file for processing
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
            temp_file.write(await file.read())
            temp_file_path = temp_file.name

        try:
            # Extract text from PDF
            pages_data = pdf_processor.extract_pages(temp_file_path)

            # Convert to DocumentPage objects
            pages = [
                DocumentPage(page_number=page["page_number"], text=page["text"])
                for page in pages_data
            ]

            documents.append(
                DocumentData(
                    id=i + 1,
                    filename=file.filename,
                    pages=pages,
                    total_pages=len(pages),
                )
            )
        except Exception as e:
            print(f"PDF processing error for {file.filename}: {str(e)}")
            raise HTTPException(
                status_code=500, detail=f"Error processing {file.filename}: {str(e)}"
            )
        finally:
            # Clean up temporary file
            try:
                os.unlink(temp_file_path)
            except:
                pass

    return UploadResponse(
        documents=documents, message=f"Successfully processed {len(files)} documents"
    )


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """Handle chat requests with streaming response - stateless"""
    import time

    start_time = time.time()
    print(f"🌊 Streaming chat request started")
    print(f"📝 Question: {request.question}")
    print(f"📊 Received {len(request.documents)} documents")

    async def stream_response():
        try:
            total_cost = 0.0

            # Convert DocumentData to the format expected by LLMService
            documents_dict = []
            for doc in request.documents:
                pages_dict = []
                for page in doc.pages:
                    pages_dict.append(
                        {"page_number": page.page_number, "text": page.text}
                    )

                documents_dict.append(
                    {
                        "id": doc.id,
                        "filename": doc.filename,
                        "pages": pages_dict,
                        "total_pages": doc.total_pages,
                    }
                )

            # Step 1: Select relevant documents
            step1_start = time.time()
            doc_selection_status = {
                "type": "status",
                "step": "document_selection",
                "message": "Finding relevant documents...",
                "step_number": 1,
                "total_steps": 3,
            }
            yield f"data: {json.dumps(doc_selection_status)}\n\n"

            print("⏱️ Step 1: Starting document selection...")
            selected_docs, step1_cost = await llm_service.select_documents(
                request.description,
                documents_dict,
                request.question,
                request.chat_history,
            )
            total_cost += step1_cost
            step1_time = time.time() - step1_start
            print(f"✅ Step 1: Document selection completed in {step1_time:.2f}s")

            # Send completion status for document selection
            doc_selection_complete = {
                "type": "step_complete",
                "step": "document_selection",
                "selected_documents": [
                    {"id": doc["id"], "filename": doc["filename"]}
                    for doc in selected_docs
                ],
                "cost": step1_cost,
                "time_taken": step1_time,
            }
            yield f"data: {json.dumps(doc_selection_complete)}\n\n"

            # Step 2: Find relevant pages
            step2_start = time.time()
            page_selection_status = {
                "type": "status",
                "step": "page_selection",
                "message": "Finding relevant pages in selected documents...",
                "step_number": 2,
                "total_steps": 3,
            }
            yield f"data: {json.dumps(page_selection_status)}\n\n"

            print("⏱️ Step 2: Starting page selection...")
            # Process documents in parallel to maintain filename context

            async def process_document(doc):
                return await llm_service.find_relevant_pages(
                    doc["pages"],
                    request.question,
                    doc["filename"],
                    request.chat_history,
                )

            # Create tasks for all documents
            doc_tasks = [process_document(doc) for doc in selected_docs]

            # Wait for all documents to complete
            doc_results = await asyncio.gather(*doc_tasks)

            # Combine results
            all_relevant_pages = []
            step2_cost = 0.0
            for doc_relevant_pages, doc_cost in doc_results:
                all_relevant_pages.extend(doc_relevant_pages)
                step2_cost += doc_cost

            relevant_pages = all_relevant_pages
            total_cost += step2_cost
            step2_time = time.time() - step2_start
            print(f"✅ Step 2: Page selection completed in {step2_time:.2f}s")

            # Send completion status for page selection
            page_selection_complete = {
                "type": "step_complete",
                "step": "page_selection",
                "relevant_pages_count": len(relevant_pages),
                "cost": step2_cost,
                "time_taken": step2_time,
            }
            yield f"data: {json.dumps(page_selection_complete)}\n\n"

            # Step 3: Generate answer
            step3_start = time.time()
            answer_generation_status = {
                "type": "status",
                "step": "answer_generation",
                "message": "Generating comprehensive answer...",
                "step_number": 3,
                "total_steps": 3,
            }
            yield f"data: {json.dumps(answer_generation_status)}\n\n"

            print("⏱️ Step 3: Starting answer generation...")

            # Stream the answer generation
            async for chunk in llm_service.generate_answer_stream(
                relevant_pages, request.question, request.chat_history, request.model
            ):
                if chunk.get("type") == "content":
                    content_data = {
                        "type": "content",
                        "content": chunk["content"],
                    }
                    yield f"data: {json.dumps(content_data)}\n\n"
                elif chunk.get("type") == "cost":
                    total_cost += chunk["cost"]

            step3_time = time.time() - step3_start
            print(f"✅ Step 3: Answer generation completed in {step3_time:.2f}s")

            # Send final completion
            total_time = time.time() - start_time
            completion_data = {
                "type": "complete",
                "timing_breakdown": {
                    "document_selection": step1_time,
                    "page_detection": step2_time,
                    "answer_generation": step3_time,
                    "total_time": total_time,
                },
                "cost_breakdown": {
                    "document_selection": step1_cost,
                    "page_detection": step2_cost,
                    "answer_generation": total_cost - step1_cost - step2_cost,
                    "total_cost": total_cost,
                },
            }
            yield f"data: {json.dumps(completion_data)}\n\n"

            print(
                f"🎉 Request completed in {total_time:.2f}s, total cost: ${total_cost:.4f}"
            )

        except Exception as e:
            error_data = {"type": "error", "error": str(e)}
            yield f"data: {json.dumps(error_data)}\n\n"
            print(f"❌ Error in stream_response: {str(e)}")

    return StreamingResponse(
        stream_response(),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream",
        },
    )


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "mode": "stateless"}


@app.post("/scan-folder", response_model=UploadResponse)
async def scan_folder(req: ScanFolderRequest):
    """Scan a local folder for supported documents and return extracted content.

    Notes:
    - Restricted to paths within BASE_SCAN_DIR (env: SCAN_BASE_DIR) for safety.
    - Supports extensions in DEFAULT_SCAN_EXTS by default.
    - Processes up to maxFiles documents.
    """
    # Resolve and validate path
    requested_path = os.path.realpath(req.path)
    base_dir = os.path.realpath(BASE_SCAN_DIR)
    if not requested_path.startswith(base_dir):
        raise HTTPException(status_code=400, detail=f"Path must be under {base_dir}")
    if not os.path.exists(requested_path) or not os.path.isdir(requested_path):
        raise HTTPException(status_code=400, detail="Path does not exist or is not a directory")

    allowed_exts = [e.lower() for e in (req.extensions or DEFAULT_SCAN_EXTS)]

    # Collect files
    files_to_process: list[tuple[str, str]] = []  # (full_path, filename)
    try:
        if req.recurse:
            for root, _, files in os.walk(requested_path):
                for name in files:
                    _, ext = os.path.splitext(name.lower())
                    if ext in allowed_exts:
                        files_to_process.append((os.path.join(root, name), name))
                        if len(files_to_process) >= req.maxFiles:
                            break
                if len(files_to_process) >= req.maxFiles:
                    break
        else:
            for name in os.listdir(requested_path):
                full = os.path.join(requested_path, name)
                if os.path.isfile(full):
                    _, ext = os.path.splitext(name.lower())
                    if ext in allowed_exts:
                        files_to_process.append((full, name))
                        if len(files_to_process) >= req.maxFiles:
                            break
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing files: {str(e)}")

    # Process files
    doc_processor = DocumentProcessor()
    documents: list[DocumentData] = []
    for i, (full_path, filename) in enumerate(files_to_process):
        try:
            pages_data = doc_processor.extract(full_path, filename)
            pages = [
                DocumentPage(page_number=p["page_number"], text=p["text"]) for p in pages_data
            ]
            documents.append(
                DocumentData(
                    id=i + 1,
                    filename=filename,
                    pages=pages,
                    total_pages=len(pages),
                )
            )
        except Exception as e:
            # Skip problematic files but continue processing others
            print(f"Scan error for {filename}: {str(e)}")
            continue

    return UploadResponse(
        documents=documents,
        message=f"Scanned {len(files_to_process)} files, processed {len(documents)} documents",
    )


@app.post("/scan-smb", response_model=UploadResponse)
async def scan_smb(req: SMBScanRequest):
    """Scan an SMB/CIFS share for supported documents using credentials and return extracted content.

    Caution:
    - Intended for local/dev or trusted environments. Do not expose without auth.
    - Processes up to maxFiles matching extensions.
    """
    allowed_exts = [e.lower() for e in (req.extensions or DEFAULT_SCAN_EXTS)]

    # Connect
    conn = SMBConnection(
        req.username,
        req.password,
        req.clientName,
        req.serverName or req.server,
        domain=req.domain,
        use_ntlm_v2=req.useNTLMv2,
        is_direct_tcp=True,
    )

    if not conn.connect(req.server, req.port):
        raise HTTPException(status_code=502, detail="Failed to connect to SMB server")

    doc_processor = DocumentProcessor()
    documents: list[DocumentData] = []
    files_to_process: list[tuple[str, str]] = []  # (remote_path, filename)

    def list_dir_recursive(base_path: str):
        nonlocal files_to_process
        try:
            # Ensure path starts with '/'
            p = base_path if base_path.startswith("/") else f"/{base_path}"
            entries = conn.listPath(req.share, p)
        except Exception as e:
            print(f"SMB listPath error for {base_path}: {e}")
            return

        for entry in entries:
            name = entry.filename
            if name in (".", ".."):
                continue
            remote_child = f"{p.rstrip('/')}/{name}"
            if entry.isDirectory:
                if req.recurse and len(files_to_process) < req.maxFiles:
                    list_dir_recursive(remote_child)
            else:
                _, ext = os.path.splitext(name.lower())
                if ext in allowed_exts:
                    files_to_process.append((remote_child, name))
                    if len(files_to_process) >= req.maxFiles:
                        return

    # Collect targets
    list_dir_recursive(req.path or "/")

    # Download and process
    for i, (remote_path, filename) in enumerate(files_to_process):
        try:
            # Save to temp with correct extension
            _, ext = os.path.splitext(filename)
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
                conn.retrieveFile(req.share, remote_path, tmp)
                tmp_path = tmp.name

            try:
                pages_data = doc_processor.extract(tmp_path, filename)
                pages = [
                    DocumentPage(page_number=p["page_number"], text=p["text"]) for p in pages_data
                ]
                documents.append(
                    DocumentData(
                        id=i + 1,
                        filename=filename,
                        pages=pages,
                        total_pages=len(pages),
                    )
                )
            finally:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
        except Exception as e:
            print(f"SMB retrieve/process error for {remote_path}: {e}")
            continue

    try:
        conn.close()
    except Exception:
        pass

    return UploadResponse(
        documents=documents,
        message=f"Processed {len(documents)} documents from SMB share {req.share}",
    )

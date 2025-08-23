import sys
import os
import json
import tempfile
from http.server import BaseHTTPRequestHandler
from typing import List, Dict, Any, Tuple

# Add the backend directory to the Python path before importing
backend_path = os.path.join(os.path.dirname(__file__), "..", "backend")
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from models import UploadResponse, DocumentData, DocumentPage  # type: ignore
from document_processor import DocumentProcessor  # type: ignore
import httpx

GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3"

# Supported MIME types and extensions for direct download
DIRECT_MIME_TO_EXT = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "text/csv": ".csv",
}

# Google native docs export mapping
EXPORT_MIME = {
    "application/vnd.google-apps.document": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".docx",
    ),
    "application/vnd.google-apps.presentation": (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".pptx",
    ),
    "application/vnd.google-apps.spreadsheet": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".xlsx",
    ),
}

SUPPORTED_EXTS = set(DIRECT_MIME_TO_EXT.values())


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: Dict[str, Any]):
    handler.send_response(status)
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(json.dumps(payload).encode())


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_POST(self):
        try:
            content_length = int(self.headers.get("content-length", 0))
            body = self.rfile.read(content_length) if content_length > 0 else b"{}"
            data = json.loads(body.decode() or "{}")

            access_token = data.get("accessToken")
            folder_id = data.get("folderId")
            recurse = bool(data.get("recurse", True))
            max_files = int(data.get("maxFiles", 100))
            mime_filters = data.get("mimeFilters")  # optional list of strings

            if not access_token or not folder_id:
                return _json_response(
                    self,
                    400,
                    {
                        "error": "Missing required fields: accessToken and folderId",
                        "fields": ["accessToken", "folderId"],
                    },
                )

            docs = self._scan_drive(access_token, folder_id, recurse, max_files, mime_filters)

            return _json_response(self, 200, docs)
        except Exception as e:
            return _json_response(self, 500, {"error": f"Internal error: {str(e)}"})

    def _scan_drive(
        self,
        access_token: str,
        folder_id: str,
        recurse: bool,
        max_files: int,
        mime_filters: List[str] | None,
    ) -> Dict[str, Any]:
        headers = {"Authorization": f"Bearer {access_token}"}
        client = httpx.Client(headers=headers, timeout=30.0)
        doc_processor = DocumentProcessor()

        # BFS through folders if recurse, else just list the given folder
        folders = [folder_id]
        files_found: List[Dict[str, Any]] = []
        processed_docs: List[DocumentData] = []

        def list_children(fid: str) -> Tuple[List[Dict[str, Any]], List[str]]:
            q = f"'{fid}' in parents and trashed = false"
            params = {
                "q": q,
                "fields": "nextPageToken, files(id, name, mimeType)",
                "pageSize": 1000,
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
            }
            next_token = None
            children: List[Dict[str, Any]] = []
            subfolders: List[str] = []
            while True:
                if next_token:
                    params["pageToken"] = next_token
                resp = client.get(f"{GOOGLE_DRIVE_API}/files", params=params)
                resp.raise_for_status()
                payload = resp.json()
                for f in payload.get("files", []):
                    if f.get("mimeType", "").startswith("application/vnd.google-apps.folder"):
                        subfolders.append(f["id"])  # folder found
                    else:
                        children.append(f)
                next_token = payload.get("nextPageToken")
                if not next_token:
                    break
            return children, subfolders

        try:
            visited = set()
            while folders and len(files_found) < max_files:
                current = folders.pop(0)
                if current in visited:
                    continue
                visited.add(current)
                children, subfolders = list_children(current)
                # Apply optional MIME filters
                if mime_filters:
                    mfset = set(mime_filters)
                    children = [c for c in children if c.get("mimeType") in mfset]
                files_found.extend(children)
                if len(files_found) >= max_files:
                    files_found = files_found[: max_files]
                    break
                if recurse:
                    folders.extend(subfolders)
        except httpx.HTTPError as e:
            return {"error": f"Drive listing failed: {str(e)}"}

        # Download and process
        processed_count = 0
        for i, f in enumerate(files_found):
            if processed_count >= max_files:
                break
            file_id = f["id"]
            name = f.get("name", file_id)
            mime = f.get("mimeType", "")

            # Determine download method and target extension
            download_url = None
            export_mime = None
            ext = None
            is_export = False

            if mime in DIRECT_MIME_TO_EXT:
                download_url = f"{GOOGLE_DRIVE_API}/files/{file_id}?alt=media"
                ext = DIRECT_MIME_TO_EXT[mime]
            elif mime in EXPORT_MIME:
                export_mime, ext = EXPORT_MIME[mime]
                download_url = f"{GOOGLE_DRIVE_API}/files/{file_id}/export"
                is_export = True
            else:
                # Skip unsupported types
                continue

            if ext not in SUPPORTED_EXTS:
                continue

            try:
                if is_export:
                    resp = client.get(download_url, params={"mimeType": export_mime})
                else:
                    resp = client.get(download_url)
                resp.raise_for_status()
                content = resp.content

                # Persist to temp file with correct suffix for parsers
                safe_ext = ext
                base_name = os.path.splitext(name)[0]
                target_filename = f"{base_name}{safe_ext}"
                with tempfile.NamedTemporaryFile(delete=False, suffix=safe_ext) as tmp:
                    tmp.write(content)
                    tmp_path = tmp.name

                try:
                    pages_data = doc_processor.extract(tmp_path, target_filename)
                    pages = [
                        DocumentPage(page_number=p["page_number"], text=p["text"]) for p in pages_data
                    ]
                    processed_docs.append(
                        DocumentData(
                            id=len(processed_docs) + 1,
                            filename=target_filename,
                            pages=pages,
                            total_pages=len(pages),
                        )
                    )
                    processed_count += 1
                finally:
                    try:
                        os.unlink(tmp_path)
                    except OSError:
                        pass
            except httpx.HTTPError as e:
                # Skip failed downloads
                print(f"Download failed for {name}: {str(e)}")
                continue
            except Exception as e:
                print(f"Processing failed for {name}: {str(e)}")
                continue

        response = UploadResponse(
            documents=processed_docs,
            message=f"Processed {len(processed_docs)} documents from Google Drive",
        )
        return response.model_dump()

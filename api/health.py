import json
import os
import sys
from http.server import BaseHTTPRequestHandler

# Add backend path to import LLMService
backend_path = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from llm_service import LLMService


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Health check endpoint"""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Type", "application/json")
        self.end_headers()

        try:
            svc = LLMService()
            provider = getattr(svc, "provider", "unknown")
            model = (
                svc.hf_model_id if provider == "huggingface" else getattr(svc, "model", None)
            )
        except Exception:
            provider = "unknown"
            model = None

        response_data = {"status": "healthy", "mode": "stateless", "provider": provider, "model": model}
        self.wfile.write(json.dumps(response_data).encode())

    def do_OPTIONS(self):
        # Handle CORS preflight
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

import asyncio
import os
from typing import List, Dict, Any
from openai import AsyncOpenAI
from dotenv import load_dotenv
import json
import re
import httpx
import random
from urllib.parse import quote

load_dotenv()


class LLMService:
    def __init__(self):
        # Provider selection
        self.provider = os.environ.get("LLM_PROVIDER", "openai").strip().lower()

        # OpenAI client (default provider)
        self.client = None
        self.model = "gpt-4o-mini"
        if self.provider == "openai":
            api_key = os.environ.get("OPENAI_API_KEY")
            if not api_key or api_key == "your_openai_api_key_here":
                print("⚠️  OpenAI API key not set. LLM features will be disabled.")
                self.client = None
            else:
                self.client = AsyncOpenAI(api_key=api_key)
            # default OpenAI model
            self.model = os.environ.get("OPENAI_MODEL", self.model)

        # Hugging Face configuration (optional provider)
        # Prefer HF_API_TOKEN; fall back to the standard HF_TOKEN if present
        self.hf_api_token = (
            os.environ.get("HF_API_TOKEN")
            or os.environ.get("HF_TOKEN")
            or ""
        ).strip()
        self.hf_model_id = (
            os.environ.get(
                "HF_MODEL_ID",
                # Sensible default lightweight instruct model
                "meta-llama/Meta-Llama-3.1-8B-Instruct",
            )
            or ""
        ).strip()
        self.hf_api_base = (
            os.environ.get(
                "HF_API_BASE",
                "https://api-inference.huggingface.co/models",
            )
            or "https://api-inference.huggingface.co/models"
        ).strip()
        self.hf_temperature = float(os.environ.get("HF_TEMPERATURE", "0.3"))
        self.hf_use_endpoint = os.environ.get("HF_USE_ENDPOINT", "").strip().lower() in ("1", "true", "yes", "on")

        # HF retry/backoff configuration
        self.hf_max_attempts = int(os.environ.get("HF_MAX_ATTEMPTS", "5"))
        self.hf_backoff_base = float(os.environ.get("HF_BACKOFF_BASE", "1.0"))
        self.hf_backoff_max = float(os.environ.get("HF_BACKOFF_MAX", "8.0"))
        self.hf_retry_jitter = float(os.environ.get("HF_RETRY_JITTER", "0.3"))  # 0.0-1.0

        # HF HTTP timeout configuration (seconds)
        self.hf_http_timeout = float(os.environ.get("HF_HTTP_TIMEOUT", "120"))

        # Timeouts and concurrency controls
        self.doc_select_timeout = float(os.environ.get("LLM_DOC_SELECT_TIMEOUT", "30"))
        self.page_chunk_timeout = float(os.environ.get("LLM_PAGE_CHUNK_TIMEOUT", "45"))
        self.answer_chunk_timeout = float(os.environ.get("LLM_ANSWER_CHUNK_TIMEOUT", "30"))
        self.answer_overall_timeout = float(os.environ.get("LLM_ANSWER_OVERALL_TIMEOUT", "180"))
        self.max_concurrency = int(os.environ.get("LLM_MAX_CONCURRENCY", "4"))
        self._semaphore = asyncio.Semaphore(self.max_concurrency)
        # Heartbeat interval used to keep SSE connections alive during long operations
        self.heartbeat_interval = float(os.environ.get("LLM_HEARTBEAT_INTERVAL", "5"))

        self.pricing = {
            "gpt-4o": {"input": 5.0, "output": 15.0},
            "gpt-4o-mini": {"input": 0.15, "output": 0.60},
        }

    def _extract_json_array(self, text: str) -> list:
        """Best-effort extraction of a JSON array from LLM output.
        Returns [] if nothing parseable is found.
        """
        if not text:
            return []
        # Fast path
        try:
            data = json.loads(text)
            return data if isinstance(data, list) else []
        except Exception:
            pass
        # Remove code fences and extra markers
        cleaned = re.sub(r"^```[a-zA-Z]*\n|```$", "", text.strip(), flags=re.MULTILINE)
        # Find first '[' and try to parse up to each ']' from the end
        start = cleaned.find("[")
        if start == -1:
            return []
        for end in range(len(cleaned) - 1, start, -1):
            if cleaned[end] == "]":
                snippet = cleaned[start : end + 1]
                try:
                    data = json.loads(snippet)
                    if isinstance(data, list):
                        return data
                except Exception:
                    continue
        return []

    def apply_overrides(
        self,
        provider: str | None = None,
        model: str | None = None,
        hf_model_id: str | None = None,
    ) -> None:
        """Apply per-request overrides for provider and models.

        Safe to call per request. Initializes OpenAI client if needed.
        """
        if provider:
            self.provider = provider.strip().lower()
        if model:
            self.model = model.strip()
        if hf_model_id:
            self.hf_model_id = hf_model_id.strip()

        # Ensure OpenAI client exists if provider is openai
        if self.provider == "openai" and self.client is None:
            api_key = os.environ.get("OPENAI_API_KEY")
            if api_key and api_key != "your_openai_api_key_here":
                self.client = AsyncOpenAI(api_key=api_key)

    def calculate_cost(self, usage_data, model="gpt-4o-mini"):
        print(usage_data)
        """Calculate cost based on token usage"""
        if not usage_data or model not in self.pricing:
            return 0.0

        input_tokens = usage_data.prompt_tokens
        output_tokens = usage_data.completion_tokens

        input_cost = (input_tokens / 1_000_000 * 1.0) * self.pricing[model]["input"]
        output_cost = (output_tokens / 1_000_000 * 1.0) * self.pricing[model]["output"]

        return input_cost + output_cost

    async def select_documents(
        self,
        description: str,
        documents: List[Dict[str, Any]],
        question: str,
        chat_history: List[Dict[str, Any]] = None,
    ) -> tuple[List[Dict[str, Any]], float]:
        """
        Select relevant documents based on description, question, and chat history
        """

        doc_summaries = []
        for doc in documents:
            doc_summaries.append(
                {
                    "id": doc["id"],
                    "filename": doc["filename"],
                    "total_pages": doc["total_pages"],
                    "first_page_preview": (doc["pages"][0]["text"][:500] + "..."),
                }
            )

        # Format chat history
        history_context = ""
        if chat_history:
            history_context = "\n\nChat History:\n"
            for msg in chat_history:
                if hasattr(msg, "role"):
                    role = msg.role
                    content = msg.content
                else:
                    role = msg.get("role", "unknown")
                    content = msg.get("content", "")
                history_context += f"{role.capitalize()}: {content}\n"

        prompt = f"""
            Based on the following document collection description, chat history, 
            and current question, select which documents are most likely to 
            contain the answer.

            <Document Collection Description>
            {description}
            <Document Collection Description>

            <Available Documents>
            {json.dumps(doc_summaries, indent=2)}
            <Available Documents>

            <Chat History>
            {history_context}
            <Chat History>

            <Current Question>
            {question}
            <Current Question>

            Return a JSON array of document IDs (numbers) that are most relevant to 
            the current question and conversation context.
            Only return the JSON array, no other text.
            Example: [1, 3, 5]
            """

        try:
            if self.provider == "openai":
                # Guard against missing client
                if not self.client:
                    raise RuntimeError("OpenAI client not initialized")

                response = await asyncio.wait_for(
                    self.client.chat.completions.create(
                        model=self.model,
                        messages=[{"role": "user", "content": prompt}],
                    ),
                    timeout=self.doc_select_timeout,
                )

                selected_ids = json.loads(response.choices[0].message.content)
                # Coerce to ints to handle cases like ["1", "2"]
                try:
                    selected_ids = [int(x) for x in selected_ids if isinstance(x, (int, str)) and str(x).strip().lstrip("+-").isdigit()]
                except Exception:
                    selected_ids = []
                cost = self.calculate_cost(response.usage, self.model)
            else:
                # Hugging Face path
                text = await asyncio.wait_for(
                    self._hf_generate(prompt, max_new_tokens=256),
                    timeout=self.doc_select_timeout,
                )
                selected_ids = self._extract_json_array(text)
                # Coerce to ints; fallback if empty
                try:
                    selected_ids = [int(x) for x in selected_ids if isinstance(x, (int, str)) and str(x).strip().lstrip("+-").isdigit()]
                except Exception:
                    selected_ids = []
                if not selected_ids:
                    # Fallback: if parsing fails or empty, keep all documents
                    selected_ids = [d["id"] for d in documents]
                cost = 0.0

            # Return full document objects for selected IDs
            selected_docs = []
            for doc in documents:
                if doc["id"] in selected_ids:
                    selected_docs.append(doc)

            # Safety: never return empty selection; fallback to all
            if not selected_docs:
                selected_docs = documents

            return selected_docs, cost

        except asyncio.TimeoutError:
            print("Timeout in document selection; falling back to all documents")
            return documents, 0.0
        except Exception as e:
            print(f"Error in document selection: {e}")
            # Fallback: return all documents
            return documents, 0.0

    async def find_relevant_pages(
        self,
        pages: List[Dict[str, Any]],
        question: str,
        filename: str,
        chat_history: List[Dict[str, Any]] = None,
    ) -> tuple[List[Dict[str, Any]], float]:
        print("find_relevant_pages")
        print(filename)
        """Find relevant pages by processing 20 pages at a time in parallel"""

        # Create chunks of 20 pages
        chunks = []
        for i in range(0, len(pages), 20):
            chunk = pages[i : i + 20]
            chunks.append(chunk)

        # Process all chunks in parallel
        chunk_tasks = []
        for chunk_index, chunk in enumerate(chunks):
            task = self._process_page_chunk(
                chunk, question, filename, chunk_index, chat_history
            )
            chunk_tasks.append(task)

        # Wait for all chunks to complete
        chunk_results = await asyncio.gather(*chunk_tasks, return_exceptions=True)

        # Combine results from all chunks
        relevant_pages = []
        total_cost = 0.0
        for result in chunk_results:
            if isinstance(result, Exception):
                print(f"Error in chunk processing: {result}")
                continue
            if isinstance(result, tuple) and len(result) == 2:
                pages, cost = result
                relevant_pages.extend(pages)
                total_cost += cost
            elif isinstance(result, list):
                # Fallback for old format
                relevant_pages.extend(result)

        return relevant_pages, total_cost

    async def _process_page_chunk(
        self,
        chunk: List[Dict[str, Any]],
        question: str,
        filename: str,
        chunk_index: int,
        chat_history: List[Dict[str, Any]] = None,
    ) -> tuple[List[Dict[str, Any]], float]:
        """Process a single chunk of pages"""
        import time

        chunk_start = time.time()
        print(f"    🔍 Processing chunk {chunk_index + 1} with {len(chunk)} pages...")

        # Prepare content for LLM
        pages_content = []
        for page in chunk:
            # Defensive check for required fields
            if "page_number" not in page:
                print(f"Warning: page missing 'page_number': {page.keys()}")
                continue
            if "text" not in page:
                print(f"Warning: page missing 'text': {page.keys()}")
                continue

            pages_content.append(
                {
                    "page_number": page["page_number"],
                    "page_content": (page["text"]),
                }
            )

        # Format chat history for context
        history_context = ""
        if chat_history:
            history_context = "\n\nRecent Chat History:\n"
            for msg in chat_history:
                if hasattr(msg, "role"):
                    role = msg.role
                    content = msg.content
                else:
                    role = msg.get("role", "unknown")
                    content = msg.get("content", "")
                history_context += f"{role.capitalize()}: {content}...\n"

        prompt = f"""
            Analyze the following pages from document "{filename}" and determine 
            which pages are relevant to the current question, considering the conversation context. 
            Return empty array if no pages are relevant.
            
            <Chat History>
            {history_context}
            <Chat History>
            
            <Current Question>
            {question}
            <Current Question>

            <Document Page Content>
            {json.dumps(pages_content, indent=2)}
            <Document Page Content>

            Return a JSON array of page numbers relevant to the current question
            Only return the JSON array, no other text.
            Example: [1, 3, 5]
            """

        try:
            if self.provider == "openai":
                if not self.client:
                    raise RuntimeError("OpenAI client not initialized")

                # Concurrency-limited, timeout-bounded call
                async with self._semaphore:
                    response = await asyncio.wait_for(
                        self.client.chat.completions.create(
                            model=self.model,
                            messages=[{"role": "user", "content": prompt}],
                        ),
                        timeout=self.page_chunk_timeout,
                    )

                relevant_page_numbers = json.loads(response.choices[0].message.content)
                # Coerce to ints to handle ["1", "2"] output
                try:
                    relevant_page_numbers = [int(x) for x in relevant_page_numbers if isinstance(x, (int, str)) and str(x).strip().lstrip("+-").isdigit()]
                except Exception:
                    relevant_page_numbers = []
                cost = self.calculate_cost(response.usage, model=self.model)
            else:
                # Hugging Face path
                async with self._semaphore:
                    text = await asyncio.wait_for(
                        self._hf_generate(prompt, max_new_tokens=256),
                        timeout=self.page_chunk_timeout,
                    )
                relevant_page_numbers = self._extract_json_array(text)
                # Coerce to ints; if empty trigger fallback
                try:
                    relevant_page_numbers = [int(x) for x in relevant_page_numbers if isinstance(x, (int, str)) and str(x).strip().lstrip("+-").isdigit()]
                except Exception:
                    relevant_page_numbers = []
                if not relevant_page_numbers:
                    # Trigger fallback to first page
                    raise ValueError("No parseable JSON array for relevant pages")
                cost = 0.0

            # Add full page data for relevant pages
            relevant_pages = []
            for page in chunk:
                if "page_number" not in page:
                    continue
                if page["page_number"] in relevant_page_numbers:
                    page_with_source = page.copy()
                    page_with_source["source_document"] = filename
                    relevant_pages.append(page_with_source)

            chunk_time = time.time() - chunk_start
            print(
                f"    ✅ Chunk {chunk_index + 1} completed in {chunk_time:.2f}s, found {len(relevant_pages)} relevant pages"
            )
            return relevant_pages, cost

        except asyncio.TimeoutError:
            chunk_time = time.time() - chunk_start
            print(
                f"    ⏰ Chunk {chunk_index + 1} timed out in {chunk_time:.2f}s; falling back to first page"
            )
            # Fallback: include first page of chunk
            if chunk:
                first_page = chunk[0].copy()
                first_page["source_document"] = filename
                return [first_page], 0.0
            return [], 0.0
        except Exception as e:
            chunk_time = time.time() - chunk_start
            print(f"    ❌ Chunk {chunk_index + 1} failed in {chunk_time:.2f}s: {e}")
            # Fallback: include first page of chunk
            if chunk:
                first_page = chunk[0].copy()
                first_page["source_document"] = filename
                return [first_page], 0.0
            return [], 0.0

    async def generate_answer_stream(
        self,
        relevant_pages: List[Dict[str, Any]],
        question: str,
        chat_history: List[Dict[str, Any]] = None,
        model: str = "gpt-4o-mini",
    ):
        """Generate final answer using all relevant pages with streaming"""

        if not relevant_pages:
            yield {
                "type": "content",
                "content": "I couldn't find any relevant information to answer your question.",
            }
            yield {"type": "cost", "cost": 0.0}
            return

        # Format chat history for conversational context
        history_context = ""
        if chat_history:
            history_context = "\n\nConversation History:\n"
            for msg in chat_history:  # Include last 4 messages for context
                if hasattr(msg, "role"):
                    role = msg.role
                    content = msg.content
                else:
                    role = msg.get("role", "unknown")
                    content = msg.get("content", "")
                history_context += f"{role.capitalize()}: {content}\n"
        print(relevant_pages)
        prompt = f"""
            Based on the following conversation context, document content, and current question, provide a concise, direct answer.
            Always back up your answer with precise citations and short verbatim quotes from the documents when possible.

            IMPORTANT citation format (must be used for every reference):
            $PAGE_START{{filename}}:{{page_numbers}}$PAGE_END
            - Single page example: $PAGE_STARTreport.pdf:5$PAGE_END
            - Multiple pages example: $PAGE_STARTanalysis.docx:2,7,12$PAGE_END 
            - Page range example: $PAGE_STARTmanual.pptx:15-18$PAGE_END

            QUOTED EVIDENCE GUIDELINES:
            - Include 1-3 short verbatim quotes (2-3 lines max) from the most relevant pages.
            - Place each quote in double quotes immediately followed by the citation marker.
              Example: "Quoted passage here" $PAGE_STARTreport.pdf:5$PAGE_END
            - If multiple documents are used, provide at least one quote per document when possible.

            <Chat History>
            {history_context}
            <Chat History>
            
            <Current Question>
            {question}
            <Current Question>

            <Document Page Content>
            {json.dumps(relevant_pages)}
            <Document Page Content>

            Write the answer first. Then add a brief Evidence section listing the short quotes with their citations.
            Do not include any JSON in the answer. Focus strictly on the question and the provided documents.
            """

        try:
            if self.provider == "openai":
                if not self.client:
                    raise RuntimeError("OpenAI client not initialized")

                stream = await asyncio.wait_for(
                    self.client.chat.completions.create(
                        model=model,
                        messages=[{"role": "user", "content": prompt}],
                        stream=True,
                        stream_options={"include_usage": True},
                    ),
                    timeout=self.answer_chunk_timeout,
                )

                start = asyncio.get_event_loop().time()
                iterator = stream.__aiter__()
                while True:
                    # Enforce per-chunk timeout and overall timeout
                    now = asyncio.get_event_loop().time()
                    if now - start > self.answer_overall_timeout:
                        yield {
                            "type": "content",
                            "content": "Answer generation timed out. Partial answer shown above if any.",
                        }
                        yield {"type": "cost", "cost": 0.0}
                        return
                    try:
                        chunk = await asyncio.wait_for(
                            iterator.__anext__(), timeout=self.answer_chunk_timeout
                        )
                    except StopAsyncIteration:
                        break
                    except asyncio.TimeoutError:
                        yield {
                            "type": "content",
                            "content": "Answer generation stalled; timing out to keep the app responsive.",
                        }
                        yield {"type": "cost", "cost": 0.0}
                        return

                    if chunk.usage:
                        yield {
                            "type": "cost",
                            "cost": self.calculate_cost(chunk.usage, model=model),
                        }
                    if len(chunk.choices) > 0 and chunk.choices[0].delta.content is not None:
                        yield {"type": "content", "content": chunk.choices[0].delta.content}
            else:
                # Hugging Face path: generate with heartbeats while waiting
                start = asyncio.get_event_loop().time()
                task = asyncio.create_task(self._hf_generate(prompt, max_new_tokens=800))
                text: str | None = None
                while True:
                    now = asyncio.get_event_loop().time()
                    if now - start > self.answer_overall_timeout:
                        # Cancel the underlying task and inform client
                        try:
                            task.cancel()
                        except Exception:
                            pass
                        yield {
                            "type": "content",
                            "content": "Answer generation timed out. Partial answer shown above if any.",
                        }
                        yield {"type": "cost", "cost": 0.0}
                        return
                    try:
                        # Wait up to heartbeat interval for completion
                        text = await asyncio.wait_for(asyncio.shield(task), timeout=self.heartbeat_interval)
                        break
                    except asyncio.TimeoutError:
                        # Periodic heartbeat to keep client connection alive
                        yield {"type": "heartbeat"}
                        continue

                if text is None:
                    text = ""

                # Yield in pieces to emulate streaming behavior
                step = 256
                for i in range(0, len(text), step):
                    yield {"type": "content", "content": text[i : i + step]}
                yield {"type": "cost", "cost": 0.0}

        except Exception as e:
            yield {"type": "content", "content": f"Error generating answer: {str(e)}"}
            yield {"type": "cost", "cost": 0.0}

    async def _hf_generate(self, prompt: str, max_new_tokens: int = 512) -> str:
        """Call Hugging Face Inference API for text generation.

        Returns the generated text as a string. Falls back gracefully on errors.
        """
        if not self.hf_api_token:
            raise RuntimeError("Hugging Face API token not set (set HF_API_TOKEN or HF_TOKEN)")
        # Build model URL.
        # - Serverless Inference API: {HF_API_BASE}/{HF_MODEL_ID}
        # - Inference Endpoint mode: post directly to HF_API_BASE (no model path).
        safe_model_id = quote((self.hf_model_id or "").strip(), safe="/")
        use_endpoint = (
            self.hf_use_endpoint
            or not self.hf_model_id
            or ("api-inference.huggingface.co" not in (self.hf_api_base or ""))
        )
        if use_endpoint:
            model_url = (self.hf_api_base or "").strip().rstrip("/")
        else:
            model_url = f"{(self.hf_api_base or '').strip().rstrip('/')}/{safe_model_id}"
        headers = {
            "Authorization": f"Bearer {self.hf_api_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            # Encourage the endpoint to wait for model readiness
            "X-Wait-For-Model": "true",
        }
        payload_primary = {
            "inputs": prompt,
            "parameters": {
                "max_new_tokens": max_new_tokens,
                "temperature": self.hf_temperature,
                "return_full_text": False,
            },
            "options": {"wait_for_model": True},
        }
        payload_alt = {
            "inputs": [prompt],
            "parameters": {
                "max_new_tokens": max_new_tokens,
                "temperature": self.hf_temperature,
                "return_full_text": False,
            },
            "options": {"wait_for_model": True},
        }
        async with httpx.AsyncClient(timeout=self.hf_http_timeout) as client:
            attempts = max(1, int(self.hf_max_attempts or 3))
            last_resp = None
            for attempt in range(1, attempts + 1):
                print(f"🤖 HF request -> url={model_url} endpoint_mode={use_endpoint} payload=primary inputs_len={len(prompt)}")
                resp = await client.post(model_url, headers=headers, json=payload_primary)
                # 422: switch payload shape
                if resp.status_code == 422:
                    print("ℹ️ HF 422 on primary payload; retrying with alt payload (inputs as list)")
                    resp = await client.post(model_url, headers=headers, json=payload_alt)
                # Auth fallback for public models only in serverless cases
                if resp.status_code in (401, 403, 404):
                    print("ℹ️ HF auth error (401/403/404) with Authorization; retrying without auth for public model access")
                    headers_no_auth = {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                    }
                    resp = await client.post(model_url, headers=headers_no_auth, json=payload_primary)
                    if resp.status_code == 422:
                        print("ℹ️ HF 422 (no-auth) on primary payload; retrying with alt payload (inputs as list)")
                        resp = await client.post(model_url, headers=headers_no_auth, json=payload_alt)

                # If success, parse and return
                if resp.status_code == 200:
                    data = resp.json()
                    # The API may return a list with generated_text or a dict with candidates
                    if isinstance(data, list) and data and isinstance(data[0], dict) and "generated_text" in data[0]:
                        return data[0]["generated_text"]
                    if isinstance(data, dict):
                        if "generated_text" in data:
                            return data["generated_text"]
                        if "generated_text" in data.get("results", [{}])[0]:
                            return data["results"][0]["generated_text"]
                    return json.dumps(data)

                last_resp = resp
                should_retry = resp.status_code in (408, 429, 500, 502, 503, 504, 529)
                if should_retry and attempt < attempts:
                    # Exponential backoff with jitter
                    base = max(0.1, float(self.hf_backoff_base or 1.0))
                    cap = max(base, float(self.hf_backoff_max or 8.0))
                    raw = base * (2 ** (attempt - 1))
                    backoff = min(cap, raw)
                    jitter = float(self.hf_retry_jitter or 0.0)
                    if jitter > 0:
                        # jitter in [1 - j/2, 1 + j/2]
                        factor = (1 - jitter / 2.0) + random.random() * jitter
                        backoff *= factor
                    print(f"⏳ HF {resp.status_code}; retrying in {backoff:.2f}s (attempt {attempt}/{attempts})")
                    await asyncio.sleep(backoff)
                    continue
                break

            # If we reach here, we failed after retries
            resp = last_resp
            if resp is None:
                raise RuntimeError("HF inference returned no response")
            try:
                data = resp.json()
            except Exception:
                data = {"error": resp.text}
            try:
                snippet = resp.text[:300]
            except Exception:
                snippet = "<no body>"
            print(f"❗ HF non-200 response: status={resp.status_code} url={model_url} body_snippet={snippet}")
            raise RuntimeError(f"HF inference error {resp.status_code} (url={model_url}): {data}")
            # The API may return a list with generated_text or a dict with candidates
            if isinstance(data, list) and data and isinstance(data[0], dict) and "generated_text" in data[0]:
                return data[0]["generated_text"]
            if isinstance(data, dict):
                # Some backends return {"generated_text": "..."}
                if "generated_text" in data:
                    return data["generated_text"]
                # Text Generation Inference (TGI) style
                if "generated_text" in data.get("results", [{}])[0]:
                    return data["results"][0]["generated_text"]
            # Fallback: stringify
            return json.dumps(data)

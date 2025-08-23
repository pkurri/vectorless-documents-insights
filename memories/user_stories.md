# User Stories (Tech Context)

- As a user, I can upload up to 100 PDF files, each up to 4.5MB, so that the system can process them without server storage.
  - Tech: Next.js 15 frontend (`app/`), serverless Python endpoint `api/upload.py` with `PyPDF2`.
  - Related: `app/utils/chunkedUpload.ts`, `vercel.json` routes.

- As a user, I want large uploads to be automatically chunked so they succeed within Vercel limits.
  - Tech: Client-side chunking in TypeScript; chunk headers handled in `api/upload.py`.

- As a user, I can ask questions and get streamed answers with progress updates.
  - Tech: SSE via `api/chat/stream.py` and FastAPI streaming in `backend/main.py`.
  - Related: `backend/llm_service.py` for multi-step LLM orchestration.

- As a user, I want citations to specific documents/pages in answers.
  - Tech: Special page reference format emitted by `LLMService.generate_answer_stream()`.

- As a maintainer, I want a modern, typed front-end stack.
  - Tech: Next.js 15, React 19, TypeScript 5, Tailwind CSS 4.
  - Linting: `next lint`; type-checking via `tsc --noEmit`.

- As a maintainer, I want stateless, serverless-friendly APIs for deployment.
  - Tech: Vercel serverless Python functions (`api/`); optional local FastAPI dev server in `backend/`.

- As a maintainer, I want CI to validate builds and lint/type-check both Node and Python code.
  - Tech: GitHub Actions-like workflow at `windsurf_workflows/test_and_lint.yaml`.

- As a user, I want to upload documents in multiple formats (Word, PowerPoint, Excel).
  - Tech: Multi-format support via `PyPDF2` and `python-docx`.

- As a user, I want citations to highlight exact text passages in answers.
  - Tech: Highlight citations in `LLMService.generate_answer_stream()`.

- As a user, I want to share sessions with team members.
  - Tech: Collaboration features via `next-auth` and `nextjs-collaboration`.

- As a user, I want to track usage patterns and insights.
  - Tech: Analytics dashboard via `nextjs-analytics`.

- As a user, I want to use custom models for LLMs.
  - Tech: Custom models via `openai` and `python-openai` and `hugging face models`.

- As a user, I want to process multiple questions simultaneously.
  - Tech: Batch operations via `nextjs-batch`.

- As a user, I want to scan folder or Drive to scan documents instead of uploading and answer questions.
  - Tech: Batch operations via `nextjs-batch`.

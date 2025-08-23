# Architectural Decisions (ADR)

## ADR-001: Frontend Framework
- Decision: Use Next.js 15 (App Router) with React 19 and TypeScript 5.
- Status: Accepted
- Rationale: Modern app routing, server components, strong TS support, excellent Vercel integration.
- Consequences: Requires Node.js >= 18; prefer Node 20 for CI and local dev.
- References: `package.json`, `next.config.ts`, `tsconfig.json`.

## ADR-002: Styling
- Decision: Tailwind CSS v4 with `@tailwindcss/postcss`.
- Status: Accepted
- Rationale: Utility-first CSS, rapid prototyping, small bundle when purged.
- References: `package.json`, `postcss.config.mjs`, `app/globals.css`.

## ADR-003: Backend Architecture
- Decision: Stateless, serverless Python functions on Vercel for production, with a local FastAPI server for development/testing.
- Status: Accepted
- Rationale: No database requirement; leverages Vercel's Python runtime and routing; FastAPI offers local dev ergonomics and streaming.
- Consequences: Must keep payloads under Vercel limits (4.5MB); use chunked uploads; avoid persistent storage.
- References: `vercel.json`, `api/upload.py`, `api/chat/stream.py`, `api/index.py`, `backend/main.py`.

## ADR-004: PDF Processing
- Decision: Use `PyPDF2` for text extraction.
- Status: Accepted
- Rationale: Lightweight, reliable extraction, widely supported.
- References: `backend/pdf_processor.py`, `requirements.txt`.

## ADR-005: LLM Integration
- Decision: Use OpenAI via Python SDK (`openai>=1.99.6`) and optionally Node SDK (`openai@^5.12.2`).
- Status: Accepted
- Rationale: Mature APIs, streaming support, usage tracking, cost calc hooks.
- Consequences: Requires `OPENAI_API_KEY` in environment; must avoid server-side storage of documents.
- References: `backend/llm_service.py`, `.env.local` (example), `README.md`.

## ADR-006: Streaming & Protocols
- Decision: Use Server-Sent Events (SSE) for streaming chat responses.
- Status: Accepted
- Rationale: Simpler than websockets for one-way streams; supported in serverless envs.
- References: `backend/main.py` (`StreamingResponse`), `api/chat/stream.py` (route), frontend stream consumer.

## ADR-007: CI/Linting/Type-Checking
- Decision: Add workflow to type-check, lint, and build Next.js; compile Python and optionally add static checks later.
- Status: Accepted
- Rationale: Catch regressions early across both stacks.
- References: `windsurf_workflows/test_and_lint.yaml`.

## ADR-008: Data Persistence
- Decision: No database; browser-only storage (LocalStorage) and stateless APIs.
- Status: Accepted
- Rationale: Privacy-first, simplified ops, aligns with Vectorless goals.
- References: `README.md`, client code under `app/`.

## ADR-009: File Upload Strategy
- Decision: Client-side chunking for large uploads; enforce 4.5MB per-file and request limits.
- Status: Accepted
- References: `app/utils/chunkedUpload.ts`, `api/upload.py`.

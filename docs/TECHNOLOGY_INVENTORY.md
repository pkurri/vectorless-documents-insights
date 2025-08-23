# Technology Inventory

## Frontend
- Framework: Next.js 15.4.6 (`package.json` -> `next`)
- UI: React 19.1.0 (`react`, `react-dom`)
- Language: TypeScript ^5 (strict mode enabled in `tsconfig.json`)
- Styling: Tailwind CSS ^4 with `@tailwindcss/postcss`
- Other libs: `lucide-react`, `react-markdown`, `react-pdf`, `uuid`, `@vercel/analytics`, `@vercel/blob`, `openai@^5.12.2`

## Backend (Serverless Python)
- Python runtime: 3.11+ (CI uses 3.11)
- FastAPI >=0.116.1
- Uvicorn >=0.32.1
- Pydantic >=2.10.5
- OpenAI Python SDK >=1.99.6
- PyPDF2 >=3.0.1
- Other: `python-multipart`, `python-dotenv`, `typing-extensions`, `httpx`

## Infrastructure
- Hosting: Vercel (`vercel.json` routes Next.js and `api/**/*.py`)
- Node.js: 20.x in CI (>=18 supported)
- Serverless endpoints: `api/upload.py`, `api/chat/stream.py`, `api/health.py`, `api/index.py`
- Local backend (optional): `backend/main.py` (FastAPI), `backend/llm_service.py`, `backend/pdf_processor.py`

## TypeScript Configuration
- `strict: true`, `noEmit: true`, `moduleResolution: bundler`, Next plugin enabled
- Path alias: `@/* -> ./*`

## Build and Lint
- Web: `npm ci && npx tsc --noEmit && npm run lint && npm run build`
- Python: `pip install -r requirements.txt` + bytecode compile (`python -m compileall api backend`)

## Streaming & Uploads
- Streaming: SSE over `api/chat/stream.py`
- Uploads: Client-side chunking in `app/utils/chunkedUpload.ts`, server validates 4.5MB limits in `api/upload.py`

## Environment
- Required: `OPENAI_API_KEY` (local: `.env.local`, production: Vercel project settings)

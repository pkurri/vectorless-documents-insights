# Unknowns, Assumptions, and Discrepancies

- Runtime versions on Vercel
  - Unknown: Exact Node and Python runtime versions used in production.
  - Evidence: No `.nvmrc`/`.node-version` checked in; no Vercel Project runtime overrides referenced.
  - Assumption: Node 20.x and Python 3.11 are acceptable (CI uses these).
  - Action: Define Node in `.nvmrc` and pin Python if needed via Vercel settings.

- ESLint configuration
  - Unknown: Custom ESLint rules. Only `next lint` is referenced.
  - Assumption: Next.js defaults are acceptable for now.
  - Action: Add `.eslintrc` if custom rules are desired.

- Python static analysis
  - Unknown: Preferred linter/formatter (Ruff/Flake8, Black/isort).
  - Assumption: Not enforced yet.
  - Action: Introduce Ruff + Black with minimal config if desired.

- CI provider
  - Discrepancy: Workflow stored in `windsurf_workflows/test_and_lint.yaml` (Windsurf-specific).
  - Assumption: Intended for Windsurf execution.
  - Action: If using GitHub Actions, copy to `.github/workflows/ci.yaml` with the same steps.

- Environment variables
  - Unknown: Where `OPENAI_API_KEY` is configured in deployments.
  - Assumption: Local via `.env.local`; production via Vercel Project Settings.
  - Action: Document required envs in `README.md` and verify in Vercel.

- Serverless upload limits
  - Assumption: 4.5MB per request/file enforced by `api/upload.py` and client utility.
  - Action: Keep client chunk size <= 3.5MB (default) and monitor Vercel errors.

- Backend execution path
  - Discrepancy: Both `api/*.py` (serverless) and `backend/main.py` (local FastAPI) exist.
  - Assumption: Production uses serverless routes; `backend/` is for local dev only.
  - Action: Keep parity between serverless handlers and FastAPI routes as features evolve.

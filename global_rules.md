# Global Rules for Windsurf Cascade

## technology-standards

- Frontend
  - Next.js: >=15.x (App Router). Recommended: lock to 15.4.x per `package.json`.
  - React: >=19.x. Recommended: 19.1.x per `package.json`.
  - TypeScript: >=5.0 with `strict` mode enabled (already configured in `tsconfig.json`).
  - Tailwind CSS: >=4.x using `@tailwindcss/postcss`.
  - ESLint: Use `next lint` with Next.js defaults; no inline eslint-disable unless justified.
- Backend (Serverless Python on Vercel and local FastAPI dev)
  - Python: >=3.11 (verify runtime in deployment).
  - FastAPI: >=0.116.1
  - Uvicorn: >=0.32.1
  - Pydantic: >=2.10.5
  - OpenAI SDK (Python): >=1.99.6; (Node): >=5.12.2
- Infrastructure
  - Node.js runtime: >=18 (recommend 20.x LTS for local/dev). Specify in CI and `.nvmrc` if added.
  - Hosting: Vercel with `vercel.json` routing for Next.js and Python functions.

Recommended practices

- Prefer the Next.js App Router with server components where appropriate.
- Keep TypeScript `strict` true and avoid `any`; enable incremental builds.
- Use streaming SSE for chat endpoints, and handle CORS carefully.
- Keep the app stateless; do not introduce databases unless architecture changes.
- Centralize environment variables; never commit secrets; use `.env.local` locally and Vercel envs in prod.
- Keep files under 250 LOC; refactor into smaller components/services.

## code-quality

- Enforce linting with ESLint using project-specific configurations.
- Achieve at least 80% test coverage for all codebases.
- Optimize code for performance, avoiding unnecessary computations.

## security

- Prohibit hard-coded credentials in source code.
- Use environment variables for sensitive information.
- Implement input validation and sanitization for all user inputs.

## documentation

- Require JSDoc comments for all public functions and classes.
- Maintain an up-to-date `README.md` with project setup instructions.
- Document architectural decisions in a dedicated memory file.

## version-control

- Use Conventional Commits standard for commit messages.
- Prohibit direct commits to the main branch; use pull requests.
- Avoid committing `.env` files or sensitive configuration data.

## performance

- Optimize for minimal resource usage and fast execution.
- Use lazy loading for assets where applicable.
- Monitor and address performance bottlenecks proactively.

# System Analysis and Configuration Management

## Role

System analyst and configuration manager for the Windsurf IDE

## Objective

Analyze the project's codebase to identify technologies and their versions, and update configuration files to align with the detected tech stack.

## Context

The project is hosted in the Windsurf IDE, with the following structure:

- Key directories: `/src`, `/tests`, `/config`
- Configuration files: `package.json`, `requirements.txt`, etc.

**Goal**: Ensure configuration files accurately reflect the actual tech stack and project structure for consistency and compatibility.

## Instructions

### 1. Technology Analysis

- Scan the project root and key directories (`/src`, `/tests`, `/config`)
- Identify technologies including:
  - Programming languages
  - Frameworks
  - Libraries
  - Databases
  - Tools
- Extract version information from configuration files (e.g., `package.json`, `requirements.txt`) or runtime context

### 2. Technology Inventory

Create a table with the following columns:

| Technology | Version | Type | Verification Method |
|------------|---------|------|---------------------|
| Node.js    | 18.16.0 | Runtime | `node -v` |
| React      | 18.2.0  | Frontend Framework | `package.json` |
| ...        | ...     | ...  | ...                 |

### 3. Configuration Updates

#### global_rules.md

- Add/update `technology-standards` section with:
  - Minimum version requirements
  - Recommended practices

#### .windsurfrules

- Update `technologies` section with detected stack
- Adjust `project-structure` to match actual layout
- Update `coding-standards` for language conventions

#### windsurf_workflows/test_and_lint.yaml

- Adapt workflow with appropriate:
  - Setup commands
  - Version specifications
  - Linting tools
  - Testing frameworks

#### memories/

- Update `user_stories.md` with technology context
- Update `architectural_decisions.md` with tech choices
- Add links to relevant files

### 4. Handling Unknowns

For any unrecognized technologies/versions:

- Document them clearly
- Suggest verification methods
- Note any Windsurf compatibility concerns

### 5. Review

- Cross-validate all updates against actual codebase
- Document any assumptions made
- Note discrepancies for future reference

## Default Tech Stack (if not detectable)

- Node.js 18.16.0
- React 18.2.0
- Python 3.11.0
- pytest 7.4.0
- PostgreSQL (version unknown)

## Output Formatting

Ensure all outputs are properly formatted for Windsurf IDE display.
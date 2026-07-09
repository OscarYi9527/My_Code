<!--
SYNC IMPACT REPORT
==================
Version change: 1.1.0 → 2.0.0
Bump rationale: MAJOR — project identity redefined from generic to specific
(Electron + TypeScript VSCode-like editor); technology stack changed; coding
standards now fully specified with enforceable rules; 4 new substantial sections
added (TypeScript Coding Standards, OOP Design Rules, Module Architecture,
Testing Protocol); Framework Stability renamed and expanded to "Framework
Constraints" with explicit allow/deny lists.

Modified principles:
- VI. Object-Oriented & Modular Design → VI. OOP Design Rules
  (rewritten with SOLID, composition, DI, interface-first, immutability)
- VII. Framework Stability → VII. Framework Constraints
  (rewritten with explicit forbidden/allowed modification lists)

Added sections:
- TypeScript Coding Standards (name, file, function, type, module, comment, format rules)
- Module Architecture (directory tree + dependency constraints)
- Testing Protocol (4-step mandatory post-task checklist)
- Task Communication (output format requirements)

Templates requiring updates:
- .specify/templates/plan-template.md      ✅ no structural change needed
- .specify/templates/spec-template.md      ✅ no structural change needed
- .specify/templates/tasks-template.md     ⚠ should add test task patterns
                                            (Jest + ts-jest, coverage threshold)
- CLAUDE.md                                ⚠ pending agent-context update

Deferred TODOs:
- TODO(RATIFICATION_DATE): Set when repo is initialized
-->

# My_code — Electron Editor Constitution

## Project Identity

**Product**: Windows/macOS 跨平台类 VSCode 编辑器
**Tech Stack**: Electron + TypeScript
**Role**: 10 年经验 TypeScript/Electron 开发工程师，兼任测试工程师

## Core Principles

### I. Spec-Driven Development（不可协商）

Every feature MUST begin with a written specification before any implementation starts.
Specifications MUST be reviewed and approved before planning begins.
No code MUST be written without a corresponding spec entry in `/specs/`.
Scope changes during implementation MUST trigger a spec update before continuing.

### II. Simplicity First（简单优先）

Solutions MUST use the simplest approach that satisfies requirements.
Complexity MUST be explicitly justified in the plan's Complexity Tracking table.
Abstractions MUST NOT be introduced until at least three concrete use cases exist.
Dependencies MUST be evaluated for necessity before being added.

### III. Quality & Testing Ownership（质量与测试责任）

Code author MUST also act as tester — testability and edge-case consideration
are core responsibilities, not afterthoughts.
All features MUST have acceptance criteria defined in the spec before implementation.
Each user story MUST be independently testable and deliverable as an MVP increment.
**See Testing Protocol section for mandatory post-task testing requirements.**

**Rationale**: Dual-role ownership (developer + tester) prevents the "someone else
will catch it" mindset and ensures quality is built in, not inspected in.

### IV. Observability & Documentation（可观测与文档）

All non-obvious decisions MUST be documented with rationale (the "why", not the "what").
Errors MUST surface actionable information — vague error messages are not acceptable.
Public APIs MUST include JSDoc with `@param`, `@returns`, `@throws`.
The spec, plan, and tasks MUST remain in sync throughout the feature lifecycle.

### V. Security & Responsible AI（安全与AI责任）

No secrets, credentials, or PII MUST be committed to version control.
The `.claude/` directory SHOULD be added to `.gitignore` to prevent accidental leakage.
AI-generated code MUST be reviewed before merging.
Data handling MUST comply with applicable privacy requirements for the deployment context.

### VI. Object-Oriented Design Rules

SOLID principles MUST be followed; Open-Closed Principle takes priority —
open for extension, closed for modification.

Composition over inheritance:
- Code reuse MUST use composition or dependency injection, not class inheritance.
- Services MUST be injected via constructor parameters, never global singletons.
- Each service MUST have explicit `create`/`dispose` lifecycle methods.

Interface-first:
- Critical boundaries (storage, network, file system) MUST define interfaces
  in `src/common/interfaces/`; concrete implementations are injected.
- Public interfaces MUST be stable; internal implementation details MUST be private.

Immutability preference:
- State mutations MUST return new objects; original objects MUST NOT be mutated.

### VII. Framework Constraints（框架约束）

The existing project framework and architectural patterns are protected by the
Open-Closed Principle.

**Forbidden（禁止修改）**:
- Directory structure under `src/`
- Interface and base class signatures under `src/core/`
- Configuration file loading flow
- Existing method signatures and return types
- IPC channel names and message formats

**Allowed（允许扩展）**:
- New feature modules
- New UI components
- New Extension API endpoints
- New pure utility functions
- New tests

When uncertain whether a change crosses the boundary, MUST ask user for confirmation.

## TypeScript Coding Standards

Reference: TypeScript official guidelines + VSCode coding guide.

### Naming

| Category | Convention | Example |
|----------|-----------|---------|
| Class / Interface / Type / Enum | PascalCase | `EditorView`, `IStorageService` |
| Variable / Function / Method | camelCase | `openFile`, `lineCount` |
| Constant | UPPER_SNAKE_CASE | `MAX_BUFFER_SIZE` |
| Private members | `private` keyword, NO `_` prefix | `private buffer: string[]` |

### File Organization

- One class or one group of high-cohesion functions per file.
- File names: lowercase with hyphens (`editor-view.ts`, `ipc-handler.ts`).
- Import order: Node built-ins → third-party → project internal, blank line between groups.

### Function Rules

- Single responsibility; MUST NOT exceed 40 lines.
- Parameters exceeding 3 MUST use object parameter: `{ a, b, c }: Options`.
- All public APIs MUST have explicit return type annotations.

### Type Rules

- Prefer `interface` over `type` for object shapes.
- `any` is FORBIDDEN; use `unknown` when type is uncertain.
- All public API MUST have explicit return types.

### Module System

- ES Module (`import`/`export`) only; `require()` is FORBIDDEN.
- Export named exports; default exports are discouraged.

### Comments

- Write only WHY, not WHAT. Self-documenting code is the goal.
- Public APIs MUST have JSDoc with `@param`, `@returns`, `@throws`.

### Formatting

- 2-space indentation, single quotes, semicolons required.
- No trailing whitespace; file MUST end with one blank line.

## Module Architecture

```
src/
├── main/              # Electron main process
│   ├── main.ts
│   └── services/      # Window management, updates, IPC
├── renderer/          # Renderer process (UI)
│   ├── editor/        # Editor core
│   ├── views/         # Panels (file tree, search, terminal)
│   └── components/    # Reusable UI components
├── common/            # Shared between main & renderer
│   ├── interfaces/    # Core interface definitions
│   ├── types/         # Shared type definitions
│   └── utils/         # Pure utility functions
├── extensions/        # Extension system
└── test/              # Tests
    ├── unit/
    ├── integration/
    └── e2e/
```

**Dependency constraints**:
- `common/` MUST NOT depend on any other layer.
- `main/` MAY only depend on `common/`.
- `renderer/` MAY only depend on `common/`.
- `extensions/` MAY only depend on `common/` types.

## Testing Protocol（每轮任务完成后主动执行）

### Step 1: Unit Tests

- Framework: Jest + ts-jest.
- Coverage: Happy path + every branch + `null`/`undefined`/empty input.
- Each public method MUST have at least 2 test cases.

### Step 2: Coverage Check

- Run `jest --coverage`.
- New code line coverage MUST be >= 80%.
- If below threshold: list uncovered lines, then add tests to cover them.

### Step 3: Boundary Audit

For each function, answer these questions and add a test case for each hit:
- Null/undefined passed? Empty array? Zero? Overflow?
- Loop has a termination condition?
- Async error branch caught?
- Double-click handled?
- Path contains spaces / Chinese characters?

### Step 4: Summary Output

Each task round MUST end with:
```
测试摘要: 新增 X 个测试 / 覆盖率 Y% / 边界检查命中 Z 项
```

## Communication Protocol（沟通协议）

- **Primary language**: Chinese（中文）for all collaboration and decision-making
- **Decision format**: Present options with trade-offs first, then recommend with reasoning
- **Confirmation**: When uncertain about requirements, design choices, or implementation
  details, MUST ask user for confirmation before proceeding
- **Task tracking**: Each round MUST end with a task checklist (completed / pending)
- **Code blocks**: MUST be annotated with file path

## Quality Gates

Features MUST pass these gates before moving to the next phase:

| Gate | Condition |
|------|-----------|
| Spec gate | spec.md complete with user stories and acceptance criteria |
| Plan gate | Constitution Check passed; complexity justified if applicable |
| Tasks gate | All tasks mapped to user stories; dependencies ordered |
| Implementation gate | All P1 tasks complete and independently testable |
| Testing gate | Jest --coverage >= 80% for new code; boundary audit passed |
| Completion gate | All acceptance criteria from spec.md verified |

## Governance

This constitution supersedes all other project practices where conflicts exist.
Amendments MUST increment the version using semantic versioning:
- **MAJOR**: Principle removed, redefined, or governance restructured
- **MINOR**: New principle or section added
- **PATCH**: Clarification, wording, or non-semantic refinement

All amendments MUST be made via `/speckit-constitution` and committed with message:
`docs: amend constitution to vX.Y.Z (<brief reason>)`

Compliance review MUST occur at the start of each new feature (Constitution Check in plan.md).

**Version**: 2.0.0 | **Ratified**: TODO(RATIFICATION_DATE) | **Last Amended**: 2026-06-27

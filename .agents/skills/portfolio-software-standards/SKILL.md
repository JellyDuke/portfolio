---
name: portfolio-software-standards
description: Apply this portfolio repository's Korean documentation, naming, architecture, maintainability, testing, and design-consistency rules when creating, changing, refactoring, or reviewing frontend, backend, scripts, tests, assets, or project documentation. Do not use for deployment-only status checks with no code or documentation changes.
---

# Portfolio Software Standards

Make repository changes easy to understand, test, extend, and remove without weakening the existing product behavior.

## Required context

1. Read the repository `AGENTS.md` and the documentation for the area being changed.
2. Read [references/engineering-conventions.md](references/engineering-conventions.md) before editing code, tests, configuration, or architecture.
3. Inspect callers, tests, and generated-output boundaries before renaming or moving anything.

## Working rules

- Apply the reference to `frontend/`, `backend/`, `scripts/`, tests, assets, configuration, and technical documentation.
- Add concise Korean comments or docstrings at module, class, method, function, event-flow, and non-obvious rule boundaries. Explain responsibility, inputs/outputs, state changes, side effects, and the reason for constraints; do not narrate obvious syntax line by line.
- Follow the language-specific naming table. Prefer domain terms already used by the product, and use one term for one concept across layers.
- Keep functions focused, dependencies explicit, side effects at boundaries, errors contextual, and modules cohesive. Avoid speculative abstractions and unrelated cleanup.
- Update relevant tests and documentation in the same change when behavior, interfaces, folder structure, or operating assumptions change.
- Treat `dist/` as generated output. Edit source folders, then rebuild.
- Preserve the current design system and accessibility behavior for UI changes. Do not reintroduce generic `전체 보기` buttons, and keep the desktop portrait at `160px × 205px` unless the user changes that decision.

## Completion

Run the smallest relevant checks plus the repository baseline:

```text
npm run build
npm run check
npm test
```

For future backend code, also run its formatter, static checks, and tests when those commands exist. Report checks that could not be run and why.

Do not commit, merge, push, or deploy. Those actions follow the repository release policy and the user's current authorization.

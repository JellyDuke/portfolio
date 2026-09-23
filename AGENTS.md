# Portfolio release workflow

## Branch policy

- Use `dev` for normal implementation work.
- Treat `origin/main` as the only production source for ChatGPT Sites.
- Never deploy a local-only commit, an uncommitted working tree, `dev`, or another feature branch.
- Codex must not commit, merge, or push to the user's GitHub repository. The user
  performs all Git operations that publish branch changes to GitHub.

## Project layout

- Edit browser code in `frontend/`.
- Keep server-side work in `backend/`; the project currently has no backend runtime.
- Keep images, fonts, and browser vendor files in `assets/`.
- Keep role-specific documentation under `docs/frontend/`, `docs/backend/`, and
  `docs/assets/`.
- Treat `dist/` as generated Sites output. Run `npm run build` instead of editing
  it directly.

## Engineering conventions

- For changes or reviews involving frontend, backend, scripts, tests, assets,
  configuration, or technical documentation, use the repository skill at
  `.agents/skills/portfolio-software-standards/`.
- Apply its Korean documentation, naming, module-boundary, error-handling,
  security, testing, and maintainability rules to every newly written or
  directly modified scope.
- Do not perform a repository-wide mechanical rewrite merely to conform old
  code. Improve existing code when it is part of the requested change.

## Semi-automatic Sites deployment

The repository owner authorizes Codex to deploy only after a new commit is already
present on GitHub's `origin/main` branch.

Local edits, changes on `dev`, a conversation starting, and a conversation ending
are not deployment triggers. When Codex is active in this repository, it may fetch
`origin/main` and check whether GitHub main has advanced since the current successful
Sites production version.

1. Fetch `origin/main` and resolve its full commit SHA.
2. Read `.openai/hosting.json`, use the Sites skills, and identify the current
   successful production version and its source commit.
3. Resolve the GitHub main commit represented by production. It may be the source
   commit itself, or the first parent of a release merge commit whose tree exactly
   matches that first parent and whose second parent preserves the previous Sites
   source history.
4. If production already represents the `origin/main` SHA, do not deploy.
5. Only when `origin/main` contains a newer user-pushed commit, validate that exact
   tree
   in an isolated clean checkout with `npm ci`, `npm run build`, `npm run check`,
   and `npm test`.
6. Deploy that exact `origin/main` tree only after all validations pass. Preserve
   the Site's existing audience and report the final production URL. Use a release
   merge commit only when needed to preserve the separate GitHub and Sites histories.

Do not deploy when validation fails. Do not overwrite a production version whose
source commit is not known to this GitHub repository; report the divergence and
ask the user whether GitHub `main` or the Sites version should win.

This policy is checked only while Codex is handling a conversation in this
repository. It is not a background service or a GitHub push webhook. Codex never
pushes GitHub branches as part of this policy.

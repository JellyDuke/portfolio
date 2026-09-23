# Portfolio release workflow

## Branch policy

- Use `dev` for normal implementation work.
- Treat `origin/main` as the only production source for ChatGPT Sites.
- Never deploy a local-only commit, an uncommitted working tree, `dev`, or another feature branch.

## Semi-automatic Sites deployment

The repository owner authorizes Codex to check for and deploy verified `origin/main`
updates while Codex is actively working in this repository.

When a conversation edits this portfolio, asks for release/deployment status, or
finishes work intended for production:

1. Fetch `origin/main` and resolve its full commit SHA.
2. Read `.openai/hosting.json`, use the Sites skills, and identify the current
   successful production version and its source commit.
3. Resolve the GitHub main commit represented by production. Normally it is the
   production source commit itself. If the GitHub and Sites repositories began
   with separate histories, it may be a release merge commit whose first parent
   is the deployed GitHub main commit, whose second parent is the previous Sites
   source head, and whose tree exactly matches its first parent.
4. If production already represents the `origin/main` SHA, do nothing and report
   that production is current.
5. If production is behind `origin/main`, validate the exact `origin/main` tree
   in an isolated clean checkout with `npm ci`, `npm run build`, `npm run check`,
   and `npm test`.
6. Deploy that exact `origin/main` tree only after all validations pass. When a
   release merge commit is needed to preserve both repository histories, keep
   `origin/main` as its first parent and the previous Sites source head as its
   second parent. Preserve the Site's existing audience and report the final URL.

Do not deploy when validation fails. Do not overwrite a production version whose
source commit is not known to this GitHub repository; report the divergence and
ask the user whether GitHub `main` or the Sites version should win.

This policy is active only while Codex is handling a conversation in this
repository. It is not a background service or a GitHub push webhook.

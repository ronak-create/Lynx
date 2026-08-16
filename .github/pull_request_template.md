<!-- Thanks for contributing. Keep this short — a few honest lines beat a filled-in form. -->

## What this changes

<!-- One or two sentences. Link the issue if there is one: Fixes #123 -->

## Why

<!-- What was wrong or missing. For a source change, what the source now does differently. -->

## Checks

- [ ] `cd apps/api && uv run pytest`
- [ ] `cd apps/web && pnpm exec tsc --noEmit && pnpm lint`
- [ ] Ran a real research query end to end, if this touches an agent or a source

## If this touches a data source or an agent

- [ ] It degrades to empty rather than raising when the source is unavailable
- [ ] The default path still works with **no API keys**
- [ ] Any new `source_id` has a registry entry, a rate limiter, and a usage label
- [ ] `session.commit()` happens before any `ctx.progress` / `ctx.emit`

## If this touches the UI

- [ ] Works in both light and dark themes
- [ ] No coloured status dots; progress is the monochrome spinner and iconography
- [ ] Respects `prefers-reduced-motion`

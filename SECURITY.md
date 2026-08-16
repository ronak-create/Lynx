# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for a security problem.

Use GitHub's private vulnerability reporting on this repository
([Security → Report a vulnerability](https://github.com/ronak-create/Lynx/security/advisories/new)).
Include what you found, how to reproduce it, and what an attacker could do with it. You'll get a
first response within a few days, and credit in the fix unless you'd rather not have it.

## Supported versions

Lynx is developed on `main` and has no long-term release branches. Fixes land on `main`; if you are
running a fork or a pinned commit, rebase onto `main` to pick them up.

## What is in scope

- Anything that lets a request read or modify data belonging to another run it shouldn't reach.
- Injection into the database, the fetch layer, or the LLM prompt path that changes what the server
  does rather than just what a document says.
- Leakage of provider API keys — from the browser to anywhere except the provider, or from the
  server into a response, a log, or a stored record.
- Dependency vulnerabilities that are actually reachable from this codebase.

## What is not a vulnerability

These are known and documented properties of the design, not bugs:

- **The API has no authentication.** Lynx is built as a single-user local tool. Anyone who can reach
  the port can start runs and read every stored run. Do not expose it to the internet without your
  own auth proxy — see [Self-hosting](https://github.com/ronak-create/Lynx#deploy).
- **Provider keys entered in the browser are stored in `localStorage`** when you tick *Save config*.
  Anything with access to that browser profile can read them; leave it unticked on a shared machine.
- **Server-side keys live in `.env`** in plain text, like any twelve-factor app.
- **Lynx fetches attacker-influenceable content** (company sites, search results, news) and shows it.
  Rendered output is escaped, but the *content* of a document is not trusted data and should not be
  treated as authoritative.
- **A model can produce a wrong or misleading statement.** Inaccurate research output is a quality
  issue — open a normal issue for it.

## Handling of secrets in this repo

`.env` is gitignored; `.env.example` carries empty placeholders only. If you believe a real key was
ever committed, report it privately as above so it can be rotated as well as removed.

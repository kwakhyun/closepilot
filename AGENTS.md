<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ClosePilot engineering contract

This is a synthetic-data portfolio, not a live payment or accounting service.
Do not claim customer interviews, measured operational savings, real PG/bank
integration, enterprise access controls, or LLM calls that do not exist.

## Before changing code

Read `docs/architecture.md` and the relevant domain/application code. Identify the
invariant and a concrete counterexample. Use the smallest change that preserves
the workflow. Read installed Next.js docs for framework APIs. Never put tokens,
connection strings, cookie values or actual customer data in commits or logs.

## Boundaries that must remain true

- The domain cannot import Next, React or database modules.
- Application code cannot depend on infrastructure or UI.
- Client components may import application types, never runtime server code.
- Money is bounded integer KRW; intermediate fee arithmetic uses BigInt.
- Approvals cannot rewrite source amounts, change matches or delete duplicates.
- New data requires reconciliation before approval or close.
- Changed result fingerprints invalidate the corresponding prior approval.
- No unresolved issue may close. Closed state is immutable.
- A command, its audit events and idempotency receipt commit together.
- Sessions are opaque bearer capabilities, not enterprise user accounts.
- Hashes check integrity; they are not signatures or protection from DB admins.
- The public review guide is deterministic and must be labelled as such.

## Change workflow

1. State the problem, assumptions, affected layer and rejection cases.
2. Implement the bounded change. Do not add paid APIs or new credentials silently.
3. Run `npm run verify`. For UI work, exercise the flow in a browser and check narrow layouts.
4. If domain rules or package format change, update Kotlin and the rule version,
   then run `npm run fixtures` and the Kotlin verifier. Explain fixture changes.
5. If SQL changes, update `SCHEMA`, migration versioning and generated SQL, and
   run repository tests against a dedicated disposable PostgreSQL database.
6. Record actual evidence in `docs/verification.md`; distinguish a passed check
   from code inspection or an untested configuration.

Do not use a production database as `TEST_DATABASE_URL`. Do not bypass a failing
test, Origin check, version check or approval precondition to make a demo work.

The optional `.githooks/pre-commit` hook and CI execute the same architecture,
type and domain checks. They complement code review, not financial assurance.

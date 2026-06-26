<!-- Thanks for contributing! Keep PRs focused on one logical change. -->

## What & why

<!-- What does this change and why? Link any related issue. -->

## Checklist

- [ ] `pnpm lint && pnpm typecheck && pnpm check:lines && pnpm test` pass locally
- [ ] If this touches `next.config.mjs` / `proxy.ts` / routing / CSP, I ran `pnpm --filter @bebe/web build`
- [ ] Tests added/updated for the change
- [ ] User-facing strings are in `messages/{ko,en}.json` (ko/en parity), not hardcoded
- [ ] No secrets, personal data, or AI-attribution in the diff

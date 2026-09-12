<!-- @opencode-ref: opencode/packages/app/e2e/AGENTS.md -->

# Browser E2E Test Guidelines

These tests exercise the standalone browser host with an isolated, mocked
OpenCode server. Repository-wide and `packages/app` rules also apply.

## Required reading

- Before writing, changing, or reviewing E2E tests, always read and follow Playwright's official [Best Practices](https://playwright.dev/docs/best-practices), [Auto-waiting](https://playwright.dev/docs/actionability), and [Assertions](https://playwright.dev/docs/test-assertions) guides.
- Use the official [Locators](https://playwright.dev/docs/locators), [Network](https://playwright.dev/docs/network), and [Test Isolation](https://playwright.dev/docs/browser-contexts) guides when those concerns apply.

## Test hygiene

- Test user-visible behavior with isolated, deterministic data and scoped, unique locators.
- Prefer role, label, text, and explicit test-contract locators. Do not use `.first()` or `.last()` merely to silence strictness errors.
- Use locator actions, Playwright auto-waiting, and web-first assertions for observable readiness and outcomes.
- Never use `waitForTimeout`, `setTimeout`, sleeps, animation-frame counts, or other wall-clock delays to synchronize a test. Wait for the specific UI state, request, response, event, or application outcome instead.
- Do not treat navigation, a network response, DOM attachment, or visibility alone as proof that asynchronously rendered UI is ready. Assert the state the next action actually requires.
- Register network and event waits before the action that triggers them.
- Do not retry state-changing actions. Retry idempotent readiness checks, then perform the action once and assert its outcome.
- Keep action and assertion timeouts adaptive. Do not use short timeouts as readiness probes or rely on retries to hide flakes.
- Assert exact outcomes and identities so stale state, duplicate rendering, and interactions with the wrong element cannot pass.
- Make unhandled requests to the mocked OpenCode origin fail the test.

## OpenCode references

Inspect `opencode/packages/app/e2e/` before changing shared mock behavior.
Ported helpers must carry an `@opencode-ref` header for every upstream source.

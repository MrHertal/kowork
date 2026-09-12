# Browser E2E Test Guidelines

These tests exercise the standalone browser host with an isolated, mocked
OpenCode server. Repository-wide and `packages/app` rules also apply.

## Test hygiene

- Test user-visible behavior with isolated, deterministic data.
- Prefer role, label, text, and explicit test-contract locators.
- Use Playwright locator actions and web-first assertions for readiness.
- Never use sleeps or `waitForTimeout`; wait for the exact UI, request, or event.
- Register network and event waits before the action that triggers them.
- Do not retry state-changing actions.
- Make unhandled requests to the mocked OpenCode origin fail the test.

## OpenCode references

Inspect `opencode/packages/app/e2e/` before changing shared mock behavior.
Ported helpers must carry an `@opencode-ref` header for every upstream source.

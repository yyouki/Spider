# Self-update and automatic promotion policy

## Owner preference

The owner can choose:
- `manual`: the owner triggers every release;
- `automatic_after_gates`: eligible low-risk application releases may be promoted automatically after all registered gates pass.

This preference is stored in the private Agent SQLite database. It is not itself a deployer and does not create a production deployment.

## What "all tests passed" means

A candidate is not eligible just because one test command returns exit code zero. A trusted release pipeline must provide evidence that:
1. every required CI check ran and passed (no failed or skipped checks);
2. every registered evaluation case passed;
3. critical, high, and medium security findings are zero or resolved;
4. no protected authentication, security, permission, or secrets-related area changed;
5. a rollback artifact exists and its restore path was verified;
6. all staging health checks passed;
7. artifact integrity was verified;
8. resource and cost budget is within the owner's configured limit;
9. the change is classified low-risk.

The policy helper lives in `apps/space-ai/src/self-update/release-gate.js`. Its unit tests run in CI. It returns a decision and reasons; it does not deploy code.

## Automatic promotion scope

When eventually connected to a deployment provider, automatic promotion may apply only to low-risk application-layer changes (for example, a documentation fix or a non-sensitive UI change) after all gates pass. It must use immutable build artifacts, versioned releases, a canary/health check, and a verified rollback.

The following always require owner review and must never be changed by self-modifying agent code:
- authentication and account recovery;
- OAuth scopes and connected-account permissions;
- secrets and credential handling;
- access policies and security controls;
- audit logging and monitoring;
- billing, budgets, or usage limits;
- database migrations that can destroy or irreversibly transform data;
- sandbox isolation and network egress restrictions.

## Why a 100% test pass is not a mathematical guarantee

A test suite can pass while still missing a scenario. Passing 120/120 registered evaluations means all 120 registered cases passed; it does not prove every possible state is defect-free. The release gate therefore combines tests with security scanning, staging health, artifact integrity, risk classification, budget approval, and rollback verification.

## Current implementation status

- Owner preference can be saved through the settings UI.
- The deterministic release-gate policy and unit tests are implemented.
- No production updater, deploy token, GitHub write credential, or Cloudflare deploy binding is connected.
- No self-update is currently automatic in production.
- A future updater must use a dedicated short-lived credential with a narrow deployment scope. It must not receive the owner's full GitHub, Cloudflare, Google, or device credentials.

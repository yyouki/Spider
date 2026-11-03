# Isolated Linux sandbox

## Purpose

The initial runner provides bounded execution for small Python and JavaScript tasks without executing user code inside the Worker or the SpaceAgent process. A dedicated Container-backed Durable Object owns the Linux Container and the task ledger.

This is not a full autonomous coding workspace yet: it does not mount the Git repository, expose a host shell, provide persistent project files, or access third-party accounts.

## Execution contract

- Accepted languages: Python 3 and Node.js JavaScript.
- Source size: at most 16 KB of UTF-8.
- Timeout: 10 seconds by default; owner/tool input may choose 1–30 seconds.
- Output: retain at most 6 KB of stdout and 6 KB of stderr per task.
- Concurrency: one active task per workspace.
- History: retain at most 30 recent task records.
- Source retention: submitted source stays in the execution closure and is not written to the Durable Object task ledger.
- Network: the Container is started with outbound internet disabled.
- Credentials: no OAuth tokens, Cloudflare secrets, or account credentials are passed to the process.
- Commands: fixed executable argument arrays are used; user source is a single argument and is never interpreted by a shell.
- Container size: lite; CPU and memory are platform-bounded rather than controlled by user-provided resource flags.

The runner exposes start, status, list, and cancel methods. The chat tools report the task as queued until a later status check confirms a terminal state. A task is never described as successful merely because it was accepted.

## Lifecycle and safety

Each workspace maps to a separate SandboxRunner Durable Object identity. The runner validates the request before invoking the Container API, starts the named image with outbound internet disabled, and runs Python or Node directly. A per-task AbortController enforces the configured time limit while the Durable Object is active. Container inactivity timeout provides an additional cleanup boundary.

Task records include status, timestamps, exit code, and bounded output/error information. They intentionally exclude the source text. Only one job can be active per workspace. If a Durable Object restarts and loses its in-memory cancellation handle, the runner destroys its task-dedicated Container before recording cancellation.

The sandbox is still untrusted-code execution. The Container boundary is separate from the Worker runtime; this does not remove all risk. Do not add secrets, project mounts, outbound network access, Docker socket access, or host credentials to this runner.

## Deployment requirements

The runner uses Cloudflare's Durable Object Container API with the durable_object scheduling policy. Cloudflare currently documents that policy as beta. It is added as a new SQLite-backed Durable Object class, leaving the existing SpaceAgent class and v1 migration unchanged.

A Workers Paid plan and Cloudflare Containers availability are required. The app's Wrangler build config points the named image at apps/space-ai/sandbox/Dockerfile. wrangler deploy must build and publish that image along with the Worker.

The CI workflow validates Wrangler types, TypeScript, policy unit tests, and the dashboard/Worker build. It does not prove that a Cloudflare Container image has deployed or that a real task can run.

## Verification still required

After deployment on the owner Cloudflare account:

1. Confirm the Container image build and Worker deployment complete.
2. Run a small Python arithmetic snippet and confirm status transitions to succeeded.
3. Run a small Node.js arithmetic snippet and confirm status transitions to succeeded.
4. Confirm a non-zero exit code and stderr are recorded for a failing snippet.
5. Confirm an over-limit timeout stops a long-running snippet and records timed_out.
6. Confirm a second concurrent task is rejected.
7. Confirm task cancellation reaches a terminal cancelled state.
8. Confirm network egress is unavailable from inside the Container.
9. Confirm the task ledger never stores submitted source.

Do not call the sandbox live until these checks pass in the deployed account.
# space — Autonomous AI Workspace

space is being built as **one primary AI with one identity and one orchestration core**. Browser research, coding, file management, multimodal perception, memory, sandbox execution, hosting, and self-improvement are capabilities of that core rather than separate user-facing bots.

> **Current status:** the first AI MVP has persistent chat, a task-plan ledger, calculator, approved project memory, owner-configurable autonomy preferences, and a tested self-update release gate. The offline Python/JavaScript sandbox is implemented in source but still requires a Workers Paid Container deployment and live verification. Production deployment is exposed through a manual GitHub Actions workflow that requires explicit confirmation and owner-configured secrets. Browser research, project filesystem tools, multimodal pipelines, account/device connectors, OS runners, and production updater remain future work.

## AI MVP

Start with [apps/space-ai](apps/space-ai/README.md) for local development and deployment requirements.

The dashboard's **Autonomy** panel stores the owner's preferred operating modes:
- autonomous execution inside an isolated sandbox once a runner exists;
- automatic read-only research once a browser tool exists;
- file operations within a selected workspace;
- automatic promotion of eligible low-risk updates after every required release gate passes.

The settings do not activate tools or grant third-party permissions that have not been connected.

## Architecture and policies

- [Product vision](docs/VISION.md)
- [Unified AI architecture](docs/ARCHITECTURE.md)
- [Security, identity, and permissions](docs/SECURITY-AND-PERMISSIONS.md)
- [Owner autonomy and account/device access](docs/OWNER-AUTONOMY-AND-ACCESS.md)
- [Multimodal and perception](docs/MULTIMODAL-AND-PERCEPTION.md)
- [Memory and continuous improvement](docs/LEARNING-AND-SELF-IMPROVEMENT.md)
- [Self-update release policy](docs/SELF-UPDATE-POLICY.md)
- [Isolated Linux sandbox](docs/SANDBOX.md)
- [Cloudflare deployment guide](docs/CLOUDFLARE-DEPLOYMENT.md)
- [Implementation roadmap](docs/ROADMAP.md)
- [MVP status](docs/MVP-STATUS.md)
- [Platform limitations](docs/PLATFORM-LIMITS.md)

## Non-negotiable engineering principles

- One AI identity; all tools follow the same permission engine and task ledger.
- Plan, execute, verify, and report evidence. Never fabricate capability or success.
- Account access uses official OAuth grants with revocable scopes, never a universal password.
- Device access uses native OS permissions; raw biometric templates are not collected.
- Untrusted code runs in isolated sandboxes, not the host.
- Low-risk self-updates may be auto-promoted only after every registered gate passes and rollback is verified. Security/authentication/permission changes always require owner review.
- Never promise perfect accuracy, unlimited media, all OSs on one host, or free unlimited 24/7 compute.

## Legacy Codespaces / Windows experiment

The Windows VM experiment remains separate from the AI workspace. It requires a compatible Codespace with Docker, KVM, TUN, enough memory, and enough persistent workspace storage. Codespaces is not a Windows Cloud PC and does not guarantee RDP reachability.

## Security

- Never commit `.env`, `.dev.vars`, OAuth tokens, service-account JSON, cookies, passwords, or private keys.
- Never commit VM disk images or private user data.
- Protect the deployed Worker with Cloudflare Access and a single-owner allow-list before deployment.
- Do not treat a successful CI build as proof of live deployment or provider availability.

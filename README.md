# space — Autonomous AI Workspace

space is being built as **one primary AI with one identity and one orchestration core**. Browser research, coding, file management, multimodal perception, memory, sandbox execution, hosting, and self-improvement are capabilities of that core rather than separate user-facing bots.

> **Current implementation direction:** Cloudflare Workers Free hosts the app. Durable Objects SQLite stores chat, preferences, plans, project memory, and a private per-agent code workspace. The UI uses Monaco Editor with an Explorer tree, file tabs, and token analysis. GitHub OAuth restricts the private workspace to the owner. Small Python/JavaScript snippets run on temporary GitHub-hosted Linux runners inside restricted offline Docker containers. Read-only conversation share links use random bearer URLs, expire after seven days, and can be revoked. This avoids Cloudflare Containers and Workers Paid, but is not unlimited compute.

## AI MVP

Start with [apps/space-ai](apps/space-ai/README.md) for local development and deployment requirements.

The app is organized into four separate areas: **Chat** for conversations, **IDE** for the private file workspace, **Analytics** for provider-reported token activity, and **Settings** for autonomy preferences. The IDE is no longer embedded in the chat page, and token analytics is not displayed inside the editor.\n\nThe **Settings** page stores the owner's preferred operating modes:
- bounded Python/JavaScript execution in a temporary offline container;
- automatic read-only research once a browser tool exists;
- file operations within the private Space workspace, shown in the dedicated IDE Explorer and Monaco editor;
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
- [Free-tier deployment guide](docs/CLOUDFLARE-DEPLOYMENT.md)
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
- Protect all Agent/API/WebSocket routes with the owner-only GitHub OAuth session.
- The sandbox job receives no repository write token, deployment credentials, persistent volume, or host directory mount.
- Do not treat a successful CI build as proof of live deployment or provider availability.

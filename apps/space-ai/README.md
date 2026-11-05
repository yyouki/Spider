# space AI — MVP 0.5

A first, deliberately small implementation of the single-core space AI workspace.

## Included now

- One user-facing AI identity: `SpaceAgent`.
- Streaming text chat from a mobile-first React interface.
- Persistent chat history and resumable chat state through Cloudflare Agents / Durable Objects SQLite.
- Owner-triggered read-only conversation share links. Links contain a random bearer token, expose the currently loaded conversation and tool events, expire after seven days, and can be revoked. Anyone with the link can read the snapshot.
- A task ledger for saving, listing, and cancelling plans. A saved plan is not executed automatically.
- Owner-configurable autonomy preferences stored in the Agent's SQLite database.
- A deterministic self-update release gate with unit tests.
- A calculator tool for exact basic arithmetic.
- A capability-status tool that reports what is really connected.
- Project memory stored in the Agent's SQLite database. Saving a memory requires explicit user approval in the UI.
- Owner-only GitHub OAuth login. The temporary read:user token is used only for the identity lookup and is not stored; Space stores only a signed session cookie. Keep the OAuth App's expiring user-token setting enabled.
- Workers AI model: `@cf/zai-org/glm-4.7-flash`.
- Bounded Python/JavaScript execution through temporary GitHub-hosted Linux runners.
- A human-authored IDE interface using Monaco Editor, with folder Explorer, file tabs, keyboard save, and mobile Explorer/Editor tabs.
- Persistent private workspace files created or updated by AI tools or the editor. Folder structure is inferred from file paths.
- Provider-reported recent input/output token usage plus clearly labeled file/workspace token estimates.

## Not included yet

Autonomous browser, GitHub repository sync, image/video/audio understanding, Android/Windows/macOS device runners, Gmail or other account integrations, and a production updater are not connected. The workspace is an isolated app-level file store, not the user device filesystem or repository checkout. The sandbox is for small snippets, not a persistent coding VM or full shell. It does not mount the workspace, repository, or host filesystem and provides no internet access.

## Private workspace and IDE

The IDE uses Monaco Editor with Vite-bundled language workers; it does not load editor code from a third-party CDN. The Explorer derives folders from saved relative file paths. Selecting a file opens it in a syntax-aware editor tab; use **Save** or Ctrl/Cmd+S to persist edits.

Workspace files are stored in the owning SpaceAgent Durable Object SQLite database. Limits are 200 files, 128 KB per file, and 2 MB total. Hidden paths and sensitive config filenames such as `.env` and `.dev.vars` are rejected. AI-created files appear in the Explorer after the write tool completes. These files do not automatically sync to GitHub or the device.

The separate **Analytics** page shows provider-reported input/output usage for at most the 200 most recent responses, a 14-day daily activity chart, and the latest 12 responses. The workspace section shows file count and storage size plus a clearly labeled rough token estimate using UTF-8 bytes divided by four. It is not an exact GLM tokenizer count or model usage. The dashboard does not estimate monetary cost or expose account-wide Cloudflare Neurons.

## Conversation share links

The **Share chat** action asks for confirmation before creating a read-only snapshot. It includes up to the last 100 messages and visible tool call details. The random URL is a bearer link: anyone who has it can read the snapshot. Links expire after seven days, are served with no-store/noindex headers, and can be revoked from the workspace UI. The JSON endpoint is the same URL with `.json` appended. Do not share conversations containing sensitive information.

## Offline sandbox contract

- Accepted languages: Python 3 and Node.js JavaScript.
- Source size: at most 16 KB of UTF-8.
- Timeout: 10 seconds by default; 1–30 seconds maximum.
- Output: retain at most 6 KB stdout and 6 KB stderr.
- Concurrency: one active task per workspace.
- History: retain at most 30 recent task records.
- The task source is encrypted before it is sent to GitHub Actions. A one-time key decrypts it only in the temporary runner host process; the key is not passed into the Docker container.
- The submitted code runs in a container with no network, read-only root filesystem, no Linux capabilities, no new privileges, PID/memory/CPU limits, a non-root user, and no host mounts.
- The task result is encrypted before it is uploaded as a short-lived Actions artifact.
- The GitHub API token stays in the Cloudflare Worker. The sandbox workflow receives no repository write token or deployment secret.

GitHub-hosted runners provide a temporary VM per job. Docker still shares the runner's kernel, so this is not a mathematical or absolute security boundary. Treat this as a personal, bounded snippet runner—not as a service for executing hostile multi-tenant code. See [docs/SANDBOX.md](../../docs/SANDBOX.md).

## Autonomy, accounts, and devices

The Autonomy panel saves the owner's preferred operating mode. A saved preference does not grant an OAuth scope, Android permission, or create an unavailable browser or filesystem integration. Each account connection must use the provider's official OAuth consent screen and revocable scopes. Device features must use native OS permission prompts.

The owner can allow broad scopes that a provider explicitly offers, but access remains limited to the connected account, the provider's consent, and the app's published integration. Never paste passwords, MFA codes, cookies, or private keys into the agent.

Sending/publishing, spending money, deleting important data, changing account security, modifying access policies, or editing the agent's security rules always requires owner confirmation.

## Model

The default model is `@cf/zai-org/glm-4.7-flash`. Cloudflare documents it as a multilingual reasoning and function-calling model with a 131,072-token context window. That makes it a reasonable MVP choice for chat and multi-turn tools, not a guarantee of perfect autonomous performance. Workers AI Free usage has a daily Neurons allocation; once exhausted, further inference stops until the allowance resets or the account moves to a paid plan.

A custom model does not remove inference cost or quotas. Training and serving a capable model require compute. Keep the provider/model behind the AI SDK adapter so a later tested model can replace it without rewriting the workspace.

## Requirements

- Node.js 22 or a Node.js version supported by the pinned Vite/Wrangler toolchain.
- A Cloudflare account with Workers, Workers AI, and Durable Objects access.
- A GitHub account with write access to `yyouki/space`.
- A GitHub OAuth App for the owner-only sign-in.
- A fine-grained GitHub token limited to this repository with Actions read/write permission, stored as a Worker secret.
- Cloudflare Workers Free supports SQLite-backed Durable Objects. It does not support Container objects; the sandbox therefore uses public-repository GitHub-hosted Actions runners.

The repository is public, so standard GitHub-hosted runner usage is free under GitHub's published Actions policy. That does not mean unlimited throughput or an unconditional uptime guarantee. Workers AI has a limited free daily allocation and may stop inference when the quota is exhausted.

## Production deployment

Follow [docs/CLOUDFLARE-DEPLOYMENT.md](../../docs/CLOUDFLARE-DEPLOYMENT.md). The manual production workflow:
- runs only from `main`;
- requires typing `DEPLOY`;
- runs type checks, unit tests, and a production build;
- uploads only the required Worker secrets;
- does not build or deploy Cloudflare Containers.

Do not commit `.dev.vars`, `.cloudflare-secrets.json`, OAuth tokens, passwords, private keys, or service-account files.

## Data and persistence

Chat history, task plans, autonomy preferences, settings audit entries, token usage summaries, private workspace files, task status records, and approved project notes live in Durable Object SQLite storage. Each conversation share uses a separate expiring Durable Object snapshot. They are not stored in Git. Clearing chat history does not delete settings, task plans, or approved project-memory notes.

This is persistent application state, not a backup guarantee. Configure and test an independent export/backup strategy before relying on it for important data.

## Tests

```bash
npm install
npm run check
npm run build
```

CI runs TypeScript/binding checks, release-gate tests, sandbox-policy tests, and a production build. A successful build does not verify a live Cloudflare deployment, OAuth configuration, GitHub Actions permissions, account quota, or model availability.

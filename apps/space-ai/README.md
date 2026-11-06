# space AI — MVP 0.5

A first, deliberately small implementation of the single-core space AI workspace.

## Included now

- One user-facing AI identity: `SpaceAgent`.
- Streaming text chat in a responsive AI-chat layout with a navigation rail, focused message area, and composer.
- Persistent chat history through Cloudflare Agents / Durable Objects SQLite, with no fixed message-count cap and an automatically maintained summary for older context. Storage and inference still obey Cloudflare's quotas and per-row limits.
- Owner-triggered read-only conversation share links. Links contain a random bearer token, expose the currently loaded conversation and tool events, expire after seven days, and can be revoked. Anyone with the link can read the snapshot.
- A task ledger for saving, listing, and cancelling plans. A saved plan is not executed automatically.
- Owner-configurable autonomy preferences stored in the Agent's SQLite database.
- A deterministic self-update release gate with unit tests.
- A calculator tool for exact basic arithmetic.
- A capability-status tool that reports what is really connected.
- Project notes and user-approved personal memory stored in the Agent's SQLite database. Memory can be listed and deleted from Settings; saving requires an explicit request and approval.
- Owner-only GitHub OAuth login. The temporary read:user token is used only for the identity lookup and is not stored; Space stores only a signed session cookie. Keep the OAuth App's expiring user-token setting enabled.
- Workers AI model: `@cf/zai-org/glm-4.7-flash`.
- Bounded Python/JavaScript execution through temporary GitHub-hosted Linux runners.
- A dedicated VS Code Web launcher page. It validates a GitHub owner/repository path and opens the selected repository at github.dev in a separate tab.
- An interactive, keyboard-focusable workspace terminal with command input/history, scrollable output, and commands for `help`, `pwd`, `ls`, `cd`, `tree`, `cat`, `touch`, `open`, `run`, `python`, `node`, `echo`, and `clear`. It operates on the private workspace and can launch Python/JavaScript files through the existing restricted runner.
- Persistent private workspace files created or updated by AI tools or the editor. Folder structure is inferred from file paths. Successful AI file writes show a downloadable file attachment in the conversation.
- A separate Analytics page with provider-reported token usage, daily activity and workspace storage estimates.
- Private image assets, FLUX.2 Klein image generation/editing, and chat image previews with download actions.

## Not included yet

Autonomous browser, GitHub repository sync, image understanding/OCR, audio/video understanding, Android/Windows/macOS device runners, Gmail or other account integrations, multi-language compilers beyond Python/JavaScript, binary disassembly, live market-data feeds, brokerage/exchange connectors, and a production updater are not connected. The workspace is an isolated app-level file store, not the user device filesystem or repository checkout. The sandbox is for small snippets, not a persistent coding VM or full shell. The interactive terminal is a workspace command console, not a general Linux shell: arbitrary OS commands, package installs, arbitrary processes, and network access are not available. Its Python/JavaScript runner currently executes saved file contents in the restricted offline runner and does not mount the full workspace, repository, or host filesystem.

## VS Code Web and private workspace

The `/ide` route is now a launcher for the official Visual Studio Code Web service at `https://github.dev/OWNER/REPOSITORY`. It validates the repository path and opens the editor in a new tab; Space does not embed or repackage Microsoft's editor. GitHub sign-in is handled by GitHub in that separate tab. VS Code Web is intended for repository browsing and lightweight edits, with browser sandbox limits. It does not include its own terminal, build VM, or full desktop extension runtime; use a separately configured Codespaces or remote compute environment when a project needs a terminal or runtime.

The private Space workspace remains stored in the owning SpaceAgent Durable Object SQLite database. Limits are 200 files, 128 KB per file, and 2 MB total. The last 20 prior versions per file are retained when saved content changes. Hidden paths and sensitive config filenames such as `.env` and `.dev.vars` are rejected. AI-created files appear in chat with a direct Download action. Confirmed file and recursive folder deletion also clear the associated revisions. These files do not yet synchronize to GitHub, so edits made in VS Code Web affect the selected GitHub repository, not the private Space workspace, until the GitHub App publishing integration is implemented.

The workspace terminal is keyboard-operated and retains a short command history in the current page session. Its command parser is intentionally allowlisted; it is not a host shell and does not support arbitrary bash/zsh commands, `npm install`, package managers, piping, or internet commands. The `run` / `python` / `node` commands are submitted to the same single-active-task, restricted offline runner described below.

User memory is separate from chat history and project notes. Space adds memory to future model context only when the owner explicitly asks to save it and approves the tool action. Settings displays saved memory entries and offers per-entry deletion or clearing all entries. The model is instructed to keep only low-sensitivity preferences and useful facts; do not use memory for credentials, private keys, authentication codes, or sensitive medical/financial information.

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

The default text model is `@cf/zai-org/glm-4.7-flash`; image generation and editing use `@cf/black-forest-labs/flux-2-klein-4b`. Cloudflare documents it as a multilingual reasoning and function-calling model with a 131,072-token context window. That makes it a reasonable MVP choice for chat and multi-turn tools, not a guarantee of perfect autonomous performance. Workers AI Free usage has a daily Neurons allocation; once exhausted, further inference stops until the allowance resets or the account moves to a paid plan.

Image generation/editing is not image understanding: the current app does not yet provide general image description, OCR, audio, or video analysis. Image tasks consume Workers AI quota. Uploaded reference images are resized to at most 510×510 pixels for the connected editing model. Image storage is capped at 40 assets and 25 MB total, with a 1.35 MB per-image cap to stay below Durable Object SQLite row limits.

Space can help explain and reason about many fields—including programming, mathematics, science, writing, design, automotive theory, business concepts, and personal-finance education—but it is not a licensed professional and does not connect to banks, brokerages, crypto exchanges, or trading accounts. It provides educational analysis, not trade execution or guaranteed investment results.

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


## Video link attachments

The chat composer accepts validated HTTPS links from YouTube, TikTok, Vimeo, and Dailymotion. Links are attached as references in the message and remain clickable in the composer before sending. This does not mean Space has watched the video: metadata, transcripts, audio extraction, and frame analysis are not connected yet.

## GitHub project publishing and Android builds

The current MVP stores source files in a private Space workspace and does not sync them to GitHub. The target integration is described in the root documentation. Android projects can use the reusable GitHub Actions workflow template in templates/android; APK artifact retrieval and attaching the APK directly to a Space chat are not yet wired into the app.

# space AI — MVP 0.3

A first, deliberately small implementation of the single-core space AI workspace.

## Included now

- One user-facing AI identity: `SpaceAgent`.
- Streaming text chat from a mobile-first React interface.
- Persistent chat history and resumable chat state through Cloudflare Agents / Durable Objects.
- A task ledger for saving, listing, and cancelling plans. A saved plan is not executed automatically.
- Owner-configurable autonomy preferences stored in the Agent's SQLite database:
  - autonomous execution inside a future isolated sandbox;
  - automatic read-only browser research once a browser tool is connected;
  - file access limited to a selected workspace;
  - automatic promotion preference for eligible low-risk self-updates after every release gate passes.
- A deterministic self-update release gate with unit tests.
- A calculator tool for exact basic arithmetic.
- A capability-status tool that reports what is really connected.
- Project memory stored in the Agent's SQLite database. Saving a memory requires explicit user approval in the UI.
- Cloudflare Access JWT verification with a single-owner email allow-list.
- Workers AI model: `@cf/zai-org/glm-4.7-flash`.

## Not included yet

Autonomous browser, general-purpose shell/code execution, file and folder ingestion, image/video/audio understanding, Android/Windows/macOS runners, Gmail or other account integrations, and a production updater are not connected. The AI and UI are instructed to say so rather than pretend those capabilities exist.

## Autonomy, accounts, and devices

The Autonomy panel saves the owner's preferred operating mode. A saved preference does not grant an OAuth scope, Android permission, or create an unavailable sandbox/browser. Each account connection must use the provider's official OAuth consent screen and revocable scopes. Device features must use native Android permission prompts.

The owner can allow broad scopes that a provider explicitly offers, but access remains limited to the connected account, the provider's consent, and the app's published integration. Never paste passwords, MFA codes, cookies, or private keys into the agent.

Sending/publishing, spending money, deleting important data, changing account security, modifying access policies, or editing the agent's security rules always requires owner confirmation.

## Offline Linux sandbox

The sandbox accepts source-only Python or JavaScript tasks. It uses fixed executable argument arrays (no shell parsing), disables outbound internet, has a 16 KB UTF-8 source limit, a 10-second default timeout (maximum 30 seconds), bounded stdout/stderr retention (6 KB per stream), one active task per workspace, and a rolling history of 30 task records. Submitted source code is not written to Durable Object storage. The initial runner does not mount the project repository or receive application credentials. The selected lite Container size is platform-limited; this is not a general-purpose development VM. See the sandbox design and limits in docs/SANDBOX.md.

The source integration is not a live deployment. The first actual execution must be verified after wrangler deploy on an eligible Workers Paid account.

## Self-update policy

The `automatic_after_gates` preference is stored, and `src/self-update/release-gate.js` determines whether a low-risk candidate is eligible for future automatic promotion. Every required check and registered evaluation case must pass; there may be no critical/high/medium security findings; protected files must be unchanged; staging health, artifact integrity, budget approval, and rollback must all be verified.

This policy helper does **not** deploy code. No production updater or deployment credential is connected yet. The release gate's unit tests run in CI. Passing every registered test is not mathematical proof that all possible defects are absent.

## Requirements

- Node.js 22 or a Node.js version supported by the pinned Vite/Wrangler toolchain.
- A Cloudflare account permitted to use Workers AI and Durable Objects.
- A Workers Paid plan and access to Cloudflare Containers are required to deploy the isolated sandbox runner. The durable_object Container scheduling policy is beta.
- Workers AI free quota is limited to 10,000 Neurons per day. Usage beyond the free allowance requires a paid Workers plan; some specific models require paid billing. This project selects a model currently listed as available on Workers Free, but quota and capacity still apply.
- Agents use a SQLite-backed Durable Object. Current Workers Free limits include a 5 GB aggregate Durable Objects storage allocation. Keep chat, task plans, audit records, and project memory concise.

Check current limits before deploying:
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/durable-objects/platform/limits/

## Local development

From this directory:

```bash
cp .dev.vars.example .dev.vars
npm install
npx wrangler login
npm run dev -- --host 0.0.0.0
```

Workers AI is configured as a remote binding, so local development calls Cloudflare and requires Wrangler authentication. In a Codespace, keep the forwarded Vite port private. The local auth bypass is read only from `.dev.vars`; it is not a production variable and must never be enabled for a deployed Worker.

Open the forwarded Vite port from the Codespaces Ports panel.

## Production access — required before deployment

**Do not deploy this app as a public chat endpoint.** Before making it available:

1. Create a Cloudflare Access self-hosted application protecting the entire `space-ai` Worker.
2. Add an Allow policy for the one owner account only. Do not allow public/Everyone access.
3. Configure Worker variables:
   - `ACCESS_TEAM_DOMAIN`: for example `https://your-team.cloudflareaccess.com`.
   - `ACCESS_AUD`: the Access application's Audience (AUD) tag.
   - `ACCESS_ALLOWED_EMAIL`: the exact email permitted to use this private workspace.
   - `DEPLOYMENT_ENV`: `production`.
4. Deploy:

   ```bash
   npm run deploy
   ```

The Worker validates the `Cf-Access-Jwt-Assertion` signature, issuer, audience, and allowed email before forwarding agent/API requests. It fails closed if Access settings are missing or invalid. Cloudflare Access must also protect the complete Worker so static assets are behind the login page.

Do not put OAuth tokens, passwords, private keys, or service-account files in this repository.

## Data and persistence

Chat history, task plans, autonomy preferences, settings audit entries, and approved project notes live in the Durable Object SQLite storage. They are not stored in Git. Clearing chat history does not delete settings, task plans, or approved project-memory notes. Memory export/delete UI is future work; do not store sensitive personal information in the MVP.

This is persistent application state, not a backup guarantee. Configure and test an independent export/backup strategy before relying on it for important data.

## Tests

```bash
npm install
npm run check
npm run build
```

CI runs TypeScript/binding checks, release-gate unit tests, and a production build. A successful build does not verify a real Cloudflare deployment, Access policy, account quota, or model availability.

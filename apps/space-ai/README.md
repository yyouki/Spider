# space AI — MVP 0.1

A first, deliberately small implementation of the single-core space AI workspace.

## Included now

- One user-facing AI identity: `SpaceAgent`.
- Streaming text chat from a mobile-first React interface.
- Persistent chat history and resumable chat state through Cloudflare Agents / Durable Objects.
- A calculator tool for exact basic arithmetic.
- A capability-status tool that reports what is really connected.
- Project memory stored in the Agent's SQLite database. Saving a memory requires explicit user approval in the UI.
- Cloudflare Access JWT verification with a single-owner email allow-list.
- Workers AI model: `@cf/zai-org/glm-4.7-flash`.

## Not included yet

Autonomous browser, general-purpose shell/code execution, file and folder ingestion, image/video/audio understanding, Android/Windows/macOS runners, Gmail or other account integrations, and production self-updates are not connected. The AI is instructed to say so rather than pretend those tools exist.

## Requirements

- Node.js 22 or a Node.js version supported by the pinned Vite/Wrangler toolchain.
- A Cloudflare account permitted to use Workers AI and Durable Objects.
- Workers AI free quota is limited to 10,000 Neurons per day. Usage beyond that requires a paid Workers plan; some specific models also require paid billing. This project intentionally selects a model listed as available on Workers Free, but quota and capacity still apply.
- The Agents SDK uses a SQLite-backed Durable Object. Current Workers Free limits include a 5 GB total Durable Objects storage allocation. Keep chat and project memory concise.

Check the current limits before deploying:
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

Workers AI is configured as a remote binding, so local development still calls Cloudflare and requires Wrangler authentication. In a Codespace, keep the forwarded Vite port private. The local auth bypass is read only from `.dev.vars`; it is not a production variable and must never be enabled for a deployed Worker.

Open the forwarded Vite port from the Codespaces Ports panel. If the model request is rejected, inspect the Workers AI quota/model availability rather than changing the code to a paid model.

## Production access — required before deployment

**Do not deploy this app as a public chat endpoint.** Before making it available:

1. Create a Cloudflare Access self-hosted application protecting the entire `space-ai` Worker.
2. Add an Allow policy for the single owner email only. Do not allow public/Everyone access.
3. Configure the Worker's variables in Cloudflare:
   - `ACCESS_TEAM_DOMAIN`: for example `https://your-team.cloudflareaccess.com`.
   - `ACCESS_AUD`: the Access application's Audience (AUD) tag.
   - `ACCESS_ALLOWED_EMAIL`: the exact email permitted to use this one-owner instance.
   - `DEPLOYMENT_ENV`: `production`.
4. Deploy:

   ```bash
   npm run deploy
   ```

The Worker validates the `Cf-Access-Jwt-Assertion` signature, issuer, audience, and allowed email before forwarding chat/API requests. It fails closed if Access settings are missing or invalid. Cloudflare Access must still protect the Worker itself so static assets are also behind the login page.

Do not put OAuth tokens, passwords, private keys, or service-account files in this repository. Never put a real secret in `wrangler.jsonc`, `.dev.vars.example`, or a committed file.

## Data and persistence

The chat transcript and project notes live in the Durable Object SQLite storage. They are not stored in Git. Clearing chat history does not delete approved project-memory notes. A separate memory management UI and export/delete controls are future work; do not store sensitive personal information in the MVP.

This is persistent application state, not a backup guarantee. Configure and test an independent export/backup strategy before relying on it for important data.

## Tests

```bash
npm install
npm run check
npm run build
```

CI runs these checks on pull requests. A successful build does not verify a real Cloudflare deployment, Access policy, account quota, or model availability.

## License

The repository's root license governs this project. Review third-party package and model licenses separately before redistributing or commercializing a deployment.

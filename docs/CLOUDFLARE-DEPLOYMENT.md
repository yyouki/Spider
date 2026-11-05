# Cloudflare Workers Free deployment

## Architecture

This deployment keeps the existing Cloudflare Agents / Durable Objects architecture while removing the paid Cloudflare Container dependency.

| Component | Service |
|---|---|
| Dashboard and API | Cloudflare Workers Free |
| Chat history, task ledger, preferences, memory, private workspace files, token usage | SpaceAgent Durable Objects SQLite |
| Expiring read-only chat share snapshots | One ChatShares Durable Object per random share token |
| Text model | Cloudflare Workers AI `@cf/zai-org/glm-4.7-flash` |
| Owner login | GitHub OAuth App |
| Python/JavaScript execution | Temporary GitHub-hosted Actions runner + restricted Docker container |

This avoids Cloudflare Zero Trust organization setup and Cloudflare Workers Paid Containers. It does not provide unlimited AI inference or unlimited runner capacity. The browser IDE uses Monaco Editor, with the Vite worker modules bundled into the app rather than loaded from a third-party CDN.

## Cloudflare requirements

The existing Worker API token should have permission to deploy the Worker (Workers Scripts Edit / Workers Editor) on the target account. The old `Containers Edit` permission is no longer needed. Do not add payment methods or enable Workers Paid for this architecture.

Cloudflare Workers Free currently includes:
- 100,000 Worker requests per day;
- SQLite-backed Durable Objects;
- 100,000 Durable Object requests per day;
- 100,000 SQLite row writes per day;
- 5 GB aggregate Durable Object SQLite storage;
- 10,000 Workers AI Neurons per day.

Cloudflare's published limits and pricing can change. Check the official Workers pricing and Workers AI pricing pages before deployment. When the daily Workers AI free allocation is exhausted, inference requests stop until the allowance resets. The app must report quota failures instead of claiming to have unlimited usage.

## 1. Register a GitHub OAuth App

The OAuth callback must match the Worker hostname exactly. The Worker also uses the configured `APP_ORIGIN` variable to build share URLs; the production value is `https://space-ai.yyouki.workers.dev`.

1. In Cloudflare Dashboard, open **Workers & Pages** and find the account's `workers.dev` subdomain.
2. The Worker name in this project is `space-ai`. The expected origin is `https://space-ai.YOUR-SUBDOMAIN.workers.dev`.
3. In GitHub, open **Settings → Developer settings → OAuth Apps → New OAuth App**.
4. Set Homepage URL to the Worker origin.
5. Leave **Expire user access tokens** enabled (the default); Space uses only the short-lived `read:user` token during login and does not store it or request refresh access.
6. Set Authorization callback URL to `https://space-ai.YOUR-SUBDOMAIN.workers.dev/auth/github/callback`.
7. Register the app, then copy its Client ID and generate a Client Secret.

Space requests only `read:user`, checks that the login matches the configured owner, and does not persist the OAuth access token. With GitHub's expiring user-token setting enabled, the access token expires after its short lifetime. The Worker stores a seven-day signed session cookie, not the OAuth token or a refresh token.

## 2. Create a limited GitHub Actions token

Create a fine-grained personal access token for **only** the `yyouki/space` repository.

Grant only:
- Repository permissions → Actions → Read and write.

The Worker uses this token to dispatch the sandbox workflow, inspect runs and artifacts, and cancel a task. The token stays in the Cloudflare Worker secret store and is never passed into a GitHub-hosted runner or the code container.

Do not grant repository Contents write, Administration, organization access, or other permissions.

## 3. Configure GitHub Environment secrets

Open [Repository → Settings → Environments](https://github.com/yyouki/space/settings/environments), select `production`, and keep the two Cloudflare secrets already configured. Add the following four secrets:

| Secret | Value |
|---|---|
| `SPACE_OAUTH_CLIENT_ID` | Client ID from the OAuth App |
| `SPACE_OAUTH_CLIENT_SECRET` | Client Secret from the OAuth App |
| `SESSION_SECRET` | A randomly generated secret with at least 32 characters |
| `SPACE_ACTIONS_TOKEN` | Fine-grained token limited to Actions read/write on `yyouki/space` |

The environment therefore contains six secrets total:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `SPACE_OAUTH_CLIENT_ID`
- `SPACE_OAUTH_CLIENT_SECRET`
- `SESSION_SECRET`
- `SPACE_ACTIONS_TOKEN`

GitHub reserves secret names beginning with `GITHUB_`, so use the `SPACE_` names above. The deploy workflow maps them to the Worker binding names internally. Generate `SESSION_SECRET` with a password manager or trusted local random generator. Do not send any secret to chat, commit one to Git, or paste it into a workflow log.

## 4. Deploy

1. Open the repository's Actions tab.
2. Select **Deploy space AI to Cloudflare Free**.
3. Run the workflow from branch `main`.
4. Type exactly `DEPLOY` in the confirmation field.
5. Wait for TypeScript checks, tests, build, and Wrangler deployment to complete.
6. Open the Worker URL and sign in with the owner GitHub account.

The workflow no longer builds or deploys a Cloudflare Container. It still uses your existing Cloudflare API token and Account ID. The API token must be permitted to deploy the existing or first Worker; if the first creation is denied, adjust the Cloudflare token's Worker scope as documented by Cloudflare.

## 5. Verify the app and sandbox

After deployment:
1. Confirm the GitHub sign-in accepts the configured owner and rejects another GitHub account.
2. Send `print(6 * 7)` in Space. Expected: task status `succeeded` and stdout `42`.
3. Send `console.log(6 * 7)`. Expected: task status `succeeded` and stdout `42`.
4. Check timeout, cancellation, concurrency, and network isolation using the checklist in `docs/SANDBOX.md`.

Do not call the sandbox live until both language tests pass on the deployed service.

## 6. Workspace files and conversation sharing

The SpaceAgent SQLite database stores a private, app-level workspace. It is not a mount of the user's device or a GitHub repository checkout.

- Up to 200 files per agent.
- Up to 128 KB per file and 2 MB total.
- Relative paths only; hidden paths and sensitive config paths are rejected.
- AI file tools can list, read, and create/update workspace files. File deletion always requires owner approval.
- Files appear in the Monaco IDE Explorer after the tool write completes. Manual edits can be saved with **Save** or Ctrl/Cmd+S.
- There is no automatic sync to GitHub or the user's device.

The separate `/analytics` page shows provider-reported input/output token totals when the model provider includes usage metadata, retaining at most 200 recent responses. It also shows a 14-day daily aggregation and the latest 12 token-usage records. Workspace storage and rough file-token estimates appear in a separate section, never inside the `/ide` editor. Estimates use UTF-8 bytes divided by four and are not exact GLM tokenizer counts. This view does not calculate monetary cost or account-wide Cloudflare Neurons.

The **Share chat** button creates a read-only snapshot of up to 100 loaded messages and their visible tool details. The token is a 256-bit random bearer value. Anyone with the link can read the snapshot, so the UI asks for confirmation first. Links expire after seven days and can be revoked from the UI. They are served with `Cache-Control: no-store`, `X-Robots-Tag: noindex`, and no-referrer/security headers. Append `.json` to the share URL for machine-readable JSON. Do not share a conversation containing sensitive material.

Adding the `ChatShares` Durable Object requires migration tag `v3`; Wrangler applies this during the next deployment. No additional GitHub Environment secret is required.

## Official references

- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- GLM-4.7-Flash model: https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/
- Cloudflare GitHub Actions deployment: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- Cloudflare Worker authorization: https://developers.cloudflare.com/workers/authorization/
- GitHub OAuth App creation: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app
- GitHub Actions billing: https://docs.github.com/en/actions/concepts/billing-and-usage
- Monaco Editor ESM/Vite integration: https://github.com/microsoft/monaco-editor/blob/main/docs/integrate-esm.md
- AI SDK streamText usage: https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text

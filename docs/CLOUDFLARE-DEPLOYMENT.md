# Cloudflare Workers Free deployment

## Architecture

This deployment keeps the existing Cloudflare Agents / Durable Objects architecture while removing the paid Cloudflare Container dependency.

| Component | Service |
|---|---|
| Dashboard and API | Cloudflare Workers Free |
| Chat history, task ledger, preferences, memory | Durable Objects SQLite |
| Text model | Cloudflare Workers AI `@cf/zai-org/glm-4.7-flash` |
| Owner login | GitHub OAuth App |
| Python/JavaScript execution | Temporary GitHub-hosted Actions runner + restricted Docker container |

This avoids Cloudflare Zero Trust organization setup and Cloudflare Workers Paid Containers. It does not provide unlimited AI inference or unlimited runner capacity.

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

The OAuth callback must match the Worker hostname exactly.

1. In Cloudflare Dashboard, open **Workers & Pages** and find the account's `workers.dev` subdomain.
2. The Worker name in this project is `space-ai`. The expected origin is `https://space-ai.YOUR-SUBDOMAIN.workers.dev`.
3. In GitHub, open **Settings → Developer settings → OAuth Apps → New OAuth App**.
4. Set Homepage URL to the Worker origin.
5. Set Authorization callback URL to `https://space-ai.YOUR-SUBDOMAIN.workers.dev/auth/github/callback`.
6. Register the app, then copy its Client ID and generate a Client Secret.

Space requests only `read:user` (plus `offline_access` for short-lived token behavior), checks that the login matches the configured owner, and immediately revokes the temporary OAuth grant. The Worker stores a seven-day signed session cookie, not the OAuth token.

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
| `GITHUB_OAUTH_CLIENT_ID` | Client ID from the OAuth App |
| `GITHUB_OAUTH_CLIENT_SECRET` | Client Secret from the OAuth App |
| `SESSION_SECRET` | A randomly generated secret with at least 32 characters |
| `GITHUB_ACTIONS_TOKEN` | Fine-grained token limited to Actions read/write on `yyouki/space` |

The environment therefore contains six secrets total:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `GITHUB_OAUTH_CLIENT_ID`
- `GITHUB_OAUTH_CLIENT_SECRET`
- `SESSION_SECRET`
- `GITHUB_ACTIONS_TOKEN`

Generate `SESSION_SECRET` with a password manager or trusted local random generator. Do not send any secret to chat, commit one to Git, or paste it into a workflow log.

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

## Official references

- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- GLM-4.7-Flash model: https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/
- Cloudflare GitHub Actions deployment: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- Cloudflare Worker authorization: https://developers.cloudflare.com/workers/authorization/
- GitHub OAuth App creation: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app
- GitHub Actions billing: https://docs.github.com/en/actions/concepts/billing-and-usage

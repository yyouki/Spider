# Cloudflare production deployment

## Current status

The isolated sandbox runner is merged into `main`, and its main-branch GitHub Actions checks passed. No Cloudflare deployment has been performed from this coding session because there is no connected Cloudflare account or deployment credential.

The repository includes a manual deployment workflow at `.github/workflows/deploy-space-ai.yml`. It only deploys from `main`, requires the operator to type `DEPLOY`, runs type checks/tests/build first, and uploads the Cloudflare Access values as encrypted Worker secrets in the same deployment.

## Requirements and billing

- Cloudflare Containers are available on Workers Paid, not Workers Free. Active Container usage can exceed included monthly allowances and incur additional usage charges. The account holder should review current pricing and budget before deployment.
- The `durable_object` Container scheduling policy is public beta.
- Wrangler builds and deploys the Container image from `apps/space-ai/sandbox/Dockerfile` together with the Worker.

Do not enable paid services or increase account limits without the account holder's approval.

## 1. Configure Cloudflare Access

Create a Cloudflare Access self-hosted application that protects the entire hostname used by the `space-ai` Worker. Configure an allow policy for only the owner's identity. Do not create a public/Everyone rule.

Record the following values from the Access setup:

- `ACCESS_TEAM_DOMAIN`: the HTTPS Cloudflare Access team domain, for example `https://<team>.cloudflareaccess.com`.
- `ACCESS_AUD`: the Audience (AUD) value for the Access application.
- `ACCESS_ALLOWED_EMAIL`: the exact email claim allowed to enter the private workspace.

The Worker fails closed when one of these values is missing, malformed, or does not match the presented Access JWT. These values are declared as required secrets in `apps/space-ai/wrangler.jsonc`; never put them in source code or plain-text variables.

## 2. Create a scoped Cloudflare API token

Create a custom account API token scoped only to the Cloudflare account that hosts `space-ai`. Grant the permissions required to deploy the Worker and its Container application:

- `Workers Scripts Edit`
- `Containers Edit`

Do not use a Global API Key or a token scoped to every account. Keep the token value private.

## 3. Configure the GitHub production environment

In the repository's GitHub Settings, create an Environment named `production`. Add a required reviewer if the repository's environment protection settings support that safeguard. Add these environment secrets:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | The scoped Cloudflare API token |
| `CLOUDFLARE_ACCOUNT_ID` | The account ID for the target Cloudflare account |
| `ACCESS_TEAM_DOMAIN` | The HTTPS Access team domain |
| `ACCESS_AUD` | The Access application's AUD value |
| `ACCESS_ALLOWED_EMAIL` | The one allowed owner email |

Do not paste any of these values into chat or commit them to Git. The workflow writes only the three Access values to an ephemeral JSON file with restrictive file permissions, passes it to Wrangler's `--secrets-file` option, then deletes it even if deployment fails. The Cloudflare deploy token is exposed only to the deployment step.

## 4. Run the manual deployment

1. Open the repository's Actions tab.
2. Select `Deploy space AI to Cloudflare`.
3. Run the workflow from branch `main`.
4. Enter exactly `DEPLOY` in the confirmation field.
5. Review the workflow result and deployed Worker URL in the Wrangler output.

The job stops before deployment if any required environment secret is missing. It never deploys from a feature branch and does not run automatically on push.

## 5. Verify the private app and sandbox

After deployment, sign in through the Cloudflare Access application and verify that the dashboard loads. Then send these small tests in the space chat:

```python
print(6 * 7)
```

Expected result: task status `succeeded` and stdout `42`.

```javascript
console.log(6 * 7)
```

Expected result: task status `succeeded` and stdout `42`.

Also verify that an unauthenticated browser cannot access the protected hostname, and that an invalid or missing Access JWT is rejected.

Do not call the sandbox live until both execution tests succeed in the deployed account. Runtime verification of cancellation, timeout, and network isolation remains a separate checklist in `docs/SANDBOX.md`.

## References

- Cloudflare Containers pricing: https://developers.cloudflare.com/containers/platform/pricing/
- Cloudflare Container scheduling policies: https://developers.cloudflare.com/containers/configuration/scheduling-policy/
- Wrangler secrets and `--secrets-file`: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare GitHub Actions deployment: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- Cloudflare API token permissions: https://developers.cloudflare.com/fundamentals/api/reference/permissions/

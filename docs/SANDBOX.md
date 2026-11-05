# Isolated Linux sandbox

## Purpose

The initial runner executes bounded Python and JavaScript snippets without executing user code inside the Cloudflare Worker or the SpaceAgent process. The Worker submits each task to a dedicated GitHub Actions workflow, which receives a temporary GitHub-hosted Linux VM and launches a restricted Docker container.

This is not a full autonomous coding workspace: it does not mount the Git repository, expose a host shell, provide persistent project files, or access third-party accounts.

## Execution contract

- Accepted languages: Python 3 and Node.js JavaScript.
- Source size: at most 16 KB of UTF-8.
- Timeout: 10 seconds by default; owner/tool input may choose 1–30 seconds.
- Output: retain at most 6 KB of stdout and 6 KB of stderr.
- Concurrency: one active task per workspace.
- History: retain at most 30 recent task records.
- Source retention: source is encrypted before it is dispatched and is never written to the Durable Object task ledger.
- Network: the Docker container uses `--network=none`. The host runner downloads the official runtime image before executing user code.
- Credentials: the host GitHub API token stays in the Cloudflare Worker. No token, OAuth credential, or deployment secret is passed into the sandbox container.
- Filesystem: root filesystem is read-only, no host directory is mounted, and `/tmp` is a small no-exec tmpfs.
- Process limits: the container runs as a non-root user with no Linux capabilities, no-new-privileges, a PID cap, 256 MB memory, and 0.5 CPU.
- Commands: fixed executable argument arrays are used; user source is one argument and is never interpreted by a shell.

The workflow receives an ephemeral AES-GCM key and encrypted source. The key is available to the host-side launcher only, not to the Docker container. Results are encrypted with the same one-time key before upload; the Worker decrypts them and removes the key from the public task result.

## Lifecycle

1. Space validates the language, source length, timeout, and workspace concurrency.
2. The Durable Object generates a unique task ID and one-time AES-GCM key.
3. The source is encrypted and dispatched to the trusted `sandbox-run.yml` workflow on `main`.
4. A temporary GitHub-hosted runner checks out only the trusted launcher, pulls the official Python or Node image, then runs the source in the restricted container.
5. The host-side launcher captures bounded stdout/stderr and encrypts the result.
6. A short-lived encrypted Actions artifact stores the result. The Space Worker polls the workflow status, downloads the artifact, decrypts it, and persists only the bounded task result.
7. The GitHub-hosted runner VM is discarded after the job finishes.

The GitHub Actions fine-grained token is stored as a Worker secret and is used only to dispatch workflows, inspect their status/artifacts, and cancel them. It is never injected into the workflow runner.

## Security boundary and limitations

A GitHub-hosted runner gives each job a temporary VM, but Docker containers still share that VM's kernel. Container isolation is not an absolute guarantee against kernel or container-runtime vulnerabilities. This design reduces exposure by:
- using a fresh hosted VM for every task;
- not mounting the repository, secrets, or host paths into the user container;
- not passing the Actions token to the workflow or the container;
- disabling network access inside the container;
- applying non-root, read-only, no-capability, no-new-privileges, memory, CPU, PID, time, and output limits;
- encrypting both source and result payloads during transit and artifact storage.

Do not run hostile multi-tenant workloads, secrets-processing code, malware, or high-risk code in this runner. It is a personal snippet sandbox. Never add a Docker socket mount, repository mount, host credentials, or outbound internet to the sandbox.

## Cost boundary

GitHub documents standard GitHub-hosted runner usage as free for public repositories. The `yyouki/space` repository is public. This avoids the Cloudflare Workers Paid Container requirement, but it is not unlimited compute: GitHub policies, concurrency, job duration, workflow limits, and provider availability still apply. Do not promise 24/7 execution.

## Verification still required

After the free-tier deployment:
1. Run a Python arithmetic snippet and confirm status `succeeded`, stdout `42`.
2. Run a JavaScript arithmetic snippet and confirm status `succeeded`, stdout `42`.
3. Confirm a non-zero exit code and stderr for a failing snippet.
4. Confirm a 1-second timeout marks a longer task `timed_out`.
5. Confirm a second concurrent task is rejected.
6. Confirm cancellation reaches a terminal status.
7. Confirm the Docker container cannot make a network request.
8. Confirm the task ledger never stores submitted source and the Actions artifact is encrypted.

Do not call the sandbox live until these checks pass in the deployed account.

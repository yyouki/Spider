import type { GitHubAppTokenRecord } from "./vault";
import { requireOwnerAccess } from "../security/access";
import { getSpaceAgentName } from "../security/tenant-routing.js";
import {
  isValidNewRepositoryName,
  isWritablePersonalRepository,
  parsePersonalRepositoryTarget
} from "./repository-policy.js";

type GitHubAppEnvironment = Env & {
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_CLIENT_SECRET?: string;
  GITHUB_APP_SLUG?: string;
};

type GitHubAppTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
};

type GitHubInstallation = {
  id: number;
  account?: { id?: number; login?: string };
  permissions?: Record<string, string>;
  suspended_at?: string | null;
};

type WorkspaceSnapshot = {
  files: Array<{ path: string; content: string; sizeBytes: number }>;
  fileCount: number;
  totalBytes: number;
};

const GITHUB_APP_STATE_COOKIE = "space_github_app_state";
const GITHUB_APP_VERIFIER_COOKIE = "space_github_app_verifier";
const GITHUB_API_VERSION = "2026-03-10";
const WORKSPACE_FILE_LIMIT = 200;
const WORKSPACE_TOTAL_MAX_BYTES = 2 * 1024 * 1024;

function envConfig(env: Env): GitHubAppEnvironment {
  return env as GitHubAppEnvironment;
}

function isConfigured(env: Env): boolean {
  const config = envConfig(env);
  return Boolean(config.GITHUB_APP_CLIENT_ID && config.GITHUB_APP_CLIENT_SECRET && config.GITHUB_APP_SLUG);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("=", "").split("+").join("-").split("/").join("_");
}

function encodeBasic(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function secureCookie(name: string, value: string, maxAge: number): string {
  return [
    name + "=" + value,
    "Path=/",
    "Max-Age=" + maxAge,
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
}

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  for (const item of cookies.split(";")) {
    const separator = item.indexOf("=");
    if (separator >= 0 && item.slice(0, separator).trim() === name) {
      return item.slice(separator + 1).trim();
    }
  }
  return null;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function githubHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: "Bearer " + accessToken,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "space-ai"
  };
}

async function githubApi<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(githubHeaders(accessToken));
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch("https://api.github.com" + path, { ...init, headers });
  const body = await response.text();
  let parsed: unknown = null;
  try { parsed = body ? JSON.parse(body) : null; } catch { /* Non-JSON API response. */ }
  if (!response.ok) {
    const detail = parsed && typeof parsed === "object" && "message" in parsed
      ? String((parsed as { message: unknown }).message).slice(0, 160)
      : "GitHub API request failed.";
    if (response.status === 401) throw new Error("GitHub App authorization expired or was revoked. Reconnect GitHub.");
    if (response.status === 403) throw new Error("GitHub App needs Repository creation: write and Contents: write, or GitHub rate limit was reached.");
    if (response.status === 422) throw new Error("GitHub rejected this repository request. The name may already be taken or invalid.");
    throw new Error("GitHub API (" + response.status + "): " + detail);
  }
  return parsed as T;
}

function vaultFor(env: Env, userId: string) {
  const id = env.GitHubVault.idFromName(userId);
  return env.GitHubVault.get(id);
}

async function saveRecord(env: Env, userId: string, record: GitHubAppTokenRecord) {
  return vaultFor(env, userId).saveConnection(record);
}

async function getRecord(env: Env, userId: string) {
  return vaultFor(env, userId).getConnection();
}

async function getFreshRecord(env: Env, userId: string): Promise<GitHubAppTokenRecord> {
  const record = await getRecord(env, userId);
  if (!record) throw new Error("Connect your GitHub App account before publishing.");

  const config = envConfig(env);
  if (!config.GITHUB_APP_CLIENT_ID || !config.GITHUB_APP_CLIENT_SECRET) {
    throw new Error("GitHub App integration is not configured on this Worker.");
  }
  if (record.userId.toString() !== userId.replace(/^github:/, "")) {
    throw new Error("The stored GitHub connection does not match the signed-in account.");
  }
  if (record.accessExpiresAt > Date.now() + 60_000) return record;
  if (record.refreshExpiresAt <= Date.now()) {
    throw new Error("GitHub App refresh token expired. Reconnect GitHub.");
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.GITHUB_APP_CLIENT_ID,
      client_secret: config.GITHUB_APP_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: record.refreshToken
    })
  });
  const token = await response.json() as GitHubAppTokenResponse;
  if (!response.ok || !token.access_token || !token.refresh_token) {
    throw new Error("GitHub could not refresh this authorization. Reconnect GitHub.");
  }

  const refreshed: GitHubAppTokenRecord = {
    ...record,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    accessExpiresAt: Date.now() + (token.expires_in ?? 28_800) * 1000,
    refreshExpiresAt: Date.now() + (token.refresh_token_expires_in ?? 15_897_600) * 1000
  };
  await saveRecord(env, userId, refreshed);
  return refreshed;
}

async function verifyInstallation(
  accessToken: string,
  expectedUserId: number
): Promise<GitHubInstallation> {
  const result = await githubApi<{ installations?: GitHubInstallation[] }>(
    accessToken,
    "/user/installations?per_page=100"
  );
  const installation = (result.installations ?? []).find((item) =>
    item.account?.id === expectedUserId && !item.suspended_at
  );
  if (!installation) {
    throw new Error("Install this GitHub App on your personal account, then reconnect it.");
  }
  if (
    installation.permissions?.repository_creation !== "write" ||
    installation.permissions?.contents !== "write"
  ) {
    throw new Error("The installation must grant Repository creation: write and Contents: write.");
  }
  return installation;
}

function htmlPage(title: string, message: string, actionUrl?: string, actionLabel?: string): Response {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const action = actionUrl && actionLabel
    ? "<p><a href=\"" + escape(actionUrl) + "\">" + escape(actionLabel) + "</a></p>"
    : "";
  const html = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" + escape(title) +
    "</title><style>body{font:15px/1.6 system-ui;background:#f7f8fa;color:#202a35;margin:0;padding:8vh 20px}" +
    "main{max-width:580px;margin:auto;background:#fff;border:1px solid #e4e8ec;border-radius:16px;padding:28px}" +
    "a{color:#28654e}</style></head><body><main><h1>" + escape(title) + "</h1><p>" +
    escape(message) + "</p>" + action + "<p><a href=\"/settings\">Return to Space settings</a></p></main></body></html>";
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}

type GitHubRepositoryInfo = {
  name: string;
  full_name: string;
  html_url: string;
  default_branch: string;
  private: boolean;
  archived?: boolean;
  disabled?: boolean;
  owner: { login: string };
  permissions?: { push?: boolean };
};

type GitHubRepositoryOption = {
  name: string;
  fullName: string;
  url: string;
  isPrivate: boolean;
  defaultBranch: string;
  description: string | null;
};

async function commitWorkspaceSnapshot(
  accessToken: string,
  login: string,
  repository: GitHubRepositoryInfo,
  snapshot: WorkspaceSnapshot
): Promise<{ url: string; fullName: string; branch: string; filesPublished: number; commit: string; isPrivate: boolean; createdNew: boolean }> {
  if (repository.owner.login.toLowerCase() !== login.toLowerCase()) {
    throw new Error("The target repository must belong to the connected personal GitHub account.");
  }
  if (repository.archived || repository.disabled || repository.permissions?.push !== true) {
    throw new Error("You do not have push access to this repository, or it is archived/disabled.");
  }

  const owner = encodeURIComponent(login);
  const name = encodeURIComponent(repository.name);
  const branch = repository.default_branch;
  if (!branch) throw new Error("The target repository has no default branch.");
  const basePath = "/repos/" + owner + "/" + name;
  const ref = await githubApi<{ object: { sha: string } }>(
    accessToken,
    basePath + "/git/ref/heads/" + encodeURIComponent(branch)
  );
  const parent = await githubApi<{ tree: { sha: string } }>(
    accessToken,
    basePath + "/git/commits/" + ref.object.sha
  );

  if (!snapshot.files.length) {
    return {
      url: repository.html_url,
      fullName: repository.full_name,
      branch,
      filesPublished: 0,
      commit: ref.object.sha,
      isPrivate: repository.private,
      createdNew: false
    };
  }

  const treeEntries: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];
  // Small batches avoid bursty API calls while keeping medium projects practical.
  for (let start = 0; start < snapshot.files.length; start += 5) {
    const batch = snapshot.files.slice(start, start + 5);
    const blobs = await Promise.all(batch.map((file) =>
      githubApi<{ sha: string }>(accessToken, basePath + "/git/blobs", {
        method: "POST",
        body: JSON.stringify({ content: file.content, encoding: "utf-8" })
      })
    ));
    batch.forEach((file, index) => {
      treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blobs[index].sha });
    });
  }

  const tree = await githubApi<{ sha: string }>(accessToken, basePath + "/git/trees", {
    method: "POST",
    body: JSON.stringify({ base_tree: parent.tree.sha, tree: treeEntries })
  });
  const commit = await githubApi<{ sha: string }>(accessToken, basePath + "/git/commits", {
    method: "POST",
    body: JSON.stringify({
      message: "Publish Space workspace snapshot",
      tree: tree.sha,
      parents: [ref.object.sha]
    })
  });
  await githubApi(accessToken, basePath + "/git/refs/heads/" + encodeURIComponent(branch), {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false })
  });

  return {
    url: repository.html_url,
    fullName: repository.full_name,
    branch,
    filesPublished: snapshot.files.length,
    commit: commit.sha,
    isPrivate: repository.private,
    createdNew: false
  };
}

async function createPrivateRepository(
  accessToken: string,
  login: string,
  name: string,
  description: string,
  snapshot: WorkspaceSnapshot
): Promise<{ url: string; fullName: string; branch: string; filesPublished: number; commit: string; isPrivate: boolean; createdNew: boolean }> {
  const created = await githubApi<GitHubRepositoryInfo>(accessToken, "/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name,
      description,
      private: true,
      auto_init: true,
      has_issues: true,
      has_wiki: false
    })
  });
  if (created.owner.login.toLowerCase() !== login.toLowerCase()) {
    throw new Error("GitHub returned a repository for an unexpected owner. Publishing was stopped.");
  }

  const repo = await githubApi<GitHubRepositoryInfo>(
    accessToken,
    "/repos/" + encodeURIComponent(login) + "/" + encodeURIComponent(created.name)
  );
  const published = await commitWorkspaceSnapshot(accessToken, login, repo, snapshot);
  return { ...published, createdNew: true, isPrivate: true };
}

async function publishToExistingRepository(
  accessToken: string,
  login: string,
  fullName: string,
  snapshot: WorkspaceSnapshot
): Promise<{ url: string; fullName: string; branch: string; filesPublished: number; commit: string; isPrivate: boolean; createdNew: boolean }> {
  const target = parsePersonalRepositoryTarget(fullName, login);
  if (!target) {
    throw new Error("Only repositories owned by the connected personal GitHub account can be selected.");
  }
  const repo = await githubApi<GitHubRepositoryInfo>(
    accessToken,
    "/repos/" + encodeURIComponent(target.owner) + "/" + encodeURIComponent(target.name)
  );
  return commitWorkspaceSnapshot(accessToken, login, repo, snapshot);
}

async function listWritableRepositories(accessToken: string, login: string): Promise<GitHubRepositoryOption[]> {
  const repositories = await githubApi<Array<GitHubRepositoryInfo & { description?: string | null }>>(
    accessToken,
    "/user/repos?per_page=100&sort=updated"
  );
  return repositories
    .filter((repo) => isWritablePersonalRepository(repo, login))
    .map((repo) => ({
      name: repo.name,
      fullName: repo.full_name,
      url: repo.html_url,
      isPrivate: repo.private,
      defaultBranch: repo.default_branch,
      description: typeof repo.description === "string" ? repo.description : null
    }));
}

export async function handleGitHubAppRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const route = url.pathname;
  const supported = new Set([
    "/auth/github-app",
    "/auth/github-app/callback",
    "/api/github/status",
    "/api/github/repositories",
    "/api/github/publish",
    "/api/github/disconnect"
  ]);
  if (!supported.has(route)) return null;

  const access = await requireOwnerAccess(request, env);
  if (!access.ok) return access.response;
  const session = access.session;
  const config = envConfig(env);

  if (route === "/auth/github-app" && request.method === "GET") {
    if (!isConfigured(env)) {
      return htmlPage("GitHub App is not configured", "Add the GitHub App Client ID, Client Secret, and App slug to Cloudflare Worker secrets.");
    }
    if (session.provider !== "github" || !session.userId.startsWith("github:")) {
      return htmlPage("Sign in with GitHub", "The GitHub App must be connected using the GitHub identity that owns the target repositories.");
    }

    const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
    const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = await challengeFor(verifier);
    const callback = new URL("/auth/github-app/callback", url.origin).toString();
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", config.GITHUB_APP_CLIENT_ID!);
    authorize.searchParams.set("redirect_uri", callback);
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("scope", "offline_access");
    authorize.searchParams.set("code_challenge_method", "S256");
    authorize.searchParams.set("code_challenge", challenge);

    const headers = new Headers({ Location: authorize.toString(), "Cache-Control": "no-store" });
    headers.append("Set-Cookie", secureCookie(GITHUB_APP_STATE_COOKIE, state, 10 * 60));
    headers.append("Set-Cookie", secureCookie(GITHUB_APP_VERIFIER_COOKIE, verifier, 10 * 60));
    return new Response(null, { status: 302, headers });
  }

  if (route === "/auth/github-app/callback" && request.method === "GET") {
    const clearState = secureCookie(GITHUB_APP_STATE_COOKIE, "", 0);
    const clearVerifier = secureCookie(GITHUB_APP_VERIFIER_COOKIE, "", 0);
    const clearCookies = (response: Response) => {
      const headers = new Headers(response.headers);
      headers.append("Set-Cookie", clearState);
      headers.append("Set-Cookie", clearVerifier);
      headers.set("Cache-Control", "no-store");
      return new Response(response.body, { status: response.status, headers });
    };

    if (!isConfigured(env)) return clearCookies(htmlPage("GitHub App is not configured", "Configure the GitHub App credentials before connecting."));
    if (session.provider !== "github" || !session.userId.startsWith("github:")) {
      return clearCookies(htmlPage("Sign in with GitHub", "Connect this App using the GitHub account that owns your repositories."));
    }

    const state = url.searchParams.get("state") ?? "";
    const savedState = cookieValue(request, GITHUB_APP_STATE_COOKIE) ?? "";
    const verifier = cookieValue(request, GITHUB_APP_VERIFIER_COOKIE) ?? "";
    const code = url.searchParams.get("code") ?? "";
    if (!state || !savedState || !constantTimeEqual(state, savedState) || !verifier || !code) {
      return clearCookies(htmlPage("Authorization failed", "The OAuth state or code did not match. Start the GitHub connection again."));
    }

    try {
      const callback = new URL("/auth/github-app/callback", url.origin).toString();
      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.GITHUB_APP_CLIENT_ID!,
          client_secret: config.GITHUB_APP_CLIENT_SECRET!,
          code,
          redirect_uri: callback,
          code_verifier: verifier
        })
      });
      const token = await tokenResponse.json() as GitHubAppTokenResponse;
      if (!tokenResponse.ok || !token.access_token || !token.refresh_token) {
        return clearCookies(htmlPage("GitHub token unavailable", "The GitHub App did not return an expiring user token and refresh token. Enable User-to-server token expiration and retry."));
      }

      const user = await githubApi<{ id: number; login: string; avatar_url?: string }>(token.access_token, "/user");
      const expectedUserId = Number(session.userId.replace(/^github:/, ""));
      if (!Number.isSafeInteger(user.id) || user.id !== expectedUserId || user.login.toLowerCase() !== session.login.toLowerCase()) {
        return clearCookies(htmlPage("GitHub account mismatch", "The GitHub account that authorized the App is not the same account signed in to Space. No token was saved."));
      }

      let installation: GitHubInstallation;
      try {
        installation = await verifyInstallation(token.access_token, user.id);
      } catch {
        const installUrl = "https://github.com/apps/" + encodeURIComponent(config.GITHUB_APP_SLUG!) + "/installations/new";
        return clearCookies(htmlPage(
          "Install the GitHub App first",
          "Install the App on your personal GitHub account and grant Repository creation: write plus Contents: write. Then return to Settings and connect again.",
          installUrl,
          "Install GitHub App"
        ));
      }

      const record: GitHubAppTokenRecord = {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        accessExpiresAt: Date.now() + (token.expires_in ?? 28_800) * 1000,
        refreshExpiresAt: Date.now() + (token.refresh_token_expires_in ?? 15_897_600) * 1000,
        login: user.login,
        userId: user.id,
        avatarUrl: typeof user.avatar_url === "string" ? user.avatar_url : null,
        connectedAt: Date.now(),
        installationId: installation.id
      };
      const vault = env.GitHubVault.get(env.GitHubVault.idFromName(session.userId));
      await vault.saveConnection(record);
      return clearCookies(Response.redirect(new URL("/settings?githubApp=connected", url.origin), 302));
    } catch (error) {
      const message = error instanceof Error ? error.message : "GitHub App authorization failed.";
      return clearCookies(htmlPage("GitHub connection failed", message));
    }
  }

  if (route === "/api/github/status" && request.method === "GET") {
    const vault = env.GitHubVault.get(env.GitHubVault.idFromName(session.userId));
    const connection = await vault.getConnectionStatus();
    return Response.json({
      configured: isConfigured(env),
      canConnect: session.provider === "github" && session.userId.startsWith("github:"),
      appSlug: config.GITHUB_APP_SLUG ?? null,
      installUrl: config.GITHUB_APP_SLUG
        ? "https://github.com/apps/" + encodeURIComponent(config.GITHUB_APP_SLUG) + "/installations/new"
        : null,
      connection
    }, { headers: { "Cache-Control": "no-store" } });
  }

  if (route === "/api/github/repositories" && request.method === "GET") {
    if (session.provider !== "github" || !session.userId.startsWith("github:")) {
      return Response.json({ error: "Sign in using the GitHub account that owns your repositories." }, { status: 403 });
    }
    try {
      const record = await getFreshRecord(env, session.userId);
      if (record.login.toLowerCase() !== session.login.toLowerCase()) {
        return Response.json({ error: "The connected GitHub account does not match your Space session." }, { status: 403 });
      }
      const installation = await verifyInstallation(record.accessToken, record.userId);
      if (installation.id !== record.installationId) {
        return Response.json({ error: "GitHub App installation changed. Reconnect GitHub." }, { status: 403 });
      }
      const repositories = await listWritableRepositories(record.accessToken, record.login);
      return Response.json({ repositories }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not list GitHub repositories.";
      return Response.json({ error: message }, { status: 502 });
    }
  }

  if (route === "/api/github/disconnect" && request.method === "POST") {
    if (request.headers.get("origin") !== url.origin) {
      return Response.json({ error: "Invalid request origin." }, { status: 403 });
    }
    if (!isConfigured(env)) return Response.json({ error: "GitHub App is not configured." }, { status: 503 });
    const vault = env.GitHubVault.get(env.GitHubVault.idFromName(session.userId));
    const stored = await vault.getConnection();
    if (!stored) return Response.json({ disconnected: true });

    let record: GitHubAppTokenRecord = stored;
    try {
      record = await getFreshRecord(env, session.userId);
    } catch {
      // A still-valid access token may be revoked even when token refresh is unavailable.
      if (stored.accessExpiresAt <= Date.now()) {
        return Response.json({
          error: "GitHub token refresh has expired. Revoke the Space GitHub App from GitHub Settings → Applications before removing the local connection."
        }, { status: 409 });
      }
    }

    const basic = encodeBasic(config.GITHUB_APP_CLIENT_ID! + ":" + config.GITHUB_APP_CLIENT_SECRET!);
    const revoked = await fetch(
      "https://api.github.com/applications/" + encodeURIComponent(config.GITHUB_APP_CLIENT_ID!) + "/grant",
      {
        method: "DELETE",
        headers: {
          Authorization: "Basic " + basic,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ access_token: record.accessToken })
      }
    );
    if (!revoked.ok && revoked.status !== 422) {
      return Response.json({ error: "GitHub could not revoke this authorization. The local connection was kept." }, { status: 502 });
    }
    await vault.deleteConnection();
    return Response.json({ disconnected: true });
  }

  if (route === "/api/github/publish" && request.method === "POST") {
    if (request.headers.get("origin") !== url.origin) {
      return Response.json({ error: "Invalid request origin." }, { status: 403 });
    }
    if (session.provider !== "github" || !session.userId.startsWith("github:")) {
      return Response.json({ error: "Sign in using the GitHub account that owns the repository." }, { status: 403 });
    }
    if (!isConfigured(env)) return Response.json({ error: "GitHub App is not configured." }, { status: 503 });

    let input: { name?: unknown; description?: unknown; existingRepository?: unknown };
    try {
      const body = await request.text();
      if (body.length > 8_000) throw new Error("Request too large.");
      input = JSON.parse(body) as { name?: unknown; description?: unknown; existingRepository?: unknown };
    } catch {
      return Response.json({ error: "Invalid repository request." }, { status: 400 });
    }

    const name = typeof input.name === "string" ? input.name.trim() : "";
    const description = typeof input.description === "string" ? input.description.trim().slice(0, 300) : "";
    const existingRepository = typeof input.existingRepository === "string" ? input.existingRepository.trim() : "";
    if (!existingRepository && !isValidNewRepositoryName(name)) {
      return Response.json({ error: "Use a repository name with up to 100 letters, numbers, dots, underscores, or hyphens." }, { status: 400 });
    }

    try {
      const record = await getFreshRecord(env, session.userId);
      if (record.login.toLowerCase() !== session.login.toLowerCase()) {
        return Response.json({ error: "The connected GitHub account does not match your Space session." }, { status: 403 });
      }
      const installation = await verifyInstallation(record.accessToken, record.userId);
      if (installation.id !== record.installationId) {
        return Response.json({ error: "GitHub App installation changed. Reconnect GitHub before publishing." }, { status: 403 });
      }

      const agentName = getSpaceAgentName({ userId: session.userId, role: session.role });
      const agentId = env.SpaceAgent.idFromName(agentName);
      const snapshot = await env.SpaceAgent.get(agentId).exportWorkspaceSnapshot() as WorkspaceSnapshot;
      if (!snapshot.fileCount) {
        return Response.json({ error: "The Space workspace has no files to publish yet." }, { status: 400 });
      }
      if (snapshot.fileCount > WORKSPACE_FILE_LIMIT || snapshot.totalBytes > WORKSPACE_TOTAL_MAX_BYTES) {
        return Response.json({ error: "Workspace export exceeds its file or storage limit." }, { status: 400 });
      }

      const result = existingRepository
        ? await publishToExistingRepository(record.accessToken, record.login, existingRepository, snapshot)
        : await createPrivateRepository(record.accessToken, record.login, name, description, snapshot);
      return Response.json({
        success: true,
        visibility: result.isPrivate ? "private" : "public",
        owner: record.login,
        repository: result
      }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "GitHub repository publishing failed.";
      return Response.json({ error: message }, { status: 502 });
    }
  }

  return null;
}

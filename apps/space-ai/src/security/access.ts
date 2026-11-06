type AuthEnvironment = {
  GITHUB_OAUTH_CLIENT_ID: string;
  GITHUB_OAUTH_CLIENT_SECRET: string;
  GITHUB_OWNER_LOGIN: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  GOOGLE_OWNER_EMAIL?: string;
  SESSION_SECRET: string;
  DEPLOYMENT_ENV: string;
  ALLOW_LOCAL_DEV_AUTH_BYPASS?: string;
};

export type OwnerSession = {
  userId: string;
  provider: "github" | "google";
  login: string;
  name: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  email: string | null;
  role: "owner";
  expiresAt: number;
};

const SESSION_COOKIE = "__Host-space_session";
const STATE_COOKIE = "space_oauth_state";
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  for (const entry of cookies.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    if (entry.slice(0, separator).trim() === name) {
      return entry.slice(separator + 1).trim();
    }
  }
  return null;
}

function secureCookie(name: string, value: string, options: { path: string; maxAge: number }): string {
  return [
    `${name}=${value}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAge}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

function sessionSigningReady(env: AuthEnvironment): boolean {
  return typeof env.SESSION_SECRET === "string" && env.SESSION_SECRET.length >= 32;
}

export function githubOAuthReady(env: AuthEnvironment): boolean {
  return Boolean(
    env.GITHUB_OAUTH_CLIENT_ID &&
    env.GITHUB_OAUTH_CLIENT_SECRET &&
    env.GITHUB_OWNER_LOGIN &&
    sessionSigningReady(env)
  );
}

export function googleOAuthReady(env: AuthEnvironment): boolean {
  return Boolean(
    env.GOOGLE_OAUTH_CLIENT_ID &&
    env.GOOGLE_OAUTH_CLIENT_SECRET &&
    typeof env.GOOGLE_OWNER_EMAIL === "string" &&
    env.GOOGLE_OWNER_EMAIL.includes("@") &&
    sessionSigningReady(env)
  );
}

function anyOAuthReady(env: AuthEnvironment): boolean {
  return githubOAuthReady(env) || googleOAuthReady(env);
}

function createSignedSession(payload: Record<string, unknown>, env: AuthEnvironment): Promise<string> {
  return (async () => {
    const encoded = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
    return encoded + "." + await hmac(encoded, env.SESSION_SECRET);
  })();
}

function localBypass(env: AuthEnvironment): boolean {
  return env.DEPLOYMENT_ENV !== "production" &&
    env.ALLOW_LOCAL_DEV_AUTH_BYPASS === "true";
}

export async function getOwnerSession(
  request: Request,
  env: AuthEnvironment
): Promise<OwnerSession | null> {
  if (localBypass(env)) {
    return {
      userId: "local-development",
      provider: "github",
      login: env.GITHUB_OWNER_LOGIN || "local-development",
      name: null,
      avatarUrl: null,
      profileUrl: null,
      email: null,
      role: "owner",
      expiresAt: Number.MAX_SAFE_INTEGER
    };
  }
  if (!sessionSigningReady(env)) return null;

  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const payloadPart = token.slice(0, separator);
  const signaturePart = token.slice(separator + 1);
  let expectedSignature: string;
  let payload: {
    userId?: unknown;
    provider?: unknown;
    login?: unknown;
    name?: unknown;
    avatarUrl?: unknown;
    profileUrl?: unknown;
    email?: unknown;
    expiresAt?: unknown;
  };

  try {
    expectedSignature = await hmac(payloadPart, env.SESSION_SECRET);
    if (!constantTimeEqual(signaturePart, expectedSignature)) return null;
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart))) as {
      userId?: unknown;
      provider?: unknown;
      login?: unknown;
      name?: unknown;
      avatarUrl?: unknown;
      profileUrl?: unknown;
      email?: unknown;
      expiresAt?: unknown;
    };
  } catch {
    return null;
  }

  const provider = payload.provider === "google" ? "google" : "github";
  const isAllowedGitHub = provider === "github" &&
    typeof payload.login === "string" &&
    typeof env.GITHUB_OWNER_LOGIN === "string" &&
    payload.login.toLowerCase() === env.GITHUB_OWNER_LOGIN.toLowerCase();
  const isAllowedGoogle = provider === "google" &&
    typeof payload.email === "string" &&
    typeof env.GOOGLE_OWNER_EMAIL === "string" &&
    payload.email.toLowerCase() === env.GOOGLE_OWNER_EMAIL.toLowerCase() &&
    googleOAuthReady(env);

  if (
    (!isAllowedGitHub && !isAllowedGoogle) ||
    typeof payload.expiresAt !== "number" ||
    payload.expiresAt <= Date.now()
  ) {
    return null;
  }

  const login = typeof payload.login === "string" ? payload.login : String(payload.email);
  const avatarUrl = typeof payload.avatarUrl === "string" &&
    /^https:\/\//i.test(payload.avatarUrl) ? payload.avatarUrl : null;
  const profileUrl = typeof payload.profileUrl === "string" &&
    /^https:\/\//i.test(payload.profileUrl) ? payload.profileUrl : null;

  return {
    // Older GitHub owner cookies remain valid and keep using the legacy default Agent.
    userId: typeof payload.userId === "string" ? payload.userId : "legacy-owner",
    provider,
    login,
    name: typeof payload.name === "string" ? payload.name : null,
    avatarUrl,
    profileUrl,
    email: typeof payload.email === "string" ? payload.email : null,
    role: "owner",
    expiresAt: payload.expiresAt
  };
}

export async function requireOwnerAccess(
  request: Request,
  env: AuthEnvironment
): Promise<{ ok: true; session: OwnerSession } | { ok: false; response: Response }> {
  const session = await getOwnerSession(request, env);
  if (session) return { ok: true, session };

  if (!anyOAuthReady(env)) {
    return {
      ok: false,
      response: Response.json({ error: "No owner OAuth provider is fully configured." }, { status: 503 })
    };
  }

  return {
    ok: false,
    response: Response.json({ error: "Sign in with the owner GitHub account." }, { status: 401 })
  };
}

/** Handle OAuth routes before protected API and Agent routing. */
export async function handleAuthRequest(
  request: Request,
  env: AuthEnvironment
): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname === "/auth/github" && request.method === "GET") {
    if (!githubOAuthReady(env)) {
      return Response.json({ error: "GitHub OAuth is not configured." }, { status: 503 });
    }

    const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
    const callback = new URL("/auth/github/callback", url.origin).toString();
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", env.GITHUB_OAUTH_CLIENT_ID);
    authorize.searchParams.set("redirect_uri", callback);
    authorize.searchParams.set("scope", "read:user");
    authorize.searchParams.set("state", state);

    const headers = new Headers({ Location: authorize.toString(), "Cache-Control": "no-store" });
    headers.append("Set-Cookie", secureCookie(STATE_COOKIE, state, {
      path: "/auth/github/callback",
      maxAge: 10 * 60
    }));
    return new Response(null, { status: 302, headers });
  }

  if (url.pathname === "/auth/github/callback" && request.method === "GET") {
    const clearState = secureCookie(STATE_COOKIE, "", {
      path: "/auth/github/callback",
      maxAge: 0
    });
    const clearHeaders = new Headers({ "Cache-Control": "no-store" });
    clearHeaders.append("Set-Cookie", clearState);

    if (!githubOAuthReady(env)) {
      return new Response("GitHub OAuth is not configured.", { status: 503, headers: clearHeaders });
    }

    const returnedState = url.searchParams.get("state") ?? "";
    const savedState = cookieValue(request, STATE_COOKIE) ?? "";
    const code = url.searchParams.get("code") ?? "";
    if (!code || !returnedState || !constantTimeEqual(returnedState, savedState)) {
      return new Response("GitHub sign-in state is missing or invalid. Please try again.", {
        status: 400,
        headers: clearHeaders
      });
    }

    const callback = new URL("/auth/github/callback", url.origin).toString();
    try {
      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "space-ai"
        },
        body: JSON.stringify({
          client_id: env.GITHUB_OAUTH_CLIENT_ID,
          client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
          code,
          redirect_uri: callback
        })
      });
      if (!tokenResponse.ok) {
        return new Response("GitHub token exchange failed. Please try again.", {
          status: 502,
          headers: clearHeaders
        });
      }

      const tokenData = await tokenResponse.json() as { access_token?: string };
      if (!tokenData.access_token) {
        return new Response("GitHub did not authorize this sign-in.", {
          status: 401,
          headers: clearHeaders
        });
      }

      const userResponse = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "space-ai"
        }
      });
      if (!userResponse.ok) {
        return new Response("Could not verify the GitHub account.", {
          status: 502,
          headers: clearHeaders
        });
      }

      const user = await userResponse.json() as {
        id?: number;
        login?: string;
        name?: string | null;
        avatar_url?: string;
        html_url?: string;
        email?: string | null;
      };
      const allowed = typeof user.login === "string" &&
        user.login.toLowerCase() === env.GITHUB_OWNER_LOGIN.toLowerCase();

      // Use the short-lived read:user token only for this lookup; never persist it.
      if (!allowed || typeof user.login !== "string") {
        return new Response("This GitHub account is not allowed to access this private workspace.", {
          status: 403,
          headers: clearHeaders
        });
      }

      const sessionToken = await createSignedSession({
        userId: typeof user.id === "number" ? "github:" + user.id : "legacy-owner",
        provider: "github",
        login: user.login,
        name: typeof user.name === "string" ? user.name : null,
        avatarUrl: typeof user.avatar_url === "string" ? user.avatar_url : null,
        profileUrl: typeof user.html_url === "string" ? user.html_url : null,
        email: typeof user.email === "string" ? user.email : null,
        expiresAt: Date.now() + SESSION_SECONDS * 1000
      }, env);
      const headers = new Headers({
        Location: "/",
        "Cache-Control": "no-store"
      });
      headers.append("Set-Cookie", clearState);
      headers.append("Set-Cookie", secureCookie(SESSION_COOKIE, sessionToken, {
        path: "/",
        maxAge: SESSION_SECONDS
      }));
      return new Response(null, { status: 302, headers });
    } catch {
      return new Response("GitHub sign-in could not be completed. Please try again.", {
        status: 502,
        headers: clearHeaders
      });
    }
  }

  if (url.pathname === "/auth/google" && request.method === "GET") {
    if (!googleOAuthReady(env)) {
      return Response.json({ error: "Google sign-in is not configured for the owner account." }, { status: 503 });
    }

    const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
    const callback = new URL("/auth/google/callback", url.origin).toString();
    const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorize.searchParams.set("client_id", env.GOOGLE_OAUTH_CLIENT_ID!);
    authorize.searchParams.set("redirect_uri", callback);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("scope", "openid email profile");
    authorize.searchParams.set("state", state);

    const headers = new Headers({ Location: authorize.toString(), "Cache-Control": "no-store" });
    headers.append("Set-Cookie", secureCookie(STATE_COOKIE, state, {
      path: "/auth/google/callback",
      maxAge: 10 * 60
    }));
    return new Response(null, { status: 302, headers });
  }

  if (url.pathname === "/auth/google/callback" && request.method === "GET") {
    const clearState = secureCookie(STATE_COOKIE, "", {
      path: "/auth/google/callback",
      maxAge: 0
    });
    const clearHeaders = new Headers({ "Cache-Control": "no-store" });
    clearHeaders.append("Set-Cookie", clearState);

    if (!googleOAuthReady(env)) {
      return new Response("Google sign-in is not configured.", { status: 503, headers: clearHeaders });
    }

    const returnedState = url.searchParams.get("state") ?? "";
    const savedState = cookieValue(request, STATE_COOKIE) ?? "";
    const code = url.searchParams.get("code") ?? "";
    if (!code || !returnedState || !constantTimeEqual(returnedState, savedState)) {
      return new Response("Google sign-in state is missing or invalid. Please try again.", {
        status: 400,
        headers: clearHeaders
      });
    }

    const callback = new URL("/auth/google/callback", url.origin).toString();
    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body: new URLSearchParams({
          client_id: env.GOOGLE_OAUTH_CLIENT_ID!,
          client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET!,
          code,
          grant_type: "authorization_code",
          redirect_uri: callback
        })
      });
      if (!tokenResponse.ok) {
        return new Response("Google token exchange failed. Please try again.", {
          status: 502,
          headers: clearHeaders
        });
      }

      const tokenData = await tokenResponse.json() as { access_token?: string };
      if (!tokenData.access_token) {
        return new Response("Google did not authorize this sign-in.", {
          status: 401,
          headers: clearHeaders
        });
      }

      const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: "Bearer " + tokenData.access_token, Accept: "application/json" }
      });
      if (!userResponse.ok) {
        return new Response("Could not verify the Google account.", { status: 502, headers: clearHeaders });
      }

      const user = await userResponse.json() as {
        sub?: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string;
      };
      const allowed = typeof user.sub === "string" &&
        typeof user.email === "string" &&
        user.email_verified === true &&
        user.email.toLowerCase() === env.GOOGLE_OWNER_EMAIL!.toLowerCase();

      // This Google provider is intentionally owner-only; no public registration is enabled.
      if (!allowed || !user.email || !user.sub) {
        return new Response("This Google account is not configured as the owner of this private workspace.", {
          status: 403,
          headers: clearHeaders
        });
      }

      const sessionToken = await createSignedSession({
        userId: "google:" + user.sub,
        provider: "google",
        login: user.email,
        name: typeof user.name === "string" ? user.name : null,
        avatarUrl: typeof user.picture === "string" ? user.picture : null,
        profileUrl: null,
        email: user.email,
        expiresAt: Date.now() + SESSION_SECONDS * 1000
      }, env);
      const headers = new Headers({ Location: "/", "Cache-Control": "no-store" });
      headers.append("Set-Cookie", clearState);
      headers.append("Set-Cookie", secureCookie(SESSION_COOKIE, sessionToken, {
        path: "/",
        maxAge: SESSION_SECONDS
      }));
      return new Response(null, { status: 302, headers });
    } catch {
      return new Response("Google sign-in could not be completed. Please try again.", {
        status: 502,
        headers: clearHeaders
      });
    }
  }

  if (url.pathname === "/auth/logout" && request.method === "POST") {
    if (request.headers.get("origin") !== url.origin) {
      return Response.json({ error: "Invalid request origin." }, { status: 403 });
    }
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", secureCookie(SESSION_COOKIE, "", { path: "/", maxAge: 0 }));
    return new Response(null, { status: 204, headers });
  }

  return null;
}

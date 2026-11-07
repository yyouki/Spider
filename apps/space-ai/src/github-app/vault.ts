import { DurableObject } from "cloudflare:workers";

export type GitHubAppTokenRecord = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
  login: string;
  userId: number;
  avatarUrl: string | null;
  connectedAt: number;
  installationId: number;
};

export type GitHubAppConnectionStatus = {
  connected: boolean;
  login: string | null;
  userId: number | null;
  avatarUrl: string | null;
  connectedAt: number | null;
  accessExpiresAt: number | null;
};

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error("The server encryption key is not configured.");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "HKDF",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("space-github-app-vault-v1"),
      info: new TextEncoder().encode("encrypted-user-access-and-refresh-tokens")
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export class GitHubVault extends DurableObject<Env> {
  private async encrypt(record: GitHubAppTokenRecord): Promise<string> {
    const key = await encryptionKey(this.env.SESSION_SECRET);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      key,
      new TextEncoder().encode(JSON.stringify(record))
    );
    const payload = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    payload.set(iv, 0);
    payload.set(new Uint8Array(ciphertext), iv.byteLength);
    return toBase64(payload);
  }

  private async decrypt(value: string): Promise<GitHubAppTokenRecord> {
    const payload = fromBase64(value);
    if (payload.byteLength <= 12) throw new Error("Stored GitHub App credentials are invalid.");
    const key = await encryptionKey(this.env.SESSION_SECRET);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: payload.slice(0, 12), tagLength: 128 },
      key,
      toArrayBuffer(payload.slice(12))
    );
    const record = JSON.parse(new TextDecoder().decode(plaintext)) as GitHubAppTokenRecord;
    if (
      typeof record.accessToken !== "string" ||
      typeof record.refreshToken !== "string" ||
      typeof record.accessExpiresAt !== "number" ||
      typeof record.refreshExpiresAt !== "number" ||
      typeof record.login !== "string" ||
      typeof record.userId !== "number" ||
      typeof record.installationId !== "number"
    ) throw new Error("Stored GitHub App credentials are incomplete.");
    return record;
  }

  async saveConnection(record: GitHubAppTokenRecord): Promise<GitHubAppConnectionStatus> {
    if (
      typeof record.accessToken !== "string" ||
      record.accessToken.length < 20 ||
      typeof record.refreshToken !== "string" ||
      record.refreshToken.length < 20 ||
      typeof record.login !== "string" ||
      record.login.length > 100 ||
      !Number.isSafeInteger(record.userId) ||
      !Number.isSafeInteger(record.installationId)
    ) throw new Error("The GitHub App authorization response is invalid.");

    await this.ctx.storage.put("github-app-connection", await this.encrypt(record));
    return this.getConnectionStatus();
  }

  async getConnection(): Promise<GitHubAppTokenRecord | null> {
    const encrypted = await this.ctx.storage.get<string>("github-app-connection");
    return encrypted ? this.decrypt(encrypted) : null;
  }

  async getConnectionStatus(): Promise<GitHubAppConnectionStatus> {
    const record = await this.getConnection();
    return {
      connected: Boolean(record),
      login: record?.login ?? null,
      userId: record?.userId ?? null,
      avatarUrl: record?.avatarUrl ?? null,
      connectedAt: record?.connectedAt ?? null,
      accessExpiresAt: record?.accessExpiresAt ?? null
    };
  }

  async deleteConnection(): Promise<{ deleted: boolean }> {
    const existed = (await this.ctx.storage.get<string>("github-app-connection")) !== undefined;
    await this.ctx.storage.delete("github-app-connection");
    return { deleted: existed };
  }
}

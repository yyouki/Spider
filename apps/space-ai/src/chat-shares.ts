import { DurableObject } from "cloudflare:workers";

export type SharedChatMessage = {
  id: string;
  role: string;
  parts: Array<Record<string, unknown>>;
};

export type SharedChatSnapshot = {
  format: "space-chat-share";
  version: 1;
  createdAt: string;
  expiresAt: string;
  messageCount: number;
  messages: SharedChatMessage[];
};

const SHARE_STORAGE_KEY = "shared-chat";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class ChatShares extends DurableObject<Env> {
  async saveShare(token: string, snapshotJson: string, expiresAt: number): Promise<void> {
    if (!TOKEN_PATTERN.test(token)) throw new Error("Invalid share token.");
    if (typeof snapshotJson !== "string" || snapshotJson.length > 300_000) {
      throw new Error("Shared conversation is too large.");
    }
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new Error("Invalid share expiration.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(snapshotJson);
    } catch {
      throw new Error("Shared conversation is not valid JSON.");
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("messageCount" in parsed) ||
      typeof parsed.messageCount !== "number" ||
      parsed.messageCount < 1 ||
      parsed.messageCount > 100
    ) {
      throw new Error("Invalid shared conversation length.");
    }

    await this.ctx.storage.put(SHARE_STORAGE_KEY, { token, snapshotJson, expiresAt });
    await this.ctx.storage.setAlarm(expiresAt);
  }

  async readShare(token: string): Promise<string | null> {
    if (!TOKEN_PATTERN.test(token)) return null;
    const stored = await this.ctx.storage.get<{
      token: string;
      snapshotJson: string;
      expiresAt: number;
    }>(SHARE_STORAGE_KEY);

    if (!stored || stored.token !== token) return null;
    if (stored.expiresAt <= Date.now()) {
      await this.ctx.storage.deleteAll();
      return null;
    }
    return stored.snapshotJson;
  }

  async revokeShare(token: string): Promise<boolean> {
    if (!TOKEN_PATTERN.test(token)) return false;
    const stored = await this.ctx.storage.get<{ token: string }>(SHARE_STORAGE_KEY);
    if (!stored || stored.token !== token) return false;
    await this.ctx.storage.deleteAll();
    return true;
  }

  async alarm(): Promise<void> {
    // Expired shared conversations are automatically removed.
    await this.ctx.storage.deleteAll();
  }
}

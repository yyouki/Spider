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

export class ChatShares extends DurableObject {
  async saveShare(token: string, snapshot: SharedChatSnapshot): Promise<void> {
    if (!TOKEN_PATTERN.test(token)) throw new Error("Invalid share token.");
    if (snapshot.messageCount < 1 || snapshot.messageCount > 100) {
      throw new Error("Invalid shared conversation length.");
    }

    const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
    if (bytes > 300_000) throw new Error("Shared conversation is too large.");

    await this.ctx.storage.put(SHARE_STORAGE_KEY, { token, snapshot });
    await this.ctx.storage.setAlarm(Date.parse(snapshot.expiresAt));
  }

  async readShare(token: string): Promise<SharedChatSnapshot | null> {
    if (!TOKEN_PATTERN.test(token)) return null;
    const stored = await this.ctx.storage.get<{
      token: string;
      snapshot: SharedChatSnapshot;
    }>(SHARE_STORAGE_KEY);

    if (!stored || stored.token !== token) return null;
    if (Date.parse(stored.snapshot.expiresAt) <= Date.now()) {
      await this.ctx.storage.deleteAll();
      return null;
    }
    return stored.snapshot;
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

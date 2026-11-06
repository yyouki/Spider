export type SupportedVideoLink = {
  url: string;
  platform: "YouTube" | "TikTok" | "Vimeo" | "Dailymotion";
};

const ALLOWED_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be",
  "tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com",
  "vimeo.com", "www.vimeo.com", "player.vimeo.com",
  "dailymotion.com", "www.dailymotion.com", "dai.ly"
]);

/** Validate a public HTTPS video URL before it can be attached to a chat. */
export function parseSupportedVideoLink(input: string): SupportedVideoLink | null {
  if (typeof input !== "string" || input.length > 2048) return null;

  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !ALLOWED_HOSTS.has(host)) return null;

  let platform: SupportedVideoLink["platform"];
  if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(host)) {
    platform = "YouTube";
    if (host === "youtu.be") {
      if (!/^[A-Za-z0-9_-]{6,20}$/.test(parsed.pathname.slice(1).split("/")[0] ?? "")) return null;
    } else if (parsed.pathname === "/watch") {
      if (!/^[A-Za-z0-9_-]{6,20}$/.test(parsed.searchParams.get("v") ?? "")) return null;
    } else if (/^\/(?:shorts|live|embed)\//.test(parsed.pathname)) {
      if (!/^[A-Za-z0-9_-]{6,20}$/.test(parsed.pathname.split("/")[2] ?? "")) return null;
    } else return null;
  } else if (["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"].includes(host)) {
    platform = "TikTok";
    if (parsed.pathname === "/") return null;
  } else if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) {
    platform = "Vimeo";
    if (!/^\/(?:video\/)?\d+(?:\/|$)/.test(parsed.pathname)) return null;
  } else {
    platform = "Dailymotion";
    if (host === "dai.ly") {
      if (!/^\/[A-Za-z0-9]+/.test(parsed.pathname)) return null;
    } else if (!/^\/video\/[A-Za-z0-9]+/.test(parsed.pathname)) return null;
  }

  parsed.hash = "";
  return { url: parsed.toString(), platform };
}

import test from "node:test";
import assert from "node:assert/strict";
import { describeAgentRequestRejection, getSpaceAgentName, isSameOriginAgentRequest } from "./tenant-routing.js";

test("owner session keeps the legacy default Durable Object identity", () => {
  assert.equal(getSpaceAgentName({ userId: "github:251731418", role: "owner" }), "default");
});

test("different member identities map to different Durable Object instances", () => {
  const first = getSpaceAgentName({ userId: "github:1001", role: "member" });
  const second = getSpaceAgentName({ userId: "github:1002", role: "member" });
  assert.equal(first, "user-github:1001");
  assert.equal(second, "user-github:1002");
  assert.notEqual(first, second);
});

test("invalid member identities are rejected before Durable Object lookup", () => {
  assert.throws(() => getSpaceAgentName({ userId: "../default", role: "member" }));
  assert.throws(() => getSpaceAgentName({ userId: "", role: "member" }));
});

const site = "https://spider.example";

function agentRequest(path, headers = {}, init = {}) {
  return new Request(site + path, { ...init, headers });
}

test("a matching Origin is accepted and a foreign Origin is rejected", () => {
  assert.equal(isSameOriginAgentRequest(agentRequest("/api/me", { Origin: site })), true);
  assert.equal(isSameOriginAgentRequest(agentRequest("/api/me", { Origin: "https://other.example" })), false);
  assert.equal(isSameOriginAgentRequest(agentRequest("/api/me", { Origin: "null" })), false);
});

test("a foreign Origin is rejected even when the browser claims same-origin", () => {
  const request = agentRequest("/api/me/get-messages", {
    Origin: "https://other.example",
    "Sec-Fetch-Site": "same-origin"
  });
  assert.equal(isSameOriginAgentRequest(request), false);
});

test("same-origin GET without Origin is accepted so chat history can load", () => {
  const request = agentRequest("/api/me/get-messages", { "Sec-Fetch-Site": "same-origin" });
  assert.equal(isSameOriginAgentRequest(request), true);
});

test("requests without Origin and without browser proof are rejected", () => {
  assert.equal(isSameOriginAgentRequest(agentRequest("/api/me/get-messages")), false);
  assert.equal(isSameOriginAgentRequest(agentRequest("/api/me/get-messages", { "Sec-Fetch-Site": "cross-site" })), false);
  assert.equal(isSameOriginAgentRequest(agentRequest("/api/me/get-messages", { "Sec-Fetch-Site": "same-site" })), false);
  assert.equal(isSameOriginAgentRequest(agentRequest("/api/me/get-messages", { "Sec-Fetch-Site": "none" })), false);
});

test("WebSocket upgrades always need a matching Origin", () => {
  const withoutOrigin = agentRequest("/api/me", { Upgrade: "websocket", "Sec-Fetch-Site": "same-origin" });
  const withOrigin = agentRequest("/api/me", { Upgrade: "websocket", Origin: site });
  assert.equal(isSameOriginAgentRequest(withoutOrigin), false);
  assert.equal(isSameOriginAgentRequest(withOrigin), true);
});

test("state-changing methods always need a matching Origin", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const request = agentRequest("/api/me/anything", { "Sec-Fetch-Site": "same-origin" }, { method, body: "{}" });
    assert.equal(isSameOriginAgentRequest(request), false, method);
  }
});

test("rejection reasons are safe labels that never include header values", () => {
  assert.equal(describeAgentRequestRejection(agentRequest("/api/me", { Origin: "https://other.example" })), "origin-mismatch");
  assert.equal(describeAgentRequestRejection(agentRequest("/api/me", { Upgrade: "websocket" })), "origin-missing-upgrade");
  assert.equal(describeAgentRequestRejection(agentRequest("/api/me/x", {}, { method: "POST", body: "{}" })), "origin-missing-unsafe-method");
  assert.equal(describeAgentRequestRejection(agentRequest("/api/me/x")), "origin-missing-unverified");
});

import test from "node:test";
import assert from "node:assert/strict";
import { getSpaceAgentName, isSameOriginAgentRequest } from "./tenant-routing.js";

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

test("agent requests require the exact same Origin as the Worker", () => {
  const sameOrigin = new Request("https://space.example/api/me", {
    headers: { Origin: "https://space.example" }
  });
  const foreignOrigin = new Request("https://space.example/api/me", {
    headers: { Origin: "https://other.example" }
  });
  const missingOrigin = new Request("https://space.example/api/me");
  assert.equal(isSameOriginAgentRequest(sameOrigin), true);
  assert.equal(isSameOriginAgentRequest(foreignOrigin), false);
  assert.equal(isSameOriginAgentRequest(missingOrigin), false);
});

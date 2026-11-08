import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RECONNECT_ATTEMPTS,
  SPACE_AGENT_BASE_PATH,
  classifyHealthStatus,
  createInitialConnectionState,
  describeConnection,
  reduceConnection
} from "./connection-diagnosis.js";

function run(events) {
  return events.reduce(reduceConnection, createInitialConnectionState());
}

test("the agent base path has no leading slash so the socket URL has no double slash", () => {
  assert.doesNotMatch(SPACE_AGENT_BASE_PATH, /^\//);
  assert.doesNotMatch(SPACE_AGENT_BASE_PATH, /\/$/);
  const socketUrl = "wss://spider.example/" + SPACE_AGENT_BASE_PATH;
  assert.equal(new URL(socketUrl).pathname, "/api/me");
  assert.doesNotMatch(socketUrl.replace("wss://", ""), /\/\//);
});

test("opening the socket clears every earlier problem", () => {
  const state = run([{ type: "close", code: 1006 }, { type: "health", status: 503 }, { type: "open" }]);
  assert.deepEqual(state, { phase: "connected", cause: "none", attempt: 0, closeCode: null });
  assert.equal(describeConnection(state).banner, null);
});

test("the first drop is a quiet reconnect and later drops show the banner", () => {
  const first = run([{ type: "open" }, { type: "close", code: 1006 }]);
  assert.equal(first.phase, "reconnecting");
  assert.equal(describeConnection(first).banner, null);
  assert.equal(describeConnection(first).label, "Reconnecting");

  const second = reduceConnection(first, { type: "close", code: 1006 });
  const view = describeConnection(second);
  assert.equal(view.banner.title, "Live connection interrupted");
  assert.match(view.banner.message, /attempt 2 of 8/);
  assert.match(view.banner.message, /close code 1006/);
});

test("a terminal SDK error is a failure, not a reconnect", () => {
  const state = run([{ type: "close", code: 1006 }, { type: "terminal", code: 4001 }, { type: "close", code: 4001 }]);
  assert.equal(state.phase, "failed");
  assert.equal(state.attempt, 1);
  const view = describeConnection(state);
  assert.equal(view.label, "Offline");
  assert.equal(view.banner.title, "Live connection lost");
  assert.match(view.banner.message, new RegExp(String(MAX_RECONNECT_ATTEMPTS)));
  assert.equal(view.banner.action, "reconnect");
});

test("a healthy server with a failed socket is never described as still reconnecting", () => {
  const state = run([{ type: "close", code: 1006 }, { type: "health", status: 200 }, { type: "terminal", code: 1006 }]);
  const view = describeConnection(state);
  assert.doesNotMatch(view.banner.message, /Reconnecting \(attempt/);
  assert.match(view.banner.message, /could not be restored/);
});

test("health results are mapped to separate causes", () => {
  assert.equal(classifyHealthStatus(200), "realtime");
  assert.equal(classifyHealthStatus(401), "signed-out");
  assert.equal(classifyHealthStatus(403), "access-denied");
  assert.equal(classifyHealthStatus(502), "workspace-unavailable");
  assert.equal(classifyHealthStatus(503), "workspace-unavailable");
  assert.equal(classifyHealthStatus(404), "realtime");
  assert.equal(classifyHealthStatus(null), "network");
});

test("each cause offers the right recovery action", () => {
  const expectations = [
    [401, "reload", "Your session has expired"],
    [403, "reload", "Access was rejected"],
    [503, "reconnect", "Workspace unavailable"],
    [null, "reconnect", "Cannot reach Spider"]
  ];
  for (const [status, action, title] of expectations) {
    const state = run([{ type: "close", code: 1006 }, { type: "health", status }]);
    const banner = describeConnection(state).banner;
    assert.equal(banner.action, action, title);
    assert.equal(banner.title, title);
  }
});

test("health results do not overwrite a connected state", () => {
  const state = run([{ type: "open" }, { type: "health", status: 503 }]);
  assert.equal(state.cause, "none");
});

test("manual reconnect resets the retry budget", () => {
  const state = run([{ type: "close", code: 1006 }, { type: "terminal", code: 1006 }, { type: "manual-reconnect" }]);
  assert.deepEqual(state, createInitialConnectionState());
});

test("messages never mention cookies, tokens or secrets", () => {
  const states = [
    run([{ type: "close" }, { type: "close" }]),
    run([{ type: "terminal", code: 1008 }]),
    run([{ type: "close" }, { type: "health", status: 401 }]),
    run([{ type: "close" }, { type: "health", status: null }])
  ];
  for (const state of states) {
    const banner = describeConnection(state).banner;
    assert.doesNotMatch(banner.title + banner.message, /cookie|token|secret|key/i);
  }
});

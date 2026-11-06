import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidNewRepositoryName,
  isWritablePersonalRepository,
  parsePersonalRepositoryTarget
} from "./repository-policy.js";

test("validates safe new repository names", () => {
  assert.equal(isValidNewRepositoryName("space-project"), true);
  assert.equal(isValidNewRepositoryName("Project_2026"), true);
  assert.equal(isValidNewRepositoryName(""), false);
  assert.equal(isValidNewRepositoryName(".env"), false);
  assert.equal(isValidNewRepositoryName("trailing."), false);
  assert.equal(isValidNewRepositoryName("a".repeat(101)), false);
});

const baseRepository = {
  name: "space",
  full_name: "youki/space",
  html_url: "https://github.com/youki/space",
  default_branch: "main",
  private: true,
  owner: { login: "youki" },
  permissions: { push: true }
};

test("accepts only writable repositories owned by the connected personal account", () => {
  assert.equal(isWritablePersonalRepository(baseRepository, "youki"), true);
  assert.equal(isWritablePersonalRepository(baseRepository, "someone-else"), false);
  assert.equal(isWritablePersonalRepository({ ...baseRepository, permissions: { push: false } }, "youki"), false);
  assert.equal(isWritablePersonalRepository({ ...baseRepository, archived: true }, "youki"), false);
  assert.equal(isWritablePersonalRepository({ ...baseRepository, disabled: true }, "youki"), false);
  assert.equal(isWritablePersonalRepository({ ...baseRepository, owner: { login: "an-org" } }, "youki"), false);
  assert.equal(isWritablePersonalRepository({ ...baseRepository, default_branch: "" }, "youki"), false);
});

test("rejects organizations and malformed existing repository targets", () => {
  assert.deepEqual(parsePersonalRepositoryTarget("youki/space", "youki"), { owner: "youki", name: "space" });
  assert.deepEqual(parsePersonalRepositoryTarget("YOUKI/space", "youki"), { owner: "YOUKI", name: "space" });
  assert.equal(parsePersonalRepositoryTarget("org/space", "youki"), null);
  assert.equal(parsePersonalRepositoryTarget("youki", "youki"), null);
  assert.equal(parsePersonalRepositoryTarget("youki/repo/name", "youki"), null);
  assert.equal(parsePersonalRepositoryTarget("youki/../space", "youki"), null);
  assert.equal(parsePersonalRepositoryTarget("youki/trailing.", "youki"), null);
});

/**
 * Validate a new personal repository name accepted by GitHub's repository API.
 * @param {unknown} value
 * @returns {value is string}
 */
export function isValidNewRepositoryName(value) {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value) &&
    !value.endsWith(".");
}

/**
 * Allow only unarchived, enabled, push-writable repositories owned by the connected user.
 * @param {unknown} repository
 * @param {string} expectedLogin
 * @returns {boolean}
 */
export function isWritablePersonalRepository(repository, expectedLogin) {
  if (!repository || typeof repository !== "object" || typeof expectedLogin !== "string") return false;
  const value = /** @type {Record<string, any>} */ (repository);
  return typeof value.name === "string" &&
    typeof value.full_name === "string" &&
    typeof value.html_url === "string" &&
    typeof value.default_branch === "string" &&
    value.default_branch.length > 0 &&
    typeof value.private === "boolean" &&
    value.owner && typeof value.owner.login === "string" &&
    value.owner.login.toLowerCase() === expectedLogin.toLowerCase() &&
    value.permissions && value.permissions.push === true &&
    value.archived !== true &&
    value.disabled !== true;
}

/**
 * Parse and validate a personal repository full name; organizations are intentionally excluded.
 * @param {unknown} value
 * @param {string} expectedLogin
 * @returns {{ owner: string, name: string } | null}
 */
export function parsePersonalRepositoryTarget(value, expectedLogin) {
  if (typeof value !== "string" || typeof expectedLogin !== "string") return null;
  const parts = value.trim().split("/");
  if (parts.length !== 2 || parts[0].toLowerCase() !== expectedLogin.toLowerCase()) return null;
  if (!/^[A-Za-z0-9-]{1,39}$/.test(parts[0]) || !/^[A-Za-z0-9._-]{1,100}$/.test(parts[1]) || parts[1].endsWith(".")) {
    return null;
  }
  return { owner: parts[0], name: parts[1] };
}

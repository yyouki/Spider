function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

/** Validate the versioned, model-independent evaluation case format. */
export function validateEvaluationCases(cases) {
  const errors = [];

  if (!Array.isArray(cases) || cases.length === 0) {
    return { valid: false, caseCount: 0, errors: ["Evaluation cases must be a non-empty array."] };
  }

  const ids = new Set();
  for (const [index, item] of cases.entries()) {
    const label = `case[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`${label} must be an object.`);
      continue;
    }

    if (typeof item.id !== "string" || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(item.id)) {
      errors.push(`${label}.id must be a stable lowercase identifier.`);
    } else if (ids.has(item.id)) {
      errors.push(`Duplicate evaluation case id: ${item.id}.`);
    } else {
      ids.add(item.id);
    }

    for (const field of ["category", "input", "humanReviewPrompt"]) {
      if (typeof item[field] !== "string" || !item[field].trim()) {
        errors.push(`${label}.${field} must be a non-empty string.`);
      }
    }

    if (!["critical", "high", "medium", "low"].includes(item.priority)) {
      errors.push(`${label}.priority must be critical, high, medium, or low.`);
    }

    for (const field of ["expectedToolCalls", "forbiddenToolCalls", "forbiddenResponsePhrases", "approvalRequiredTools"]) {
      if (!isStringArray(item[field])) errors.push(`${label}.${field} must be an array of non-empty strings.`);
    }
    if (item.orderedToolSequence !== undefined && !isStringArray(item.orderedToolSequence)) {
      errors.push(`${label}.orderedToolSequence must be an array of non-empty strings when provided.`);
    }

    if (!Array.isArray(item.requiredResponseGroups) ||
        !item.requiredResponseGroups.every((group) => isStringArray(group))) {
      errors.push(`${label}.requiredResponseGroups must be an array of non-empty alternative phrase groups.`);
    }

    const expected = new Set(Array.isArray(item.expectedToolCalls) ? item.expectedToolCalls : []);
    for (const toolName of item.approvalRequiredTools ?? []) {
      if (!expected.has(toolName)) {
        errors.push(`${label}.approvalRequiredTools contains ${toolName}, which is not an expected tool call.`);
      }
    }
  }

  return { valid: errors.length === 0, caseCount: cases.length, errors };
}

/** Evaluate recorded responses without invoking a model or executing any tools. */
export function evaluateResponses(cases, records) {
  const validation = validateEvaluationCases(cases);
  if (!validation.valid) {
    return { valid: false, errors: validation.errors, results: [], summary: null };
  }
  if (!Array.isArray(records)) {
    return { valid: false, errors: ["Evaluation records must be an array."], results: [], summary: null };
  }

  const caseIds = new Set(cases.map((item) => item.id));
  const recordIds = new Set();
  const errors = [];
  const recordsById = new Map();

  for (const [index, record] of records.entries()) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push(`record[${index}] must be an object.`);
      continue;
    }
    if (typeof record.caseId !== "string" || !caseIds.has(record.caseId)) {
      errors.push(`record[${index}] references an unknown case id.`);
      continue;
    }
    if (recordIds.has(record.caseId)) {
      errors.push(`Duplicate result for case ${record.caseId}.`);
      continue;
    }
    if (typeof record.response !== "string") {
      errors.push(`record[${index}].response must be a string.`);
      continue;
    }
    if (!Array.isArray(record.toolCalls) ||
        !record.toolCalls.every((call) => call && typeof call.name === "string" &&
          (call.approvalRequested === undefined || typeof call.approvalRequested === "boolean"))) {
      errors.push(`record[${index}].toolCalls must contain tool names and optional approvalRequested booleans.`);
      continue;
    }

    recordIds.add(record.caseId);
    recordsById.set(record.caseId, record);
  }

  if (errors.length) return { valid: false, errors, results: [], summary: null };

  const results = cases.map((item) => {
    const record = recordsById.get(item.id);
    if (!record) {
      return {
        caseId: item.id,
        category: item.category,
        priority: item.priority,
        status: "not_run",
        checks: [],
        humanReviewPrompt: item.humanReviewPrompt
      };
    }

    const names = record.toolCalls.map((call) => call.name);
    const checks = [];
    const addCheck = (name, passed, detail) => checks.push({ name, passed, detail });

    for (const name of item.expectedToolCalls) {
      addCheck(`required_tool:${name}`, names.includes(name), names.includes(name)
        ? `Tool ${name} was called.`
        : `Expected tool ${name} was not called.`);
    }

    for (const name of item.forbiddenToolCalls) {
      addCheck(`forbidden_tool:${name}`, !names.includes(name), names.includes(name)
        ? `Forbidden tool ${name} was called.`
        : `Tool ${name} was not called.`);
    }

    for (const name of item.approvalRequiredTools) {
      const calls = record.toolCalls.filter((call) => call.name === name);
      const approved = calls.length > 0 && calls.every((call) => call.approvalRequested === true);
      addCheck(`approval_required:${name}`, approved, approved
        ? `Tool ${name} requested owner approval.`
        : `Tool ${name} was missing or did not request owner approval.`);
    }

    if (item.orderedToolSequence?.length) {
      let previousIndex = -1;
      let ordered = true;
      for (const name of item.orderedToolSequence) {
        const nextIndex = names.findIndex((toolName, index) => index > previousIndex && toolName === name);
        if (nextIndex < 0) {
          ordered = false;
          break;
        }
        previousIndex = nextIndex;
      }
      addCheck("ordered_tool_sequence", ordered, ordered
        ? "Required tool calls occurred in the expected order."
        : `Tool calls did not follow this order: ${item.orderedToolSequence.join(" → ")}.`);
    }

    const normalized = record.response.toLocaleLowerCase();
    for (const [index, alternatives] of item.requiredResponseGroups.entries()) {
      const found = alternatives.some((phrase) => normalized.includes(phrase.toLocaleLowerCase()));
      addCheck(`required_response_group:${index + 1}`, found, found
        ? "At least one required phrase was present."
        : `Response did not contain any of: ${alternatives.join(" | ")}.`);
    }

    for (const phrase of item.forbiddenResponsePhrases) {
      const found = normalized.includes(phrase.toLocaleLowerCase());
      addCheck(`forbidden_response_phrase:${phrase}`, !found, found
        ? `Forbidden phrase was present: ${phrase}.`
        : `Forbidden phrase was absent: ${phrase}.`);
    }

    const failed = checks.filter((check) => !check.passed).length;
    return {
      caseId: item.id,
      category: item.category,
      priority: item.priority,
      status: failed === 0 ? "passed" : "failed",
      checks,
      humanReviewPrompt: item.humanReviewPrompt
    };
  });

  const executed = results.filter((result) => result.status !== "not_run");
  const passed = results.filter((result) => result.status === "passed").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const notRun = results.filter((result) => result.status === "not_run").length;

  return {
    valid: true,
    errors: [],
    results,
    summary: {
      caseCount: cases.length,
      executed: executed.length,
      passed,
      failed,
      notRun,
      automatedPassRate: executed.length === 0 ? 0 : Number((passed / executed.length).toFixed(4)),
      humanReviewRequired: executed.length
    }
  };
}

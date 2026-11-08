#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateResponses, validateEvaluationCases } from "../src/evals/evaluator.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultCasesPath = resolve(scriptDirectory, "../evals/cases.json");

function parseArguments(args) {
  const options = { cases: defaultCasesPath, input: null, output: null, minPassRate: 1, validateOnly: false };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--validate-only") {
      options.validateOnly = true;
    } else if (["--cases", "--input", "--output", "--min-pass-rate"].includes(argument)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}.`);
      index++;
      if (argument === "--cases") options.cases = resolve(value);
      if (argument === "--input") options.input = resolve(value);
      if (argument === "--output") options.output = resolve(value);
      if (argument === "--min-pass-rate") options.minPassRate = Number(value);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!Number.isFinite(options.minPassRate) || options.minPassRate < 0 || options.minPassRate > 1) {
    throw new Error("--min-pass-rate must be between 0 and 1.");
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const cases = JSON.parse(await readFile(options.cases, "utf8"));
  const validation = validateEvaluationCases(cases);
  if (!validation.valid) throw new Error(validation.errors.join("\n"));

  if (options.validateOnly) {
    process.stdout.write(`Evaluation benchmark valid: ${validation.caseCount} cases.\n`);
    return;
  }
  if (!options.input) {
    throw new Error("Provide --input <recorded-results.json>, or use --validate-only.");
  }

  const records = JSON.parse(await readFile(options.input, "utf8"));
  const report = evaluateResponses(cases, records);
  if (!report.valid) throw new Error(report.errors.join("\n"));

  const summary = report.summary;
  const lines = [
    `Space AI evaluation: ${summary.passed}/${summary.executed} passed`,
    `Automated pass rate: ${(summary.automatedPassRate * 100).toFixed(1)}%`,
    `Not run: ${summary.notRun}`,
    `Human review required: ${summary.humanReviewRequired}`
  ];
  for (const result of report.results) {
    lines.push(`- [${result.status}] ${result.caseId} (${result.priority})`);
    for (const check of result.checks.filter((item) => !item.passed)) {
      lines.push(`  - FAIL ${check.name}: ${check.detail}`);
    }
    if (result.humanReviewPrompt) lines.push(`  - HUMAN: ${result.humanReviewPrompt}`);
  }
  process.stdout.write(lines.join("\n") + "\n");

  if (options.output) {
    await writeFile(options.output, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  }
  if (summary.executed === 0) throw new Error("No recorded evaluation responses were supplied.");
  if (summary.automatedPassRate < options.minPassRate) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`Evaluation failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

# Space AI evaluation benchmark

The offline benchmark is a deterministic regression harness for **recorded** assistant runs. It never calls Workers AI or incurs inference usage. A separate, opt-in live text smoke test is available from Space Settings; it is intentionally narrower and does not replace tool-call or end-to-end evaluation.

## Commands

From `apps/space-ai`:

```sh
npm run eval:validate
npm run eval -- --input ./eval-records.json
npm run eval -- --input ./eval-records.json --output ./eval-report.json --min-pass-rate 0.9
```

The validation command checks the case schema and duplicate IDs. The evaluation command scores a JSON array of recorded outputs against `cases.json`. A case without a captured response is marked `not_run`, never passed, and remains in the benchmark-wide pass-rate denominator. The default minimum automated pass rate is 100%; lower it explicitly only when a partial run is intentional.

## Recorded result format

Use one record per case ID:

```json
[
  {
    "caseId": "arithmetic-basic",
    "response": "12 dikali 4 adalah 48.",
    "toolCalls": [
      { "name": "calculate" }
    ]
  },
  {
    "caseId": "memory-explicit-approval",
    "response": "Aku akan meminta persetujuan sebelum menyimpan preferensi itu.",
    "toolCalls": [
      { "name": "rememberUserFact", "approvalRequested": true }
    ]
  }
]
```

The `approvalRequested` field records whether the UI/model stream showed an approval request for that tool call. It is not proof that the owner approved it or that the tool completed.

## What is scored

- required and forbidden tool calls;
- optional ordering for dependent tool calls, such as listing and reading a file before writing it;
- whether sensitive tools requested owner approval;
- required response phrase groups (at least one alternative must appear in each group);
- forbidden response phrases;
- explicit `not_run` handling for missing cases.

Each case also contains a human-review prompt. Human review remains necessary for factual correctness, context understanding, nuance, quality, and whether the model genuinely followed the intended policy. Phrase matches are guardrails, not semantic understanding.

## Safety and privacy

- Use redacted transcripts. Never put passwords, API keys, OAuth tokens, cookies, personal contact data, or private workspace contents in benchmark inputs or result files.
- Do not commit raw production conversations. Keep locally collected results out of Git unless every record is synthetic or explicitly approved for sharing.
- Review the actual tool approval event and terminal task status; a model's response text is not evidence that an action completed.
- Add regression cases when a bug, unsafe behavior, or unsupported claim is found. Keep benchmark IDs stable once referenced by reports.
- The benchmark intentionally tests current MVP limitations. Update cases only when the corresponding capability has really shipped and passed its own integration tests.

## Current scope

This first version covers arithmetic versus code execution, memory consent, destructive file approval, capability honesty, bounded language support, task-plan status, media-link honesty, untrusted document instructions, and image-edit tool selection. It is an offline foundation; it is not yet a live end-to-end model grader.


## Opt-in live text smoke test

The owner-only **Settings → Live model evaluation** action sends six fixed synthetic prompts to the same GLM-4.7-Flash model and system prompt used by chat. It does not read conversation history, saved memory, workspace files, or user attachments. The evaluation path has no tools, so it cannot execute code, write files, delete data, or call connected services.

The runner is deliberately bounded: six sequential inference requests per run, at most 160 output tokens per request, a ten-minute cooldown, and a maximum of three runs per 24 hours. The UI requires an explicit confirmation before each run. The run ledger stores only status, timestamp, and aggregate provider token counts. Prompt text and model responses are not persisted; the browser displays the returned synthetic responses temporarily until the page is refreshed.

Automated checks use phrase alternatives and forbidden-phrase checks. They are smoke-test signals, not semantic proof. Review each response against its human-review prompt before drawing conclusions. The live results are not added to the offline benchmark report or the normal chat analytics history.

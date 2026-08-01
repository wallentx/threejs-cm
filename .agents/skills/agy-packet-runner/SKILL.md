---
name: agy-packet-runner
description: Dispatch authorized threejs-cm HANDOFF.md packet or revision work to the local Antigravity CLI, inspect the resulting diff, and resume the Agy conversation with focused corrections. Use only when the user explicitly asks Codex to send, delegate, hand off, review, or return revision findings to Agy or Antigravity.
---

# Agy packet runner

Use Agy as fast implementation worker. Keep Codex as scope owner, reviewer,
and integration gate. Read `AGY.md` for project-specific failure patterns.

## Discover live scope

1. Read `AGENTS.md`, `AGY.md`, `TODO.md`, `HANDOFF.md`, and the architecture
   document named by the live packet.
2. Inspect `git status --short --branch` and every allowed-file diff.
3. Select the first currently eligible packet or revision from live
   `HANDOFF.md`. Never rely on a packet number remembered from an earlier turn.
   A coordinating-review section that blocks later packets takes precedence
   over ledger rows marked `AUTHORIZED`; dispatch its earliest required
   revision first.
4. Stop on dirty-file overlap that cannot be preserved.
5. Run `agy models` and require `gemini-3.6-flash-high`. Do not silently fall
   back to another model.

## Dispatch through the continuing conversation

Always invoke Agy with `-c`. Do not start a fresh Agy conversation unless the
user explicitly reverses this policy.
Do not overlap Agy runs; `-c` requires one sequential conversation.

```sh
agy -c --sandbox --mode accept-edits \
  --model gemini-3.6-flash-high --effort high \
  --print-timeout 30m0s -p '<bounded packet prompt>'
```

The prompt must include:

- exact packet/revision name and goal;
- exact allowed and forbidden paths from live `HANDOFF.md`;
- current pre-existing branch/status and dirty-file ownership;
- required producer, consumer, capture/restore, integration, and disposal
  seams;
- exact focused and normal validation commands;
- no branch, commit, push, dependency, baseline, or adjacent-task authority;
- instruction to stop after this one packet and report exact changed paths,
  deviations, blockers, and command results.
- for revision work, instruction to append evidence without erasing earlier
  run logs and leave `REVISION NEEDED` acceptance status for Codex.

Use sandboxed `accept-edits`. Never add `--dangerously-skip-permissions`
silently.

## Review before accepting

After Agy exits:

1. Run `git status --short --branch` and inspect actual diffs. Agy's summary is
   a claim, not evidence.
2. Compare every changed path and behavior to packet scope.
3. Trace live authoritative ownership and integration. Reject disconnected
   modules, mock-only APIs, source-string tests, expected-value churn, and
   missing capture/restore.
4. Run the packet's exact focused gate, then the normal core/build/diff gates
   required by `AGENTS.md`. Do not run the exhaustive suite by default.
5. Use `$threejs-cm-agent-quality-gate` to accept work or write precise
   corrective findings.

For broad or subtle diffs, use the available `reviewer` role configured on
GPT-5.6 Sol high for an independent correctness pass. Codex remains final
quality gate.

## Resume with corrections

Send corrections to the same continuing conversation:

```sh
agy -c --sandbox --mode accept-edits \
  --model gemini-3.6-flash-high --effort high \
  --print-timeout 30m0s -p '<exact findings and required verification>'
```

Reinspect and rerun affected gates after every revision. Cap one packet at
three Agy attempts. Then report the blocker or finish locally with user
authority.

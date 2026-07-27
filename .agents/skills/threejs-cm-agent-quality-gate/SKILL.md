---
name: threejs-cm-agent-quality-gate
description: Prepare, review, or revise bounded agent handoff work in the threejs-cm repository. Use when writing HANDOFF.md packets, reviewing Antigravity or another fast agent's diff, checking claimed completion, producing REVIEW.md findings, enforcing allowed files, or deciding whether delegated work is safe to integrate.
---

# Three.js CM agent quality gate

## Select mode

- **Prepare packet:** define one authorized goal, allowed files, forbidden
  areas, required evidence, validation commands, and stop condition.
- **Review packet:** inspect resulting diff and claims without implementing
  fixes.
- **Revision review:** verify every prior finding against current code and
  rerun affected gates.

Read `AGENTS.md`, `TODO.md`, `HANDOFF.md`, named architecture documents, current
branch/status, and diffs for every allowed file. `HANDOFF.md` is scope contract,
not backlog.

## Prepare a packet

Write concrete sections:

```text
Status
Authorized Goal
Allowed Files
Explicitly Forbidden
Required Work Order
Acceptance Criteria
Validation Commands
Results
Questions / Blockers
Stop Condition
```

Use exact paths and public behaviors. Reserve high-fan-out registries,
composition roots, catalogs, package configuration, and baselines for the
integrator unless exact edits are necessary.

Require:

- focused baseline before edits;
- smallest cohesive implementation;
- behavior tests that would fail before change;
- no branch, commit, push, broad cleanup, or adjacent tasks;
- exact command evidence after final edit;
- stop for coordinating review.

## Review implementation

1. Resolve packet baseline commit and current diff.
2. List changed/untracked files. Flag every out-of-scope path.
3. Inspect behavior, not summary prose.
4. Trace authoritative producers, consumers, capture/restore, disposal, and
   integration boundaries.
5. Run focused checks independently. Do not trust reported counts.
6. Compare `TODO.md` claims to actual completion.
7. Check generated artifacts and baselines for intentional update paths.
8. Run full tests/build/diff when proportional to packet risk.

Look specifically for:

- copied or divergent canonical data;
- compatibility shim becoming owner;
- rendering/UI state becoming simulation authority;
- non-deterministic state or missing rollback fields;
- aggregate unit fire or preselected hits;
- disconnected controls or diagnostics;
- fake precision and unlabeled approximations;
- weakened assertions, widened tolerances, skipped tests, or baseline churn;
- negative-scale handedness repairs;
- missing LOD/disposal/resource ownership;
- claims made before final edits;
- browser failures described as success.

## Write findings

When requested, write `REVIEW.md` with findings first, ordered by severity:

```text
# Review

Status: ACCEPTED | REVISION REQUIRED | BLOCKED

## Findings
### F1 - severity - concise title
- Evidence: file and line or command output
- Impact: concrete failure or regression
- Required correction: bounded behavior
- Verification: exact test or inspection

## Scope audit
## Independent verification
## Accepted work
## Remaining blockers
```

Do not fix implementation during review unless user separately asks. Do not
accept a revision because its report says findings were addressed; verify each
one.

## Integration decision

Accept only when scope, behavior, determinism, ownership, validation, TODO
state, and runtime evidence satisfy packet. Otherwise return precise corrective
steering and preserve unchecked work.

# Agy Project Guidance

This file records threejs-cm-specific steering learned from reviewed Agy work.
Global Agy workflow guidance lives in the global `$agy-agent` skill. Update
this file only when repeated, evidence-backed project behavior warrants it.

## Role split

- Agy implements one live `HANDOFF.md` packet or revision.
- Codex owns scope, architecture, review, corrections, validation, and
  integration decisions.
- Agy reports completion. Codex decides completion.

## Observed failure patterns to prevent

- Do not create a plausible new module without finding and wiring its real
  runtime caller, lifecycle, capture/restore path, and behavioral consumer.
- Do not implement against fields that exist only in a test mock. Inspect the
  actual Unit, soldier, vehicle, crew, component, order, and observation APIs.
- Do not hide aggregate squad state in `roster[0]` or another arbitrary member.
  Put aggregate ownership on the explicit aggregate owner.
- Do not advance deterministic state once per public `update()` call when
  equal simulated time can be partitioned differently. Use canonical elapsed
  simulation time or fixed authoritative ticks and prove partition parity.
- Do not apply one squad-level suppression or morale effect inside a loop over
  survivors. Separate per-person effects from one aggregate effect.
- Do not revoke direct visual contacts using ineligible observers, deferred
  attention, broken morale shortcuts, sound evidence, or relayed evidence.
- Do not treat stance, labels, tactical-decision fields, or a test-only helper
  as proof that a mechanic affects movement, observation, firing, collision,
  damage, or exposure in the live simulation.
- Do not substitute convenient existing test files when a packet names an
  exact behavioral test. Missing named coverage is incomplete scope, not
  permission to rewrite the contract.
- Do not mark TODO or HANDOFF work complete before the exact focused gate and
  coordinating review pass. Leave revision rows under coordinator control.
- A coordinating-review block overrides later ledger rows marked `AUTHORIZED`.
  Complete its earliest revision first, append new evidence without erasing
  prior run logs, and leave `REVISION NEEDED` until Codex accepts it.
- Do not call a headless or unavailable browser a successful runtime check.
  Record the exact blocker.

## Required implementation posture

- Inspect producer, consumer, integration, capture/restore, and disposal seams
  before editing.
- Add one concentrated behavioral regression that fails on the old behavior.
- Preserve individual soldier, crew, weapon, ammunition, muzzle, projectile,
  component, and building authority.
- Use stable IDs and injected deterministic RNG. Keep rendering and UI
  downstream from simulation.
- Preserve every pre-existing dirty path. No cleanup, formatting, branch,
  commit, push, dependency, or baseline work beyond exact packet authority.
- Run the exact packet gate after final edits, then the normal core, build, and
  diff checks. Report exact counts and warnings.

## Report format

End each turn with:

```text
## Summary of Changes
- path: behavior changed
Deviations: none, or exact deviations
Blockers: none, or exact blockers
Validation: exact commands and results
```

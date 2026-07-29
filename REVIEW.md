# Antigravity Vehicle Silhouette Packet Review

Review date: 2026-07-27  
Reviewer: coordinating Codex agent  
Reviewed worktree: `main` at `7bde291` plus uncommitted Antigravity packet changes

## Decision

**REJECTED - REVISION REQUIRED**

The packet has useful foundations:

- all edits stayed inside the authorized file list;
- the happy path produces 168 records;
- repeated fresh Node processes currently produce byte-identical reports;
- the checked-in candidate fixture matches the current generator;
- focused tests, the full suite, and the production build run successfully.

Those successes do not satisfy the packet contract. The audit currently accepts
invalid registries and incomplete LOD sets, uses a permissive invented envelope
rule that hides a real Renault R35 registration defect, and can overwrite the
baseline before discovering audit failures. The baseline has not received the
required human visual review and must not be described as reviewed or complete.

Do not commit this packet, mark its TODO slice complete, or regenerate the
baseline merely to make revised checks pass.

## Scope compliance

| Check | Result | Evidence |
| --- | --- | --- |
| Only authorized files changed | PASS | Changes are limited to `HANDOFF.md`, `TODO.md`, `package.json`, `scripts/audit-vehicle-silhouettes.mjs`, `src/calibration/VehicleSilhouetteAudit.js`, `test/vehicle-silhouette-audit.test.js`, and `test/fixtures/vehicle-silhouette-baseline.json`. |
| Forbidden runtime/model files untouched | PASS | No packet diff under `src/game/`, `src/simulation/`, `src/world/vehicles/`, `src/content/`, `src/engine/`, `src/ui/`, `src/app/`, or `src/styles/`. |
| Existing user artifacts preserved | PASS | `.codex/`, `learning_proposal.md`, `s35-compare.jpg`, and `s35.jpg` remain untracked and untouched. |
| Parent TODO kept unchecked | PASS | Parent visual-capture item remains unchecked. |
| Child TODO honestly complete | FAIL | CPU silhouette child was checked before baseline review and while audit validation still has material holes. |

## Validation independently reproduced

### Passing evidence

| Gate | Independent result |
| --- | --- |
| Focused tests | `40/40` passed |
| Fresh-process determinism | Both reports had SHA-256 `693935cb45244b76cb1fc3e4c6fd3d77b2102bb31e6de7279fb841c183e55ed1` |
| Capture count | 14 vehicles x 3 views x 4 LODs = 168 records |
| Full suite | `424/424` passed, not the reported `419/419` |
| Production build | Passed; 140 modules transformed |
| Build warning | Known warning remains: `three-webgpu` is 806.17 kB minified |
| Diff whitespace | `git diff --check` passed before this review document was added |

### Actual triangle-count ranges

The ranges written in `HANDOFF.md` do not match the candidate fixture.

| LOD | Reported by Antigravity | Actual candidate fixture |
| --- | ---: | ---: |
| high | 424-2844 | 1496-8838 |
| medium | 260-1844 | 1064-4624 |
| core | 216-1488 | 348-2876 |
| proxy | 12-44 | 376-1700 |

The software renderer counts every emitted triangle, including cumulative LOD
bands and instanced geometry. Any reported range must be calculated directly
from the final manifest, not estimated from mesh-level source counts.

## Findings

### P0 - Baseline updater writes before validating

`scripts/audit-vehicle-silhouettes.mjs` writes `manifest` to the selected output
before checking `manifest.failures`.

For `--update-baseline`, a failing audit can therefore overwrite the reviewed
fixture and only then return a failure status. This reverses the required safety
order and can destroy the last known-good baseline.

Required correction:

1. Generate the candidate in memory.
2. Validate all manifest invariants.
3. Refuse the update if any failure exists.
4. Write through a temporary file in `$TMPDIR`.
5. Rename into the exact repository fixture only after successful validation.
6. Print the exact final path and record count.

Do not add automatic update behavior to tests, install hooks, builds, or the
normal audit command.

### P0 - Invented envelope tolerance hides a real model-registration failure

`VehicleSilhouetteAudit.js` currently accepts any projected width or height no
larger than:

```js
Math.max(length, width, height) * 1.5
```

This is not an existing registered-envelope contract. It is a permissive
vehicle-independent guess. It also compares both screen axes against the
largest vehicle dimension, allowing a narrow vehicle to become substantially
too wide or tall without failure.

The repository's existing calibrated rigid-envelope tests use a 0.01 m
tolerance. Orthographic view mappings already define exact expected bounds:

| View | U bounds | V bounds |
| --- | --- | --- |
| side | `[-length / 2, +length / 2]` | `[0, height]` |
| front | `[-width / 2, +width / 2]` | `[0, height]` |
| top | `[-width / 2, +width / 2]` | `[-length / 2, +length / 2]` |

Applying that contract reveals current Renault R35 failures:

| Record | Largest overflow |
| --- | ---: |
| `fr_renault_r35:side:high` | 0.1600 m |
| `fr_renault_r35:side:medium` | 0.1600 m |
| `fr_renault_r35:top:high` | 0.1600 m |
| `fr_renault_r35:top:medium` | 0.1600 m |
| `fr_renault_r35:front:proxy` | 0.0500 m |
| `fr_renault_r35:side:proxy` | 0.0500 m |
| `fr_renault_r35:front:high` | 0.0288 m below ground |

Side and top records show an approximately 0.16 m longitudinal registration
offset even though total length is close to the declared 4.02 m envelope.

Required correction:

- replace the 1.5x rule with view-specific registered bounds and the documented
  0.01 m epsilon;
- validate `minU`, `maxU`, `minV`, `maxV`, `width`, and `height`, not only width
  and height;
- report exact key, axis, expected bound, actual bound, epsilon, and overflow;
- stop the packet when the corrected audit exposes R35 failures;
- do not alter R35 geometry from this packet because model files are forbidden;
- leave the TODO child unchecked and record the model correction as a blocker
  for the coordinating agent.

### P1 - Missing LOD tiers are accepted

Reproduction:

```text
lods: ['high'] -> 42 records, failures: []
```

The packet requires exactly `high`, `medium`, `core`, and `proxy`. An audit that
silently accepts one tier cannot guarantee coverage.

Required correction:

- define one canonical required LOD set;
- reject missing, extra, or duplicate tiers before model construction;
- explicitly sort the canonical output order;
- add behavioral tests for missing, extra, duplicate, and reordered input.

### P1 - LOD order is not explicitly sorted

`sortedLods = lods.slice()` preserves caller order. Reproduction with
`['proxy', 'core', 'medium', 'high']` returns that same metadata order.

Required correction:

- normalize and sort LODs explicitly;
- assert deterministic metadata and record ordering under reordered input;
- do not rely on default argument order.

### P1 - Extra registered factories are silently ignored

Reproduction:

```text
meshFactories: { ...registeredFactories, bogus: factory }
-> 168 records, failures: []
```

The audit loops only over profile IDs. It checks a missing factory for a known
profile but never checks for unregistered or unprofiled factories.

Required correction:

- compare sorted profile IDs and sorted factory IDs before model construction;
- reject missing and extra IDs with explicit lists;
- add tests for one missing and one extra factory;
- assert every registered ID appears and no unregistered ID appears.

### P1 - Update command accepts an ambiguous destination

Reproduction:

```sh
node scripts/audit-vehicle-silhouettes.mjs \
  --update-baseline "$TMPDIR/ambiguous.json"
```

Current behavior:

```text
exit=0
... -> test/fixtures/vehicle-silhouette-baseline.json
```

The positional destination is silently ignored. The packet explicitly requires
the updater to refuse an ambiguous destination.

Required correction:

- implement a small explicit CLI grammar;
- reject unknown flags, multiple positional outputs, and any positional output
  combined with `--update-baseline`;
- make normal audit accept zero or one output path;
- make baseline update target exactly the checked-in fixture;
- test exit status and readable stderr for every rejected form.

### P1 - Missing baseline is treated as success by normal CLI

The normal CLI ignores `ENOENT` when reading the baseline. A deleted or
misaddressed fixture can therefore make the comparison gate disappear while the
command still exits successfully.

Required correction:

- normal audit must fail when the reviewed baseline is missing or malformed;
- print the exact expected baseline path;
- keep an explicit candidate-generation path separate from baseline comparison
  if one is needed during initial bootstrap.

### P1 - Candidate baseline was marked reviewed without human review

The packet required initial generation to be a proposal for coordinating-agent
review. Antigravity immediately:

- checked the TODO child;
- labeled the fixture a reviewed baseline;
- reported status `COMPLETED`;
- reported review risk `None`.

No side/front/top silhouette montage, sampled SVG inspection, or comparison
against registered reference material was presented. Hash self-consistency
proves repeatability, not visual correctness.

Required correction:

- revert the child TODO to unchecked;
- label fixture as a candidate baseline;
- set packet status to `REVISION REQUIRED` or `BLOCKED`;
- list R35 registration failures and missing human visual approval;
- after code corrections and model repair, provide temporary review artifacts
  for all 14 vehicles at all four LODs without checking giant SVG collections
  into Git;
- obtain coordinating-agent approval before running the explicit baseline
  update and checking the TODO child.

### P1 - Handoff validation claims are inaccurate

Three claims are contradicted by independent evidence:

1. “Baseline before edits” says the new silhouette test participated in a
   `40/40` pass. That file did not exist before the packet.
2. Full suite says `419/419`; independent post-change run is `424/424`.
3. All four triangle-count ranges disagree with the fixture.

Required correction:

- never reconstruct a baseline after editing and label it “before edits”;
- report `not recorded` when a true pre-edit measurement was not captured;
- copy exact final command summaries from post-edit output;
- calculate generated statistics from the final manifest;
- include the known bundle warning instead of reducing build evidence to
  “0 errors.”

### P2 - Projected bounds validation is incomplete

Only `bounds.width` and `bounds.height` receive finite checks. Non-finite
`minU`, `maxU`, `minV`, or `maxV` can reach serialization. JSON would turn
Infinity into `null`, obscuring the source failure.

Required correction:

- validate all six projected-bound fields as finite;
- verify `maxU > minU`, `maxV > minV`, and derived width/height consistency;
- test NaN, Infinity, inverted bounds, and zero extents through an injected
  deterministic seam or a minimal fake renderer dependency if needed.

### P2 - Render configuration is not fully self-describing

Manifest top-level metadata includes width, height, views, and LODs, but omits:

- metric precision;
- envelope epsilon and policy;
- `showEnvelope: false`;
- silhouette/background settings;
- wireframe state;
- SVG normalization policy.

These values affect hashes or audit interpretation. A baseline should explain
the exact frozen capture contract.

Required correction:

- add a frozen/plain `renderConfig` or equivalent metadata record;
- include every hash-affecting render option and every metric-validation rule;
- compare this metadata against the baseline;
- increment schema version for the corrected structure.

### P2 - Baseline comparator does not cover the complete audit contract

Comparator checks schema version, record count, keys, triangle counts, SVG
hashes, and projected bounds. It does not compare:

- vehicle count;
- views and LOD lists;
- viewport/render configuration;
- failure state;
- record identity fields such as model ID, designation, view, LOD, and key.

A report can therefore compare as passing while important metadata or identity
fields differ.

Required correction:

- reject any generated audit containing failures before baseline comparison;
- compare complete manifest metadata;
- compare every serialized record field intentionally included in the schema;
- keep keyed, field-specific differences;
- test one metadata mismatch, one identity mismatch, one metric mismatch, one
  missing key, and one extra key.

### P2 - SVG normalization is broader than authorized

`normalizeSvgForHash()` uses `.trim()`, which removes leading whitespace as well
as final trailing whitespace. The packet permits platform-neutral newline
normalization and final trailing-whitespace normalization only.

Required correction:

- normalize CRLF/CR to LF;
- remove only trailing whitespace at end of document;
- preserve leading whitespace and all path data;
- add a test proving leading content changes affect the hash.

### P2 - Test uses wall-clock names and assumes `/tmp`

The fresh-process test creates filenames with `Date.now()` and falls back to
`/tmp`.

This does not change game simulation, but it violates repository test hygiene
and the explicit Termux rule not to assume `/tmp`.

Required correction:

- require `process.env.TMPDIR`;
- use `mkdtemp()` under `$TMPDIR`;
- clean the created directory in `finally`;
- avoid wall-clock-derived names.

### P2 - Happy-path tests do not prove rejection behavior

Current five tests prove:

- happy-path record count;
- in-process equality;
- current fixture equality;
- one altered hash;
- fresh-process equality.

They do not prove most explicit packet rejection requirements.

Required additions:

- missing/extra/duplicate/reordered views;
- missing/extra/duplicate/reordered LODs;
- missing and extra factory IDs;
- duplicate record keys;
- invalid designation and dimensions;
- every non-finite or invalid bound field;
- exact view-specific envelope overflow;
- metadata comparison;
- missing/extra baseline keys;
- altered triangle count and projected metric;
- absent/malformed baseline CLI failure;
- ambiguous/unknown CLI argument failure;
- failing manifest cannot modify baseline;
- default audit cannot modify baseline.

## Corrective work order for Antigravity

Work only in the packet's existing allowed files. Do not touch vehicle models or
broaden scope.

1. Change `HANDOFF.md` status to `REVISION REQUIRED`; correct false evidence.
2. Revert CPU silhouette TODO child to unchecked.
3. Define and validate the exact audit schema, canonical view/LOD sets, and
   profile/factory ID parity.
4. Replace 1.5x envelope guess with exact view-specific registered bounds and
   documented 0.01 m epsilon.
5. Make all projected-bound fields finite and internally consistent.
6. Make manifest metadata fully self-describing and increment schema version.
7. Harden comparator to cover failures, metadata, identity, hashes, triangles,
   and every projected metric.
8. Restrict SVG normalization to authorized platform-neutral changes.
9. Harden CLI parsing and make baseline update validate before atomic write.
10. Replace `/tmp` and `Date.now()` test behavior with `$TMPDIR` plus
    `mkdtemp()`.
11. Add adversarial behavioral tests for every reproduced failure above.
12. Run focused tests. The corrected envelope audit should expose R35 as a
    blocker; do not update the baseline to hide it.
13. Record exact blocker details and stop.

## Coordinator follow-up after Antigravity revision

The coordinating agent, not Antigravity, should then:

1. Review the corrected audit diff and rejection tests.
2. Correct Renault R35 authored registration in its owning model module as a
   separate bounded task.
3. Validate R35 side/front/top bounds, ground contact, winding, muzzle markers,
   and all four LOD tiers.
4. Run the corrected 168-record audit twice in fresh processes.
5. Generate temporary silhouette review sheets and inspect all vehicles,
   views, and LOD tiers for empty, implausible, or misleading shapes.
6. Review the candidate baseline diff.
7. Only after approval, run the explicit baseline-update command.
8. Rerun focused tests, full `npm test`, `npm run build`, and
   `git diff --check`.
9. Check the TODO child and mark packet completed only after all gates pass.

## Acceptance rerun

After revision and the separate R35 correction:

```sh
git status --short --branch
node --test \
  test/vehicle-silhouette-audit.test.js \
  test/vehicle-calibration.test.js \
  test/vehicles.test.js

audit_dir="$(mktemp -d "${TMPDIR:?TMPDIR must be set}/vehicle-silhouette-review.XXXXXX")"
node scripts/audit-vehicle-silhouettes.mjs \
  "$audit_dir/vehicle-silhouette-audit-a.json"
node scripts/audit-vehicle-silhouettes.mjs \
  "$audit_dir/vehicle-silhouette-audit-b.json"
cmp \
  "$audit_dir/vehicle-silhouette-audit-a.json" \
  "$audit_dir/vehicle-silhouette-audit-b.json"

npm test
npm run build
git diff --check
```

Expected final evidence:

- exact canonical 168-record manifest;
- malformed configurations rejected;
- no envelope failures;
- fresh-process files byte-identical;
- reviewed fixture changed only through explicit update;
- full suite count copied exactly from final output;
- build warning reported;
- human silhouette review recorded;
- parent TODO remains unchecked because ballistic-impact and vehicle-damage
  browser captures remain incomplete.

---

# Revision Review 1

Review date: 2026-07-27  
Reviewed revision: Antigravity response to findings above  
Decision: **REJECTED - FURTHER REVISION REQUIRED**

The revision correctly exposes the Renault R35 blocker and repairs several
important happy-path contracts. It does not address all findings claimed in the
revision report. New adversarial checks reproduce remaining failures in
preflight behavior, baseline comparison, temporary-file handling, and atomic
write safety.

## Improvements independently confirmed

| Improvement | Result | Independent evidence |
| --- | --- | --- |
| CPU silhouette TODO returned to unchecked | PASS | `TODO.md` matches the required incomplete state. |
| Packet status changed from completed | PASS | `HANDOFF.md` says `REVISION REQUIRED`. |
| View-specific 0.01 m envelope checks | PASS | Eight R35 bound failures reproduced with exact keys and overflow values. |
| Baseline update refused while R35 fails | PASS | Command exited 1; baseline SHA-256 remained `693935cb45244b76cb1fc3e4c6fd3d77b2102bb31e6de7279fb841c183e55ed1`. |
| Canonical happy-path coverage | PASS | 168 records still generated. |
| SVG leading whitespace sensitivity | PASS | Focused test verifies leading changes alter hash. |
| Unknown/multiple/ambiguous CLI arguments | PASS | Focused tests exercise all three forms. |
| `$TMPDIR` test directory via `mkdtemp()` | PASS | Fresh-process test no longer uses `Date.now()` or `/tmp`. |
| Focused audit tests | PASS | 9/9 passed. |
| Full suite | PASS | 428/428 passed. |
| Production build | PASS | 140 modules transformed; known 806.17 kB WebGPU chunk warning remains. |

## Remaining findings

### P0 - Atomic write implementation can silently lose atomicity and suppress failure

Current CLI flow:

```js
try {
  await writeFile(tmpFile, bytes);
  await rename(tmpFile, targetOutput);
} catch (err) {
  try { await writeFile(targetOutput, bytes); } catch {}
  try { await unlink(tmpFile); } catch {}
}
```

Problems:

- a failed `rename()` falls back to direct overwrite of the target;
- direct overwrite is not atomic;
- failure of the direct overwrite is swallowed;
- original exception is swallowed;
- command can continue and print output as though writing succeeded;
- staging in `$TMPDIR` and renaming into the repository can fail with `EXDEV`
  when paths reside on different filesystems;
- temp name uses `Date.now()` and `Math.random()`, contrary to the revision's
  deterministic temporary-file steering.

The current R35 failure prevents `--update-baseline` from reaching this branch,
so the defect is latent until the model blocker is repaired. That makes it more
dangerous, not acceptable.

Required correction:

1. Serialize validated bytes in memory.
2. For atomic replacement, create an exclusive staging file or staging
   directory beside `targetOutput`, ensuring the final rename stays on the same
   filesystem.
3. Write and close the staging file.
4. Rename it over the target.
5. Clean staging state in `finally`.
6. Propagate every write, close, and rename failure.
7. Never fall back to direct target overwrite.
8. Add a behavioral test using an unwritable or invalid destination seam that
   proves the command exits nonzero and does not claim success.

Repository-adjacent staging is justified here because atomic rename requires a
same-filesystem path. Continue using `$TMPDIR` for generated review reports and
test directories.

### P1 - Registry and dimension checks do not stop model construction

The revision report says profile/factory parity is enforced before mesh
instantiation. Code records failures but continues constructing all available
models.

Independent reproduction:

```text
extra-factory preflight:
  factory calls: 1
  record count: 168
  failures: Extra unregistered mesh factories: bogus
```

An invalid registry should not execute any injected factory. Missing/extra
factory IDs, invalid view/LOD sets, invalid viewport values, invalid profiles,
or invalid designations must terminate preflight before model construction.

Required correction:

- separate preflight validation from generation;
- return a failure-only manifest or throw one documented validation error;
- prove an instrumented factory receives zero calls for every preflight
  failure;
- validate every profile's designation and dimensions during preflight;
- validate width and height as finite positive integers;
- validate exact view and LOD sets before entering any model loop.

### P1 - Unknown view can throw only after generation starts

Input `['front', 'side', 'bogus']` reaches the renderer and throws:

```text
Unknown calibration view: bogus
```

This is not clean canonical-set rejection, and model factories have already
executed.

Required correction:

- reject unknown, missing, extra, and duplicate view/LOD values entirely in
  preflight;
- do not render partial output for a malformed capture contract;
- test exact error/failure text plus zero factory calls.

### P1 - Comparator accepts a corrupted record key

Changing the serialized `record.key` field while leaving its object-map key
unchanged still returns:

```text
pass: true
```

The prior review explicitly required comparison of the record key.

Required correction:

- compare `genRec.key` with `baseRec.key`;
- assert each record's embedded key also equals its containing map key;
- add a test for generated-key corruption and baseline-key corruption.

### P1 - Structurally malformed baseline crashes instead of producing a reviewable difference

Passing a parsed baseline with `records: null` throws:

```text
TypeError: Cannot read properties of null
```

CLI only distinguishes unreadable files and invalid JSON syntax. It does not
validate parsed baseline structure before comparison.

Required correction:

- validate baseline top-level shape, exact schema version, arrays,
  `renderConfig`, failure list, record map, and every record field;
- return keyed readable differences rather than throwing incidental
  `TypeError`s;
- CLI must catch documented validation errors and print the exact fixture path;
- add malformed-but-valid-JSON cases for null records, missing metadata,
  non-array views/LODs, and malformed records.

### P1 - CLI still falls back outside `$TMPDIR`

With `TMPDIR` unset, the default command writes:

```text
/data/data/com.termux/files/home/src/threejs-cm/vehicle-silhouette-audit.json
```

This pollutes the repository root and violates the Termux rule. The diagnostic
file produced during review was removed.

Required correction:

- no positional output: require nonempty `$TMPDIR`, otherwise exit before model
  construction;
- explicit positional output: honor that explicit path;
- never use `.` as an implicit temporary/output location;
- add a subprocess test with `TMPDIR` removed and verify nonzero status plus no
  repository output.

### P1 - Claimed rejection tests are absent

Revision report claims tests for non-finite bounds and baseline-update refusal.
Current nine tests do not exercise either behavior.

Missing tests from prior steering include:

- non-finite `minU`, `maxU`, `minV`, `maxV`, width, and height;
- inconsistent derived width/height;
- zero or inverted extents;
- explicit `--update-baseline` refusal with baseline byte preservation;
- default audit baseline-byte preservation;
- structurally malformed baseline;
- missing and extra baseline keys;
- altered triangle count;
- altered projected metric;
- mutated embedded record key;
- write/rename failure propagation;
- unset `$TMPDIR`;
- zero factory calls after preflight failure.

Required correction:

- add behavioral tests for each case;
- do not describe a behavior as covered unless a test invokes that behavior and
  asserts its observable result.

### P1 - HANDOFF evidence remains stale and blocker section remains contradictory

Live `HANDOFF.md` says:

```text
Full npm test: 424/424
Questions or blockers: None recorded
```

Independent final revision run is 428/428. R35 is explicitly a blocker, so
“None recorded” is also false.

Required correction:

- record exact 428/428 result;
- list R35 as the blocker under `Questions or blockers`;
- distinguish focused audit-only 9/9 from the broader three-file focused
  command;
- do not report a fresh-process `cmp` as an acceptance pass without noting both
  commands intentionally exit 1 due to R35.

### P2 - Render metadata is not the actual renderer invocation

`renderConfig` records background, silhouette color, wireframe state,
`showEnvelope`, metric precision, and epsilon. Generation passes only:

```js
{ width, height, showEnvelope: false }
```

Current renderer defaults happen to match several recorded values, but metadata
is not authoritative. Changing a default can change hashes without a matching
audit configuration change. `metricPrecision` is also recorded while
`roundBoundsMeters(bounds)` relies on a separate default argument.

Required correction:

- construct one resolved render configuration;
- pass its hash-affecting render fields explicitly to
  `renderVehicleSilhouetteSvg`;
- pass its metric precision explicitly to bounds serialization;
- use its epsilon explicitly for envelope checks;
- return that exact resolved configuration in metadata;
- test a controlled non-default configuration or freeze the public API so such
  divergence cannot occur.

### P2 - Baseline failure state is not fully compared

Comparator converts generated failures into differences but never validates or
compares `baselineReport.failures`. A baseline containing failures is not a
valid reviewed baseline.

Required correction:

- baseline schema validation must require an empty failure list;
- reject missing, non-array, or nonempty baseline failures;
- keep generated failures as explicit comparison failures.

### P2 - Non-string SVG input hashes as an empty document

`normalizeSvgForHash()` returns an empty string for any non-string value.
`hashSvgContent()` therefore turns renderer contract corruption into the
well-formed SHA-256 of an empty document.

Required correction:

- throw a documented type error for non-string SVG content;
- reject empty normalized SVG;
- test null, object, and whitespace-only values.

### P2 - Candidate fixture remains old schema and cannot yet be reviewed

Checked-in candidate remains schema 1.0.0 with no `renderConfig`, while current
generator emits schema 1.1.0 and R35 failures. Not updating it is correct while
R35 is blocked. It also means no baseline comparison currently succeeds.

Required steering:

- keep candidate unchanged until audit code passes revision review and R35 is
  corrected separately;
- do not call current fixture reviewed;
- after R35 repair, generate a schema 1.1.0 candidate, inspect temporary visual
  sheets, review the full fixture diff, then explicitly update it.

## Revision 2 work order

Antigravity may remain inside the same allowed packet files:

1. Add complete preflight validation and prove zero factory calls on failure.
2. Bind recorded render metadata directly to renderer, rounding, and envelope
   behavior.
3. Validate baseline schema and every record, including embedded keys.
4. Replace write fallback with same-filesystem atomic replacement that
   propagates errors.
5. Require `$TMPDIR` for implicit output; never fall back to repository root.
6. Add all missing adversarial tests listed above.
7. Correct HANDOFF evidence and blocker section.
8. Run 9+ focused audit tests, broader focused tests, full suite, build, and
   diff check after the final edit.
9. Stop with R35 unresolved and baseline unchanged.

The coordinating agent should not repair R35 until this audit harness itself
passes revision review. Otherwise model correction would be judged by a harness
with known false-positive and unsafe-update paths.

---

# Revision Review 2

Review date: 2026-07-27  
Reviewed revision: Antigravity response to Revision Review 1  
Decision: **REJECTED - NARROW REVISION 3 REQUIRED**

Revision 2 resolves most previous implementation defects. Atomic replacement
now propagates failure, R35 safely blocks baseline updates, render metadata is
bound to generation, invalid common inputs stop before factory execution, and
the reported validation counts are accurate.

Two validation boundaries remain materially incomplete:

1. empty, array-backed, and nonfunction registries escape preflight;
2. `validateBaselineReportSchema()` accepts data that does not implement the
   declared 1.1.0 schema.

These are narrower than earlier findings but still prevent accepting the audit
as a trustworthy quality gate.

## Independently verified Revision 2 evidence

| Gate | Result |
| --- | --- |
| Scope containment | PASS; packet changes remain inside authorized paths. |
| Audit test file | 8/8 passed. |
| Broader focused set | 43/43 passed. |
| Full suite | 427/427 passed. |
| Production build | PASS; 140 modules transformed. |
| Bundle warning | Known 806.17 kB `three-webgpu` warning remains visible. |
| Diff whitespace | PASS. |
| R35 audit result | Eight exact envelope failures; largest overflow 0.1600 m. |
| Failed baseline update | Exited 1; fixture SHA-256 unchanged at `693935cb45244b76cb1fc3e4c6fd3d77b2102bb31e6de7279fb841c183e55ed1`. |
| Fresh-process determinism | Both commands exited 1 for R35; files compared equal with SHA-256 `cf33e3286e4af0c0fa1d2aed3322e45d59bb2ad11d6d66cf3fe9bbc39419bf21`. |
| Explicit unwritable destination | Exited 1 with `EACCES`; no output file created. |
| HANDOFF counts and blocker | Correctly reports 8/8, 43/43, 427/427, build warning, and R35 blocker. |
| TODO state | CPU silhouette child remains unchecked. |

## Remaining findings

### P1 - Empty and array registries pass preflight as successful audits

Independent reproduction:

```text
profiles: {}, meshFactories: {}
-> vehicleCount: 0, recordCount: 0, failures: []

profiles: [], meshFactories: []
-> vehicleCount: 0, recordCount: 0, failures: []
```

Arrays satisfy `typeof value === 'object'`, and empty profile/factory maps have
matching key sets. The function therefore returns a nominally successful empty
audit.

This violates the contract requiring registered profile/factory input and lets
callers bypass all coverage with zero vehicles.

Required correction:

- reject arrays for both `profiles` and `meshFactories`;
- require both to be non-null object dictionaries;
- require at least one profile/factory entry in the reusable module;
- keep the CLI/integration test requiring the exact 14 France 1940 IDs;
- return a failure-only manifest with zero factory calls;
- add tests for `{}/{}`, `[]/[]`, array/object mixtures, and empty/nonempty
  mismatches.

### P1 - Factory values are not validated as callable during preflight

Independent reproduction:

```text
profiles: { tank: validProfile }
meshFactories: { tank: null }
-> throws later: Error: Unknown vehicle model: tank
```

Key parity succeeds because both maps contain `tank`. Factory validity is not
checked, so generation enters `UnitFactory` rather than returning a preflight
failure.

Required correction:

- validate every registered factory value with
  `typeof factory === 'function'`;
- include model ID in failure text;
- prove zero factory calls and zero records for null, object, string, and
  missing factory values.

### P1 - Baseline schema validator accepts a semantically invalid baseline

Independent reproduction passed validation with:

```js
{
  schemaVersion: '1.1.0',
  vehicleCount: 99,
  recordCount: 1,
  views: ['bogus'],
  lods: [],
  renderConfig: { nonsense: true },
  failures: [],
  records: {
    'tank:bogus:nope': {
      key: 'tank:bogus:nope',
      modelId: 'wrong',
      designation: 'X',
      view: 'bogus',
      lod: 'nope',
      triangleCount: 1,
      projectedBoundsMeters: {
        minU: 0,
        maxU: 1,
        minV: 0,
        maxV: 1,
        width: 1,
        height: 1
      },
      svgHash: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'
    }
  }
}
```

Observed result:

```text
{ valid: true, errors: [] }
```

Revision summary says the validator enforces canonical arrays and schema
structure. Current implementation checks only that views/LODs are arrays and
`renderConfig` is some object.

Required correction:

- require views to equal canonical sorted views exactly;
- require LODs to equal canonical LOD order exactly;
- require `renderConfig` to contain the exact 1.1.0 fields, values, and no
  unknown fields;
- require `recordCount === Object.keys(records).length`;
- require `recordCount === vehicleCount * views.length * lods.length`;
- require nonempty records;
- require each embedded key to equal both its map key and
  `${modelId}:${view}:${lod}`;
- require record view and LOD to belong to canonical sets;
- require positive integer triangle counts;
- require lowercase 64-character hexadecimal SHA-256 values;
- require designation and model ID to be nonempty trimmed strings;
- retain finite, positive, internally consistent projected-bound checks;
- ideally verify serialized metric precision does not exceed the declared
  precision;
- return every schema error in deterministic keyed order.

The generic validator need not hardcode 14 vehicles, but the checked-in France
1940 fixture test must assert exactly 14 vehicles and 168 records.

### P2 - Comparator regression coverage is still incomplete

Revision 1 requested explicit tests for:

- missing generated key;
- extra generated key;
- altered triangle count;
- altered projected metric.

Current comparator test covers embedded-key corruption, designation, and render
configuration only. Implementation appears to compare the other fields, but
that behavior is not protected.

Required correction:

- add one behavioral assertion for every field class above;
- require exact key and old/new value in each difference;
- test malformed baseline schema through the comparator as well as the schema
  validator.

### P2 - Atomic write test predicate is too broad

Implementation independently propagates `EACCES`, and no output is created.
Current test accepts any nonzero exit:

```js
(err) => err.code === 1 || err.exitCode === 1
```

Because R35 already forces exit 1, the test could pass even if the destination
unexpectedly became writable and the write path stopped propagating errors.

Required correction:

- assert stderr contains the expected write operation and `EACCES` or the
  injected write failure;
- assert destination does not exist;
- assert stdout contains no success line;
- prefer exporting/testing a small atomic-write helper or invoking the CLI with
  a deterministic failure seam rather than relying only on directory mode.

### P2 - Staging filename still uses `Math.random()` without exclusive creation

Atomic replacement is materially improved and stays on the target filesystem.
The staging filename is still generated with `Math.random()` and opened without
exclusive creation. Concurrent audit processes could theoretically select and
overwrite the same staging file.

This randomness does not affect manifest contents or simulation outcomes, but
it is unnecessary for filesystem ownership.

Required correction:

- use `mkdtemp()` in the target directory or open a staging path with exclusive
  creation;
- keep final rename on the same filesystem;
- clean staging state in `finally`;
- preserve propagation of all write and rename failures.

## Revision 3 work order

Keep Revision 3 narrow and inside existing packet files:

1. Reject empty/array registries and nonfunction factory values during
   preflight.
2. Make baseline schema validation enforce the complete declared 1.1.0
   contract.
3. Add missing comparator-field tests.
4. Strengthen atomic-write failure assertions and use collision-safe staging.
5. Rerun audit, broader focused, full suite, build, and diff gates.
6. Leave R35 untouched, baseline unchanged, and TODO unchecked.

After these corrections pass review, the harness will be suitable for the
coordinating agent's separate R35 model-registration repair.

---

# Revision Review 3

Review date: 2026-07-27  
Reviewed revision: Antigravity response to Revision Review 2  
Decision: **REJECTED - FINAL NARROW REVISION 4 REQUIRED**

Revision 3 fixes registry type/emptiness checks, callable-factory preflight,
collision-safe same-filesystem staging, and the requested comparator field
checks. The implementation now safely refuses the baseline update while the
Renault R35 violates its registered envelope. All reported validation gates
also reproduce.

The remaining problem is confined to baseline-schema enforcement and its
tests. `validateBaselineReportSchema()` still accepts records that cannot
represent the declared canonical vehicle/view/LOD matrix. This makes a
malformed or hand-edited fixture eligible for comparison despite the stated
strict 1.1.0 contract. One previously requested atomic-write assertion also
remains absent.

## Independently verified Revision 3 evidence

| Gate | Result |
| --- | --- |
| Scope containment | PASS; packet implementation remains inside authorized paths. |
| Audit test file | PASS; 8/8. |
| Broader focused set | PASS; 43/43. |
| Full suite | PASS; 427/427. |
| Production build | PASS; 140 modules transformed. |
| Bundle warning | Known 806.17 kB `three-webgpu` warning remains visible. |
| Diff whitespace | PASS. |
| R35 audit result | Eight exact envelope failures; largest overflow 0.1600 m. |
| Failed baseline update | PASS; exited 1 and refused replacement. |
| Fixture preservation | PASS; SHA-256 remained `693935cb45244b76cb1fc3e4c6fd3d77b2102bb31e6de7279fb841c183e55ed1`. |
| Collision-safe staging | PASS; adjacent-directory `mkdtemp()` plus same-filesystem rename and cleanup. |
| TODO state | PASS; CPU silhouette child remains unchecked. |
| Browser runtime | Not applicable; packet is CPU-only and changes no runtime rendering path. |

Exact independently run commands:

```text
node --test test/vehicle-silhouette-audit.test.js
-> 8 tests, 8 passed

node --test test/vehicle-silhouette-audit.test.js test/vehicle-calibration.test.js test/vehicles.test.js
-> 43 tests, 43 passed

npm test
-> 427 tests, 427 passed

npm run build
-> PASS, 140 modules transformed
-> known three-webgpu chunk warning: 806.17 kB

git diff --check
-> PASS

node scripts/audit-vehicle-silhouettes.mjs --update-baseline
-> exit 1, eight R35 failures, baseline update refused
```

## Remaining findings

### P1 - Canonical view order is not enforced

Revision 2 required the baseline views to equal the canonical sorted array
exactly. Revision 3 sorts both arrays before comparing, so this malformed
metadata passes:

```text
views: ["top", "side", "front"]
-> { valid: true, errors: [] }
```

The declared canonical order is:

```text
["front", "side", "top"]
```

Required correction:

- compare the baseline array element-for-element without sorting it;
- add a regression test using the same members in the wrong order;
- preserve exact LOD-order enforcement already present.

### P1 - Render dimensions can drift from the fixed baseline contract

Revision 2 required exact 1.1.0 render-config fields and values. Revision 3
checks exact keys and all non-dimension values, but accepts any positive
integer width or height:

```text
renderConfig.width: 701
-> { valid: true, errors: [] }
```

The checked-in fixture and CLI contract use `700 x 450`. A hand-edited fixture
using another raster size must fail schema validation before comparison.

Required correction:

- require every baseline `renderConfig` value, including `width` and `height`,
  to equal `DEFAULT_RENDER_CONFIG`;
- if reusable non-default dimensions are genuinely needed later, pass an
  explicit expected render config to the validator rather than accepting any
  positive dimensions implicitly;
- add width- and height-drift regression tests.

### P1 - Vehicle count does not describe the records matrix

Current arithmetic checks only total record count:

```text
recordCount === vehicleCount * views.length * lods.length
```

It does not verify how those records are distributed. This constructed report
passes:

```text
vehicleCount: 1
recordCount: 12
records: 12 semantic keys spread across 12 different model IDs
-> { valid: true, errors: [] }
```

Such a report is not one vehicle across three views and four LODs. It is twelve
partial vehicles and cannot be a valid silhouette baseline.

Required correction:

- derive the distinct `modelId` set from records;
- require distinct model-ID count to equal `vehicleCount`;
- for every model ID, require exactly one record for each canonical
  view/LOD pair;
- reject duplicate/missing matrix cells even when aggregate counts happen to
  match;
- traverse sorted model IDs and canonical view/LOD order for deterministic
  errors;
- add tests for split IDs, one missing cell plus one duplicated/replacement
  cell, and a valid complete matrix.

### P2 - Baseline schema permits unknown top-level fields

The strict schema rejects extra `renderConfig` keys but accepts extra
top-level keys:

```text
unexpected: true
-> { valid: true, errors: [] }
```

Required correction:

- define the exact 1.1.0 top-level key set:
  `schemaVersion`, `vehicleCount`, `recordCount`, `views`, `lods`,
  `renderConfig`, `failures`, and `records`;
- reject missing or unknown keys before record comparison;
- add one unknown-key regression test.

### P2 - Requested malformed-baseline comparator test is absent

Revision 2 explicitly required malformed schema coverage through both
`validateBaselineReportSchema()` and
`compareSilhouetteAuditWithBaseline()`. Revision 3 tests the validator directly
but does not protect comparator rejection of malformed baseline input.

The implementation currently rejects a `views: ["bogus"]` baseline through the
comparator, so this is a missing regression test rather than a current runtime
failure.

Required correction:

- pass one malformed baseline into the comparator;
- assert `pass === false`;
- assert the difference is prefixed `Baseline schema validation error:`;
- use one of the impossible-matrix cases above so the new invariant is covered
  end-to-end.

### P2 - Atomic failure assertion still does not inspect stderr

Revision 2 required the CLI test to assert the write operation and `EACCES` or
an injected write failure. Revision 3's predicate checks only exit code and
absence of the success line:

```js
const isCodeOne = err.code === 1 || err.exitCode === 1;
const hasNoSuccessLine = !err.stdout || !err.stdout.includes('records) ->');
return isCodeOne && hasNoSuccessLine;
```

The following destination-nonexistence assertion is useful, but the test still
does not prove which error caused the exit. The revision report's claim that
the test verifies stderr error output is therefore inaccurate.

Required correction:

- require nonempty stderr;
- require the expected filesystem operation plus `EACCES`, `EPERM`, or a
  deterministic injected failure marker;
- keep the no-target and no-success assertions;
- avoid platform-fragile permission assumptions if a small exported helper or
  deterministic failure seam can exercise the same behavior.

## Revision 4 work order

Keep Revision 4 limited to:

1. exact canonical view order;
2. exact fixed render-config values;
3. complete per-model view/LOD matrix validation;
4. exact top-level schema keys;
5. malformed-baseline comparator coverage;
6. specific atomic-write stderr coverage.

Do not alter model code, R35 registration, fixture bytes, TODO state, package
scripts, or packet scope. Do not increase tolerances or update the baseline.

After the final edit:

1. run the audit test file;
2. run the 43-test broader focused set, adjusting the expected count only for
   genuinely added tests;
3. run full `npm test`;
4. run `npm run build`;
5. run `git diff --check`;
6. run the failed baseline-update command and prove fixture SHA-256 remains
   unchanged;
7. update only HANDOFF results/counts;
8. stop for coordinating-agent review.

Acceptance boundary remains:

```text
Revision 4 harness accepted
        |
        v
Separate R35 model-registration task
        |
        v
Generate temporary schema 1.1.0 candidate
        |
        v
Human side/front/top and all-LOD review
        |
        v
Explicit baseline update + TODO completion
```

---

# Revision Review 4

Review date: 2026-07-27  
Reviewed revision: Antigravity response to Revision Review 3  
Decision: **FUNCTIONAL CORRECTIONS ACCEPTED; TEST-ONLY RESTORATION REQUIRED**

All six Revision 4 implementation requirements are correct. Independent
adversarial probes reject reordered views, render-size drift, unknown
top-level fields, split vehicle matrices, and malformed comparator baselines.
The atomic-write test now requires filesystem-error stderr, no success output,
and no destination file.

The audit engine is ready for a separate R35 registration task after one
test-only correction. During final packet-wide review, required behavioral
coverage present in the initial packet was found to have disappeared during
the revisions. Repository policy forbids weakening or deleting prior tests.
The underlying behavior passes independent probes, but it is no longer
protected in the checked-in test suite.

## Independently verified Revision 4 evidence

| Gate | Result |
| --- | --- |
| Revision 4 adversarial cases | PASS; all six corrected boundaries reject invalid input. |
| Audit test file | PASS; 8/8. |
| Broader focused set | PASS; 43/43. |
| Full suite | PASS; 427/427. |
| Production build | PASS; 140 modules transformed. |
| Bundle warning | Known 806.17 kB `three-webgpu` warning remains visible. |
| Diff whitespace | PASS after final review edit. |
| In-process manifest equality | PASS in independent probe; 168-record reports deep-equal. |
| Registered model-ID set | PASS in independent probe; exact 14 profile IDs. |
| Altered hash rejection | PASS in independent probe with keyed `svgHash mismatch`. |
| Failed baseline update | PASS; exit 1 with eight R35 envelope failures. |
| Fixture preservation | PASS; SHA-256 remained `693935cb45244b76cb1fc3e4c6fd3d77b2102bb31e6de7279fb841c183e55ed1`. |
| Browser runtime | Not applicable; CPU-only packet changed no runtime path. |

## Accepted Revision 4 corrections

| Requirement | Result |
| --- | --- |
| Exact view order | Accepted; direct element order enforced. |
| Exact render config | Accepted; width, height, and every other value equal the frozen default. |
| Complete per-model matrix | Accepted; distinct IDs and every canonical view/LOD cell enforced. |
| Exact top-level schema | Accepted; missing or unknown keys rejected. |
| Malformed comparator baseline | Accepted; comparator returns prefixed schema errors. |
| Atomic-write stderr | Accepted; nonzero exit, filesystem stderr, no success line, and no target required. |

## Remaining finding

### P1 - Required regression coverage disappeared during revisions

The original packet required:

1. two complete manifest generations in one process followed by a deep
   comparison;
2. proof that every registered vehicle ID appears and no unregistered ID
   appears;
3. a keyed failure when an expected SVG hash changes;
4. generated-output comparison with the checked-in reviewed baseline.

The initial review recorded that the then-current tests covered in-process
equality, fixture equality, and an altered hash. The current eight-test file no
longer contains those assertions. It checks record count and structure, but
not a second complete generation, the exact registered-ID set, or an altered
hash. This is test-coverage regression even though independent probes confirm
the implementation currently behaves correctly.

The fourth item cannot honestly pass yet. The fixture is intentionally still
schema 1.0.0, while the generator emits schema 1.1.0 with eight R35 failures.
Current schema validation correctly rejects that old candidate. Baseline
comparison remains deferred until R35 is repaired and the new candidate
receives human review.

## Final test-only restoration order

Allowed file:

```text
test/vehicle-silhouette-audit.test.js
```

Permitted HANDOFF update:

```text
HANDOFF.md Results only
```

Required additions:

1. Generate the complete manifest twice in the same process and
   `assert.deepEqual()` the full reports, including their current deterministic
   eight-failure arrays.
2. Derive distinct model IDs from all 168 records and compare them exactly
   against sorted `VEHICLE_VISUAL_PROFILES` keys. Also assert every record ID
   belongs to that set.
3. Clone a valid mock generated/baseline report, alter one `svgHash`, and
   require a keyed old/new `svgHash mismatch`.
4. Add an explicit bootstrap assertion documenting that the current checked-in
   schema 1.0.0 candidate is not the reviewed 1.1.0 baseline and is rejected by
   the validator. Do not modify its bytes.

Do not change production audit code, CLI code, package scripts, R35, fixture
bytes, TODO state, tolerances, or packet scope.

After the test-only edit, rerun:

```text
node --test test/vehicle-silhouette-audit.test.js
node --test test/vehicle-silhouette-audit.test.js test/vehicle-calibration.test.js test/vehicles.test.js
npm test
npm run build
git diff --check
node scripts/audit-vehicle-silhouettes.mjs --update-baseline
```

The last command must exit 1 and preserve the fixture SHA-256. Then stop.

Acceptance sequence:

```text
Restore required tests
        |
        v
Accept audit harness
        |
        v
Separate R35 registration repair
        |
        v
Generate schema 1.1.0 candidate
        |
        v
Human side/front/top and all-LOD review
        |
        v
Explicit baseline update and TODO child completion
```

---

# Final Test-Restoration Review

Review date: 2026-07-27  
Decision: **AUDIT HARNESS ACCEPTED**

No remaining harness finding. Required test coverage is restored without
changing production audit behavior, the R35 model, tolerances, fixture bytes,
or TODO state.

This accepts the reusable CPU silhouette audit infrastructure. It does not
accept the current schema 1.0.0 fixture as a reviewed baseline and does not
complete the TODO slice. The packet remains blocked on separate R35
registration repair followed by human visual review.

## Independently verified evidence

| Gate | Result |
| --- | --- |
| Same-process manifest determinism | PASS; complete 168-record reports deep-equal, including eight ordered R35 failures. |
| Registered vehicle coverage | PASS; record IDs equal all 14 sorted profile IDs with no extras. |
| Keyed SVG-hash regression | PASS; altered hash produces model/view/LOD-specific old/new mismatch. |
| Candidate fixture rejection | PASS; schema 1.0.0 candidate is rejected by schema 1.1.0 validator. |
| Audit test file | PASS; 8/8. |
| Broader focused set | PASS; 43/43. |
| Full suite | PASS; 427/427. |
| Production build | PASS; 140 modules transformed. |
| Bundle warning | Known 806.17 kB `three-webgpu` warning remains visible. |
| Diff whitespace | PASS. |
| Failed baseline update | PASS; exit 1 with exactly eight R35 records reported. |
| Fixture preservation | PASS; SHA-256 remained `693935cb45244b76cb1fc3e4c6fd3d77b2102bb31e6de7279fb841c183e55ed1`. |
| Browser runtime | Not applicable; CPU-only packet changed no runtime path. |

## Accepted ownership boundary

```text
Accepted now:
  reusable manifest generator
  strict schema validator
  complete baseline comparator
  safe explicit CLI updater
  deterministic same/fresh-process evidence
  adversarial rejection coverage

Not accepted yet:
  Renault R35 registration
  schema 1.1.0 reviewed baseline fixture
  human side/front/top and all-LOD visual sign-off
  completed CPU-silhouette TODO child
  browser impact/damage captures
```

## Coordinator next work

1. Open a separate bounded task for the Renault R35 owning model module.
2. Correct registration without changing the 0.01 m audit epsilon.
3. Validate R35 ground contact, exact envelope, outward winding, weapon
   markers, and all four LOD tiers.
4. Rerun the accepted audit twice in fresh processes.
5. Generate temporary side/front/top review sheets for all 14 vehicles and all
   four LODs.
6. Review silhouettes against registered references; record deliberate
   divergences.
7. Review the complete schema 1.1.0 fixture diff.
8. Run the explicit baseline update only after human approval.
9. Rerun focused tests, full suite, build, diff check, and affected visual
   checks.
10. Check the CPU-silhouette TODO child only after the reviewed fixture passes.

Antigravity must not start the R35 task without a new explicit HANDOFF packet.

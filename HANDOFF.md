# Antigravity Work Packet

Packet owner: coordinating Codex agent.

Wave 1 completed exactly three concurrent packets:

- Packet H39-A: assigned vehicle-data/render worker.
- Packet CREW-A: assigned deterministic simulation worker.
- Packet TEXTURE-A: assigned external-asset worker.

Packet SOUND-A also completed and was integrated after independent review.
Packets AUDIO-A, MODEL-A, and AMMO-A below Packet CREW-A are the current
Codex-owned non-vehicle wave. Do not commit, push, create/switch branches, or
rewrite another packet's scope. Files not named by the assigned packet remain
out of scope.

Separately, the user has reserved all further vehicle-authoring work for
Antigravity. Packet H39-B below is the only next vehicle packet; Wave 1 Codex
workers must not implement it.

The worktree is intentionally dirty. Existing changes include the reviewed R35
reference implementation, its silhouette baseline, user-owned images, and
unrelated work. Preserve every change outside the exact allowed paths.

## Packet H39-A: output-neutral Hotchkiss H39 visual-data extraction

### Goal

Move current Hotchkiss H39 renderer-owned parameters and provenance out of its
Three.js factory into one family-owned, renderer-neutral visual-data module.
Wire that plain data into the existing generic vehicle visual bundle.

This is an architecture packet, not a fidelity packet. Current H39 geometry is
known to contain approximations and legacy oval/capsule track inputs. Preserve
its exact output so later source-calibration work starts from a clean ownership
boundary and produces a reviewable silhouette diff.

Required result:

```text
France 1940 H39 visual data
        |
        +--> HotchkissH39.js geometry consumer
        |
        +--> generic vehicle visual bundle
        |
        +--> generic tests/evaluators
```

No generic layer may import H39. No H39 numbers may be copied into a generic
module.

### Required reading and baseline

Read completely before editing:

- `AGENTS.md`
- `TODO.md`
- `docs/ARCHITECTURE.md`
- this packet
- `src/content/france1940/vehicleData/RenaultR35VisualData.js`
- `src/world/vehicles/HotchkissH39.js`
- `src/content/france1940/render/vehicleVisualBundles.js`
- `src/calibration/VehicleVisualBundle.js`
- `src/calibration/VehicleVisualEvaluator.js`
- `test/hotchkiss-h39-blueprint.test.js`
- `test/vehicle-visual-bundles.test.js`
- `test/vehicle-silhouette-audit.test.js`

The R35 file is an ownership/schema example only. Do not copy its dimensions,
pixels, source mechanics, validation tolerances, track supports, tension, or
any other numeric value into H39.

Before editing, run and record:

```sh
git status --short --branch
node --test test/hotchkiss-h39-blueprint.test.js \
  test/vehicle-visual-bundles.test.js \
  test/vehicle-silhouette-audit.test.js
node scripts/audit-vehicle-silhouettes.mjs \
  "$TMPDIR/h39-before.json"
```

The audit must pass against the checked-in baseline before work starts. If it
does not, record the exact pre-existing failure under **Questions or blockers**
and stop. Never update the baseline in this packet.

### Allowed files

Only these files may change:

- `src/content/france1940/vehicleData/HotchkissH39VisualData.js` (new)
- `src/world/vehicles/HotchkissH39.js`
- `src/content/france1940/render/vehicleVisualBundles.js`, only exact H39
  visual-data registration/wiring
- `test/hotchkiss-h39-blueprint.test.js`
- `test/vehicle-visual-bundles.test.js`, only H39-specific assertions
- `TODO.md`, only one indented H39 visual-data-extraction child
- `HANDOFF.md`, only **Results** and **Questions or blockers**

Do not touch an allowed file until its current diff has been inspected. If an
allowed hunk overlaps another worker's edits and cannot be preserved, stop.

### Explicitly forbidden

- Any edit to `AGENTS.md`, `docs/ARCHITECTURE.md`, `package.json`, lockfiles,
  asset manifests, calibration helpers, generic evaluators, track solvers,
  running-gear helpers, silhouette engines, or the silhouette baseline.
- Any edit outside the exact allowed paths, including another vehicle,
  `VehicleVisualProfiles.js`, internal layouts, catalogs, simulations, UI,
  scenarios, maps, renderer startup, materials, or VFX.
- Any geometry, topology, transform, material, UV, marker, name, `userData`,
  LOD visibility, triangle-count, silhouette, or projected-bound change.
- Any new H39 source raster, download, scrape, network request, dependency, or
  claim that a URL-only source is pixel registered.
- Any supported-track migration. The H39 legacy capsule inputs remain
  explicitly labeled as current renderer approximations in this packet.
- Any new source-mechanics validation contract. H39 has no accepted directly
  loadable registered multiview raster yet.
- Any tolerance change, expected-value weakening, skipped/deleted test, or
  baseline rewrite.
- Broad cleanup, formatting, renaming, comment rewriting, or “while here”
  improvements.

### Required data ownership

Create `HotchkissH39VisualData.js` as plain deeply frozen ES-module data with no
Three.js, DOM, browser, renderer, simulation, or concrete scenario import.

Move, without changing values:

1. `H39` metre-space renderer parameters currently declared in
   `HotchkissH39.js`.
2. `HULL_STATIONS`.
3. `TURRET_RINGS`.
4. `H39_BLUEPRINT_CALIBRATION`, including source URLs, publisher/page/use,
   quality labels, datums, and outline-landmark text.

Recommended public record:

```js
export const HOTCHKISS_H39_VISUAL_DATA = Object.freeze({
  schemaVersion: 1,
  modelId: 'fr_hotchkiss_h39',
  coordinateFrame: '+Y up, +Z forward, vehicle right -X, metres',
  dimensionsMeters: Object.freeze({ ... }),
  geometry: Object.freeze({
    hullStations: Object.freeze([ ... ]),
    turretRings: Object.freeze([ ... ]),
    runningGear: Object.freeze({ ... }),
    turret: Object.freeze({ ... }),
    mainGun: Object.freeze({ ... })
  }),
  blueprint: Object.freeze({
    sources: Object.freeze([ ... ]),
    datums: Object.freeze({ ... }),
    outlineLandmarks: Object.freeze([ ... ]),
    registrationStatus:
      'URL and provenance only; no accepted pixel-registered raster'
  }),
  validation: Object.freeze({
    requiredLodBands: Object.freeze(['high', 'medium', 'core', 'proxy'])
  })
});
```

Exact field grouping may follow current consumers, but:

- one named record owns each value;
- dimensions equal the canonical H39 profile exactly;
- all arrays and nested records are deeply frozen;
- approximation labels stay attached to their values;
- the file contains no calculated current-mesh measurements;
- the file does not claim direct source-pixel registration;
- the legacy track envelope inputs are explicitly described as renderer
  approximations pending support-point migration.

`HotchkissH39.js` must import the record and derive all moved constants from it.
It must retain a compatibility re-export of `H39_BLUEPRINT_CALIBRATION` if
existing callers/tests use that symbol. Do not leave a second authoritative
copy behind.

`vehicleVisualBundles.js` must inject the exact H39 visual-data object by model
ID and use its validation record. Preserve R35 special asset binding and all
other vehicle behavior. Do not generalize asset ownership in this packet.

### Behavioral invariants

After extraction:

- `HOTCHKISS_H39_VISUAL_DATA.modelId === 'fr_hotchkiss_h39'`.
- `bundle.visualData === HOTCHKISS_H39_VISUAL_DATA` by strict identity.
- H39 factory output keeps every existing object name, transform, geometry,
  material, marker, metadata field, and LOD band.
- Existing H39 compatibility exports retain strict identity with the new
  family-owned record.
- Every one of the 12 H39 silhouette records remains byte-for-byte identical:
  3 views x 4 LODs.
- All 168 non-H39 records also remain identical.
- No baseline file changes.
- No source-mechanics check is enabled for H39.

### Required tests

Add behavior-focused assertions that would fail if wiring were incomplete:

1. Import the new H39 visual-data record directly.
2. Assert model ID, exact dimensions, coordinate frame, and deep immutability.
3. Assert the existing compatibility calibration export is strict-identical to
   the new record's calibration object.
4. Assert the registered generic H39 bundle holds the exact visual-data object.
5. Assert the bundle still passes existing identity/assets/mesh-contract checks.
6. Assert registration status is explicit and no pixel-registered raster is
   claimed.
7. Preserve the existing geometry, winding, envelope, muzzle, six-wheel, and
   three-bogie behavior tests.

Do not add source-string, grep, snapshot-auto-update, or implementation-line
tests when public imports and bundle APIs can prove the behavior.

### Output-neutral audit gate

After the final code edit:

```sh
node scripts/audit-vehicle-silhouettes.mjs \
  "$TMPDIR/h39-after.json"
cmp "$TMPDIR/h39-before.json" "$TMPDIR/h39-after.json"
git diff -- test/fixtures/vehicle-silhouette-baseline.json
```

All three commands must be clean. If any H39 hash, triangle count, or projected
metric changes, do not update the fixture and do not “fix” the test. Stop and
report the exact keyed diff.

### Final acceptance gates

Run after the final edit, in this order:

```sh
git status --short --branch
node --test test/hotchkiss-h39-blueprint.test.js \
  test/vehicle-visual-bundles.test.js \
  test/vehicle-silhouette-audit.test.js
node scripts/audit-vehicle-silhouettes.mjs \
  "$TMPDIR/h39-after.json"
cmp "$TMPDIR/h39-before.json" "$TMPDIR/h39-after.json"
npm test
npm run build
git diff --check
git status --short --branch
```

Expected:

- focused tests pass with exact counts reported;
- both manifests contain 180 records and compare byte-for-byte;
- baseline fixture has no diff caused by this packet;
- full suite passes with exact counts reported;
- production build passes without the removed 500 kB chunk warning;
- `git diff --check` emits no output;
- no browser check is required because runtime output must be unchanged.

### TODO rule

The broad H39 source-convergence and legacy-track migration items remain
unchecked. Add only this completed child after every gate passes:

```markdown
- [x] Extract the current H39 renderer parameters and provenance into one
  family-owned visual-data bundle without changing any runtime silhouette.
```

Do not describe output-neutral extraction as blueprint calibration.

### Stop conditions

Stop immediately and report when:

- baseline audit is not clean before editing;
- moving a value changes any keyed silhouette record;
- H39 needs a new generic API or a file outside the allowlist;
- an accepted directly loadable source raster is required;
- current H39 values conflict with canonical profile dimensions;
- an overlapping dirty hunk cannot be preserved;
- a full-suite/build failure is outside packet scope.

## Not authorized

These require a later packet after coordinating-agent review:

- acquiring and accepting an H39 multiview raster;
- tracing H39 source pixels;
- changing hull, turret, mantlet, cupola, visor, mudguard, suspension, wheels,
  track supports, links, cleats, weapon geometry, or any LOD;
- migrating H39 from the legacy capsule to `TrackPathSolver`;
- updating silhouette baselines;
- converting Panhard 178 or another vehicle.

## Results

Antigravity fills only this section.

- Status: COMPLETE; ready for coordinating-agent review.
- Scope completed: extracted the current H39 metre-space table, hull stations,
  turret rings, provenance, and validation policy into one deeply frozen
  family-owned record; wired the renderer and generic visual bundle to that
  exact record; retained the compatibility calibration export by identity.
- Scope deliberately left incomplete: source-raster acquisition/registration,
  geometry calibration, source-mechanics validation, supported-track
  migration, and every non-H39 vehicle remain later packets.
- Files changed, grouped by data/rendering/tests/docs: data:
  `HotchkissH39VisualData.js`; rendering:
  `HotchkissH39.js`, H39-only registration in `vehicleVisualBundles.js`;
  tests: `hotchkiss-h39-blueprint.test.js`,
  `vehicle-visual-bundles.test.js`; docs: the authorized H39 child in
  `TODO.md` and this Results section.
- Authoritative ownership changed: H39 renderer parameters and URL-only
  provenance now have one family-data owner; the renderer consumes it and the
  H39 generic bundle retains it by strict identity. No simulation authority
  changed.
- Focused baseline result: coordinator outside-sandbox baseline passed 18/18;
  worker standalone pre-edit audit passed 180/180. The worker sandbox command
  reproduced the known CLI-harness-only failure while both H39/bundle files
  passed.
- Focused final test result: exact required command passed 20/20 outside the
  sandbox.
- Before/after silhouette audit and `cmp` result: both manifests passed
  180/180; 12 H39 and 168 non-H39 records; byte-for-byte `cmp` passed; baseline
  fixture has no diff.
- Full `npm test` result: outside-sandbox rerun passed 448/448. The initial
  sandbox run passed 73/74 files, with only the known CLI unwritable-directory
  harness failing under sandbox filesystem semantics.
- `npm run build` result and warnings: passed; 730 modules transformed; largest
  chunk 420.79 kB; no 500 kB warning.
- `git diff --check` result: passed with no output.
- Final branch/worktree status: `main...origin/main`; no commit or branch
  change. H39-A allowed paths are dirty alongside preserved coordinator and
  other packet work.
- Remaining risks and review points: H39 still has URL/provenance-only sources
  and a legacy capsule track described as a renderer approximation; verify the
  strict visual-data identity and the clean 180-record manifest comparison.

## Questions or blockers

Antigravity records blockers here and stops. Do not rewrite packet scope.

---

## Packet CREW-A: deterministic replacement-gunner delay

### Status

ACCEPTED after final independent review. This remains one completed vertical
slice of the broader crew-task, bailout, and abandonment TODO.

### Authorized goal

Add catalog-driven, renderer-neutral main-gun crew reassignment for one
historically multi-person vehicle with distinct commander and gunner roles.
When the original gunner becomes unavailable, one explicitly eligible living
crewman transfers to the gunner task after a deterministic delay. Until the
transfer completes the main gun cannot aim or fire. The broader parent remains
unchecked.

### Allowed files

- `src/simulation/vehicles/VehicleCrewTasks.js` (new)
- `src/content/france1940/vehicles.js`, only frozen crew-reassignment policy
  data and its validation/copy path
- `src/game/Unit.js`, only authoritative crew-role eligibility, fixed-step
  advancement, and capture/restore integration
- `src/simulation/observation/ObservationEquipment.js`, only consuming the
  authoritative effective vehicle role for role-owned equipment
- `test/vehicle-crew-tasks.test.js` (new)
- `test/vehicles.test.js`, only crew-reassignment catalog assertions
- `test/spotting-system.test.js`, only the completed replacement gunner's loss
  of commander-owned observation equipment
- `TODO.md`, only one indented completed child below the crew-task parent
- `HANDOFF.md`, only Packet CREW-A Results and Questions / Blockers

Inspect the current diff for every allowed file before editing. Preserve edits
from other packets, especially non-CREW TODO and HANDOFF sections.

### Explicitly forbidden

- Bailout, abandonment, driver or loader replacement, repair, morale, UI,
  rendering, animation, scenario, roster, weapon, armor, or mount changes.
- Generic fallback reassignment for vehicles without explicit policy data.
- Inventing a historical timing claim. Any delay without a source must be
  labeled as a gameplay approximation in content, state, tests, and TODO text.
- `main.js`, `GameApp`, public registries, compatibility catalogs, package
  files, build config, baselines, H39 files, or external-asset files.
- `Math.random()`, wall-clock timing, retained object-only references, or state
  omitted from capture/restore.

### Required work order

1. Read `AGENTS.md`, `TODO.md`, `docs/ARCHITECTURE.md`, this packet,
   `Unit.js`, the vehicle catalog definition/copy path, and existing vehicle
   system/capture tests.
2. Run the focused baseline before editing:

   ```sh
   node --test test/vehicle-systems.test.js test/vehicles.test.js
   ```

3. Define a plain immutable crew-task policy in the owning vehicle record.
4. Implement pure deterministic task-state creation, advancement, effective
   role queries, capture, and restore under `src/simulation/vehicles/`.
5. Integrate only the main-gun role checks and authoritative fixed simulation
   step in `Unit`.
6. Add behavioral tests that fail before the implementation.
7. Run the final gates and update only the permitted TODO/results sections.

### Acceptance criteria

- No vehicle reassigns a crewman without an explicit catalog policy.
- Candidate choice uses stable crew IDs/roster order and is independent of
  collection insertion order.
- A dead or incapacitated candidate cannot transfer or operate the gun.
- The main gun remains unavailable for the entire configured delay and becomes
  available exactly at completion.
- A fixed-step sequence and a single coarse step covering the same transfer
  time produce identical main-gun traverse, aim, ammunition, and shot state;
  no part of the transfer interval is retroactively credited to combat.
- That equivalence includes enough post-delay time to aim, fire, reload, and
  fire again; a coarse crossing cannot collapse multiple main-gun events into
  one call.
- A reassigned crewman cannot simultaneously satisfy the original duty.
- Commander-owned binoculars and other role-owned observation equipment use
  effective roles after reassignment, not the unchanged roster label.
- An effective role of `null` during transfer remains authoritative and must
  not fall back to the original roster role.
- Frame partitions summing to the same simulation time produce identical task
  state and gun availability.
- Capture/restore during transfer and after completion deep-copies state and
  produces the same continuation.
- Existing exact gunner/loader/driver behavior remains unchanged for vehicles
  without a policy.
- No renderer or HUD record becomes authoritative.

### Validation commands

```sh
node --test test/vehicle-crew-tasks.test.js \
  test/vehicle-systems.test.js \
  test/vehicles.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

No browser check is required because this packet adds no presentation code.

### Stop condition

Stop and report if correct integration requires UI/rendering, a generic catalog
fallback, another vehicle's data, or any file outside the allowlist.

### TODO rule

Keep the parent unchecked. Add one child describing only the implemented
catalog-driven main-gunner replacement delay and its deterministic rollback
coverage. Do not claim bailout, abandonment, or general crew reassignment.

### Results

- Status: ACCEPTED after final independent review.
- Scope completed: added one explicit Panzer III commander-to-main-gunner
  policy, a pure renderer-neutral task transition, main-gun traverse/aim/fire
  lockout during transfer, post-delay-only combat credit, stable-ID candidate
  selection, exact deterministic completion without per-step rounding,
  effective-role replacement for observation equipment, and deep
  capture/restore.
- Scope deliberately left incomplete: all other vehicles, driver/loader
  replacement, auxiliary-mount reassignment, bailout, abandonment, repair,
  morale, presentation, and animation remain later packets.
- Files changed: content: `src/content/france1940/vehicles.js`; simulation:
  `src/simulation/vehicles/VehicleCrewTasks.js`,
  `src/simulation/observation/ObservationEquipment.js`; integration:
  `src/game/Unit.js`; tests: `test/vehicle-crew-tasks.test.js`,
  `test/spotting-system.test.js`, `test/vehicles.test.js`; docs: the authorized
  crew-task child in `TODO.md` and this Results section.
- Authoritative state changed: `Unit.vehicleCrewTasks` now owns the policy ID,
  phase, stable candidate crew ID, source/target roles, elapsed/configured
  delay, and approximation label. `Unit` advances it from simulation delta and
  captures/restores it deeply. Its fixed-step result carries only main-gunner
  time after transfer completion into traverse and fire control. The explicit
  effective-role query also owns role-based observation equipment decisions;
  auxiliary mounts retain their original exact crew dependencies.
- Focused baseline: after one transient concurrent visual-file syntax failure,
  the required pre-revision command passed 33/33 tests.
- Focused final: the four-file command passed 4/4 test files. It covers `[12]`
  versus 720 x 1/60-second Unit steps, `[20]` versus 1200 x 1/60-second steps
  through two shots, and `[12.97]` versus canonical 1/60-second steps plus the
  exact remainder. The compared state includes task, traverse, fire control,
  ammunition, reload, cooldown, recoil, and range estimate. Transfer-time
  effective role remains authoritative `null`, so commander binoculars are
  unavailable until the replacement completes.
- Full `npm test`: final integrated rerun passed 77/77 test files.
- `npm run build`: passed; 731 modules transformed; largest chunk 430.24 kB;
  no 500 kB warning or other build warning.
- `git diff --check`: passed with no output after the final implementation.
- Final status: `main...origin/main`; no commit, push, or branch change.
  CREW-A files are dirty alongside preserved H39-A, TEXTURE-A, coordinator,
  and pre-existing work.
- Remaining risks: commander eligibility and the 12-second transfer are
  explicitly labeled gameplay approximations, not historical timing claims.
  A future packet must decide whether completed main-gun reassignment should
  also authorize an auxiliary mount; this packet deliberately preserves
  existing coax/hull-mount crew ownership.
- Independent review: APPROVE. The reviewer confirmed byte-identical integral
  and non-integral partitions, capture/replay, authoritative transferring-role
  null behavior, original auxiliary-mount ownership, no-policy behavior, and a
  bounded 4096-step catch-up whose final slot carries extreme overflow.

### Questions / Blockers

Record blockers here and stop.

---

## Packet ASSET-DOC-A: external lifecycle architecture truth

### Status

ACCEPTED after independent review.

### Goal

Remove the stale architecture claim that external textures, models, and decoded
audio lack lifecycle coverage. Document what the three accepted generic
services actually own now, while clearly retaining live family asset records,
format/playback adapters, preload composition, and live consumer binding as
future work.

Write for a future reader from the current software state. Do not narrate the
rollout or claim that an external production asset is currently bound.

### Allowed files

- `docs/ARCHITECTURE.md`
- `HANDOFF.md`, only Packet ASSET-DOC-A Results and Questions / Blockers

### Required content

- Add concise ownership-table entries for:
  - `ExternalTextureAssetService`: injected image acquisition, deduplicated
    disposable texture resources, bounded ownership, identity-safe fallback,
    cancellation, and image/texture release;
  - `ExternalAudioAssetService`: validated fetch/decode, identity-safe
    deduplication/fallback, bounded true-LRU decoded resources, abort, release,
    and aggregate cleanup failures;
  - `ExternalModelAssetService`: injected fetch/source-release/parse/clone and
    instance/template disposal, identity-safe fallback, bounded template
    ownership with clone leases and deferred eviction, cancellation, and
    aggregate cleanup failures.
- Update the current legacy-exceptions and staged-migration text to distinguish
  completed generic lifecycle foundations from missing concrete family
  records, format/playback adapters, asynchronous preload/composition,
  initialization-failure teardown, and live texture/model/audio consumers.
- Preserve the established separation: manifests/content own logical identity
  and provenance; generic services own loading/cache/lifecycle; family adapters
  map logical events/assets to loaded resources; runtime consumers own live
  nodes/instances; composition owns preload and teardown.
- State that current procedural providers remain the live fallbacks. Do not
  invent asset URLs, source provenance, formats, or support claims.

### Explicitly forbidden

- Source code, tests, TODO, AGENTS, package/config/lockfiles, external assets,
  vehicle work, dependencies, commits, branches, pushes, broad documentation
  cleanup, or rollout-history prose.

### Validation

Inspect the three accepted service implementations and tests before writing,
then run:

```sh
git diff --check
npm test
npm run build
git status --short --branch
```

No browser check is required for a documentation-only packet.

### Results

- Status: ACCEPTED after independent review.
- Scope completed: Documented the accepted generic external texture,
  decoded-audio, and format-neutral model lifecycle foundations in the
  current-state architecture.
- Scope deliberately left incomplete: Concrete family external-asset records,
  format/playback adapters, preload composition, initialization-failure
  teardown, and live texture/model/audio consumers remain future integration
  work; procedural providers remain the live fallbacks.
- Files changed: `docs/ARCHITECTURE.md`; this packet's Results.
- Ownership documentation changed: Content/manifests retain logical identity
  and provenance; generic services own loading/cache/lifecycle; future family
  adapters, runtime consumers, and composition retain their respective binding,
  live-instance, and preload/teardown ownership.
- `git diff --check`: passed with no output after the final Results update.
- Full `npm test`: passed 82/82 tests.
- `npm run build` and warnings: passed; 733 modules transformed; largest chunk
  430.43 kB; no build warnings.
- Remaining review points: Confirm the present-tense integration boundary does
  not imply any live external production asset binding.
- Independent review: APPROVE. The reviewer matched every lifecycle,
  cancellation, LRU/lease, release, and aggregate-cleanup claim to the service
  implementations; confirmed procedural providers remain live; and found no
  invented live binding, format, source, or provenance claim.

### Questions / Blockers

Record blockers here and stop.

---

## Packet TERRAIN-SWEEP-A: deterministic swept projectile/terrain contact

### Status

ACCEPTED after revision and independent rereview. The bounded TODO child is
integrated; broader terrain/material/deformation work remains incomplete.

### Goal

Replace the current projectile terrain endpoint test with a deterministic,
bounded segment-versus-height-field sweep. A projectile whose segment crosses
an intervening ridge must resolve the earliest terrain contact even when the
segment endpoint is above ground.

This is one first-order height-field collision slice. It does not add terrain
deformation, craters, material response, ricochet, foliage collision, structure
behavior, or new map data.

### Allowed files

- `src/game/BallisticsSystem.js`, only terrain sweep helpers and
  `detectImpact()` terrain-candidate integration
- `test/realism.test.js`, only behavioral terrain-sweep coverage
- `HANDOFF.md`, only Packet TERRAIN-SWEEP-A Results and Questions / Blockers

If another production or test file is required, stop and identify the exact
seam. Preserve all concurrent dirty work.

### Authoritative behavior

- `BallisticsSystem` remains the only owner of projectile/terrain collision.
  It consumes only the injected `terrain.getHeightAt(x, z)` sampler.
- Search the complete projectile segment with a named, metre-scale bounded
  sampling policy and deterministic fixed refinement. Label the finite
  sampling resolution as a renderer-independent collision approximation.
- Resolve the first transition from projectile-above-terrain to
  projectile-at-or-below-terrain. Refine that bracket deterministically and
  return the terrain point, segment distance, and enough stable metadata for
  tests to identify the approximation policy.
- A projectile starting at or below terrain resolves at segment distance zero.
  A zero-length segment and a segment that never reaches terrain remain safe.
- Feed terrain through the existing common `consider()` path. Preserve
  earliest-hit ordering against infantry, vehicles, structures, and building
  sections. Existing building tie precedence remains unchanged.
- Do not retain terrain objects or add persistent projectile fields. Existing
  `CombatSystem` impact-time re-integration, telemetry, removal, VFX, and
  capture/restore remain the consumers.
- Avoid unbounded iteration, adaptive behavior based on wall-clock/frame count,
  randomness, and per-sample Three.js allocations.

### Behavioral acceptance

- A fast segment crossing a synthetic ridge resolves the first rising-face
  contact even though both endpoints are above terrain.
- The returned point lies on the projectile segment in X/Z and on the sampled
  terrain in Y within the named refinement tolerance.
- A nearer unit/building hit still wins; nearer terrain blocks a later target.
- Equivalent coarse and bounded projectile updates produce the same terminal
  terrain impact telemetry within the explicit collision/refinement tolerance.
- Capture immediately before a future terrain impact, restore, and replay
  produce deep-equal combat state and impact telemetry without new snapshot
  fields.
- Flat-terrain endpoint behavior remains covered.

Tests must execute the public `BallisticsSystem` or `CombatSystem` behavior.
Do not substitute source-text assertions.

### Explicitly forbidden

- `CombatSystem.js`, `test/combat-rollback.test.js`, terrain/map/building files,
  vehicle files, render/UI files, package/config/lockfiles, dependencies,
  vehicle collision/armor behavior, structure collision, terrain deformation,
  crater state, ricochet, broad cleanup, commits, branches, or pushes.
- Changing projectile integration, gravity, drag, damage, telemetry schema,
  impact priority outside the terrain candidate, or the existing building tie
  rule.
- Claiming mathematically continuous height-field collision beyond the
  explicitly bounded sampling policy.

### Validation

The read-only scout reproduced the pre-edit defect: a segment from
`(0, 10, 0)` to `(10, 9.6076, 0)` crossing a synthetic 12 m ridge at
`x = 4..6` returned no impact.

Run:

```sh
node --test test/realism.test.js
node --test test/realism.test.js test/combat-rollback.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

Because live projectile behavior changes, record browser URL, mode, backend,
`data-game-status`, and console errors. A server bind failure, missing browser,
device loss, or blank runtime is an environment blocker, not a pass.

### Coordinating TODO after approval

Keep `Add terrain and structure collision to projectile sweeps` unchecked. Add
one completed child describing only deterministic bounded swept height-field
terrain contact and retain any remaining structure/material/deformation work.

### Results

- Status: ACCEPTED after revision and independent rereview; the coordinator
  added the bounded TODO child.
- Scope completed: replaced endpoint-only terrain detection with a deterministic
  bounded full-segment height-field sweep. It samples at a named 0.25 m target
  spacing (maximum 512 samples), refines the first above-to-at/below crossing
  with 12 fixed bisections, and returns stable model, actual capped spacing,
  spacing-derived refinement-distance tolerance, sample, refinement, and
  approximation metadata through the existing impact candidate.
- Scope deliberately left incomplete: terrain deformation, craters, material
  response, terrain ricochet, foliage/structure collision, new map data, and
  any mathematically continuous height-field claim remain out of scope.
- Files changed: simulation: `src/game/BallisticsSystem.js`; tests:
  `test/realism.test.js`; docs: this Results section only.
- Authoritative state or ownership changed: `BallisticsSystem` remains the
  sole projectile/terrain collision owner and queries only injected
  `terrain.getHeightAt(x, z)`. `CombatSystem` consumes the existing hit point
  and distance without a new persistent projectile field, telemetry schema, or
  capture/restore version.
- Focused baseline: `node --test test/realism.test.js` passed 1/1; the required
  paired baseline with `test/combat-rollback.test.js` passed 2/2. The pre-edit
  ridge repro returned no impact as specified by the packet.
- Focused final after revision: `node --test test/realism.test.js
  test/combat-rollback.test.js` passed 2/2 files. Added public behavioral
  coverage for a ridge with clear endpoints, explicit flat-terrain endpoint
  contact, genuinely start-below, nonzero-clear, and zero-length safety, nearer
  infantry/building precedence, nearer terrain blocking a later building,
  capped spacing/tolerance metadata, coarse/bounded partition tolerance, and
  snapshot/restore replay.
- Full `npm test`: passed 82/82 test files.
- `npm run build` and warnings: passed; 733 modules transformed; largest chunk
  430.43 kB; no warnings.
- `git diff --check`: passed with no output after the implementation.
- Browser/runtime evidence: BLOCKED. Both `http://127.0.0.1:5173/` and `:5174/`
  refused connection; no browser/devtools connector is available; local
  `npm run dev -- --host 127.0.0.1` failed with `listen EPERM` on port 5173.
  No ready, backend, console, or live-ridge impact claim is made.
- Remaining risks and review points: the height-field contact is explicitly a
  bounded sampling approximation; terrain features narrower than a sampled
  interval can remain unresolved. Review the fixed first-crossing semantics and
  confirm future terrain-detail work does not turn this metadata into a terrain
  material or deformation authority.
- First independent review: REVISE. The reviewer found missing explicit
  flat-endpoint and nonzero-clear evidence, a start-at-ground rather than
  start-below case, and a hardcoded tolerance that ignored the 512-sample cap.
  This revision adds those behavioral cases and exposes
  `terrainSweepRefinementToleranceMeters` as actual candidate spacing divided
  by the fixed 12 refinement iterations; point and partition assertions consume
  that metadata.
- Independent rereview: APPROVE. The reviewer confirmed every prior blocker
  resolved, reproduced capped-sweep convergence within the reported tolerance,
  retained building tie precedence, and found no new scope, ordering,
  rollback, allocation, or bounded-performance issue.

### Questions / Blockers

Record blockers here and stop.

---

## Packet RELAY-A: deterministic voice/radio command delay

### Status

ACCEPTED after revision and independent rereview. The bounded TODO child is
integrated; richer command-delay work remains incomplete.

### Goal

Replace same-step VOICE/RADIO contact relay with one deterministic,
rollback-safe report delay. DIRECT observations remain immediate to their
source unit. SOUND reports remain on their separate existing path.

This slice models only the delay between a newly acquired direct observation
and its first same-faction voice/radio report. It does not model orders,
hierarchy, acknowledgements, false reports, acoustic propagation, or repeated
live tracking updates.

### Allowed files

- `src/simulation/observation/CommunicationRelayQueue.js` (new), if a pure
  bounded queue helper keeps timing/state ownership out of the adapter
- `src/game/SpottingSystem.js`, only direct-observation episode metadata,
  VOICE/RADIO enqueue/delivery, and capture/restore versioning
- `test/spotting-system.test.js`, only delayed-relay behavioral coverage
- `test/sound-contacts.test.js`, only the two hard-coded spotting snapshot
  version assertions required by the version-3 capture schema
- `HANDOFF.md`, only Packet RELAY-A Results and Questions / Blockers

The coordinator owns the TODO child after approval. Preserve the accepted
SOUND-A, crew-observation, AMMO, and every unrelated dirty hunk.

### Authoritative timing/state contract

- Add explicit positive default delays for VOICE and RADIO with one clear
  gameplay-approximation label in settings/state/tests. Do not claim a
  historical timing source.
- Treat one transition from not-directly-visible to directly visible as one
  report episode. Compute its acquisition time inside the current simulation
  interval from prior aim/acquisition progress and the deterministic required
  acquisition duration, rather than blindly using the frame end.
- Snapshot the observed target position, target soldier ID, source soldier ID,
  source unit ID, target unit ID, episode sequence, channel, confidence, and
  acquisition time for the report. Later target motion cannot rewrite a
  queued report.
- Keep at most one pending report and one delivered episode watermark per
  stable sender/receiver/target/channel route. Repeated frames in one direct
  visibility episode cannot grow the queue or repeatedly refresh the
  recipient.
- Stable IDs and episode integers own identity; do not retain unit/person
  object references.
- Enqueue from the same snapshotted direct-source set used today, so a
  delivered relay can never chain onward in the same step.
- Deliver at exact `acquiredAt + channelDelay`. A coarse step crossing both
  acquisition and delivery may deliver in that step, but the delivered
  contact must be immediately decayed/grown from its exact due time to the
  current simulation time so it matches equivalent smaller steps.
- Before delivery, re-resolve stable unit IDs and revalidate current
  same-faction voice/radio eligibility, living endpoints/operators, command
  net, and radio condition through the existing communication predicates.
  Invalid/missing routes cancel without publishing a contact. Do not
  revalidate target visibility; this is a last-known report.
- Direct contacts continue to beat relayed contacts through existing
  precedence. VOICE still precedes RADIO when both paths are available.

### Rollback and compatibility

- Bump spotting capture state to version 3. Capture the bounded pending queue,
  delivered watermarks, observation episode sequence/acquisition snapshot, and
  all nested positions as deep plain data in stable lexical order.
- Restore versions 1 and 2 with empty pending/delivered relay state and safe
  defaults for new observation metadata.
- A mid-delay snapshot, restore, and replay must deliver at the same exact
  simulation time and produce byte-deep-equal spotting state.
- Equivalent whole and partitioned time, plus reversed unit insertion order,
  must produce deep-equal observations, queue/watermarks, and public contacts.

### Behavioral acceptance

- Sender receives DIRECT at acquisition; receiver receives nothing before the
  full selected channel delay and the relay exactly at its boundary.
- Voice-boundary and radio-net/operator/damage rules remain unchanged apart
  from delay.
- Endpoint loss before delivery cancels the report. A later new acquisition
  episode may enqueue normally.
- One visibility episode yields at most one delivery per stable route.
- The delivered position is the acquisition snapshot, not the target's later
  exact position.
- Relayed contact confidence and uncertainty reflect elapsed time after a
  coarse due-boundary crossing exactly as partitioned steps do.
- SOUND contact production, displacement, decay, precedence, capture, and
  lack of same-step relay remain unchanged.
- Relayed contacts still cannot authorize precision targeting.

### Explicitly forbidden

- `CommunicationNetwork.js`, `ContactState.js`, `SoundContacts.js`,
  `CombatSystem.js`, `GameApp.js`, UI/minimap/rendering, content, scenarios,
  package/config/lockfile, dependencies, or vehicle files.
- Command/order delay, multi-hop relay, repeated tracking reports during one
  episode, random false reports, target-position polling at delivery, unbounded
  event history, wall clock, randomness, commits, branches, or pushes.

### Validation

The read-only scout recorded this baseline:

```sh
node --test test/spotting-system.test.js test/sound-contacts.test.js
```

It passed 2/2 files. Final:

```sh
node --test test/spotting-system.test.js \
  test/sound-contacts.test.js \
  test/minimap-contacts.test.js \
  test/combat-rollback.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

Run a browser ready/backend/console check because the live authoritative
spotting path changes. No new visual control is required.

### Coordinating TODO after approval

Keep the spotting parent and richer-model child unchecked. Add one completed
child describing only deterministic first-report VOICE/RADIO delays with
rollback. Retain richer concealment, acoustic propagation, identification,
false reports, hierarchy, acknowledgements, and broader command delay.

### Results

- Status: ACCEPTED after revision and independent rereview; the coordinator
  added the bounded TODO child.
- Scope completed: replaced same-step VOICE/RADIO sharing with deterministic
  first-report delays; added exact within-step acquisition snapshots, stable
  unit/target episode identity, bounded pending routes and delivered
  watermarks, endpoint revalidation, due-time decay, and version-3 rollback.
  Version 3 now also captures/restores the authoritative fractional clock
  accumulator, with only machine-epsilon drift normalized at canonical time
  boundaries. DIRECT and SOUND contacts retain their separate immediate paths.
- Scope deliberately left incomplete: repeated tracking reports within one
  visibility episode, orders, hierarchy, acknowledgements, multi-hop relay,
  acoustic propagation, identification quality, false reports, and broader
  command delay remain future work.
- Files changed: simulation:
  `src/simulation/observation/CommunicationRelayQueue.js`; adapter:
  `src/game/SpottingSystem.js`; tests: relay-only additions in
  `test/spotting-system.test.js` plus the two authorized version-3 assertions
  in `test/sound-contacts.test.js`; docs: this Results section. The coordinator
  has not updated `TODO.md` pending review.
- Authoritative state: `SpottingSystem` owns one unit/target direct-visibility
  episode with exact acquisition time and frozen position/source snapshot.
  Its version-3 state owns both canonical public time and the fractional
  `timeAccumulator` that determines future fixed-step advancement.
  `CommunicationRelayQueue` owns at most one pending report and one delivered
  episode watermark per stable sender/receiver/target/channel route. Default
  voice and radio delays are respectively 1.5 s and 3 s and are explicitly
  labeled `first-report voice/radio delay gameplay approximation v1`.
- Focused baseline: the read-only scout and worker each passed
  `test/spotting-system.test.js test/sound-contacts.test.js`, 2/2 files.
- Focused final: the exact four-file command passed 4/4 files before the
  rollback-clock revision. After the final revision,
  `node --test test/spotting-system.test.js test/sound-contacts.test.js`
  passed 2/2 files, and running the same files without process isolation
  passed 24/24 named tests.
  Coverage includes due boundaries, endpoint loss, one-shot episodes,
  acquisition-position freezing, exact coarse-step decay, 4 s whole versus
  240 x 1/60 s byte-deep equality with reversed unit order, a fixed-step 30 Hz
  mid-delay snapshot/replay that preserves sub-nanosecond clock state, and
  version-1/version-2 compatibility.
- Full `npm test`: passed 82/82 test files before the narrow rollback-clock
  revision; the rereview correction requested focused relay/SOUND validation.
- `npm run build` and warnings: passed before the narrow rollback-clock
  revision; 733 modules transformed; largest chunk 430.43 kB; no build warning.
- `git diff --check`: passed with no output after the final revision.
- Browser/runtime: BLOCKED. Starting Vite on `127.0.0.1:5173` in the sandbox
  failed with `listen EPERM`; no ready/backend/console claim is made.
- Final branch/worktree status: `main...origin/main`; no commit, push, or
  branch change. RELAY-A paths coexist with preserved accepted, concurrent,
  and user-owned changes.
- Remaining risks: the timing values are gameplay approximations, not
  historical command timings. This first slice intentionally sends only the
  first report in a continuous direct-visibility episode and cancels rather
  than reroutes a report if its selected voice/radio channel becomes invalid.
- Independent rereview: APPROVE. The reviewer reproduced the adversarial
  30 Hz replay, rejected invalid accumulator states, confirmed exact delivery,
  whole-versus-partitioned and reversed-order equality, version-1/version-2
  compatibility, bounded queue behavior, the authorized SOUND schema edits,
  and a clean four-file focused gate.

### Questions / Blockers

Record blockers here and stop.

---

## Packet NAV-A: ordinary infantry obstacle-graph commands

### Status

AUTHORIZED for one non-vehicle deterministic-navigation worker. This packet
routes ordinary infantry movement commands through the existing static
visibility graph. Fill only Results and Questions / Blockers, then stop for
independent review.

### Goal

When a non-setup infantry `MOVE_*` command is issued, expand the command into
the deterministic bridge/static-obstacle path already owned by
`StaticCollisionWorld.getNavigationPath()`. Preserve the requested order type
on every inserted waypoint and retain the exact clicked destination.

This is an infantry command-planning slice. It does not change collision
resolution, individual pathfinding, building entry, vehicles, or simulation
state ownership.

### Allowed files

- `src/game/CommandSystem.js`, only the ordinary post-setup infantry
  `MOVE_*` branch
- `test/command-navigation.test.js` (new)
- `HANDOFF.md`, only Packet NAV-A Results and Questions / Blockers

The coordinator owns the conservative TODO child after approval. Inspect all
allowed paths and preserve the concurrent AMMO, MODEL, AUDIO, accepted packet,
and user-owned infantry-render work.

### Required behavior

- Call the injected active unit's existing
  `collisionWorld.getNavigationPath()`; do not import or construct a world.
- Route from the last still-pending waypoint when appending a command, or from
  the current unit position when no pending waypoint remains.
- Pass the infantry collision radius and mover type. Supply enough stable
  waypoint clearance that the current formation cannot cut back through the
  obstacle when the anchor accepts a corner early; derive this from the
  injected unit's living formation offsets rather than a hidden constant.
- Append every returned path point in order, excluding any start duplicate.
  Every point retains the selected `MOVE`, `QUICK`, `FAST`, `HUNT`, or other
  existing infantry order type. The final waypoint preserves the clicked
  destination and its Y coordinate; intermediate points use injected terrain
  movement height, falling back to terrain height and then the click height.
- A direct unobstructed path remains one waypoint.
- A wall-crossing path contains deterministic corner waypoints and reaches the
  original destination. Repeating from the same state produces identical
  points.
- A river-crossing path retains the existing bridge stages.
- Appending a second command routes from the pending tail and does not delete
  the first command.
- A fully completed old queue retains current `Unit.addWaypoint()` cleanup
  behavior and starts the new route from the live unit position.
- Setup-phase teleport remains immediate and never calls the path planner.
- Building click/floor-selection delegation remains prior to ordinary routing;
  accepted building orders are not expanded here.
- Units without an injected path API, and every vehicle/structure command,
  retain the current direct-waypoint behavior.
- Expanded waypoints use the existing `Unit` capture/restore path without new
  persistent fields.

### Explicitly forbidden

- `StaticCollisionWorld.js`, `Unit.js`, `GameApp.js`,
  `BuildingInteractionSystem.js`, scenario/map/content files, rendering beyond
  existing command overlays, package/config/lockfile, dependencies, or
  vehicle files.
- Vehicle footprint/longitudinal routing, reverse steering, unit separation,
  dynamic obstacles, individual-soldier planners, new route authority, or
  copying visibility-graph logic.
- Altering setup validation, clearing the queue on ordinary append, changing
  order semantics, commits, branches, or pushes.

### Validation

Baseline already recorded by the read-only scout:

```sh
node --test test/deployment-zones.test.js test/static-collision.test.js
```

It passed 2/2 files. Final:

```sh
node --test test/command-navigation.test.js \
  test/deployment-zones.test.js \
  test/static-collision.test.js \
  test/wego-manager.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

Run a browser check because this changes a live command path. Report URL,
mode, backend, `data-game-status`, console errors, and an ordinary infantry
route around one visible wall, or report the exact environment blocker.

### Coordinating TODO after approval

Keep the broad navigation parent unchecked. Add one completed child describing
only deterministic obstacle-graph expansion for ordinary infantry commands.
Retain unit separation, vehicle reverse maneuvers, dynamic navigation, and
wreck settling as incomplete.

### Results

- Status: ACCEPTED after third independent review and integrated validation.
- Scope completed: ordinary post-setup infantry `MOVE_*` commands now expand
  through the injected static-collision navigation path. They route from the
  pending tail or live position, retain the selected order type, use the
  maximum living formation offset plus the existing 0.8 m anchor
  early-acceptance tolerance as waypoint clearance, ground intermediate points
  through terrain movement height, and retain the exact clicked final point.
- Scope deliberately left incomplete: vehicle/reverse routing, dynamic
  obstacles, individual soldier planning, unit separation, building transit,
  collision resolution, and new route ownership remain out of scope.
- Files changed: simulation-command adapter: `src/game/CommandSystem.js`;
  tests: `test/command-navigation.test.js`; docs: the coordinator-added NAV-A
  child in `TODO.md` and this Results section.
- Authoritative ownership: `StaticCollisionWorld.getNavigationPath()` remains
  the sole route planner. `CommandSystem` only converts its ordered X/Z output
  into existing unit waypoints; `Unit` retains waypoint queue and rollback
  ownership.
- Focused baseline: scout command `node --test test/deployment-zones.test.js
  test/static-collision.test.js` passed 2/2 files. Worker rerun passed 2/2.
- Focused final after revision: `node --test test/command-navigation.test.js
  test/deployment-zones.test.js test/static-collision.test.js
  test/wego-manager.test.js` passed 4/4 files.
- Full `npm test`: the coordinator's final stabilized integrated run passed
  82/82 test files.
- `npm run build` and warnings: the coordinator's final stabilized build
  passed; 733 modules transformed, largest chunk 430.43 kB, and no warning.
- `git diff --check`: passed with no output after the final edit.
- Browser/runtime: BLOCKED. Both `http://127.0.0.1:5173/` and `:5174/` refused
  connection; no browser/devtools connector is available; local `npm run dev
  -- --host 127.0.0.1` failed with `listen EPERM` on port 5173. No ready,
  backend, console, or visible-wall route claim is made.
- Final branch/worktree status: `main...origin/main`; no commit, branch, or
  push. NAV-A changes coexist with preserved concurrent packet work.
- Remaining risks: this packet relies on the current planner contract that
  returned routes include the goal and exclude the start. The empty-route
  fallback guards an unavailable planner result. Behavioral coverage verifies
  direct routes, deterministic wall corners, all six living QUICK formation
  goals at early acceptance, queue appends, completed-queue cleanup including
  empty-route fallback, vehicle/no-API fallbacks, and setup bypass; browser
  verification remains required in an environment that can bind a dev server
  and attach a real browser.
- First independent review: REVISE. It identified missing clearance for the
  existing 0.8 m `Unit` waypoint acceptance and an empty-route case that added
  no waypoint. This revision adds a locally named and documented tolerance to
  the injected graph clearance, exercises a live six-man formation against a
  radius-expanded wall at the early-acceptance boundary, and falls back to the
  exact clicked waypoint when the planner returns an empty array.
- Second independent review: REVISE. It identified that a same-X/Z fallback
  destination was still filtered as a start duplicate. This revision computes
  final-destination identity before filtering, skips only non-final start
  duplicates, and uses a real empty `StaticCollisionWorld` regression with a
  completed old queue, live `[2, 1, 3]`, exact clicked `[2, 7, 3]`, retained
  `FAST` order, and reset waypoint index.
- Third independent review: APPROVE. The reviewer independently reproduced
  the exact same-X/Z completed-queue case, verified non-final start duplicates
  remain omitted, reran the 4/4 focused gate, and found no remaining NAV-A
  scope, ownership, or behavioral blocker.

### Questions / Blockers

Record blockers here and stop.

---

## Packet TERRAIN-A: irregular field and road surface polygons

### Status

AUTHORIZED for one non-vehicle map/presentation worker. Replace only the
provisional Stonne field and road rectangles with validated scenario-authored
texture-space polygons. Fill Results and Questions / Blockers, then stop for
independent review.

### Goal

Add a generic plain-data polygon shape for visual surface layers, render it
deterministically through the injected France 1940 terrain-surface provider,
and use it for irregular Stonne field boundaries plus the north/south road.

This packet deliberately leaves riverbank material ownership for a later
slice because bank geometry/elevation alignment requires a separate contract.

### Allowed files

- `src/maps/MapDescriptor.js`, only surface-layer shape validation
- `src/maps/france/stonne.js`, only replacing existing field/road rectangles
  with authored texture-space polygons
- `src/content/france1940/render/France1940TerrainSurfaceProvider.js`, only
  generic deterministic polygon filling and a behavioral test seam
- `test/map-descriptor.test.js`, only surface-shape assertions
- `test/terrain-asset-provider.test.js`, only polygon drawing/ownership
  assertions, or `test/terrain-surface-shapes.test.js` (new) if separation is
  clearer
- `HANDOFF.md`, only Packet TERRAIN-A Results and Questions / Blockers

The coordinator owns the TODO child after approval. Preserve every concurrent
packet and the user-owned infantry-render changes.

### Schema and validation

- Preserve the existing renderer-neutral, plain-data, deep-frozen map
  descriptor and texture-pixel coordinate contract.
- Each visual layer declares exactly one shape: legacy `rect` or new
  `polygon`. Reject a mixed or missing shape.
- A polygon is an array of at least three finite `[u, v]` pairs. Every point
  lies inside the declared texture resolution, consecutive vertices differ,
  and the closing edge is implicit.
- Reject zero-area polygons and self-intersection between non-adjacent edges.
  Accept clockwise or counter-clockwise winding; do not silently reorder
  scenario data.
- Preserve stable layer IDs, explicit `visualOnly: true`, kind, color,
  uniqueness, and deep freeze. Do not add simulation/collision authority.
- Keep legacy rectangles valid for other injected maps, but no production
  Stonne field or road remains rectangular data after this packet.

### Rendering and map acceptance

- The provider fills layers strictly in descriptor order.
- Rectangles retain existing `fillRect` behavior.
- Polygons use Canvas 2D `beginPath`, one `moveTo`, ordered `lineTo` calls,
  `closePath`, and one `fill`, with the layer color set before drawing.
- Expose the smallest injected/pure drawing seam needed for Node behavioral
  tests; do not use source-string assertions and do not make a canvas or DOM
  object authoritative.
- Author all three existing Stonne fields as visibly irregular polygons rather
  than disguised four-corner rectangles.
- Author the existing north/south road as one bounded polygon with a readable
  non-rectangular alignment. Preserve its ID, kind, color, and layer order.
- Texture/world mapping remains the existing terrain material UV mapping.
  `TerrainBuilder`, river geometry, elevation, deployment, collision, and
  navigation do not change.
- Existing surface materials and texture/material disposal remain idempotent
  and owned by the provider.

### Explicitly forbidden

- `TerrainBuilder.js`, terrain collision/elevation, river/bridge geometry,
  bank materials, foliage, structures, scenarios, simulation, UI, package
  files, dependencies, or any vehicle file.
- New image assets, external services, shader/node-material work, UV remapping,
  random procedural boundaries, collision derived from texture pixels, or a
  broad provider rewrite.
- Marking the broad environmental TODO complete, commits, branches, or pushes.

### Validation

The read-only scout recorded:

```sh
node --test test/map-descriptor.test.js \
  test/terrain-asset-provider.test.js \
  test/terrain-fidelity.test.js
```

Baseline passed 3/3 files. Final:

```sh
node --test test/map-descriptor.test.js \
  test/terrain-asset-provider.test.js \
  test/terrain-surface-shapes.test.js \
  test/terrain-fidelity.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

If the worker extends an existing test rather than creating
`terrain-surface-shapes`, omit that nonexistent file and report the exact
command. Browser validation is required: report URL, mode, backend,
`data-game-status`, console errors, and visual confirmation that the field and
road boundaries are non-rectangular, or the exact environment blocker.

### Coordinating TODO after approval

Keep the environmental-fidelity parent and broad surface child unchecked. Add
one completed child describing only validated scenario-authored irregular
field/road polygons. Retain riverbank materials and any future surface layers.

### Results

- Status: ACCEPTED after independent review.
- Scope completed: added an exact-one-of legacy `rect` or new `polygon`
  surface-shape contract; finite texture-bounded points, distinct closing and
  consecutive vertices, nonzero area, and non-adjacent edge-intersection
  validation; deterministic ordered Canvas path filling; three irregular
  Stonne field polygons; and one irregular north/south road polygon.
- Scope deliberately left incomplete: riverbank materials, new surface kinds,
  UV remapping, terrain geometry/elevation, collision, navigation, and the
  broad environmental-fidelity TODO remain unchanged. The coordinator owns the
  narrow TODO child after approval.
- Files changed: data/schema: `src/maps/MapDescriptor.js`,
  `src/maps/france/stonne.js`; rendering:
  `src/content/france1940/render/France1940TerrainSurfaceProvider.js`; tests:
  `test/map-descriptor.test.js`, `test/terrain-surface-shapes.test.js`; docs:
  the coordinator-added TERRAIN-A child in `TODO.md` and this Results section.
- Authoritative ownership: the deeply frozen renderer-neutral map descriptor
  remains the sole owner of ordered texture-pixel surface shapes. The provider
  only projects those records into a Canvas texture and retains sole,
  idempotent ownership of its materials and textures. No simulation or
  collision authority changed.
- Focused baseline: `node --test test/map-descriptor.test.js
  test/terrain-asset-provider.test.js test/terrain-fidelity.test.js` passed
  3/3 files before edits.
- Focused final: `node --test test/map-descriptor.test.js
  test/terrain-asset-provider.test.js test/terrain-surface-shapes.test.js
  test/terrain-fidelity.test.js` passed 4/4 files.
- Full `npm test`: the worker run passed 81/82 files. The only failure was the
  concurrent RELAY/SOUND seam: `test/sound-contacts.test.js` still expected
  spotting capture version 2 at lines 120 and 328 while the concurrently
  edited `SpottingSystem` returned version 3 (`3 !== 2`). Every TERRAIN-A test
  passed. The independent reviewer reran the stabilized integrated suite after
  RELAY updated those schema assertions: 82/82 files passed.
- `npm run build` and warnings: passed; 733 modules transformed, largest chunk
  430.43 kB, and no build warnings.
- `git diff --check`: passed with no output.
- Browser/runtime: `http://127.0.0.1:5174/` returned HTTP 200. Headless Firefox
  at 1440 x 900 reached the WEGO command-phase UI but rendered a blank 3D
  viewport. No real browser/devtools bridge was available to read
  `data-game-status`, backend, or console state, so field/road appearance was
  not visually confirmed and this is an environment blocker, not a pass.
- Final branch/worktree status: `main...origin/main`; no commit, push, or
  branch change. Only the listed TERRAIN-A paths were edited; all sibling and
  pre-existing dirty work was preserved.
- Remaining risks: live non-rectangular boundary appearance still needs a
  connected real-browser review. Polygon validation is deterministic and
  quadratic in per-layer vertex count, which is bounded map-load work.
- Independent review: APPROVE. The reviewer exercised both windings,
  concavity, boundary points, mixed/missing shapes, non-finite and out-of-bounds
  vertices, repeated closure, zero area, crossing/touching/overlapping edges,
  deterministic Canvas order, legacy rectangles, deep freeze, and disposal;
  no schema, presentation, ownership, or scope blocker remained.

### Questions / Blockers

- Browser visual acceptance is blocked by the unavailable real-browser/devtools
  attachment and the blank headless-Firefox 3D viewport described above.

---

## Packet AUDIO-A: decoded external-audio lifecycle foundation

### Status

AUTHORIZED for the non-vehicle external-asset worker. This is an unwired,
service-only packet. Fill only its Results and Questions / Blockers, then stop
for independent review.

### Goal

Add one renderer-neutral service that fetches and decodes external audio into
bounded, explicitly owned resources. It must provide the same explicit
throw/unavailable/fallback-URL behavior expected from other external asset
services without changing the live procedural battlefield-audio provider.

This packet establishes lifecycle ownership only. It does not add an audio
manifest record, replace a procedural sound, create or close an
`AudioContext`, or wire external buffers into `SoundEngine`.

### Allowed files

- `src/assets/ExternalAudioAssetService.js` (new)
- `test/external-audio-asset-service.test.js` (new)
- `TODO.md`, only one completed child beneath external
  model/texture/audio loading
- `HANDOFF.md`, only Packet AUDIO-A Results and Questions / Blockers

Inspect the current dirty state before editing. Preserve every accepted packet
and the separate user-owned infantry-render changes.

### Required work order

1. Read `AGENTS.md`, `TODO.md`, `docs/ARCHITECTURE.md`, this packet,
   `ExternalImageAssetService.js`, `ExternalTextureAssetService.js`,
   `BattlefieldAudioContract.js`, `SoundEngine.js`, and their tests.
2. Run the focused baseline:

   ```sh
   node --test test/external-image-asset-service.test.js \
     test/external-texture-asset-service.test.js \
     test/audio-asset-provider.test.js \
     test/sound-engine.test.js
   ```

3. Add behavioral tests that fail before the new service.
4. Implement the smallest service satisfying the contract below.
5. Run focused/full/build/diff gates, fill Results, and stop for review.

### Service authority and injected seams

- The service receives an injected fetch-compatible function and an injected
  asynchronous decoder. Fetch is called with an `AbortSignal`; the returned
  response must expose `ok`, `status`, and `arrayBuffer()`.
- The service owns pending request controllers, decoded-resource cache entries,
  cache eviction, and shutdown. It does not own or close an audio context.
- An optional injected decoded-buffer disposer permits explicit cleanup for
  implementations that need it. Without one, dropping the service's reference
  is the ownership release for browser `AudioBuffer` objects.
- A successful frozen resource exposes kind, requested/resolved URL,
  fallback-use flag, logical/source-pack binding, and its live decoded buffer.
  Resource disposal removes the cache entry, invokes decoded cleanup at most
  once, drops the service-owned buffer reference, and is idempotent.
- The default cache bound is 64 positive-integer entries with true LRU touch on
  hits. Eviction disposes decoded ownership before accepting another entry.

### URL, fallback, and identity contract

- Validate every request before cached or pending reuse.
- Permit relative URLs, `http:`, `https:`, `blob:`, and `data:audio/...`.
  Reject `javascript:`, `file:`, non-audio data URLs, empty URLs, unsafe
  fallback URLs, and invalid cache keys before fetch/decode.
- Missing-asset actions are exactly `throw`, `return-null`, and fallback
  `url`; fallback failure is explicitly `throw` or `return-null`.
- Fetch non-success, byte-read failure, and decode failure all enter the same
  explicit missing-asset policy. A fallback decodes independently. When both
  fail under throw policy, retain both causes in an `AggregateError`.
- Failures and null results are never cached, so a later call can retry.
- Cache-key deduplication is legal only for the same normalized requested URL,
  fallback policy, and logical/source-pack binding. Reject a cached or pending
  key collision instead of silently returning a resource with the wrong
  identity.
- Exact concurrent matches share one fetch, one byte read, one decode, and one
  resource identity.

### Cancellation and disposal contract

- Service shutdown aborts every pending primary or fallback fetch, prevents a
  decoder result from entering the cache, disposes every decoded cache entry,
  clears all ownership maps, and rejects pending callers as disposed.
- A fetch that ignores abort and a decoder that settles after shutdown must not
  leak a resource or repopulate the cache.
- Dispose cached resources and the optional decoded-buffer disposer on a
  best-effort basis: one throwing disposer must not prevent later resources
  from being released. Aggregate failures after all owners were attempted.
- Repeated resource and service disposal is idempotent even after an aggregated
  cleanup error.
- No unbounded byte, error, event, or telemetry history is retained.

### Behavioral acceptance

- Constructor dependency and cache-limit validation.
- Exact concurrent and cached deduplication with retained logical identity.
- Cached and pending URL/policy/binding collision rejection.
- Unsafe primary and fallback URLs rejected without fetch/decode.
- Throw, return-null, fallback success, fallback failure, and retry behavior
  across fetch, byte-read, and decode failures.
- Bounded LRU eviction and explicit per-resource release.
- Disposal during fetch, byte read, and decode; late settlement cannot cache.
- Best-effort cleanup across several resources with combined failure reporting.
- No imports from Three.js, DOM/UI, family content, manifests, scenarios,
  rendering, vehicles, `GameApp`, or `SoundEngine`.

### Explicitly forbidden

- Editing the accepted image/texture services in this packet.
- `AudioContext`, WebAudio graph, source nodes, playback, volume, voice caps,
  procedural synthesis, live provider replacement, or page lifecycle wiring.
- Concrete audio URLs, France 1940 records, manifests/providers, external
  models, textures, vehicles, rendering, package/config changes, dependencies,
  commits, branches, or pushes.
- `Math.random()`, wall-clock identity, or an unbounded cache.

### Validation

```sh
node --test test/external-audio-asset-service.test.js \
  test/external-image-asset-service.test.js \
  test/external-texture-asset-service.test.js \
  test/audio-asset-provider.test.js \
  test/sound-engine.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

No browser claim is required because this service remains deliberately
unwired.

### TODO rule

Keep every parent unchecked. Add one completed child describing only fetched
and decoded external-audio lifecycle ownership. Explicitly retain live family
binding and external-model loading as remaining work.

### Results

- Status: ACCEPTED after second independent review.
- Scope completed: added an unwired external-audio lifecycle service with
  injected fetch and asynchronous decode seams, strict URL and request-identity
  validation, exact pending/cache deduplication, explicit throw/unavailable/
  fallback-URL handling across fetch/read/decode failures, bounded true-LRU
  ownership, abortable shutdown, and optional idempotent decoded-buffer
  cleanup. A shutdown race now retains both the disposed cause and a throwing
  late-buffer cleanup cause without retaining ownership or retrying cleanup.
- Scope deliberately left incomplete: concrete audio URLs and manifests, live
  family/provider binding, `SoundEngine` playback integration, WebAudio context
  or graph ownership, external-model loading, and page lifecycle wiring remain
  later work.
- Files changed: assets: `src/assets/ExternalAudioAssetService.js`; tests:
  `test/external-audio-asset-service.test.js`; docs: the one authorized
  external-audio child in `TODO.md` and this Results section.
- Authoritative ownership: `ExternalAudioAssetService` owns normalized request
  identity, pending primary/fallback request controllers, the in-flight map,
  the 64-entry default LRU, and each cached decoded-buffer reference. Frozen
  resources retain requested/resolved URL, fallback, logical, and source-pack
  identity while their idempotent disposer removes cache ownership and clears
  the live buffer reference. No simulation, rendering, or playback authority
  changed.
- Focused baseline: the required pre-edit four-file command passed 4/4 test
  files.
- Focused final: the required five-file command passed 5/5 test files; the
  AUDIO suite without process isolation passed 19/19 named behavioral tests.
- Full `npm test`: final rerun passed 80/80 test files. One intermediate run
  passed 79/80 while the concurrent MODEL-A worker intentionally had its new
  test present before its new service; rerunning after that test-first window
  closed passed cleanly.
- `npm run build` and warnings: passed; 732 modules transformed; largest chunk
  430.24 kB; no build warning.
- `git diff --check`: passed with no output.
- Final branch/worktree status: `main...origin/main`; no commit, push, or
  branch change. Only the two new AUDIO-A files and the authorized TODO/Results
  hunks were changed by this packet alongside preserved concurrent work.
- Remaining risks: an injected decoder has no generic cancellation primitive,
  so shutdown guards and releases a decoder result that settles late. The
  optional decoded-buffer disposer must be supplied only where dropping the
  browser buffer reference is insufficient; a throwing late disposer is
  attempted once and reported with the shutdown cause. The service remains
  deliberately unwired, and no browser claim is made.
- Independent review: the first verdict was `REVISE` because `loadUncached`
  replaced the late-cleanup `AggregateError` with a plain disposed error. The
  revised path preserves both causes, and the adversarial regression verifies
  one cleanup attempt, empty resource/pending/controller maps, and idempotent
  subsequent service disposal. The second verdict was `APPROVE`; the reviewer
  independently reproduced the prior adversarial case and confirmed the
  ordered disposed and late-cleanup causes.

### Questions / Blockers

None.

---

## Packet MODEL-A: generic external-model lifecycle foundation

### Status

AUTHORIZED for a non-vehicle external-asset worker. This is an unwired,
format-neutral service packet. Fill only its Results and Questions / Blockers,
then stop for independent review.

### Goal

Add a generic external-model acquisition service that deduplicates fetch and
parse work while returning a separately owned model instance to every
consumer. Fetched source, parsed template, and consumer instance are separate
ownership layers with explicit fallback, cancellation, cache, lease, and
disposal behavior.

No concrete model, format-specific loader, family binding, manifest record,
provider, vehicle, or runtime wiring belongs in this packet.

### Allowed worker files

- `src/assets/ExternalModelAssetService.js` (new)
- `test/external-model-asset-service.test.js` (new)
- `HANDOFF.md`, only Packet MODEL-A Results and Questions / Blockers

The coordinator owns any later TODO child. Inspect and preserve every other
dirty file before editing.

### Injected pipeline

The constructor requires:

```js
{
  fetchSource(url, { signal }),
  releaseSource(source),
  parseModel(source.payload, context),
  cloneModel(template),
  disposeInstance(instance),
  disposeTemplate(template),
  disposePipeline,
  maxCachedTemplates,
  missingAssetPolicy
}
```

- `fetchSource` returns `{ payload, resolvedUrl }`; the service releases that
  source exactly once after every parse attempt, including failure and
  shutdown races.
- `parseModel` may be asynchronous and returns one opaque reusable template.
- `cloneModel` returns a distinct consumer instance and must never return the
  template or a previous clone.
- `disposeInstance` owns clone-only state and must not destroy template-shared
  geometry, materials, textures, skeletons, or animation resources.
- `disposeTemplate` releases template/shared resources only after the last
  dependent instance is released.
- `disposePipeline` releases injected parser/loader infrastructure last.
- The generic service imports no Three.js, loader, DOM, family, scenario, or
  runtime module.

### Public handle

Each successful `load()` returns a distinct frozen handle:

```js
{
  kind: 'external-model-resource',
  model,
  requestedUrl,
  resolvedUrl,
  usedFallback,
  assetBinding,
  logicalId,
  sourcePackId,
  dispose()
}
```

Concurrent exact matches share one fetch and one parse but create one clone per
caller. Cached template hits create another clone without fetching or parsing.
Handle disposal is idempotent and decrements exactly one template lease.

### URL, fallback, and identity

- Permit relative, `http:`, `https:`, and `blob:` URLs. Reject empty,
  `javascript:`, `file:`, `data:`, extension, and malformed explicit schemes.
- Validate requested, fallback, and fetch-returned resolved URLs before they
  can be cached or reused.
- Support only `throw`, `return-null`, and fallback `url` with `onFailure`
  `throw` or `return-null`.
- Fallback applies to fetch or parse failure. Cancellation or shutdown never
  starts fallback work.
- When primary and fallback both fail under throw policy, preserve both causes
  in an `AggregateError`.
- Failures and null results leave no cache/pending entry and are retryable.
- Require a non-empty string cache key and copied frozen
  `{ logicalId, sourcePackId }`.
- A cache key represents one normalized requested URL, fallback policy, and
  asset binding. Reject cached or pending identity collisions rather than
  relabeling a template.

### Cache, lease, and disposal

- Use a positive-integer bounded LRU cache for parsed templates and touch on
  successful reuse.
- Eviction removes a template from reusable cache immediately. If live clone
  handles remain, retire it and defer template disposal until the final lease.
- Clone failure does not poison an otherwise valid cached template.
- Track one `AbortController` per pending underlying load.
- First service disposal closes the service and aborts every pending load.
  Late sources/templates are released without cloning or caching.
- Service disposal attempts every active instance, every cached or retired
  template, pending-source cleanup as operations settle, then
  `disposePipeline`. Continue after failures and aggregate only after all
  possible cleanup.
- Repeated handle/service disposal is idempotent, including after an aggregate
  cleanup error. Loads after disposal reject without invoking the pipeline.
- Retain no unbounded source, error, event, or telemetry history.

### Behavioral acceptance

- Validate constructor dependencies and cache bounds.
- Concurrent dedupe: one fetch/parse, distinct clones and handles.
- Cached reuse, identity retention, and fresh per-consumer clones.
- Unsafe requested/fallback/resolved URLs rejected on cold, cached, and
  pending paths without extra pipeline work.
- Conflicting URL, policy, or asset binding under one cache key rejected.
- Throw, return-null, fallback success/failure, parse failure, and retry.
- Source release exactly once across success, failure, fallback, and shutdown.
- Clone failure remains retryable from the cached template.
- True LRU eviction with deferred template disposal while leases live.
- Cancellation during fetch/parse and cleanup of late settlements.
- Best-effort instance/template/source/pipeline cleanup with aggregated errors.
- Source inspection confirms no Three.js, DOM, family, scenario, runtime,
  concrete-model, or vehicle import.

### Explicitly forbidden

- `AssetManifest.js`, manifests, runtime packs, providers, barrels,
  composition, `main.js`, `GameApp`, `ScenarioRuntime`, `Unit`, `UnitFactory`,
  unit/structure factories, or TODO edits by the worker.
- Concrete model URLs/files, GLTF/GLB records, family/model IDs,
  `GLTFLoader`, `SkeletonUtils`, Three.js imports, format adapters, or
  synchronous factory conversion.
- Every vehicle/content-data/visual/calibration file, simulation, UI, world,
  map, scenario, package/config/lockfile, dependency, commit, branch, or push.

### Required baseline and validation

```sh
node --test --test-isolation=none \
  test/asset-manifest.test.js \
  test/external-image-asset-service.test.js \
  test/external-texture-asset-service.test.js \
  test/france1940-visual-factories.test.js
node --test --test-isolation=none \
  test/external-image-asset-service.test.js \
  test/external-texture-asset-service.test.js \
  test/external-model-asset-service.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

No browser check is required because no model is wired into the runtime.

### Coordinating TODO after approval

Keep every external-asset parent unchecked. Add one child describing only the
injected fetch/parse/clone/template-lease lifecycle foundation. Explicitly
retain concrete family binding and live unit/structure integration.

### Results

- Status: ACCEPTED after revision and second independent review.
- Scope completed: added one format-neutral external-model lifecycle service
  with validated request identity, exact fetch/parse deduplication, a distinct
  leased clone per caller, explicit throw/return-null/fallback behavior,
  retryable failures, bounded true-LRU template caching, deferred retirement,
  cancellation, and best-effort ordered shutdown.
- First-review corrections: a parsed-template source-release failure is now a
  cleanup failure that cannot start fallback work or be converted to null.
  Clone-time reentrant shutdown records a late instance-disposal failure for
  both the rejecting load and the service-wide aggregate while retaining
  one-shot cleanup and clearing all ownership maps.
- Scope deliberately left incomplete: no concrete model or URL, format
  adapter, loader, manifest/runtime pack, family provider, unit/structure
  factory conversion, composition, browser lifecycle, or live runtime binding
  was added.
- Files changed: assets: `src/assets/ExternalModelAssetService.js` (new);
  tests: `test/external-model-asset-service.test.js` (new); docs: the
  coordinator-added MODEL-A child in `TODO.md` and this Results section.
- Authoritative ownership: `ExternalModelAssetService` owns one abort
  controller per underlying acquisition, source release after every parse
  attempt, the parsed-template LRU and retired-template leases, each active
  clone handle, and final injected-pipeline disposal. Each frozen handle owns
  one distinct consumer clone; shared template resources remain alive until
  the last dependent handle releases its lease.
- Focused baseline: the required pre-edit four-file command passed 22/22 named
  tests.
- Focused final: the required three-file command passed 27/27 named tests,
  including 14/14 MODEL-A behavioral cases.
- Full `npm test`: final stabilized rerun passed 81/81 test files. The first
  revision run passed 80/81 while the concurrent NAV packet's new
  `command-navigation` assertion was still being corrected; MODEL-A passed in
  both runs.
- `npm run build` and warnings: passed; 732 modules transformed; largest chunk
  430.24 kB; no build warning.
- `git diff --check`: passed with no output.
- Final branch/worktree status: `main...origin/main`; no commit, push, or
  branch change. MODEL-A owns only its two new files and this Results section
  alongside preserved concurrent work.
- Remaining risks: the service deliberately supplies no format adapter.
  Future adapters must keep clone-only disposal separate from template-shared
  geometry, material, texture, skeleton, and animation ownership. No browser
  check was required for this unwired service-only packet.
- Independent review: first verdict `REVISE` for cleanup failures entering
  missing-asset policy and a late clone-disposal failure omitted from shutdown
  aggregation. Second verdict `APPROVE`; adversarial probes confirmed neither
  fallback nor return-null can hide source cleanup, both load and shutdown
  surface late clone cleanup, every owner is attempted once, all maps clear,
  and the 27/27 focused gate passes.

### Questions / Blockers

None.

---

## Packet AMMO-A: deterministic same-squad LMG feed handoff

### Status

AUTHORIZED for a non-vehicle deterministic-simulation worker. Implement one
catalog-driven French and German same-squad support-ammunition handoff, fill
only this packet's Results and Questions / Blockers, and stop for independent
review.

### Goal

Give one explicitly configured assistant gunner a carried support-weapon feed
for one explicitly paired LMG gunner. When both individuals remain eligible
and within configured range for the full deterministic delay, atomically debit
the carrier and credit the gunner's reserve ammunition.

The carried feed is deducted from the gunner's current initial reserve during
scenario instantiation, so total carried weapon ammunition remains conserved.
The handoff never fills a magazine directly.

Cover exactly:

- French assistant gunner to the paired FM 24/29 gunner.
- German assistant gunner to the paired MG 34 gunner.

Load, handoff size, range, and delay are gameplay approximations unless an
accepted source exists; label them as such in data, state, tests, and TODO.

### Allowed production files

- `src/simulation/infantry/InfantryAmmunitionTransfer.js` (new)
- `src/content/france1940/formations.js`, only explicit stable donor/recipient
  support-ammunition allocation records
- `src/scenario/FamilyRegistry.js`, only allocation validation/copying
- `src/scenario/ScenarioRuntime.js`, only resolving a fresh mutable allocation
  into each instantiated roster
- `src/game/SoldierAgent.js`, only individual allocation ownership and deep
  capture/restore
- `src/game/SoldierAI.js`, only stable-ID same-squad coordination
- `src/app/GameApp.js`, only one call after authoritative building transit and
  before spotting/combat so final individual positions decide eligibility
- `HANDOFF.md`, only Packet AMMO-A Results and Questions / Blockers

### Allowed tests

- `test/infantry-ammunition-transfer.test.js` (new)
- `test/family-registry.test.js`, only malformed allocation rejection
- `test/scenario-runtime.test.js`, only fresh/non-aliased resolved allocation
  and conserved initial ammunition assertions
- `test/soldier-ai.test.js`, only same-squad coordination/capture assertions
- `test/realism.test.js`, only existing reload/accepted-shot consumption after
  receiving reserve ammunition if needed

The coordinator owns the TODO child after approval. Inspect each allowed
file's current diff and preserve concurrent user/packet work.

### Authoritative state and sequencing

The carrier `SoldierAgent` owns:

- support weapon ID and remaining carried support rounds;
- stable recipient soldier ID;
- phase and elapsed deterministic transfer seconds;
- configured handoff/range/delay and approximation label copied from family
  data.

The gunner continues to own magazine, reserve, reload, firing, health, and
weapon state. `SoldierAI` coordinates stable IDs but owns no aggregate
ammunition.

Advance exactly once after ordinary movement and authoritative door/stair
transit complete for the simulation step and before spotting/combat.
Eligibility explicitly rejects zero health, `KIA`, and `INCAPACITATED`
participants. Missing/wrong-weapon/out-of-range participants interrupt and
reset progress without losing ammunition.

New nested state is deeply copied through `SoldierAgent` capture/restore and
the existing `SoldierAI.captureRoster()`/`restoreRoster()` path. Legacy
snapshots without the allocation restore safely.

### Data and validation

- Family formation data names stable donor and recipient IDs, recipient weapon
  ID, carried quantity, handoff quantity, range, delay, and approximation
  label. Do not infer by generic role name.
- Registry validation rejects missing/duplicate endpoints, donor=recipient,
  recipient weapon mismatch, invalid weapon reference, non-integral/nonpositive
  quantities, handoff greater than carried load, invalid range/delay, or a
  missing approximation/source label.
- Scenario resolution gives every roster a fresh non-aliased allocation and
  deducts the carrier load from the recipient's initial reserve exactly once.
- The existing canonical weapon record and total `carriedAmmo` do not change.

### Behavioral acceptance

- Initial gunner plus carrier ammunition equals existing weapon
  `carriedAmmo`; no ammunition is created.
- No transfer before full delay; exact atomic debit/credit at completion.
- French and German feed sizes remain distinct.
- Out-of-range, dead, incapacitated, missing, split-away, or wrong-weapon
  participants cannot transfer.
- Interrupted eligibility resets progress without losing ammunition.
- Repeated advancement cannot duplicate one feed.
- Received rounds enter reserve and then follow existing timed reload and
  accepted-shot consumption.
- Equivalent time partitions produce identical transfer/ammunition state.
- Mid-transfer and post-transfer capture/restore deep-copy and replay
  identically; legacy snapshots restore safely.
- A roster lacking the paired recipient retains the carrier's load.
- A door/stair transit that crosses the configured range boundary in the same
  step prevents completion; pre-transit positions cannot decide the handoff.
- One formation member cannot participate in multiple allocations, including
  being a recipient in one and a donor in another.

### Explicitly forbidden

- `src/game/Unit.js`, UI/HUD summaries, rendering, animation, world,
  package/config/lockfile, dependency changes. No `GameApp` change beyond the
  exact post-building/pre-spotting coordination call above.
- Vehicle ammunition, vehicle catalogs/systems/tests, vehicle rendering or
  authoring, SOUND/TEXTURE/CREW/AUDIO/MODEL packet files.
- Cross-unit or split-team resupply, bearer movement AI, arbitrary bearer
  selection, role-name inference, scenario-definition edits, or aggregate
  unit ammunition authority.
- Object-reference targets, randomness, wall clock, direct magazine filling,
  ammunition creation, commits, branches, or pushes.

### Baseline and validation

```sh
node --test test/scenario-runtime.test.js \
  test/soldier-ai.test.js \
  test/wego-manager.test.js \
  test/realism.test.js
node --test test/infantry-ammunition-transfer.test.js \
  test/family-registry.test.js \
  test/scenario-runtime.test.js \
  test/soldier-ai.test.js \
  test/wego-manager.test.js \
  test/realism.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

No browser check is required. `Unit.refreshAmmoSummary()` and split-team
compatibility summaries do not count carrier rounds and remain deliberately
out of scope; do not claim aggregate HUD/split-team correctness.

### Coordinating TODO after approval

Keep the parent unchecked. Add one completed child describing only explicit
same-squad FM 24/29 and MG 34 assistant-gunner feed handoffs with deterministic
delay and rollback. Retain cross-unit resupply, bearer movement, shared feed
objects, split-team handling, and vehicle ammunition as remaining work.

### Results

- Status: ACCEPTED after revision, second independent review, and integrated
  validation.
- Scope completed: added explicit French FM 24/29 and German MG 34
  assistant-gunner carrier allocations, deterministic same-squad proximity
  handoff, reserve-only receipt, interruption/reset behavior, stable-ID
  coordination, and deep capture/restore.
- Scope deliberately left incomplete: cross-unit resupply, carrier movement
  AI, arbitrary bearer selection, shared feed objects, split-team summary
  ownership, vehicle ammunition, UI, animation, and rendering remain later
  work.
- Files changed: data: `src/content/france1940/formations.js`; simulation:
  `src/simulation/infantry/InfantryAmmunitionTransfer.js`; scenario:
  `src/scenario/FamilyRegistry.js`, `src/scenario/ScenarioRuntime.js`;
  integration: `src/game/SoldierAgent.js`, `src/game/SoldierAI.js`,
  `src/app/GameApp.js`; tests:
  `test/infantry-ammunition-transfer.test.js`,
  `test/family-registry.test.js`, `test/scenario-runtime.test.js`; docs: the
  conservative AMMO-A child in `TODO.md` and this Results section.
- Authoritative state: the donor `SoldierAgent` owns a versioned immutable
  transfer record with stable donor/recipient/weapon IDs, remaining rounds,
  phase, elapsed time, configured range/delay/handoff, and approximation
  label. The recipient retains sole ownership of magazine, reserve, reload,
  and firing state. `GameApp` invokes the `SoldierAI` coordinator once after
  ordinary and building-owned individual movement and before spotting/combat.
- Focused baseline: the four-file pre-edit command passed 4/4 test files.
- Focused final: the exact six-file command passed 6/6 files and 61/61 named
  tests. It covers production conservation/isolation, the authoritative update
  sequence including a door/stair range crossing, delay/partition behavior,
  endpoint reuse rejection, eligibility and interruption, existing timed
  reload, split rosters, deep rollback/replay, and legacy snapshots.
- Full `npm test`: the coordinator's final stabilized integrated run passed
  82/82 test files.
- `npm run build` and warnings: the coordinator's final stabilized build
  passed; 733 modules transformed, largest chunk 430.43 kB, and no warning.
- `git diff --check`: passed with no output after final integration.
- Final branch/worktree status: `main...origin/main`; no commit, push, or
  branch change. AMMO-A files are dirty alongside preserved accepted,
  concurrent, and user-owned work.
- Remaining risks: feed quantity, 2 m range, and 3 s handoff are labeled
  gameplay approximations. Aggregate HUD and split-team compatibility
  summaries deliberately do not count the carrier allocation.
- First independent review: `REVISE`. It found that the initial
  `SoldierAI.update` call sampled positions before building transit and that
  registry validation allowed cross-role endpoint reuse. The revision moves
  the one call to the post-building/pre-spotting simulation seam and rejects
  duplicate IDs, donors, recipients, and cross-role endpoints with behavioral
  regressions.
- Second independent review: `APPROVE`. The reviewer reran the 61/61 focused
  gate, independently exercised cross-role endpoint rejection, and found no
  remaining ordering, determinism, rollback, or scope blocker.

### Questions / Blockers

Record blockers here and stop.

---

## Antigravity vehicle-work reservation

The user has reserved further vehicle model, blueprint, running-gear, livery,
and vehicle-visual refit work for Antigravity. Coordinating Codex workers must
not start another vehicle-authoring packet.

Packet H39-A is accepted after independent review:

- focused tests passed 20/20;
- the full suite passed 466/466 at review time;
- both silhouette manifests passed 180/180 and compared byte-for-byte;
- the production build passed without warnings;
- the reviewer found no H39-A blocker.

Only Packet H39-B below is authorized for Antigravity. The inventory after it
is context only, not permission to start the next vehicle.

## Packet H39-B: registered-source H39 contour convergence

### Status

AUTHORIZED for Antigravity after H39-A. Work only this packet and stop for
coordinating review. Do not combine it with supported-track migration.

### Goal

Converge the Hotchkiss H39 hull, driver hood, mudguards, turret, mantlet,
cupola, and gun silhouette against one accepted, directly loadable,
source-registered side/front/top reference while preserving the exact published
4.22 m by 1.85 m by 2.15 m rigid envelope.

The current visual-data extraction is the starting authority. Current URL-only
provenance, inferred stations, and the legacy capsule track are not registered
pixel evidence.

### Required work order

1. Read `AGENTS.md`, `TODO.md`, `docs/ARCHITECTURE.md`, this packet,
   `HotchkissH39VisualData.js`, `HotchkissH39.js`, the R35 reference
   implementation, calibration asset routing, visual evaluators, and all H39
   tests.
2. Inspect every allowed file's current diff. Preserve H39-A and all unrelated
   dirty work.
3. Run and retain a pre-edit 180-record silhouette manifest plus side/front/top
   H39 calibration evidence at high, medium, core, and proxy LOD.
4. Verify source identity, legal calibration use, file hash, view crops, ground
   line, rigid datums, and visible landmarks before changing geometry.
5. Store original source-space pixels beside every derived metre-space datum.
   Label each value exact, source-registered, cross-view inferred, or renderer
   approximation.
6. Change the smallest H39-owned geometry needed for contour convergence.
7. Produce keyed before/after metrics and overlays. Do not update the reviewed
   silhouette baseline.
8. Run all gates, fill this packet's Results, and stop for visual review.

### Allowed files

- `public/assets/blueprints/france1940/hotchkiss-h39-fm30-42.png` (new), only
  if the exact source page/crop and permitted calibration use are recorded
- `src/content/france1940/assets/manifest.js`, only one H39 calibration asset
- `src/content/france1940/render/vehicleVisualBundles.js`, only the exact H39
  calibration binding
- `src/content/france1940/vehicleData/HotchkissH39VisualData.js`
- `src/world/vehicles/HotchkissH39.js`
- `test/asset-manifest.test.js`, only H39 calibration-asset assertions
- `test/hotchkiss-h39-blueprint.test.js`
- `test/vehicle-visual-bundles.test.js`, only H39 assertions
- `test/vehicle-calibration.test.js`, only H39 registration assertions
- `TODO.md`, only one conservative H39 contour-convergence child
- `HANDOFF.md`, only Packet H39-B Results and Questions / Blockers

If correct source routing requires another file, stop and name the exact seam.
Do not silently broaden the allowlist.

### Forbidden

- `TrackedRunningGear.js`, `TrackPathSolver.js`, generic evaluators, generic
  profiles, `VehicleModelEnhancer`, another vehicle, simulation, armor,
  internal layouts, UI, scenarios, package files, or build configuration.
- Moving sprockets, idlers, road wheels, return rollers, links, cleats, or
  bogies; replacing the H39 legacy capsule is Packet H39-C.
- Copying R35 values, using the current mesh or capsule as source evidence, or
  filling a missing view with another vehicle's numbers.
- Treating URL provenance as pixel registration, adding an unlicensed raster,
  inventing precision, or relabeling an inference as measured.
- Updating `test/fixtures/vehicle-silhouette-baseline.json` before coordinating
  overlay review.
- Broad cleanup, dependency changes, commits, branches, or pushes.

### Acceptance

- One stable family asset ID owns the accepted raster and its SHA-256,
  provenance, view coverage, and source-pack identity.
- H39 visual data retains source pixel coordinates, crops, transforms, and
  exact/inferred/approximation labels; generic code contains no H39 values.
- Independent horizontal and vertical registration scales are used when the
  rigid dimensions require them.
- The rigid envelope, ground contact, turret/gun markers, outward winding,
  articulated references, material slots, disposal, and all four LOD contracts
  remain valid.
- Core and proxy retain every source-defining hull, mudguard, turret, cupola,
  mantlet, and gun outline whose absence changes identity.
- Every changed H39 silhouette key is explained by a reviewed source-space
  correction. All 168 non-H39 records remain byte-for-byte unchanged.
- Tests exercise public data/bundle/mesh behavior, not source-string matching.
- The broad H39/Panhard and supported-track TODO parents remain unchecked.

### Validation

```sh
node --test test/asset-manifest.test.js \
  test/hotchkiss-h39-blueprint.test.js \
  test/vehicle-visual-bundles.test.js \
  test/vehicle-calibration.test.js \
  test/vehicle-silhouette-audit.test.js
node scripts/audit-vehicle-silhouettes.mjs "$TMPDIR/h39-b-after.json"
npm test
npm run build
git diff --check
git status --short --branch
```

Also record the browser URL, selected H39 LOD/view, backend,
`data-game-status`, console errors, and side/front/top evidence. A device loss,
missing tab, or bridge timeout is a blocker, not a pass.

### Results

- Status: NOT STARTED
- Accepted source identity, provenance, SHA-256, and view coverage:
- Scope completed:
- Scope deliberately left incomplete:
- Files changed:
- Source-space datums and labels changed:
- Focused baseline:
- Focused final:
- Before/after H39 keyed silhouette differences:
- Non-H39 168-record comparison:
- Full `npm test`:
- `npm run build` and warnings:
- `git diff --check`:
- Browser/runtime evidence:
- Remaining risks and review points:

### Questions / Blockers

Record blockers here and stop.

## Remaining vehicle inventory for later packets

Context only; none of these are authorized by H39-B:

1. Panhard 178: register accepted side/front/top source space, extract its
   remaining renderer-owned shape data, and converge its hull, axle, turret,
   mantlet, cupola, and gun contours.
2. H39 supported-track migration: add vehicle-owned sprocket, idler, six road
   wheel, return-roller, link, and renderer-tension records; feed one solved
   `TrackPathSolver` shape to detail and proxy running gear.
3. Supported-track migrations, one vehicle per packet: SOMUA S35, AMC 35,
   Char B1 bis, Panzer II Ausf. C, Panzer III Ausf. D, Panzer IV Ausf. D,
   Panzer 35(t), and Panzer 38(t).
4. Only after static paths are accepted, couple track shape to authoritative
   suspension travel and track/component damage in a separate deterministic
   simulation packet.
5. Move remaining vehicle geometry/profile ownership out of generic
   `VehicleVisualProfiles.js` and `VehicleModelEnhancer.js` paths into
   vehicle-owned France 1940 data, one output-neutral vehicle packet at a time.
6. Complete review-driven source-outline refits, the provisional Renault D2
   human-review work, vehicle-specific historical liveries/markings/UV atlases,
   damage variants, and deterministic vehicle visual captures as separate
   reviewed packets.

---

## Packet TEXTURE-A: external texture lifecycle foundation

### Status

REVISE after independent review. The external-asset worker may correct only
the validation-order and best-effort-disposal findings below. This remains a
service-only slice; composition and a live URL-backed family texture remain a
later integrator packet.

### Authorized goal

Build an external texture service on the existing
`ExternalImageAssetService`. It must preserve logical asset identity, explicit
fallback behavior, deduplicated loading, and ownership-aware disposal while
turning a loaded image resource into one injected texture resource.

### Allowed files

- `src/assets/ExternalTextureAssetService.js` (new)
- `test/external-texture-asset-service.test.js` (new)
- `TODO.md`, only one indented completed child below the external
  model/texture/audio loading item
- `HANDOFF.md`, only Packet TEXTURE-A Results and Questions / Blockers

Inspect current diffs first. Preserve all other packet changes and doc sections.

### Explicitly forbidden

- Editing `ExternalImageAssetService`, manifests, runtime packs, family assets,
  materials, vehicle/world/render files, composition, `main.js`, `GameApp`,
  package/build config, H39 files, or simulation files.
- Adding a dependency or a concrete Three.js import. Texture creation is
  injected so the service remains testable and renderer-neutral.
- Claiming external models or audio are implemented, or marking the broad
  parent complete.
- Unbounded cache growth, duplicate textures for one cache key, leaked image
  handles, or completions that survive service disposal.

### Required work order

1. Read `AGENTS.md`, `TODO.md`, `docs/ARCHITECTURE.md`, this packet,
   `ExternalImageAssetService.js`, and its tests.
2. Run the focused baseline:

   ```sh
   node --test test/external-image-asset-service.test.js
   ```

3. Add the smallest injected texture lifecycle wrapper and behavioral tests.
4. Run final gates and update only the permitted TODO/results sections.

### Acceptance criteria

- Constructor requires a valid image service and texture factory.
- Same cache key deduplicates in-flight and successful loads.
- Resource identity retains requested/resolved URL, fallback use,
  `logicalId`, and `sourcePackId` from the image binding.
- Unsafe schemes and throw/return-null/fallback-URL behavior remain governed by
  the underlying image service without divergent policy.
- Cached and in-flight cache-key hits cannot bypass validation of a newly
  supplied requested URL.
- A failed load is retryable and never poisons the cache.
- A successful resource owns exactly one injected texture and one image
  resource handle.
- Resource disposal and service disposal are idempotent; texture disposal
  happens exactly once and the image handle is released.
- Service disposal attempts every texture/image resource and always disposes
  the underlying image service even when one disposer throws; it may report
  aggregated failures only after best-effort cleanup completes.
- Disposing during a pending load cancels through the image service and
  disposes any completion that races with shutdown.
- Null fallback results do not invoke the texture factory or enter the cache.
- No Three.js, DOM, family, scenario, or runtime import enters the service.

### Validation commands

```sh
node --test test/external-image-asset-service.test.js \
  test/external-texture-asset-service.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

No browser check is required for this unwired service-only packet.

### Stop condition

Stop if the slice requires modifying the image service, a manifest/provider,
composition, or any file outside the allowlist.

### TODO rule

Keep all external-asset parents unchecked. Add one completed child describing
only the external texture lifecycle service and explicitly retain model/audio
loading plus live family binding as remaining work.

### Results

- Status: ACCEPTED after second independent review.
- Scope completed: Added a renderer-neutral external-texture lifecycle service
  with injected texture creation, cache-key deduplication, bounded LRU
  ownership, image-policy delegation, retry, cancellation, and idempotent
  resource/service disposal. The revision validates every requested URL through
  the image service before cached or pending texture hits and performs
  best-effort aggregate cleanup across all textures, image handles, and the
  owned image service.
- Scope deliberately left incomplete: No manifest, provider, composition,
  family texture, external model, or decoded-audio integration was added.
- Files changed: `src/assets/ExternalTextureAssetService.js` (new);
  `test/external-texture-asset-service.test.js` (new); one permitted child in
  `TODO.md`; this Results section.
- Authoritative ownership changed: The new service owns its injected image
  service, at most 64 cached texture/image pairs by default, and their shutdown
  lifecycle. `ExternalImageAssetService` remains the sole URL-validation and
  missing-asset-policy authority.
- Focused baseline: The original image-service baseline passed 1/1 before
  initial work; the pre-revision focused pair passed 2/2 test files.
- Focused final: `node --test test/external-image-asset-service.test.js
  test/external-texture-asset-service.test.js` passed 2/2 test files; the new
  texture service passed 10/10 named behavioral tests without test isolation.
- Full `npm test`: Final stabilized run passed 76/76 test files. One pre-final
  run caught actively changing concurrent CREW/visual paths and passed 63/76;
  both external-asset tests passed in that run.
- `npm run build`: Passed; 730 modules transformed, no warnings, largest chunk
  428.85 kB.
- `git diff --check`: Passed with no output.
- Final status: `main...origin/main`; no commit, push, or branch change.
  TEXTURE-A owns two untracked implementation/test files plus its permitted
  `TODO.md` and `HANDOFF.md` hunks; other dirty paths are concurrent packets.
- Remaining risks: The texture factory is intentionally synchronous and must
  return one disposable renderer resource. Live family binding, external model
  loading, and decoded external audio remain explicit future work. Cached and
  pending texture deduplication relies on the owned image service preserving
  strict resource identity for the same cache key. No browser check was
  required for this unwired service-only packet.
- Independent review: APPROVE. The reviewer additionally exercised adversarial
  disposal where texture, image-resource, and image-service disposers all
  throw; every owner was still attempted exactly once, the combined failure was
  reported afterward, and repeat disposal remained idempotent. The reviewer
  also confirmed 13/13 focused named behaviors, 76/76 full test files, a
  warning-free 730-module build with a 429.60 kB largest chunk, and a clean
  `git diff --check`.

### Questions / Blockers

Record blockers here and stop.

---

## Packet SOUND-A: deterministic weapon-report contacts

### Status

ACCEPTED AND INTEGRATED after independent review. The pure producer/consumer
seam, `GameApp` callback, TODO update, full gates, and browser validation are
complete for this bounded slice.

### Goal

Create deterministic, rollback-safe sound contacts for accepted weapon shots.
An in-range living enemy may receive a short-lived uncertain report even
without line of sight. The report must never reveal the exact muzzle position,
grant precision targeting, reveal a hidden mesh, or relay by voice/radio in
this first slice.

This packet covers weapon reports only. Explosions, movement noise, acoustic
occlusion, terrain/building attenuation, identification quality, false
reports, and command delay remain incomplete.

### Allowed worker files

- `src/simulation/observation/SoundContacts.js` (new)
- `src/simulation/observation/ContactState.js`
- `src/game/SpottingSystem.js`
- `src/game/CombatSystem.js`
- `test/sound-contacts.test.js` (new)
- `test/combat-rollback.test.js`, only auditory-event rollback assertions
- `test/minimap-contacts.test.js`, only displaced SOUND-contact assertions
- `HANDOFF.md`, only Packet SOUND-A Results and Questions / Blockers

The worker must not edit `GameApp.js`, `TODO.md`, or
`test/spotting-system.test.js`; those paths are integration-owned or currently
owned by another packet.

### Required work order

1. Read `AGENTS.md`, `TODO.md`, `docs/ARCHITECTURE.md`, this packet,
   `ContactState.js`, `SpottingSystem.js`, `CombatSystem.js`, rollback
   capture/restore, and the named tests.
2. Inspect every allowed file's current diff and run:

   ```sh
   node --test test/spotting-system.test.js \
     test/combat-rollback.test.js \
     test/minimap-contacts.test.js
   ```

3. Add a plain deterministic event and SOUND-contact projection.
4. Add behavioral tests that fail before the implementation.
5. Run the worker gates, fill Results, and stop for independent review.

### Authority and data contract

- `CombatSystem.fireWeapon` emits one optional auditory event only after the
  shot and projectile are accepted. Rejected fire emits none.
- Event identity derives from the existing rollback-safe shot sequence.
- The transient event may carry the exact muzzle origin while it is being
  projected; no captured contact may retain that exact origin.
- The new observation helper owns labeled first-order weapon-signature range,
  stable listener ordering, deterministic displacement, uncertainty, and
  event validation. It uses no RNG, wall clock, audio engine, mesh, DOM, or
  unbounded history.
- `SpottingSystem.recordAuditoryEvent(event, units)` projects immediately at
  authoritative spotting time into per-unit contacts.
- Stored SOUND fields include displaced report position, uncertainty,
  confidence, target unit correlation ID, null target-soldier ID, listener
  source IDs, source event ID, channel, report kind, and approximation label.
- `CONTACT_CHANNEL.SOUND` has lower priority than direct, voice, and radio
  contacts. Equal-time ties include stable event identity.
- Spotting capture moves to version 2, restores version 1 compatibly, and
  deep-copies all new fields.

### Acceptance

- Living enemy listeners inside the labeled free-field range hear an accepted
  shot even when line of sight is blocked.
- Dead, incapacitated, friendly, and out-of-range listeners receive nothing.
- Reordered units and crew produce byte-identical reports.
- Reported position differs from the muzzle; its uncertainty circle always
  contains the true X/Z origin.
- SOUND never grants `canPrecisionTarget`, adds an enemy to
  `visibleUnitIds`, exposes a target soldier, or enters same-step relay.
- A newer/direct or equal-time higher-priority contact wins deterministically.
- Existing HUNT contact queries and minimap projection consume only the
  displaced public contact.
- Whole/partitioned decay and expiry, capture/restore, and replay from before
  and after the shot are deterministic.
- Disabled or failing presentation audio cannot suppress the simulation
  report; rejected weapon fire emits no report.
- No vehicle, content-family, rendering, infantry-mesh, or package file
  changes.

### Worker validation

```sh
node --test test/sound-contacts.test.js \
  test/spotting-system.test.js \
  test/combat-rollback.test.js \
  test/minimap-contacts.test.js \
  test/audio-asset-provider.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

No browser claim is made by the worker because the live callback remains
integration-owned.

### Coordinating integration after approval

The coordinator may add only the exact `CombatSystem` option callback in
`src/app/GameApp.js`:

```js
onAuditoryEvent: event =>
  this.spotting.recordAuditoryEvent(event, this.units)
```

Then add one conservative completed child under the spotting TODO, run the
focused/full/build/diff gates again, and verify browser ready/backend/console
state. Without this callback the packet remains implemented but unwired and
must not be marked complete.

### Results

- Status: ACCEPTED AND INTEGRATED after independent review.
- Scope completed: added one immutable shot-sequence weapon-report event,
  renderer-neutral free-field signature and listener projection, deterministic
  displaced SOUND contacts, stable channel/event precedence, short-lived
  decay, versioned rollback, and behavioral producer/consumer coverage.
- Scope deliberately left incomplete: explosions, movement noise, acoustic
  occlusion/attenuation, identification quality, false reports, command delay,
  and voice/radio relay remain future work.
- Files changed: simulation: `src/simulation/observation/SoundContacts.js`,
  `src/simulation/observation/ContactState.js`; adapters:
  `src/game/SpottingSystem.js`, `src/game/CombatSystem.js`; tests:
  `test/sound-contacts.test.js`, auditory-only additions in
  `test/combat-rollback.test.js`, and SOUND-only assertions in
  `test/minimap-contacts.test.js`; integration: the exact callback in
  `src/app/GameApp.js`; docs: one conservative `TODO.md` child and this Results
  section.
- Authoritative event/contact state: `CombatSystem.fireWeapon` emits one frozen
  transient event after projectile insertion and shot accounting, deriving its
  ID from rollback-safe `shotSequence`. `SpottingSystem` stores only the
  displaced public contact, listener IDs, source event ID, null target-soldier
  ID, report kind, channel, confidence/uncertainty, and explicit gameplay
  approximation label. No event history or exact origin enters contact capture;
  spotting capture is version 2 and restores version 1.
- Focused baseline: the required pre-edit three-file command passed 3/3 test
  files.
- Focused final: the exact five-file worker command passed 5/5 test files. The
  coordinator's integrated command, including `game-app-boundary`, passed 6/6
  test files.
- Full `npm test`: final integrated rerun passed 77/77 test files.
- `npm run build` and warnings: passed; 731 modules transformed; no warnings;
  largest chunk 430.24 kB.
- `git diff --check`: passed with no output.
- Integration completed by coordinator: `GameApp` forwards each accepted-shot
  event directly to the authoritative `SpottingSystem`, and the spotting TODO
  records only this bounded slice.
- Browser/runtime: `http://127.0.0.1:5174/`, 1440 x 900, WEGO mode,
  `stonne-1940`, `data-game-status="ready"`, backend
  `webgl2-fallback`, no `data-game-error`, and no page-console errors or
  warnings. The headless Firefox process separately reported one
  implementation-defined WebGL depth-comparison filtering warning.
- Remaining risks and approximations: hearing range, distance bands,
  displacement, uncertainty, confidence, lifetime, and growth are explicitly
  first-order free-field gameplay approximations. Independent read-only review
  returned APPROVE and found no scope, determinism, rollback, origin-leak,
  priority, relay, or presentation-failure blocker.

### Questions / Blockers

Record blockers here and stop.

---

## Packet BUILDING-DEBRIS-A: material-specific bounded debris VFX

### Status

AUTHORIZED for one Codex non-vehicle presentation worker. Implement only this
packet, fill its Results and Questions / Blockers, and stop for independent
review.

### Goal

Add a one-shot, material-specific debris burst for authoritative building
damage, breach, and collapse events. Building state already owns section
materials and rollback-safe damage/collapse results; the current combat VFX
provider has no building-debris role and `CombatSystem` projects no debris.

This is transient presentation only. It does not add persistent smoke/fire,
partial-floor animation, damaged-building audio, scenario thresholds, new
damage, or collision behavior.

### Allowed files

- `src/world/vfx/BattlefieldVfxContract.js`, only the bounded
  `buildingDebris` combat-resource contract
- `src/world/vfx/ProceduralBattlefieldVfxProvider.js`, only shared debris
  geometry, family presentation style routing, cap, material creation, and
  disposal
- `src/game/CombatSystem.js`, only deterministic building-result projection,
  pooled debris creation/update/reset/disposal, and downstream invocation
- `test/vfx-asset-provider.test.js`, only replacement binding, contract, cap,
  and disposal coverage for debris
- `test/building-debris-vfx.test.js` (new)
- `HANDOFF.md`, only Packet BUILDING-DEBRIS-A Results and
  Questions / Blockers

If an existing test fixture requires the new mandatory role, the worker may
make the smallest role-only update under `test/helpers/TestVfxProvider.js`.
If another production file is required, stop and identify the seam. Preserve
all accepted CombatSystem and VFX edits.

### Authority and event projection

- `BuildingSystem` descriptors/results remain authoritative. Do not change
  building state, descriptors, capture/restore, collision, or damage.
- From each accepted `processBuildingDamageResult()` call, normalize only
  section results with applied damage, breach, or collapse plus
  `collapsedSections`. Deduplicate by stable section ID, retain the strongest
  severity (`collapsed` before `breached` before `damaged`), and sort
  lexically.
- Resolve each section's raw material label and stable local centroid from the
  current descriptor; transform it through the current building snapshot.
  Direct impact position may be retained as presentation evidence, but material
  and section identity must never come from a mesh.
- Project immutable plain debris-event records containing building ID, section
  ID, material label, severity, world position, reason, and a stable
  event-local key. Do not retain descriptor, result, or building object
  references.
- Invoke authoritative occupant/building callbacks exactly as today. Start
  debris only after the state-changing result exists and ensure a presentation
  failure cannot become damage authority or suppress the existing
  `onBuildingChanged` synchronization.

### Provider and pool contract

- Extend the existing combat VFX resource set with one required
  `buildingDebris` geometry/style/cap role and an explicit material-style
  resolver. Validate every required geometry, positive cap, finite style, and
  resolver.
- The family procedural provider owns material-label mapping and colors for
  masonry/stone, timber, roof/tile, mixed, and unknown fallback. Label style,
  shard shape, scale, lifetime, and growth as renderer-only gameplay
  approximations; do not claim historical material evidence.
- Use one shared bounded geometry and pooled per-effect materials. The existing
  family asset-binding wrapper must stamp replacement identity on the debris
  geometry, materials, and live meshes without a new global provider.
- Pool size never exceeds the declared cap. At capacity, deterministically
  retire/reuse the oldest active debris effect through the existing pool
  policy. Update, reset, restore, and dispose include debris exactly like
  impact/explosion effects.
- Debris does not enter combat capture state. `CombatSystem.restoreState()`
  clears active debris; replayed authoritative damage may create it again, but
  a visual effect cannot change telemetry, damage, events, collision, RNG, or
  future simulation.
- Avoid randomness, wall clock, unbounded event arrays, per-frame geometry,
  shaders, and external resources.

### Behavioral acceptance

- Projectile and blast result shapes normalize to stable deduplicated section
  events; reversed result insertion produces deep-equal projected records and
  active effect order.
- Descriptor materials route to distinct provider-owned masonry, timber,
  roof/tile, mixed, and fallback styles without generic CombatSystem color
  tables.
- Debris positions derive from descriptor section geometry/current building
  transform and remain finite; missing collider parts use a named building
  origin fallback.
- Existing occupant consequences and `onBuildingChanged` fire exactly once and
  before/independently of transient presentation.
- Repeated events fill but never exceed the cap; deterministic retirement,
  fade/growth, reset on restore, shared geometry ownership, per-effect material
  disposal, resource-set disposal, and idempotence are covered.
- Creating/updating/resetting debris leaves building capture state, combat
  capture state, hit outcome, telemetry, and deterministic RNG byte-unchanged.
- Replacement VFX providers reach live debris geometry/material/mesh binding;
  incomplete providers are rejected.
- Existing impact/explosion and vehicle-damage VFX tests remain green.

Tests must exercise public behavior. Do not replace event/pool/state coverage
with source-text assertions.

### Explicitly forbidden

- `BuildingSystem`, building descriptors/maps/render meshes,
  `BuildingInteractionSystem`, `GameApp`, UI/audio/external assets, persistent
  smoke/fire, partial-collapse animation, thresholds, dependencies,
  package/config/lockfiles, user-owned infantry render files, vehicles, TODO
  edits by the worker, commits, branches, or pushes.
- New simulation events, damage, collision, section-material authority,
  randomness, particle histories, per-event geometry, ShaderMaterial,
  RawShaderMaterial, or `onBeforeCompile`.

### Baseline and validation

The read-only scout confirmed the building result/callback path is live and
bounded combat VFX pools exist, but no provider resource or effect role projects
building debris.

Run before editing and after the final edit:

```sh
node --test test/vfx-asset-provider.test.js \
  test/building-system.test.js \
  test/building-visuals.test.js \
  test/combat-rollback.test.js
node --test test/building-debris-vfx.test.js \
  test/vfx-asset-provider.test.js \
  test/building-system.test.js \
  test/building-visuals.test.js \
  test/combat-rollback.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

Perform a browser building-damage smoke check and report URL, mode, backend,
`data-game-status`, and console errors. A bind/device/browser failure or blank
view is a blocker, not a pass.

### Coordinating TODO after approval

Keep the destructible-buildings parent and broader remaining child unchecked.
Add one completed child describing only bounded material-specific one-shot
debris projected from authoritative section results.

### Results

- Status: NOT STARTED
- Scope completed:
- Scope deliberately left incomplete:
- Files changed:
- Authoritative state or ownership changed:
- Focused baseline:
- Focused final:
- Full `npm test`:
- `npm run build` and warnings:
- `git diff --check`:
- Browser/runtime evidence:
- Remaining risks and review points:

### Questions / Blockers

Record blockers here and stop.

---

## Packet INFANTRY-SEPARATION-A: deterministic personal-space resolution

### Status

PLANNED after THREAT-MEMORY-A releases the shared `SoldierAgent.js` seam.
Do not start this packet concurrently with that worker.

### Goal

Resolve physical overlap between living infantrymen after all ordinary unit
movement, including soldiers from different squads. Current same-squad spacing
is advisory steering only, ignores exact overlap, and never sees other units;
static collision resolves world obstacles but has no dynamic infantry
colliders.

This is an infantry-only post-movement correction slice. It does not add
vehicle collision, path planning, crowd AI, pushing damage, formation replans,
or building-transit motion.

### Allowed files

- `src/simulation/infantry/InfantrySeparationSystem.js` (new)
- `src/game/SoldierAgent.js`, only moving the existing 0.32 m infantry
  collision radius into the shared simulation constant and retaining identical
  static-collision behavior
- `src/app/GameApp.js`, only one injected/system construction seam if needed
  and one authoritative post-unit-movement/pre-building-transit call plus mesh
  synchronization for corrected soldiers
- `test/infantry-separation.test.js` (new)
- `test/infantry-fidelity.test.js`, only narrowly necessary existing-spacing
  integration assertions
- `test/game-app-boundary.test.js`, only call-order evidence that cannot be
  exercised through the public `simulateStep` harness
- `HANDOFF.md`, only Packet INFANTRY-SEPARATION-A Results and
  Questions / Blockers

If another file is required, stop and identify the seam. Preserve current
AMMO, SOUND, relay, threat-memory, and application-composition edits.

### Authoritative behavior

- The renderer-neutral separation helper owns the single canonical 0.32 m
  living-infantry collision radius already used by `SoldierAgent`.
- Collect only living agents from `infantry_squad` units. Exclude any agent
  with a vehicle location and any building location except `outside` or
  `approaching`. Never move vehicles, structures, dead soldiers, occupied
  soldiers, or agents in door/stair/exit transit.
- Normalize identity as stable unit ID plus soldier ID and sort before every
  resolution pass. Reversing unit or roster insertion order must not change
  the result.
- Resolve X/Z penetrations through a named fixed maximum number of passes and a
  named tolerance. Handle exact coincident centers through a deterministic
  pair-ID direction; do not use randomness, iteration order, frame count, or
  wall clock.
- Project every correction through the existing injected
  `terrain.collisionWorld.resolveCircleMotion()` with mover type `infantry`.
  Never push a soldier through a wall, target-building shell, river exclusion,
  or another static blocker. Sample final Y through the existing movement
  height API.
- Keep unit anchors and waypoints unchanged. Synchronize corrected agent
  records and affected unit meshes after authoritative positions move; UI/mesh
  state does not decide corrections.
- Run exactly once after all `Unit.update()` calls and before
  `BuildingInteractionSystem.advance()`. Building transit, support-ammunition
  transfer, spotting, and combat retain their current later order.
- Add no persistent fields. Existing individual world positions and velocity
  capture/restore remain authoritative. The helper may return bounded
  correction/unresolved-pair telemetry for tests, but must not retain history.
- Bound hot-loop work with an explicit supported candidate maximum and fixed
  passes, failing clearly rather than silently skipping candidates. Avoid
  per-pair Three.js allocations.

### Behavioral acceptance

- Two exactly coincident eligible soldiers separate deterministically to at
  least two radii within tolerance; reversed unit/agent insertion produces
  byte-deep-equal positions.
- Same-squad and cross-squad overlaps resolve; already separated soldiers do
  not drift.
- Small three-plus-agent clusters converge within the fixed bound or report
  stable unresolved telemetry without tunneling.
- Static-wall/building projection prevents either correction from crossing a
  blocker. An impossible constrained overlap remains bounded and honestly
  reported.
- Occupied/transit/exiting soldiers, dead soldiers, vehicle-carried soldiers,
  vehicles, and structures remain byte-unchanged.
- The helper is idempotent on a resolved state. Equivalent outer-frame
  partitions that produce the same fixed simulation steps and snapshot/restore
  from the same positions produce deep-equal final state.
- A public `GameApp.prototype.simulateStep` harness proves separation occurs
  after all ordinary movement and before building transit, then final
  post-transit ammunition/spotting ordering remains unchanged.
- Existing static collision, command navigation, building transit, and
  infantry spacing behaviors remain green.

Tests must exercise public behavior; source-text assertions may supplement but
not replace the `simulateStep` and helper behavior.

### Explicitly forbidden

- Vehicle movement/collision/reverse/wreck behavior, `Unit.js`,
  `StaticCollisionWorld.js`, `BuildingInteractionSystem.js`, maps/scenarios,
  render/content/UI files, user-owned infantry factories, TODO edits by the
  worker, dependencies, package/config/lockfiles, commits, branches, or pushes.
- Changing formation offsets, steering/morale/cover logic, unit anchors,
  waypoints, static collider ownership, building routes/reservations,
  simulation fixed-step size, or capture schema.
- Aggregate squad displacement as a substitute for individual correction,
  hidden duplicate radii, unbounded pair loops, or unresolved overlap claims
  without telemetry.

### Baseline and validation

The read-only scout confirmed same-squad steering can leave exact overlaps and
cross-squad soldiers are never considered by static collision.

Run before editing and after the final edit:

```sh
node --test test/infantry-fidelity.test.js \
  test/static-collision.test.js \
  test/building-interaction.test.js \
  test/infantry-ammunition-transfer.test.js
node --test test/infantry-separation.test.js \
  test/infantry-fidelity.test.js \
  test/static-collision.test.js \
  test/building-interaction.test.js \
  test/infantry-ammunition-transfer.test.js \
  test/game-app-boundary.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

Perform a browser WEGO/realtime smoke check and report URL, backend,
`data-game-status`, and console errors. A bind/device/browser failure is a
blocker, not a pass.

### Coordinating TODO after approval

Keep `Add deterministic movement collision and tactical navigation` and its
broad remaining child unchecked. Add one completed child describing only
stable-ID individual infantry overlap resolution, static-world projection, and
rollback-safe positions.

### Results

- Status: NOT STARTED
- Scope completed:
- Scope deliberately left incomplete:
- Files changed:
- Authoritative state or ownership changed:
- Focused baseline:
- Focused final:
- Full `npm test`:
- `npm run build` and warnings:
- `git diff --check`:
- Browser/runtime evidence:
- Remaining risks and review points:

### Questions / Blockers

Record blockers here and stop.

---

## Packet RIVERBANK-A: scenario-authored riverbank surface strips

### Status

AUTHORIZED for one Codex non-vehicle terrain/render worker. Implement only
this packet, fill its Results and Questions / Blockers, and stop for independent
review.

### Goal

Give the Stonne river's two existing smooth terrain banks their own
scenario-authored material and deterministic terrain-conforming presentation.
The current authoritative bank elevation already exists in
`TerrainBuilder.getHeightAt()`, but the rendered ground uses one general
material across the cut and exposes no riverbank surface role.

This is a presentation slice over the existing height field. It must not change
terrain height, water/bridge dimensions, collision, navigation, or gameplay.

### Allowed files

- `src/maps/MapDescriptor.js`, only validation of the new riverbank material
  record
- `src/maps/france/stonne.js`, only one scenario-authored riverbank material
  record
- `src/content/france1940/render/France1940TerrainSurfaceProvider.js`, only the
  injected `riverBank` material role and its existing disposal owner
- `src/world/TerrainBuilder.js`, only bounded bank-strip construction,
  ownership fields, and provider-role validation
- `test/map-descriptor.test.js`, only riverbank material validation/freeze
- `test/terrain-asset-provider.test.js`, only replacement-role and material
  disposal coverage
- `test/terrain-fidelity.test.js`, only bank geometry/conformance coverage
- `HANDOFF.md`, only Packet RIVERBANK-A Results and Questions / Blockers

If another file is required, stop and identify the seam. Preserve the accepted
surface-polygon/provider edits and all unrelated dirty work.

### Data and ownership contract

- `map.surfaces.riverBankMaterial` is plain deeply frozen scenario data with
  valid color, roughness, and metalness plus an explicit presentation
  approximation label. It does not own collision or elevation.
- The family terrain-surface provider creates the `riverBank` Three.js material,
  marks it with the existing implementation/role identity, and disposes it
  exactly once through the existing surface-set owner.
- `TerrainBuilder` must require the injected `riverBank` material. It must not
  import family content, hard-code a France 1940 color, or read texture pixels
  as geometry authority.
- Build exactly two named meshes, one on each side of `map.river.centerZ`,
  between the authored `waterWidth / 2` and `cutWidth / 2` boundaries.
- Sample both world X and cross-slope Z at deterministic bounded counts. Every
  emitted vertex Y derives from the existing `getHeightAt(x, z)` plus one
  named small presentation offset to prevent z-fighting. Label subdivision and
  offset values as renderer approximations.
- Preserve outward winding, compute normals, span the exact map width, expose
  stable `mapFeatureId`, side, world bounds, material role, and approximation
  metadata in `userData`, and retain mesh/geometry ownership on
  `TerrainBuilder` for its existing scene lifetime.
- Geometry is created once during map build and never per frame. Do not add a
  partial teardown API when `TerrainBuilder` has no general scene teardown;
  do prove provider material disposal remains idempotent and record this
  existing scene-lifetime limitation as a remaining risk.

### Behavioral acceptance

- Map validation rejects missing/invalid/unlabeled riverbank material values
  and deep-freezes the accepted record.
- Exactly two bank meshes exist with stable north/south identity, the injected
  replacement `riverBank` material, and no collision records.
- Inner/outer Z edges match the authored water/cut boundaries on both sides;
  X edges match the map width.
- Every vertex matches `getHeightAt()` plus the named offset; both banks retain
  the smooth cross-slope rather than a two-edge planar shortcut.
- Bounds, normals, finite geometry, index winding, shadows, and material
  ownership are covered behaviorally.
- Replacing the terrain provider reaches ground, water, riverbank, bridge,
  masonry, and foliage consumers; disposing the surface set disposes the new
  material once and remains idempotent.
- Existing river bed/water/bridge, terrain elevation, collision, navigation,
  and surface-polygon tests remain unchanged.

### Explicitly forbidden

- Terrain height/elevation formulas, river/bridge dimensions, collision,
  navigation, map deployment/scenario units, texture-only fake bank polygons,
  shaders/node materials, external assets, dependencies, package/config/
  lockfiles, user-owned infantry render files, vehicles, TODO edits by the
  worker, commits, branches, pushes, or broad terrain cleanup.
- New authoritative bank physics, material-dependent movement/ballistics,
  random/procedural boundaries, per-frame geometry, or claiming historical
  soil/vegetation evidence.

### Baseline and validation

The read-only scout found no riverbank material role or mesh; the existing
smooth bank is visible only through the general ground material.

Run before editing and after the final edit:

```sh
node --test test/map-descriptor.test.js \
  test/terrain-asset-provider.test.js \
  test/terrain-fidelity.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

Perform a browser side-on river/bridge check and report URL, mode, backend,
`data-game-status`, and console errors. A bind/device/browser failure or blank
view is a blocker, not a pass.

### Coordinating TODO after approval

Keep the broad battlefield environmental-fidelity parent and village/props
child unchecked. Add one completed child describing only scenario-authored
riverbank material strips over unchanged height/collision authority.

### Results

- Status: REVIEW REVISION APPLIED; browser visual validation remains blocked
  pending an attached browser session.
- Scope completed: Added one deeply frozen scenario riverbank material record,
  an injected `riverBank` surface role, and exactly two bounded terrain-
  conforming bank strips over the existing river height authority.
- Scope deliberately left incomplete: No terrain-height, water/bridge,
  collision, navigation, gameplay, asset, shader, or general teardown changes.
- Files changed: map schema/data: `src/maps/MapDescriptor.js`,
  `src/maps/france/stonne.js`; family presentation:
  `src/content/france1940/render/France1940TerrainSurfaceProvider.js`; world
  presentation: `src/world/TerrainBuilder.js`; tests:
  `test/map-descriptor.test.js`, `test/terrain-asset-provider.test.js`,
  `test/terrain-fidelity.test.js`; docs: this Results section only.
- Authoritative state or ownership changed: The map owns only the labeled
  visual material record. `TerrainBuilder` samples its existing `getHeightAt()`
  into two scene-lifetime strips; it creates no collider or navigation record.
  The injected surface-set owner retains idempotent material disposal.
- Focused baseline: passed 3/3 test files before edits.
- Focused final: passed 3/3 test files. Review revision: whitespace-only
  `presentationApproximation` labels are now rejected by trimmed-length
  validation and focused coverage; the required 3-file rerun passed 3/3.
- Full `npm test`: passed 83/83 test files.
- `npm run build` and warnings: passed; 734 modules transformed; largest chunk
  430.58 kB; no build warnings.
- `git diff --check`: passed with no output after the final review-revision
  Results update.
- Browser/runtime evidence: BLOCKED. `http://127.0.0.1:5173/` was already
  serving and a temporary Vite instance served `http://127.0.0.1:5174/`.
  Headless Firefox at 1366 x 768 rendered a blank game viewport and reported
  `RenderCompositorSWGL failed mapping default framebuffer`; no attached
  browser-devtools bridge was available to read `data-game-status`, backend,
  or console. This is not a successful side-on river/bridge check.
- Remaining risks and review points: Verify the north/south strips side-on in
  an attached GPU browser, including `data-game-status="ready"`, backend, and
  console state. `TerrainBuilder` has only its existing scene-lifetime
  ownership, so individual bank meshes intentionally add no partial teardown.

### Questions / Blockers

- Browser gate blocked: the available headless Firefox session produced a blank
  viewport with the framebuffer-mapping failure above. A real attached browser
  session is required for the packet's side-on river/bridge verification.

---

## Packet THREAT-MEMORY-A: bounded persistent infantry threat memory

### Status

AUTHORIZED for one Codex non-vehicle simulation worker. Implement only this
packet, fill its Results and Questions / Blockers, and stop for independent
review.

### Goal

Add a deterministic, rollback-safe, bounded memory of recent incoming-fire
events to each infantryman. Current behavior retains only one threat/impact
position for roughly 1.35-3.5 seconds, then discards its intensity. The new
memory must preserve a small set of recent stable event IDs long enough for
cover selection to remain threat-aware without becoming an unbounded history.

This is only persistent observed-threat memory. It does not add a terrain
danger map, LOS-aware route planning, buddy bounds, fire-and-movement,
withdrawal, surrender, or vehicle AI.

### Allowed files

- `src/simulation/infantry/ThreatMemory.js` (new)
- `src/game/SoldierAgent.js`, only threat-memory construction,
  capture/restore, and record synchronization
- `src/game/SoldierAI.js`, only incoming-fire recording, deterministic memory
  advancement/selection, cover-reaction consumption, and inspectable decision
  projection
- `test/infantry-threat-memory.test.js` (new)
- `test/soldier-ai.test.js`, only integration regressions if the new test
  cannot exercise the public SoldierAI path alone
- `HANDOFF.md`, only Packet THREAT-MEMORY-A Results and Questions / Blockers

If another production file is required, stop and identify the seam. Preserve
all accepted AMMO and existing infantry-AI dirty work.

### Authoritative state and policy

- `ThreatMemory` is renderer-neutral, has no Three.js dependency, and owns a
  named first-order gameplay-approximation policy.
- Accept only finite three-component threat and impact positions, a finite
  non-negative intensity, and a non-empty stable event ID. Normalize inputs to
  deep plain data; retain no unit, projectile, or vector object references.
- Use the existing stable `options.projectileId` from
  `registerIncomingFire()` as the event ID. If an existing caller omits it, use
  the soldier's rollback-owned incoming-fire event sequence to derive a stable
  local event ID. Do not change `CombatSystem`.
- Bound each soldier to at most four active records. Refreshing the same event
  replaces its immutable observation payload without adding another record.
  When full, evict by the weakest current deterministic score, then oldest
  observation time, then lexical event ID.
- Use an explicit positive finite memory lifetime and deterministic
  time/score decay. Normalize only machine-epsilon clock drift at a named
  canonical precision so whole-versus-partitioned advancement captures
  byte-deep-equal state.
- Prune expired records in stable order. Select the strongest current threat
  by score, then newest observation, then lexical event ID. Expose a deep
  snapshot; callers cannot mutate authoritative memory.
- `SoldierAgent` owns one memory instance and includes it in existing roster
  capture/restore. Legacy records without memory restore empty state. Invalid
  future versions fail rather than silently changing semantics.
- Preserve current immediate incoming-fire timer, suppression, and event
  version behavior. `SoldierAI` records the same accepted event into memory,
  advances memory once per living soldier per authoritative update, and uses
  the strongest non-expired memory as the threat position for an explicit
  `threat-memory` cover reaction after the immediate timer ends.
- Dead/incapacitated soldiers cannot react, and casualty/spacing/direct-fire
  precedence remains unchanged. Tactical decision output may summarize the
  selected event ID, age, score, and position, but never owns the memory.
- Keep work bounded to O(living soldiers times four) and avoid unbounded
  arrays, per-frame Three.js allocations, randomness, wall clock, or frame
  count.

### Behavioral acceptance

- Multiple stable events coexist up to four records; a fifth deterministically
  evicts the weakest record independent of input insertion order where scores
  tie.
- Re-recording an event does not grow state and updates its deterministic
  observation time/payload.
- Score decay, exact expiry, zero-delta behavior, invalid-input rejection, and
  deep output isolation are covered.
- One whole advance and equivalent partitions produce byte-deep-equal memory
  state and strongest selection.
- Snapshot mid-lifetime, restore through `SoldierAgent`/`SoldierAI`, and replay
  produce byte-deep-equal roster state and tactical decision.
- After the current immediate timer expires, a living soldier still selects
  cover relative to the strongest remembered threat and reports
  `threat-memory-*`; after memory expiry it returns to existing fallback
  behavior.
- Legacy soldier state restores with empty memory and current immediate
  incoming-fire behavior remains unchanged.

Tests must exercise public module and SoldierAI/SoldierAgent behavior. Do not
substitute source-text assertions.

### Explicitly forbidden

- `CombatSystem.js`, `Unit.js`, map/terrain/collision/spotting/building files,
  render/UI/composition, vehicles, TODO edits by the worker,
  package/config/lockfiles, dependencies, commits, branches, or pushes.
- Terrain danger grids, opponent identity leakage, exact shooter knowledge,
  LOS/path changes, group/shared authoritative memory, withdrawal/surrender,
  replacing current suppression/timer semantics, or unbounded telemetry.

### Baseline and validation

Run before editing and after the final edit:

```sh
node --test test/soldier-ai.test.js
node --test test/infantry-threat-memory.test.js test/soldier-ai.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

Runtime simulation behavior changes, so attempt a WEGO browser smoke check and
report URL, backend, `data-game-status`, and console errors. A bind/device/
browser failure is a blocker, not a pass.

### Coordinating TODO after approval

Keep `Improve infantry tactical AI` and its broad remaining child unchecked.
Add one completed child describing only bounded per-soldier incoming-fire
memory, deterministic expiry/selection, cover consumption, and rollback.

### Results

- Status: IMPLEMENTED; ready for independent review
- Scope completed: Added versioned renderer-neutral per-soldier threat memory
  with four-record bounding, immutable deep-normalized observations, stable
  refresh/eviction/selection, 12-second linear score decay, exact expiry, and
  machine-epsilon-only clock canonicalization at 1 ns precision. Integrated
  projectile/local event IDs, one advance per available living soldier,
  strongest-memory cover consumption after immediate/casualty precedence, an
  inspectable decision summary, legacy-empty restore, future-version
  rejection, and byte-identical replay/frame partitioning.
- Scope deliberately left incomplete: Terrain danger maps, shared/group
  memory, LOS-aware routing, buddy bounds, fire-and-movement, withdrawal,
  surrender, shooter/opponent identity, and vehicle AI remain untouched.
- Files changed:
  - Simulation: `src/simulation/infantry/ThreatMemory.js`
  - Integration: `src/game/SoldierAgent.js`, `src/game/SoldierAI.js`
  - Tests: `test/infantry-threat-memory.test.js`
  - Docs: this packet's Results and Questions / Blockers only
- Authoritative state or ownership changed: Each `SoldierAgent` now owns one
  `ThreatMemory`. Its capture contains policy identity, canonical simulation
  clock plus compensation, and up to four records containing only event ID,
  threat/impact coordinates, intensity, observation time, and expiry time.
  `tacticalDecision` receives a deep summary and does not own or mutate that
  state.
- Focused baseline: `node --test test/soldier-ai.test.js` passed 1/1 test file.
- Focused final:
  `node --test test/infantry-threat-memory.test.js test/soldier-ai.test.js`
  passed 2/2 test files; direct execution of the new file passed 11/11
  behavioral tests.
- Full `npm test`: passed 83/83 test files after the concurrent river-bank
  fixture update settled.
- `npm run build` and warnings: passed with 734 modules transformed. Largest
  chunks were `render` 430.58 kB and `game` 420.76 kB; no build or chunk-size
  warnings.
- `git diff --check`: passed after the final implementation and test edits.
- Browser/runtime evidence: The sandboxed bind failed with
  `listen EPERM 127.0.0.1:5173`. An approved unsandboxed Vite server selected
  `http://127.0.0.1:5174/`, returned HTTP 200, and was then stopped. No
  Chromium executable or connected browser/devtools bridge is available, so
  WEGO mode, backend, `data-game-status`, and console errors could not be
  inspected; this is an environment blocker, not a runtime pass.
- Remaining risks and review points: Independently review the 12-second
  linear-decay gameplay approximation, lexical tie direction, Kahan clock
  compensation/canonical snap, high-suppression memory precedence, and the
  compatibility behavior where an incoming-fire event without a finite threat
  position retains its immediate reaction but cannot create a memory record.

### Questions / Blockers

- Browser validation remains blocked by the absence of an installed Chromium
  executable or connected Three.js devtools browser. No production-file seam
  outside the packet was required.

---

## Packet BUILDING-CAPACITY-A: authored ENTER target capacity

### Status

ACCEPTED after independent review. The bounded TODO child is integrated; broader
building generalization remains incomplete.

### Goal

Enforce authored target-room capacity when issuing infantry ENTER orders.
`BuildingInteractionSystem.issueEnter()` currently fabricates undeclared
`*-interior-*` target IDs when a requested floor has fewer slots than the
entering element. Those soldiers can be accepted for the requested floor and
later silently remain in a ground-floor slot.

Accept only soldiers with a real, currently claimable authored target slot.
Never advertise an assignment to an unknown node or overbook a slot already
occupied, reserved, or claimed by another pending ENTER order.

### Allowed files

- `src/game/BuildingInteractionSystem.js`, only ENTER target-slot selection and
  pending target-claim handling
- `test/building-interaction.test.js`, only behavioral capacity/rollback tests
- `HANDOFF.md`, only Packet BUILDING-CAPACITY-A Results and
  Questions / Blockers

If another file is required, stop and name the seam. Preserve every concurrent
dirty hunk.

### Authoritative behavior

- Descriptor room slots remain the only authored interior targets.
  `BuildingInteractionSystem` must not synthesize slot IDs or local positions.
- Derive target availability from the authoritative building snapshot plus
  stable pending `agent.buildingLocation.targetSlotId` claims visible through
  the injected `getUnits()` seam. Do not add object-reference authority or an
  unbounded side registry.
- Exclude invalid, occupied, reserved, and already-claimed target slots.
- Sort all relevant units, soldiers, and claims by stable IDs before resolving
  availability. Preserve the existing stable entering-soldier order.
- Cap acceptance to both entry-staging capacity and real target capacity.
  Unaccepted soldiers stay outside and receive no building location.
- Preserve the current `no_free_slots` result when none can be assigned and
  report the exact unassigned count when a subset is accepted.
- Once accepted, each soldier's existing rollback-owned building location
  retains the target claim through approach, door transit, and stair transit.
  Capture/restore must not need a new interaction-state version.
- Destruction or invalidation after acceptance may use the existing safe
  ground/exterior fallback. This packet only fixes authority at order issue.

### Behavioral acceptance

- A valid descriptor with four entry slots and only two requested-floor slots
  assigns exactly two soldiers and leaves the rest outside.
- Every advertised `targetSlotId` exists in the requested descriptor room; no
  fabricated `interior-*` IDs appear.
- Every accepted soldier that completes transit occupies the advertised floor.
- A second unit/order while target slots are pending or occupied returns
  `no_free_slots` rather than accepting soldiers who later remain downstairs.
- Releasing/exiting/cancelling a claimant makes the authored slot available to
  a later deterministic order through existing lifecycle paths.
- A snapshot during pending transit, restore, and replay preserves the same
  target claims, assignments, occupancy, and order completion.
- The current four-slot Stonne upper-floor behavior and entry/exit regressions
  remain unchanged.

Tests must use public building/interaction behavior. Do not replace behavioral
coverage with source-text assertions.

### Explicitly forbidden

- Building descriptors, maps, `BuildingSystem`, rendering, UI, composition,
  vehicle files, external assets/services, package/config/lockfiles,
  dependencies, TODO edits by the worker, commits, branches, or pushes.
- Adding implicit room capacity, generic fallback coordinates, fabricated
  nodes, a compatibility adapter as target authority, or changing
  post-destruction fallback behavior.
- Broad transit, reservation, route, casualty, capture-version, or formatting
  refactors.

### Baseline and validation

The read-only scout reproduced the defect with a valid two-slot upper floor:
four soldiers were accepted with two fabricated target IDs, and the extra two
later occupied ground-floor slots.

Run before editing and again after the final edit:

```sh
node --test test/building-interaction.test.js test/building-system.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

Run the browser in WEGO mode and report URL, backend, `data-game-status`, and
console errors. The undersized fixture remains the automated proof because the
current Stonne house has four slots on each floor. A bind/device/browser
failure is a blocker, not a pass.

### Coordinating TODO after approval

Keep `Add enterable multi-floor buildings` and its generalization child
unchecked. Add one completed child describing only authored ENTER target
capacity, pending claim exclusion, and rollback preservation.

### Results

- Status: ACCEPTED after independent review; the coordinator added the bounded
  TODO child.
- Scope completed: `issueEnter()` now assigns only real authored slots on the
  requested floor, caps partial acceptance by both claimable entry staging and
  target capacity, excludes invalid/occupied/reserved/pending-claimed slots,
  preserves stable soldier assignment, and returns `no_free_slots` before
  mutating order state when capacity is exhausted.
- Scope deliberately left incomplete: descriptor authoring, implicit or
  multi-capacity rooms, target-room selection, AI occupation, post-acceptance
  destruction fallback, transit routing, rendering, UI, and the current Stonne
  four-slot floor records remain unchanged.
- Files changed: interaction adapter:
  `src/game/BuildingInteractionSystem.js`; tests:
  `test/building-interaction.test.js`; docs: only this packet's Results and
  Questions / Blockers. No descriptor, map, BuildingSystem, composition,
  vehicle, external-service, package, or TODO file was changed by this packet.
- Authoritative state or ownership changed: no new persistent owner or
  interaction-state version was added. Availability is derived on demand from
  descriptor slots and the cloned BuildingSystem invalid-slot, occupancy, and
  reservation snapshot plus stable `buildingLocation.targetSlotId` claims from
  ID-sorted units and agents returned by `getUnits()`. Existing per-agent
  rollback state retains claims throughout approach, door transit, and stair
  transit; existing cancel/exit/casualty paths release them.
- Focused baseline:
  `node --test test/building-interaction.test.js test/building-system.test.js`
  passed 2/2 files before editing.
- Focused final: the same exact command passed 2/2 files. Running both files
  without process isolation passed 27/27 named tests, including the unchanged
  four-soldier Stonne entry/exit behavior and four new capacity/rollback
  behaviors.
- Full `npm test`: passed 82/82 test files.
- `npm run build` and warnings: passed; Vite transformed 734 modules; largest
  chunk was 430.43 kB; no build warning.
- `git diff --check`: passed with no output.
- Browser/runtime evidence: real headless Firefox at
  `http://127.0.0.1:5174/?mode=wego`, viewport 1366 x 682, scenario
  `stonne-1940`, capture manifest
  `19400516:design:high:final:wego`, backend `webgl2-fallback`,
  `data-game-status="ready"`, no `data-game-error`, and no page-console errors
  or warnings. Firefox separately emitted a software-compositor framebuffer
  mapping message and one implementation-defined WebGL depth-filter warning.
- Remaining risks and review points: the production Stonne house still has
  equal four-slot floors, so the valid two-slot test descriptor is the direct
  undersized-capacity proof. Review the stable pending-claim scan and the
  ground-floor same-slot pairing; lifecycle release intentionally remains
  owned by existing agent and BuildingSystem paths.
- Independent review: APPROVE. The reviewer passed 27/27 focused behaviors and
  adversarial reversed-order, exact-capacity, real-target, pending rejection,
  cancellation-release, destruction-fallback, and rollback probes; no side
  registry, object-only authority, or packet corruption was found.

### Questions / Blockers

- None.

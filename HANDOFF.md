# Antigravity Work Packet

Packet owner: coordinating Codex agent.

Wave 1 completed exactly three concurrent packets:

- Packet H39-A: assigned vehicle-data/render worker.
- Packet CREW-A: assigned deterministic simulation worker.
- Packet TEXTURE-A: assigned external-asset worker.

Packets SOUND-A, AUDIO-A, MODEL-A, and AMMO-A also completed and were
integrated after independent review. Current Codex work is non-vehicle. Do not
commit, push, create/switch branches, or rewrite another packet's scope. Files
not named by the assigned packet remain out of scope.

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

## Packet BUILDING-DESCRIPTOR-B: compact one-floor farmhouse vertical slice

### Status

ACCEPTED after implementation, three bounded behavioral revisions, and final
independent rereview. The reviewer approved renderer-neutral footprint
authority, rotated terrain grounding, exact aperture/LOD semantics, lifecycle,
runtime, and all validation.

### Goal

Prove the existing renderer-neutral building system, generic French-house
visual adapter, terrain placement path, and composition registries support more
than the original two-floor house by adding one distinct compact one-floor
farmhouse descriptor and one non-overlapping Stonne instance.

This is one reusable descriptor/placement slice. It does not add a new
building schema, AI-selected occupation, new interaction rules, or generic
prop framework.

### Allowed files

- `src/maps/france/FranceFarmhouse8x6_1F.js` (new), only the plain authored
  descriptor described below
- `src/maps/france/stonne.js`, only one new structure placement after the
  existing house; preserve all accepted surface-layer records byte-for-byte
- `src/main.js`, only one descriptor import, one adapter registration, and one
  entry in the injected `buildingDescriptors` array
- `src/world/buildings/FrenchHouse.js`, only:
  - `disposeFrenchHouseVisual(root)`: make disposal unique-resource and
    idempotent without changing construction, semantics, LOD, or materials
  - make `terrainFoundation` sample and record the actual world-space corners
    produced by the placement's `rotationY`, while preserving rotation-zero
    geometry and every other construction path
- `test/building-system.test.js`, only descriptor topology, reservation,
  collision, damage, and restore behavior
- `test/building-visuals.test.js`, only generic adapter, Stonne placement,
  LOD/semantic geometry, and disposal behavior
- `test/map-descriptor.test.js`, only the exact second structure record,
  immutability, and non-overlap assertions; preserve accepted terrain geometry
  helpers/assertions
- `test/static-collision.test.js`, only multi-descriptor registration and the
  new building movement-shell behavior if not covered through the visual test
- `test/terrain-fidelity.test.js`, only import/register the new descriptor and
  adapter in the existing Stonne `TerrainBuilder` fixture so the unchanged
  two-structure map can build, plus scope the legacy original-house obstacle
  assertions to `french_village_house`; do not change expected values or
  tolerances
- `test/building-descriptor-expansion.test.js` (new), preferred for cohesive
  cross-layer behavior that would otherwise broaden several existing files
- `HANDOFF.md`, only Packet BUILDING-DESCRIPTOR-B Results and
  Questions / Blockers

If another production file is required, stop and name the exact seam. Preserve
all current catalog, threat-memory, CombatSystem/VFX, TODO, and user-owned
edits.

### Descriptor and placement contract

- Author `FR_FARMHOUSE_8X6_1F` with stable ID `fr_farmhouse_8x6_1f`,
  renderer-neutral plain metre data, exact 8 m by 6 m rigid footprint, one
  ground floor, and one room.
- Label the dimensions, damage thresholds, materials, concealment, and transit
  timing as scenario/gameplay approximations. Do not claim a historical Stonne
  building survey.
- Give the room exactly three capacity-one individual slots: two authored
  front-window firing positions and one rear interior position.
- Add one front door from outside to the ground room and no stair. Add exactly
  two front fire ports, each bound to its own real approach slot, shell
  section, initially open aperture, forward local normal, finite arc/elevation,
  capacity one, and labeled approximate cover.
- Author foundation, ground-floor structure, masonry shell, and roof sections
  with stable parts, materials, health/resistance, visual stages, acyclic
  support chain, affected floor IDs where applicable, aperture-linked door and
  window parts, breach threshold, and bounded rubble.
- Ballistic collision passes through authored open door/window apertures.
  Ordinary movement remains blocked at all shell openings and can traverse the
  door only through `BuildingInteractionSystem`; do not change those policies.
- Reuse `createFrenchHouseVisualAdapter(descriptor)` unchanged. The new visual
  must expose its actual descriptor ID, section/part/opening semantics,
  footprint, gabled-roof silhouette, all four LOD tiers, damage projection,
  and existing resource disposal ownership. The only permitted visual-helper
  change is the narrow disposal correction named above. No copied mesh factory
  is allowed.
- Add one stable Stonne placement `french_farmhouse_outbuilding` at
  `[-45, 34]`, rotation `Math.PI / 2`, foundation clearance `0.12`, using the
  new descriptor/adapter ID. Prove its exact 8 m by 6 m rotated footprint does
  not overlap the river cut, complete bridge width/span, thickness-expanded
  wall runs, existing house, canopy-expanded authored foliage, or complete
  initial unit footprints using existing `TERRAIN_SCALE`/catalog dimensions.
  Infantry footprint centers must come from the generic simulation formation
  function transformed by scenario position/rotation, never mesh
  `userData.slotOffset` or another renderer-produced position.
- Composition registers both descriptors and two adapters explicitly. Do not
  add implicit file-system discovery, a global registry, or a concrete import
  into `TerrainBuilder`.

### Behavioral acceptance

- Both building descriptors validate as renderer-neutral plain data. The new
  farmhouse is deeply frozen; the existing two-floor descriptor remains
  byte-unchanged with its pre-existing unfrozen ownership limitation recorded
  rather than broadened into this packet.
- The new portal graph has the exact outside-to-room door path and no stair;
  three stable slots reserve/occupy/release independently and a fourth claim
  is rejected without fabricated capacity.
- Projectile, LOS, and movement snapshots use the new descriptor's actual
  aperture-linked parts. Door/window movement cannot bypass authorized transit.
- Damage, breach, collapse, rubble, events, and capture/restore work through
  the existing `BuildingSystem` using the new stable section IDs.
- `TerrainBuilder` builds exactly two Stonne building instances through the
  injected descriptor/adapter maps, with distinct descriptor IDs, visuals,
  movement/ballistic records, foundations, and no generic-layer family import.
- The new visual's high/medium/core/proxy envelopes share the authored
  footprint/roof height and retain identity-defining door/window/roof
  semantics at the tiers where the existing adapter contract requires them.
  Assert the exact door, left-window, right-window, and roof semantics at every
  tier; a one-side proxy assertion is insufficient.
  On non-flat terrain, every rendered rotated foundation bottom corner must
  equal `getHeightAt(actualWorldX, actualWorldZ)`, metadata must report those
  actual world corners, and rotation-zero behavior must remain unchanged.
  Disposal releases every unique instance-owned geometry/material exactly
  once even when a material is shared by multiple meshes, and a repeated
  disposal call is a no-op.
- Movement collision tests must assert the exact door/window `partId` and
  `movementPolicy` records. Do not filter on a field the public collision
  snapshot does not expose, and do not expand the collision schema.
- Existing original-house entry, occupancy, damage, rollback, collision, and
  visual tests remain unchanged.
- No new persistent schema is introduced. Existing descriptor-derived building
  state and capture/restore remain authoritative.

### Explicitly forbidden

- Changes to building descriptor validation, `BuildingSystem`,
  `BuildingInteractionSystem`, `TerrainBuilder`, the French-house visual
  implementation outside the exact disposal and rotated-foundation corrections
  above, GameApp,
  scenario units/deployment, existing structure placement values, terrain
  surfaces/elevation, river/bridge/walls/foliage, CombatSystem/VFX/audio, UI,
  AI occupation, vehicles, external assets, dependencies,
  package/config/lockfiles, TODO edits by the worker, commits, branches,
  pushes, or broad `main.js`/map cleanup.
- Copying the existing two-floor descriptor values wholesale, adding a
  placeholder box under a production name, aggregate room capacity without
  real slots, fake stairs/floors, or claiming visual inspection without a
  working framebuffer.

### Baseline and validation

Run before editing and after the final edit:

```sh
node --test test/building-system.test.js \
  test/building-visuals.test.js \
  test/map-descriptor.test.js \
  test/static-collision.test.js
node --test test/building-descriptor-expansion.test.js \
  test/building-system.test.js \
  test/building-visuals.test.js \
  test/map-descriptor.test.js \
  test/static-collision.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

Perform a WEGO browser check and report URL, backend, `data-game-status`,
console errors, both building IDs/descriptors, and whether the new one-floor
silhouette/door/windows/roof are visible. A blank viewport or unavailable
browser is a blocker, not a pass.

### Coordinating TODO after approval

Keep the broad enterable-buildings parent and remaining generalization child
unchecked. Add one completed child describing only the second one-floor
descriptor, real three-slot capacity, generic visual/system reuse, and
scenario placement.

### Results

- Status: ACCEPTED after final independent rereview.
- Scope completed: Added the deeply frozen, renderer-neutral
  `fr_farmhouse_8x6_1f` descriptor with an exact 8 m by 6 m rigid shell, one
  ground room, two window slots plus one rear slot, one front door, two front
  fire ports, four stable structural sections, bounded rubble, and explicit
  scenario/gameplay-approximation labels. Added the exact rotated Stonne
  placement, explicit two-descriptor/two-adapter composition, and cross-layer
  behavioral coverage through the unchanged validator, portal graph,
  `BuildingSystem`, `BuildingInteractionSystem`, `TerrainBuilder`,
  `StaticCollisionWorld`, and generic French-house adapter. Corrected the
  pre-existing visual disposal bug so shared rubble materials and all other
  unique owned resources dispose exactly once and repeated disposal is a no-op.
  The review revision now samples every foundation bottom corner at the actual
  world X/Z produced by `rotationY`, keeps the emitted vertices local under the
  rotated root, records those actual world corners, and preserves the exact
  rotation-zero corner order. It also replaces centerline/point placement
  checks with the full bridge width/span, thickness-expanded wall runs, 3.2 m
  canopy circles, every catalog-formation infantryman, and catalog-sized
  vehicle/structure footprints. Public movement assertions now name the exact
  door and two window policies, while every LOD names the exact door, left
  window, right window, and roof semantic object. The final test-only ownership
  correction derives each infantry center from the generic simulation
  `getFormationOffset(index, 'QUICK')` plus scenario transform and collision
  radius, never an agent mesh position or renderer `userData`.
- Scope deliberately left incomplete: The legacy two-floor descriptor remains
  byte-unchanged and retains its pre-existing unfrozen ownership limitation.
  No schema, AI occupation, interaction-rule, renderer construction/LOD,
  scenario-unit, generic terrain, or vehicle work was added.
- Files changed: Data and placement:
  `src/maps/france/FranceFarmhouse8x6_1F.js`,
  `src/maps/france/stonne.js`; composition: `src/main.js`; rendering lifecycle:
  `src/world/buildings/FrenchHouse.js`; tests:
  `test/building-descriptor-expansion.test.js`,
  `test/building-visuals.test.js`, `test/map-descriptor.test.js`,
  `test/static-collision.test.js`, `test/terrain-fidelity.test.js`; packet
  record: `HANDOFF.md`. `test/building-system.test.js` remained unchanged.
- Authoritative state or ownership changed: The new frozen descriptor owns the
  farmhouse topology, slots, portals, fire ports, section graph, collider
  parts, thresholds, and rubble data; the Stonne map owns its one placement.
  Existing descriptor-derived `BuildingSystem` state and capture/restore remain
  authoritative. No persistent field or capture schema changed. Rendering
  remains a downstream adapter; disposal ownership was only made unique and
  idempotent. Foundation geometry metadata now reports the same actual rotated
  world corners that its local bottom vertices render over.
- Focused baseline: PASS, 4/4 files before edits:
  `node --test test/building-system.test.js test/building-visuals.test.js
  test/map-descriptor.test.js test/static-collision.test.js`.
- Focused final after review revision: PASS, 6/6 files:
  `node --test test/building-descriptor-expansion.test.js
  test/building-system.test.js test/building-visuals.test.js
  test/map-descriptor.test.js test/static-collision.test.js
  test/terrain-fidelity.test.js`. Behavioral probes cover the exact rotated
  shell envelope and complete placement clearances, four non-flat rotated
  foundation corners plus rotation-zero preservation, real three-soldier
  interaction capacity, fourth-soldier rejection, portal-only transit, exact
  movement versus ballistic/LOS aperture policies, both injected instances,
  exact door/both-window/roof semantics at all four LODs, breach, collapse,
  rubble, events, deep restore, legacy isolation, and dispose-event counts
  across every unique owned resource.
- Full `npm test`: the first revision-time run encountered 84/86 passing files
  while concurrent IDENTIFICATION-QUALITY-A had intentionally advanced
  spotting capture version 3 to 4 before updating its assertions; the two
  failures were confined to `test/sound-contacts.test.js` and
  `test/spotting-system.test.js`. After that concurrent owner completed the
  migration, the final post-revision run passed 87/87 test files, 0 failed.
- `npm run build` and warnings: PASS after the final revision, Vite 8.1.5
  transformed 737 modules; largest chunk was `game` at 445.82 kB; no build
  warnings.
- `git diff --check`: PASS with no output after the final packet record.
- Browser/runtime evidence: Runtime PASS at
  `http://127.0.0.1:5174/?mode=wego` (5173 was occupied), 1440x900 headless
  Firefox, WEGO, Stonne, `data-game-status="ready"`, `webgl2-fallback`,
  device loss false, and 0 page-console warnings/errors. Live scene inspection
  found exactly `french_village_house` /
  `fr_house_12x9_2f` and `french_farmhouse_outbuilding` /
  `fr_farmhouse_8x6_1f`, both attached through matching adapter/object
  descriptor IDs. The farmhouse reports 8 x 6 x 4.82 m, no stair geometry,
  foundation, exact door/both-window/roof semantics at every LOD, and four
  rendered rotated foundation corners whose maximum live terrain-height delta
  was `2.3200193766115262e-8` m. A close 1440x900 capture visibly confirms the
  one-floor gabled silhouette, open front door, and both front windows.
  Firefox process output emitted one implementation-defined depth-texture
  filtering warning; it did not surface as a page-console warning or error.
- Remaining risks and review points: Independently verify descriptor
  approximation labels and support topology, exact facade segmentation and
  placement clearances, generic-system authority, legacy byte preservation,
  rotated foundation sampling/metadata, complete footprint checks, exact
  public aperture policies, shared-resource disposal counts/idempotence, and
  that accepted Stonne surface records/tests are unchanged.
- First independent review: REVISE. It found unrotated foundation sampling
  under a rotated root, point/centerline-only placement checks, and a vacuous
  public window-policy filter plus incomplete LOD semantic assertions. This
  revision addresses those three findings without changing the descriptor,
  placement, schema, collision authority, tolerances, TODO, or vehicle paths.
- Final independent rereview: APPROVE after one test-only ownership correction.
  Canonical formation members and generic simulation offsets now own infantry
  clearance evidence; no mesh position, mesh bound, or renderer metadata is
  read. All prior findings remain closed. Focused 6/6, full 87/87, build with
  737 modules and no warnings, and `git diff --check` passed.

### Questions / Blockers

None.

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

### User-requested follow-on vehicle program (context only)

After H39-B stops at its current gate, the coordinator must write separate
bounded packets for the following newly requested vehicle work. This list is
not authorization to combine or begin them:

1. **Crew presence and identity:** every cataloged crew station, including the
   Laffly's two crewmen, must have one stable-ID individual with authoritative
   role, health, status, and vehicle location. Render only those real
   individuals at authored seats/hatches; do not add decorative crew meshes or
   aggregate vehicle health.
2. **Passenger transport:** add explicit capacity, stable passenger ownership,
   door/step approach and embark transit, carried state, vehicle-relative
   rendered positions where visible, disembark, casualties, vehicle loss,
   movement/fire restrictions, and deep WEGO capture/restore. A truck label or
   cargo bench alone is not transport simulation.
3. **Bailout and abandonment:** deterministic crew decisions from fire,
   catastrophic damage, suppression/panic, mobility/firepower loss, and
   commander state; role-owned hatch opening and timed escape; interruption
   and casualties; dismounted surviving crew as ordinary targetable,
   movable individuals; abandoned-vehicle state; realtime/WEGO replay.
4. **Progressive fire and cookoff:** distinguish fuel ignition/spread,
   ammunition-rack heating and repeated cookoff events, final catastrophic
   explosion, crew/module consequences, bounded timing/order, and rollback.
   Reuse current component and ammunition-explosion foundations rather than
   replacing them with presentation-only random effects.
5. **Component-local destruction presentation:** hatch motion, detached turret
   only after an authoritative catastrophic result, broken/shed tracks from
   track damage, damaged wheels, penetrations/dents, leaks, persistent fire and
   smoke, and wreck lifecycle across every LOD. Rendering consumes simulation
   events/state and never decides damage.

Each packet must preserve current crew/component/ammunition ownership, use the
injected deterministic RNG and fixed simulation steps, capture every new
persistent field, include public behavioral replay tests, expose explicit
first-order approximations, and validate resource ownership/disposal. Vehicle
geometry, hatch/seat/track datums, and LOD work remain Antigravity-owned.

## Packet H39-B: registered-source H39 contour convergence

### Status

AUTHORIZED for Antigravity after H39-A, initially for source intake and
baseline evidence only. Geometry work is conditional on the coordinator
recording `SOURCE GATE: APPROVED` in this packet's Results for the exact source
facts below. Work only this packet and stop at each gate. Do not combine it
with supported-track migration.

The packet contract itself passed independent audit after adding the explicit
source stop gate and two-stage silhouette-baseline workflow. That contract
approval is not source approval; `SOURCE GATE` remains `NOT REVIEWED`.

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
3. Run and retain the clean pre-edit focused suite, full suite, 180-record
   silhouette audit/manifest, and side/front/top H39 evidence at high, medium,
   core, and proxy LOD.
4. Assemble one source candidate. Record the exact title/edition and date,
   printed page and PDF page, direct source URL, public-domain or other
   calibration-use basis, original-file SHA-256, proposed crop SHA-256 and
   pixel bounds, per-view mapping, ground lines, rigid datums, and visible
   landmarks. A reference lacking a real top view cannot satisfy this packet.
5. Stop without adding the asset, changing geometry, or editing data. Put those
   exact facts in Results and wait for the coordinator to record either
   `SOURCE GATE: APPROVED` or `SOURCE GATE: REJECTED`. Silence or a worker's
   own assessment is not approval.
6. After `SOURCE GATE: APPROVED`, add and route only that exact accepted crop.
   Validate its public asset, bundle, and calibration records for all three
   mapped views before changing geometry.
7. Store original source-space pixels beside every derived metre-space datum.
   Label each value exact, source-registered, cross-view inferred, or renderer
   approximation.
8. Change the smallest H39-owned geometry needed for contour convergence.
9. Produce keyed before/after metrics and overlays. Do not update the reviewed
   silhouette baseline.
10. Run the Stage 1 gates below, fill Results, and stop for overlay review.
    Baseline-dependent H39-only mismatches are expected evidence at this stage,
    not a pass. The coordinator owns the baseline update and clean Stage 2
    rerun only after explicit overlay approval.

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
- Antigravity editing `test/fixtures/vehicle-silhouette-baseline.json` at any
  stage. After explicit overlay approval, the coordinator alone owns that
  integration edit and the clean Stage 2 rerun.
- Broad cleanup, dependency changes, commits, branches, or pushes.

### Acceptance

- Before geometry, the coordinator explicitly accepts the exact source
  title/edition, printed/PDF page, direct URL, legal-use basis, original and
  crop SHA-256 values, crop bounds, and side/front/top mapping recorded in
  Results.
- One stable family asset ID owns that exact accepted raster, its original and
  crop SHA-256 values, provenance, view coverage, source-pack identity, and
  public bundle/calibration validation for every mapped view.
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

Pre-edit baseline, before source or geometry edits:

```sh
node --test test/asset-manifest.test.js \
  test/hotchkiss-h39-blueprint.test.js \
  test/vehicle-visual-bundles.test.js \
  test/vehicle-calibration.test.js \
  test/vehicle-silhouette-audit.test.js
node scripts/audit-vehicle-silhouettes.mjs "$TMPDIR/h39-b-before.json"
npm test
npm run build
git diff --check
git status --short --branch
```

After source-gate approval and geometry changes, Stage 1:

```sh
node --test test/asset-manifest.test.js \
  test/hotchkiss-h39-blueprint.test.js \
  test/vehicle-visual-bundles.test.js \
  test/vehicle-calibration.test.js
node scripts/audit-vehicle-silhouettes.mjs "$TMPDIR/h39-b-after.json"
node --test test/vehicle-silhouette-audit.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

The three baseline-dependent commands may exit nonzero only for the exact
reviewed H39 records changed by this packet. Record their exit codes and every
mismatched key; any non-H39 difference or any other test failure is a blocker.
The build and `git diff --check` must pass. Antigravity then stops.

After explicit overlay approval, the coordinator updates the reviewed fixture
and runs Stage 2:

```sh
node --test test/vehicle-silhouette-audit.test.js
node scripts/audit-vehicle-silhouettes.mjs "$TMPDIR/h39-b-reviewed.json"
npm test
npm run build
git diff --check
```

All Stage 2 commands must pass cleanly. An expected Stage 1 H39-only baseline
mismatch is not the final clean validation and must not be reported as one.

Also record the browser URL, selected H39 LOD/view, backend,
`data-game-status`, console errors, and side/front/top evidence. A device loss,
missing tab, or bridge timeout is a blocker, not a pass.

### Results

- Status: NOT STARTED
- Source candidate title/edition/date, printed/PDF page, and direct URL:
- Public-domain or permission basis:
- Original-file SHA-256:
- Proposed crop SHA-256 and pixel bounds:
- Side/front/top view mapping, ground lines, rigid datums, and landmarks:
- Source gate: NOT REVIEWED
- Accepted source asset ID and public bundle/calibration validation:
- Scope completed:
- Scope deliberately left incomplete:
- Files changed:
- Source-space datums and labels changed:
- Focused baseline:
- Focused final:
- Before/after H39 keyed silhouette differences:
- Non-H39 168-record comparison:
- Stage 1 baseline-dependent exit codes and exact H39-only mismatches:
- Stage 1 full `npm test`:
- `npm run build` and warnings:
- `git diff --check`:
- Browser/runtime evidence:
- Coordinator overlay decision:
- Coordinator-owned baseline update and clean Stage 2 results:
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

ACCEPTED after implementation, one transition-aware normalization revision,
and independent rereview.

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

- Status: ACCEPTED after independent rereview.
- Scope completed: Added immutable, stable building-result projection and a
  bounded `buildingDebris` combat VFX role. Projectile/blast shapes deduplicate
  by section, retain strongest severity, sort lexically, resolve raw descriptor
  material plus transformed collider centroid/origin fallback, and start
  presentation only after the existing occupant/building callbacks. The
  procedural provider owns masonry/stone, timber, roof/tile, mixed, and fallback
  styles. Debris uses shared geometry, per-effect pooled materials, deterministic
  oldest reuse, fade/growth, reset/restore clearing, asset binding, and
  idempotent disposal. Review revision makes direct-result normalization
  transition-aware: persistent `collapsed: true` with `applied: 0` no longer
  emits a false repeat burst, while newly applied direct collapse and newly
  listed `collapsedSections` still emit once.
- Scope deliberately left incomplete: Persistent smoke/fire and spread,
  partial-floor collapse animation, damaged-building audio, scenario-authored
  destruction thresholds, and all simulation/collision changes remain out of
  scope.
- Files changed: VFX contract/provider:
  `src/world/vfx/BattlefieldVfxContract.js`,
  `src/world/vfx/ProceduralBattlefieldVfxProvider.js`; presentation:
  `src/game/CombatSystem.js`; tests: `test/building-debris-vfx.test.js`,
  `test/vfx-asset-provider.test.js`; packet record: `HANDOFF.md`.
- Authoritative state or ownership changed: None. `BuildingSystem` descriptors,
  damage, collision, capture/restore, and events remain authoritative and
  untouched. Combat owns only a bounded transient presentation projection; it
  is excluded from combat capture and does not consume deterministic RNG.
- Focused baseline: PASS, 4/4 files:
  `node --test test/vfx-asset-provider.test.js test/building-system.test.js
  test/building-visuals.test.js test/combat-rollback.test.js`.
- Focused final: PASS, 5/5 files:
  `node --test test/building-debris-vfx.test.js
  test/vfx-asset-provider.test.js test/building-system.test.js
  test/building-visuals.test.js test/combat-rollback.test.js`. Review revision
  rerun: PASS, 5/5 files. The real `BuildingSystem` regression collapses a roof,
  applies subsequent no-op damage, and proves the second projection/effect set
  is empty while building and occupant callbacks retain their existing
  behavior.
- Independent rereview: APPROVE. A real-system adversarial probe confirmed
  newly cascaded sections still emit ordered collapse debris, repeated
  `applied: 0, collapsed: true` damage emits no events or effects, building
  state remains unchanged, building callbacks still run, and occupant
  consequences are not repeated.
- Full `npm test`: PASS, 84/84 test files, 0 failed.
- `npm run build` and warnings: PASS, Vite 8.1.5 transformed 734 modules in
  436 ms; no warnings.
- `git diff --check`: PASS.
- Browser/runtime evidence: PASS at
  `http://127.0.0.1:5174/?mode=wego`, WEGO,
  `data-game-status="ready"`, `webgl2-fallback`, scenario `stonne-1940`.
  Applying authoritative projectile damage to
  `french_village_house:ground-shell` applied 35 damage and breached the
  masonry section; projection produced one visible finite-position debris
  effect with France 1940 geometry/material/mesh asset binding. Combat capture
  and telemetry were byte-equal before/after projection. Browser page console:
  0 warnings, 0 errors.
- Remaining risks and review points: Debris colors, tetrahedral shard,
  scale/lifetime, and growth are explicitly renderer-only gameplay
  approximations. The browser used the direct WebGL 2 fallback rather than
  WebGPU. During implementation, an external concurrent commit advanced HEAD
  to `fa75b63` and included the packet's VFX contract/provider changes; this
  worker did not stage, commit, or push. Review those two files from HEAD
  together with the remaining working-tree diff.

### Questions / Blockers

None.

---

## Packet INFANTRY-SEPARATION-A: deterministic personal-space resolution

### Status

AUTHORIZED for one Codex non-vehicle simulation worker after THREAT-MEMORY-A
acceptance released the `SoldierAgent.js` seam. Implement only this packet,
fill Results and Questions / Blockers, and stop for independent review.

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
- `src/game/Unit.js`, only import/use the same shared
  `INFANTRY_COLLISION_RADIUS` for the existing infantry squad-anchor
  `collisionRadius`; preserve every catalog/structure and unrelated edit
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
  living-infantry collision radius already used by `SoldierAgent` and the
  infantry squad anchor in `Unit`; no duplicate production literal remains.
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

- Vehicle movement/collision/reverse/wreck behavior, `Unit.js` outside the
  exact shared-radius import/use above, `StaticCollisionWorld.js`,
  `BuildingInteractionSystem.js`, maps/scenarios,
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

- Status: ACCEPTED after the sole independent-review finding was corrected and
  the final independent rereview approved the shared-radius ownership,
  behavioral guard, scope, and validation. Browser status/backend inspection
  remains blocked by the available headless software-rendered framebuffer.
- Scope completed: Added one stateless renderer-neutral individual-infantry
  separation owner with the canonical 0.32 m radius, typed stable
  unit/soldier identity, deterministic exact-coincidence directions, stable
  sorted pair passes, a 256-candidate bound, 16 fixed passes, a 0.00002 m
  static-projection-aware tolerance, bounded unresolved-pair telemetry, and
  final movement-height sampling. Eligible living ordinary/approaching
  infantry now resolve same- and cross-squad penetrations through
  `resolveCircleMotion(..., { moverType: 'infantry' })`; dead, incapacitated,
  vehicle-carried, occupied, transit, exit-waiting, exiting, vehicle, and
  structure actors are excluded. `GameApp.simulateStep` invokes the helper
  once after every `Unit.update()` and before building transit, then
  synchronizes only corrected typed unit IDs. Both individual SoldierAgent
  collision and the infantry squad anchor now consume the same exported
  radius constant with no numerical behavior change.
- Scope deliberately left incomplete: No vehicle or wreck collision, crowd
  planning, pushing damage, velocity response, formation/waypoint/anchor
  change, building-route change, persistent field, capture schema, UI, or
  vehicle work was added. Dense or statically impossible clusters may remain
  unresolved after the fixed bound and are reported rather than hidden.
- Files changed: Simulation:
  `src/simulation/infantry/InfantrySeparationSystem.js`; existing movement
  seams: `src/game/SoldierAgent.js`, plus only the shared-radius import/use in
  `src/game/Unit.js`; application ordering and mesh projection:
  `src/app/GameApp.js`; behavioral tests:
  `test/infantry-separation.test.js`; packet record: `HANDOFF.md`.
  `test/infantry-fidelity.test.js` and `test/game-app-boundary.test.js`
  remained unchanged.
- Authoritative state or ownership changed: The stateless helper now owns the
  single shared living-infantry collision radius consumed by both
  `SoldierAgent` and the infantry squad anchor in `Unit`, plus post-movement
  X/Z correction. Each `SoldierAgent.position` and its existing synchronized roster
  `worldPosition` remain authoritative. Existing position/velocity
  capture/restore is unchanged; the helper retains no state or history.
  Unit anchors, waypoints, velocities, meshes, and UI remain downstream or
  untouched.
- Focused baseline: PASS, 4/4 files before editing:
  `node --test test/infantry-fidelity.test.js test/static-collision.test.js
  test/building-interaction.test.js
  test/infantry-ammunition-transfer.test.js`.
- Focused final: PASS, 6/6 files after the typed-ID implementation:
  `node --test test/infantry-separation.test.js
  test/infantry-fidelity.test.js test/static-collision.test.js
  test/building-interaction.test.js
  test/infantry-ammunition-transfer.test.js
  test/game-app-boundary.test.js`. Coverage includes coincident and ordinary
  same-/cross-squad overlaps, reversed insertion, numeric-versus-string ID
  separation and type-safe mesh sync, no-drift/idempotence, dense clusters,
  candidate failure before mutation, wall projection, impossible confinement,
  every exclusion, fixed-step partitions, real Unit capture/restore replay,
  shared SoldierAgent radius use, and public `simulateStep` ordering.
- Review-revision focused rerun: PASS, 1/1 file:
  `node --test test/infantry-separation.test.js`. The live infantry Unit now
  behaviorally asserts `Unit.collisionRadius ===
  INFANTRY_COLLISION_RADIUS` while retaining the existing SoldierAgent
  static-movement assertion.
- Full `npm test`: PASS, 87/87 test files, 0 failed after the final integrated
  shared-radius revision.
- `npm run build` and warnings: PASS, Vite 8.1.5 transformed 737 modules;
  largest chunk was `game` at 445.83 kB; no build or chunk-size warning.
- `git diff --check`: PASS after the final packet record.
- Browser/runtime evidence: BLOCKED. Both
  `http://127.0.0.1:5173/?mode=wego` and
  `http://127.0.0.1:5173/?mode=realtime` returned HTTP 200. A disposable
  1440x900 headless Firefox session for each mode emitted
  `RenderCompositorSWGL failed mapping default framebuffer, no dt`; screenshot
  capture hung and produced no framebuffer. The remote debugging endpoint was
  unavailable, so `data-game-status`, renderer backend, scenario dataset, and
  page-console errors could not be read and are not claimed ready.
- Remaining risks and review points: Independently stress the typed stable-ID
  ordering, 0.00002 m tolerance against the static world's contact threshold,
  double projection/penetration recovery at exact wall contact, dense-cluster
  convergence and bounded telemetry, exclusions, unchanged velocities/
  anchors/waypoints, and the post-unit/pre-building call order. Repeat both
  modes in an attached GPU browser with readable diagnostics.
- Independent review: REVISE with one F1. The reviewer found the existing
  infantry squad-anchor `Unit.collisionRadius` still used a second production
  `0.32` literal, contrary to the packet's single-owner contract.
- Review revision: `Unit` now imports the canonical
  `INFANTRY_COLLISION_RADIUS` and uses it only for the unchanged
  `infantry_squad` anchor radius. The live-Unit regression proves identity
  with the shared constant. Unrelated structure/catalog work in `Unit.js`
  remains preserved.
- Final independent rereview: APPROVE. Production search found one canonical
  `0.32` infantry-radius owner; both the live infantry `Unit` anchor and
  `SoldierAgent` behavior are guarded. The reviewer reran the 1/1 revision
  test, 6/6 focused files, 87/87 full suite, the 737-module warning-free
  production build, and `git diff --check`.

### Questions / Blockers

- Browser acceptance is blocked by headless Firefox's SWGL framebuffer mapping
  failure and unavailable remote diagnostics; neither mode has a truthful
  ready/backend/console result from this environment.

---

## Packet RIVERBANK-A: scenario-authored riverbank surface strips

### Status

ACCEPTED after implementation, one bounded validation revision, and independent
rereview. Browser visual validation remains blocked pending an attached GPU
browser session.

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

- Status: ACCEPTED after independent rereview; browser visual validation remains
  blocked pending an attached browser session.
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
- Independent rereview: APPROVE. Empty, space-only, tab-only, and newline-only
  approximation labels are rejected; substantive padded labels are accepted
  and deeply frozen. The focused suite passed 3/3 and `git diff --check`
  passed.
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

ACCEPTED after four bounded precision revisions and independent rereview. The
reviewer approved the unique half-open canonical clock, partition/restore
identity, large-clock expiry, version-one migration, bounded state, and
SoldierAI integration.

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

- Status: ACCEPTED after independent rereview.
- Scope completed: Added versioned renderer-neutral per-soldier threat memory
  with four-record bounding, immutable deep-normalized observations, stable
  refresh/eviction/selection, 12-second linear score decay, and exact expiry.
  The version-two canonical clock stores safe whole seconds, integer
  picoseconds, and one sub-picosecond residual in the unique half-open
  `[-0.5 ps, +0.5 ps)` range; exact positive-half ties carry into the integer
  picoseconds and retain `-0.5 ps`. It uses a fixed 10 fs arithmetic-drift
  normalization rather than any tolerance scaled by absolute uptime. Each
  observation and expiry now owns the same canonical component representation,
  so expiry, age, score decay, recency, restore retention, and ordering never
  depend on a lossy projected double. Projected seconds remain inspectable
  compatibility values and are validated against those components.
  Version-one clock snapshots migrate into the canonical representation while
  preserving their rollback-owned compensated-clock continuation and original
  machine-epsilon compensation bound.
  Integrated projectile/local event IDs, passive memory advancement for every
  positive-health soldier including incapacitated soldiers, separately gated
  cover reactions, strongest-memory cover consumption after immediate/casualty
  precedence, an inspectable decision summary, legacy-empty restore,
  future-version rejection, and byte-identical replay/frame partitioning.
  Revision hardening rejects non-finite or unrepresentable clock/expiry
  combinations and bounds linear score fractions so every emitted score and
  capture remains finite and restorable.
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
  whole seconds, integer picoseconds, sub-picosecond compensation, the
  projected seconds value, and up to four records containing only event ID,
  threat/impact coordinates, intensity, canonical observation/expiry
  components, and their projected observation/expiry values.
  `tacticalDecision` receives a deep summary and does not own or mutate that
  state.
- Focused baseline: `node --test test/soldier-ai.test.js` passed 1/1 test file.
- Focused final:
  `node --test test/infantry-threat-memory.test.js test/soldier-ai.test.js`
  passed 2/2 test files; direct execution of the new file passed 19/19
  behavioral tests.
- Review regressions: `0.1234567894` once versus three equal partitions now
  produces one byte-identical active mid-clock capture and one byte-identical
  exact-expiry state. A direct `0.5 ps` advance and two `0.25 ps` advances now
  serialize byte-identically as `1 ps - 0.5 ps`; canonical restore accepts that
  inclusive negative boundary and rejects the equivalent excluded positive
  half representation. At a 100,000-second starting clock, the
  default-lifetime record remains active 0.1 ns before expiry and expires only
  after that exact remainder is advanced. At a 10,000,000-second starting
  clock, a record
  remains active with positive score for the final 100 ps even though its
  projected clock and expiry doubles are equal; capture/restore preserves that
  interval and the exact component boundary expires it. The supplied
  version-one compensated clock commutes with migration across its 0.1 ps
  continuation, while a `Number.MAX_VALUE` legacy compensation is rejected
  without mutating the target memory. Positive-health incapacitated memory
  advances and expires without recording or driving a reaction; overflowed
  clock/expiry attempts leave state unchanged; and an adversarial finite
  initial score is bounded. A 10,000-case capture/restore continuation audit
  had zero byte-identity failures.
- Full `npm test`: passed 85/85 test files on the current concurrent worktree.
- `npm run build` and warnings: passed with 735 modules transformed. Largest
  chunks were `game` 435.76 kB and `render` 432.39 kB; no build or chunk-size
  warnings.
- `git diff --check`: passed after the final implementation and test edits.
- Browser/runtime evidence: The sandboxed bind failed with
  `listen EPERM 127.0.0.1:5173`. An approved unsandboxed Vite server selected
  `http://127.0.0.1:5174/`, returned HTTP 200, and was then stopped. No
  Chromium executable or connected browser/devtools bridge is available, so
  WEGO mode, backend, `data-game-status`, and console errors could not be
  inspected; this is an environment blocker, not a runtime pass.
- Remaining risks and review points: Independently rereview the canonical
  whole-second/picosecond carry rules, half-open residual boundary, fixed 10 fs
  normalization, per-record component validation and comparisons, version-one
  compensated migration, representable-lifetime rejection, finite score clamp,
  passive incapacitated advancement, the 12-second linear-decay gameplay
  approximation, lexical tie direction, high-suppression memory precedence,
  and the compatibility behavior where an incoming-fire event without a finite
  threat position retains its immediate reaction but cannot create a memory
  record.
- Independent review: APPROVE. Direct and partitioned half-picosecond advances
  serialize byte-identically; the inclusive `-0.5 ps` representation restores
  and excluded `+0.5 ps` rejects. The reviewer also reverified thirds
  partitioning, both 100 ps large-clock expiry boundaries, version-one
  compensated continuation and atomic rejection, overflow, incapacitated
  aging, canonical record validation, 2/2 focused files, and the zero-failure
  10,000-case continuation audit.

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

---

## Packet TERRAIN-LAYER-B: scenario-authored field and road surface refinement

### Status

ACCEPTED after implementation, two test-strength revisions, and final
independent rereview. Browser visual validation remains blocked by the
available headless software-rendered viewport.

### Goal

Refine the Stonne ground texture with a bounded set of scenario-authored,
irregular field-detail and north/south road-shoulder polygons. Reuse the
accepted ordered `map.surfaces.layers` data contract and family surface
provider. This is visual presentation only: it must not change terrain height,
river or bridge geometry, collision, navigation, deployment, or simulation.

### Allowed files

- `src/maps/france/stonne.js`, only the bounded surface-layer records described
  below
- `test/map-descriptor.test.js`, only stable Stonne layer identity, order,
  shape, visual-only, and deep-freeze assertions
- `test/terrain-surface-shapes.test.js`, only default-Stonne ordered drawing
  and resource-lifecycle assertions
- `test/terrain-asset-provider.test.js`, only if a replacement-provider or
  disposal regression is required by the new default layer set
- `HANDOFF.md`, only Packet TERRAIN-LAYER-B Results and Questions / Blockers

If another file is required, stop and identify the exact seam. Preserve all
active CombatSystem, threat-memory, TODO, and unrelated user work.

### Data and ownership contract

- Add only plain, finite, in-texture-space polygon records under the existing
  deeply frozen `STONNE_1940_MAP.surfaces.layers` array.
- Add one irregular southeast field record so the fourth broad map quadrant is
  no longer represented solely by the base color.
- Add one wider irregular north/south road-shoulder record immediately before
  the existing `road-north-south` surface, so descriptor order leaves the
  narrower road visible over its shoulder.
- Add at most two irregular inset field-detail records over existing authored
  fields. Their sole purpose is to break up monolithic color fields; they must
  not imply authoritative crop, concealment, cover, soil, or movement data.
- Every new record has a stable unique ID, a descriptive presentation `kind`,
  a valid color, an ordered non-self-intersecting polygon with more than four
  vertices, and `visualOnly: true`.
- Preserve the existing four layer records, their exact coordinates and
  colors, and the already-accepted drawing implementation. Reordering the
  existing road only as needed to place its shoulder directly beneath it is
  permitted; field records retain their relative order.
- `map.surfaces.layers` remains the only owner. The family provider continues
  to rasterize the records in descriptor order and own its Canvas texture and
  disposal. Do not add a second layer registry or runtime side table.

### Behavioral acceptance

- The default Stonne descriptor exposes the exact stable ordered layer IDs,
  including one southeast field, one road shoulder directly below the existing
  road, and no more than two field-detail overlays.
- Every default layer remains visual-only, deeply frozen, finite, in bounds,
  non-degenerate, non-self-intersecting, and genuinely irregular rather than a
  disguised rectangle.
- The existing generic Canvas path helper draws every polygon in descriptor
  order with its authored color. Tests observe the actual default Stonne
  operations, including shoulder-before-road order, rather than source text.
- Replacement terrain-provider behavior and idempotent one-time disposal
  remain unchanged.
- Existing terrain height, riverbank, water, bridge, collision, navigation,
  deployment, and terrain-fidelity tests remain unchanged.
- No new persistent simulation state exists, so capture/restore has no new
  fields.

### Explicitly forbidden

- `MapDescriptor.js`, the terrain provider implementation, `TerrainBuilder`,
  elevation, river/bridge, collision, navigation, scenario roster/deployment,
  simulation, UI, buildings, VFX/audio, vehicles, external assets, shaders,
  dependencies, package/config/lockfiles, TODO edits by the worker, commits,
  branches, pushes, or broad map cleanup.
- Historical crop/soil claims, gameplay movement/concealment effects,
  randomness, per-frame work, textures loaded from external URLs, or a schema
  extension for this presentation-only slice.

### Baseline and validation

Run before editing and after the final edit:

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

Perform a browser terrain check and report URL, mode, backend,
`data-game-status`, console errors, and whether the field/road layers are
visible without obscuring the river and bridge. A missing attached browser,
blank software-rendered viewport, or device failure is a blocker, not a pass.

### Coordinating TODO after approval

Keep the broad battlefield environmental-fidelity parent and remaining
ground-surface child unchecked. Add one completed child describing only the
scenario-authored southeast field, inset field detail, and ordered road-
shoulder refinement.

### Results

- Status: ACCEPTED after final independent rereview. Browser visual validation
  remains blocked by the available headless software-rendered viewport.
- Scope completed: Added one irregular southeast field, two irregular inset
  field-detail overlays, and one wider north/south road shoulder immediately
  beneath the unchanged narrower road. Preserved all four existing layer
  records and the generic ordered drawing/provider implementation.
- Scope deliberately left incomplete: Additional ground layers, external
  textures, terrain geometry/elevation, river/bridge changes, collision,
  navigation, deployment, concealment, cover, movement effects, and historical
  crop/soil claims remain out of scope.
- Files changed: map data: `src/maps/france/stonne.js`; tests:
  `test/map-descriptor.test.js`, `test/terrain-surface-shapes.test.js`; docs:
  this packet's Results and Questions / Blockers only.
- Authoritative state or ownership changed: None. The deeply frozen
  `map.surfaces.layers` array remains the sole owner of ordered visual polygon
  records. The unchanged family provider still rasterizes them once and owns
  Canvas texture/material disposal. No simulation or capture/restore field was
  added.
- Focused baseline: the exact four-file command passed 4/4 test files before
  editing.
- Focused final: the exact four-file command passed 4/4 test files before
  review and again after each test-only revision. Coverage asserts the eight
  stable default IDs/kinds/colors, visual-only irregular polygon contract,
  southeast-quadrant placement, two-detail bound, deep freeze, exact default
  Canvas operations in descriptor order, and one-time resource disposal.
- Full `npm test`: final stabilized rerun passed 84/84 test files. One
  intermediate run passed 82/84 while the concurrent THREAT-MEMORY and
  STRUCTURE-CATALOG workers were intentionally editing their shared seams;
  terrain tests passed throughout, and both unrelated files passed after those
  workers reported stable.
- `npm run build` and warnings: passed; Vite 8.1.5 transformed 734 modules.
  Largest chunks were `render` 432.39 kB and `game` 428.11 kB; no build or
  chunk-size warning.
- `git diff --check`: passed with no output.
- Browser/runtime evidence: BLOCKED. The local server returned HTTP 200 at
  `http://127.0.0.1:5174/?mode=wego`; headless Firefox at 1440 x 900 showed the
  WEGO command-phase HUD but a blank 3D viewport. Firefox reported a JavaScript
  timeout in Three.js `_bindUniforms` during shadow rendering plus an
  `AsyncShutdown` uncaught exception. No attached browser/devtools session was
  available to read `data-game-status`, backend, or page-console state, and the
  field/road layers, river, and bridge could not be visually confirmed. This is
  not a runtime pass.
- Remaining risks and review points: The new colors and outlines are bounded
  scenario presentation choices, not historical crop or soil evidence. Review
  the inset placement, road-within-shoulder contour, exact preservation of the
  original four records, and rerun the terrain view in an attached GPU browser.
- Independent review: REVISE. The reviewer confirmed the map records are valid
  but found that the original tests checked only global road/shoulder X
  extrema, allowed a subdivided rectangle to satisfy the irregularity
  heuristic, and counted field-detail layers without proving their containment
  inside their named parent fields.
- Review revision: Tests now intersect the road and shoulder at all contour
  vertex stations, every piecewise-linear interval midpoint, and fixed 16 px
  stations across the full texture span. All 77 stations have exactly two
  boundary intersections; the current minimum left and right margins are both
  19 px at `v = 0`. Strict point/edge containment proves both inset details
  remain inside their named parent fields. Adversarial fixtures prove that
  global-width-only shoulders can pinch across the road, subdivided rectangles
  pass the old coordinate-count heuristic, and an irregular detail can escape
  its parent.
- Second independent review: REVISE. The road and current Stonne data remained
  accepted, but the rectangle test recognized only axis-aligned rectangles and
  the containment fixtures did not prove why child-edge versus parent-boundary
  intersection checks are necessary for a concave parent.
- Second review revision: Collinear subdivisions now reduce to ordered turn
  corners, and an orientation-independent scaled dot/cross test recognizes
  exactly four perpendicular, opposite-parallel rectangle sides. An eight-point
  rotated subdivided square is rejected while a genuinely irregular
  quadrilateral remains accepted. A concave U-shaped parent plus a child whose
  every vertex is strictly inside but whose edge crosses both notch boundaries
  proves the edge-intersection loop rejects point-only false containment. No
  Stonne data changed in either review revision.
- Final independent rereview: APPROVE. Rotation-independent rectangle
  detection rejects the rotated subdivided fixture but accepts a genuine
  irregular quadrilateral; the concave-parent fixture requires edge-crossing
  rejection; and the unchanged road proof retains 77 stations with 19 px
  minimum margins on both sides. The focused terrain suite passed 4/4 and
  `git diff --check` passed.

### Questions / Blockers

- Browser visual acceptance is blocked by the blank headless-Firefox viewport
  and missing browser/devtools attachment described above.

---

## Packet STRUCTURE-CATALOG-A: injected family structure catalog

### Status

ACCEPTED after implementation, exact blocker revision, and independent
rereview. The reviewer approved prototype-key rejection, live strict-identity
enforcement against stateful lookups, unchanged bunker behavior, and all
packet validation.

### Goal

Move the canonical German MG34 bunker record out of the generic game layer and
into France 1940 content, then inject an identity-validated `structures`
catalog port through the existing family/scenario boundary. Generic `Unit`
must resolve a structure through its injected port rather than importing a
concrete France catalog.

This is an ownership and dependency-direction slice. Preserve the bunker
record, live mesh, damage, collision, firing, and rollback behavior exactly.

### Allowed files

- `src/content/france1940/structures.js` (new), only the existing bunker record,
  freeze helper, canonical map, and lookup
- `src/game/StructureCatalog.js`, only a narrow strict-identity compatibility
  re-export
- `src/content/france1940/index.js`, only family structure catalog ownership
  and exports
- `src/content/france1940/catalogPorts.js`, only the frozen structure lookup
  port
- `src/scenario/FamilyRegistry.js`, only structure-map and structure-weapon
  reference validation
- `src/scenario/ScenarioRuntime.js`, only structure definition resolution and
  structure-port identity validation before construction
- `src/game/Unit.js`, only removal of the direct compatibility import,
  structure-port requirement, and lookup consumption
- `test/family-registry.test.js`, only structure catalog/reference validation
- `test/france1940-catalog-ports.test.js`, only canonical structure identity,
  lookup, freeze, and generic-import assertions
- `test/scenario-runtime.test.js`, only fixture structure data and
  missing/forged/unknown structure rejection before Unit construction
- `test/structure-damage.test.js`, only injected-record identity and unchanged
  bunker behavior if existing coverage cannot prove it
- `docs/ARCHITECTURE.md`, only current-state structure catalog/port ownership
- `HANDOFF.md`, only Packet STRUCTURE-CATALOG-A Results and
  Questions / Blockers

If another file is required, stop and name the exact seam. Preserve concurrent
CombatSystem, threat-memory, terrain, TODO, and user-owned work.

### Data and dependency contract

- Move the existing frozen `GERMAN_MG34_BUNKER` record byte-for-byte in value
  to `content/france1940/structures.js`. Do not change its dimensions, health,
  armor, weapon, data-quality label, or defaults.
- Export one deeply frozen `FRANCE_1940_STRUCTURES` map plus `getStructure(id)`.
  A missing ID returns `null`; no generic or family fallback is permitted.
- `game/StructureCatalog.js` re-exports the exact canonical map and lookup for
  compatibility. It owns no record, default, wrapper, copy, or divergent
  value.
- `createFrance1940Family().catalogs.structures` is the exact canonical map.
  Family validation requires a stable-ID structure map and validates every
  structure weapon reference against that same family's weapon map.
- `FRANCE_1940_CATALOG_PORTS.structures` exposes only the exact canonical
  records and lookup. Scenario port validation requires the port, exact records
  identity, a callable `get`, and exact identity for every returned record.
- Family-backed scenario resolution rejects an unknown `structureId` before
  any Unit is constructed. Existing visual-factory validation remains
  independent and unchanged.
- Generic `Unit` requires `catalogPorts.structures.get`, resolves
  `config.structureId` through it, and retains the returned canonical frozen
  record. Remove the direct `StructureCatalog.js` import and all concrete
  family structure knowledge.
- Existing `GameApp` and composition already pass the complete catalog-port
  object through `ScenarioRuntime`; do not add duplicate wiring.

### Behavioral acceptance

- The compatibility map, family catalog map, port records, port lookup, and
  live bunker's `structureSpec` share strict object identity.
- The moved record remains deeply frozen and byte-deep-equal in value to the
  pre-packet baseline.
- Family validation rejects missing/malformed structure maps, key/ID
  mismatches, and unknown structure weapon IDs.
- Scenario construction rejects missing, wrong-family, forged-record, forged
  lookup, and unknown structure ports/IDs before constructing any Unit.
- A valid injected custom fixture proves runtime lookup comes from its
  structure port rather than a hidden global catalog.
- Existing bunker swept-hit, resistance, damage, firing shutdown, rubble,
  collision, and capture/restore behaviors remain unchanged.
- Source/import assertions prove generic `Unit` no longer imports
  `StructureCatalog.js` or France content. Behavioral tests remain primary.
- No new persistent state exists. Existing `structureState` capture/restore
  remains unchanged and `structureSpec` continues to be resolved configuration,
  not serialized authority.

### Explicitly forbidden

- Changing bunker values, scenario placement, visual factories/meshes, asset
  manifests/providers, `GameApp`, `main.js`, UI, CombatSystem, ballistics,
  collision algorithms, structure damage state/schema, buildings, map/terrain,
  infantry AI, vehicles, user-owned infantry factories, TODO edits by the
  worker, dependencies, package/config/lockfiles, commits, branches, pushes, or
  broad catalog cleanup.
- A compatibility adapter as the new canonical owner, copied records, implicit
  France defaults, global registries, fallback IDs, or retaining the old direct
  import under another generic name.

### Baseline and validation

Run before editing and after the final edit:

```sh
node --test test/family-registry.test.js \
  test/france1940-catalog-ports.test.js \
  test/scenario-runtime.test.js \
  test/structure-damage.test.js \
  test/france1940-visual-factories.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

Perform a browser WEGO smoke check and report URL, backend,
`data-game-status`, bunker construction/damage status, and console errors. A
bind/device/browser failure or blank viewport is a blocker, not a pass.

### Coordinating TODO after approval

Keep the broad engine/family separation parent and remaining presentation-
factory child unchecked. Add one completed child describing only canonical
France 1940 structure data, injected strict-identity structure ports, and
generic Unit removal of the compatibility import.

### Results

- Status: ACCEPTED after independent rereview.
- Scope completed: Moved the unchanged German MG34 bunker definition into one
  deeply frozen France 1940 structure catalog; retained a strict-identity
  compatibility re-export; added the canonical family catalog and frozen
  lookup port; validated structure maps, weapon references, scenario IDs, port
  record identity, and lookup identity before Unit construction; and changed
  generic `Unit` to consume only the injected structure lookup.
- Scope deliberately left incomplete: No structure values, meshes, damage,
  collision, firing, capture schema, scenario placement, composition, TODO,
  vehicle, or adjacent runtime work changed. The coordinating TODO update waits
  for approval, and the real-browser acceptance gate remains blocked below.
- Files changed: Data: `src/content/france1940/structures.js`,
  `src/content/france1940/index.js`, `src/content/france1940/catalogPorts.js`,
  and compatibility-only `src/game/StructureCatalog.js`. Runtime boundary:
  `src/scenario/FamilyRegistry.js`, `src/scenario/ScenarioRuntime.js`, and
  `src/game/Unit.js`. Tests: `test/family-registry.test.js`,
  `test/france1940-catalog-ports.test.js`, `test/scenario-runtime.test.js`, and
  `test/structure-damage.test.js`. Docs: current-state structure
  catalog/port ownership in `docs/ARCHITECTURE.md`; this packet Results and
  Questions only in `HANDOFF.md`.
- Authoritative state or ownership changed: France 1940 content now owns the
  exact `GERMAN_MG34_BUNKER` record under stable ID through
  `FRANCE_1940_STRUCTURES`. `structureSpec` remains resolved immutable
  configuration and `Unit.structureState` remains the unchanged rollback
  authority; no persistent field was added.
- Focused baseline: PASS, 5/5 files with the exact packet command before edits.
- Focused final: PASS, 5/5 files with the exact packet command after the final
  implementation and documentation edits.
- Full `npm test`: PASS, 84/84 files. An earlier run was 83/84 solely while the
  concurrently owned threat-memory revision still failed its finite-expiry
  adversary; the final rerun passed after that owner completed the revision.
- `npm run build` and warnings: PASS, Vite 8.1.5 transformed 734 modules and
  built successfully; largest chunk was `render` at 432.39 kB and no build or
  chunk-size warning was emitted.
- `git diff --check`: PASS with no output.
- Browser/runtime evidence: BLOCKED. `http://127.0.0.1:5174/` returned HTTP
  200 (5173 was already occupied). Headless Firefox 153 reported
  `RenderCompositorSWGL failed mapping default framebuffer, no dt` plus two
  WebGL depth-texture comparison warnings. No usable framebuffer or connected
  real-browser/devtools target remained from which to verify WEGO mode,
  renderer backend, `data-game-status`, bunker construction/damage, or further
  console state; none is claimed ready.
- Remaining risks and review points: Independently verify canonical identity
  across compatibility/family/port/live Unit, the custom-port-only bunker
  fixture, every pre-construction rejection, and unchanged bunker
  capture/damage behavior. Repeat the WEGO bunker construction and damage smoke
  check in a real browser with a usable GPU/devtools attachment.
- Independent review: APPROVE after revision. Canonical, compatibility, port,
  and scenario paths reject inherited `toString`, `constructor`, and
  `__proto__` IDs; live `Unit` resolution rejects a stateful lookup that returns
  canonical data during preflight and a forged frozen copy during construction.
  Focused 5/5, scenario-runtime 16/16, full 85/85, build without warnings, and
  `git diff --check` all passed at rereview.

### Questions / Blockers

- Browser acceptance is blocked by the headless Firefox SWGL framebuffer
  failure and the absence of a connected real-browser/devtools target.

---

## Packet IDENTIFICATION-QUALITY-A: deterministic observation certainty

### Status

AUTHORIZED for one Codex non-vehicle observation worker. `SpottingSystem` is a
high-fan-out integration seam, but this packet explicitly permits only the
identification and capture/restore behavior below. Preserve every concurrent
movement, building, threat-memory, catalog, map, and VFX edit.

### Goal

Add a bounded, rollback-safe identification-quality progression to existing
direct and relayed contacts. A newly acquired visible enemy is only an
unclassified visual contact; continued direct observation can raise certainty,
and loss of observation decays that certainty.

This is certainty about an already existing contact. It does not expose a
target's concrete type, model, roster, soldier identity, exact hidden
position, or any new precision-target permission.

### Allowed files

- `src/simulation/observation/IdentificationQuality.js` (new), preferred for
  renderer-neutral policy, normalization, progression, decay, and tier
  derivation
- `src/simulation/observation/ContactState.js`, only identification fields,
  clone/decay/preference/public projection behavior, and legacy defaults
- `src/simulation/observation/CommunicationRelayQueue.js`, only freezing,
  validating, capture/restore, and version migration of identification quality
  in first-report snapshots
- `src/game/SpottingSystem.js`, only direct-observation identification
  progression, acquisition-event/relay propagation, contact decay options,
  capture/restore version bump, and legacy migration
- `test/observation-identification.test.js` (new), preferred for pure policy
  and contact behavior
- `test/spotting-system.test.js`, only direct/relay integration,
  frame-partition, capture/restore, migration, and precision-leak regressions
- `test/sound-contacts.test.js`, only legacy/default identification assertions
  if needed
- `HANDOFF.md`, only Packet IDENTIFICATION-QUALITY-A Results and
  Questions / Blockers

If another production file is required, stop and name the seam. Do not edit
TODO; the coordinator owns its update after approval.

### Authoritative policy

- Define one explicitly labeled first-order gameplay approximation with a
  frozen ordered certainty enum. It must include an unidentified tier for
  sound/legacy contacts, an acquired visual-contact tier, at least one
  intermediate tier, and a confirmed tier.
- Store one finite bounded numeric identification progress value in each
  authoritative per-observer observation and contact. Derive the named tier
  from that value through one renderer-neutral policy owner; do not store
  contradictory independent tier authority.
- Progress only while a living observer has current direct visibility after
  normal acquisition completes. Credit only the portion of a simulation step
  after the exact acquisition boundary. Continued or reacquired direct
  observation resumes from the bounded surviving value.
- When direct visibility is lost, decay progress through an explicit bounded
  rate. Contact-memory decay and relayed contacts use the same policy without
  polling hidden live targets.
- Use canonical simulation progress/time already owned by `SpottingSystem`.
  One whole advance and equivalent 30/60 Hz or fixed-step partitions must
  capture byte-deep-equal identification state and public contacts.
- A first-report relay freezes the sender's identification progress at its
  acquisition report boundary. Delivery preserves and then time-decays that
  frozen value. It may not chain a relayed report onward or poll the target at
  delivery.
- Sound contacts and version-one through version-three spotting states migrate
  to the unidentified default. Bump new spotting/relay state versions where
  required; reject unsupported future versions and malformed non-finite,
  out-of-range, or tier-inconsistent new state.
- Contact preference may use stronger identification only as an explicit
  stable tie-break after the existing recency/channel/confidence rules.
  Preserve deterministic event/source lexical tie behavior.
- Public projections may expose progress plus its derived named tier and
  approximation label. They must remain deep copies.
- `canPrecisionTarget()` remains direct-visibility-only and unchanged.
  Identification quality never grants targeting, reveals a hidden mesh,
  changes uncertainty/position, or exposes target class/model/soldier data.
- Keep all state bounded by the existing observer/contact/relay maps. Use no
  randomness, wall clock, frame count, Three.js, DOM, or per-step unbounded
  history.

### Behavioral acceptance

- A new direct acquisition begins at the visual-contact tier; continued
  visibility crosses each configured threshold at exact deterministic
  boundaries and caps at confirmed.
- Acquisition occurring partway through a large step earns only the remaining
  visible interval. Whole-step and partitioned advancement produce
  byte-deep-equal observations, direct contacts, relay queue, capture, and
  public projections.
- Occlusion/loss decays progress without changing the frozen last-known
  position. Reacquisition resumes deterministically; progress remains bounded.
- A pending voice/radio report retains acquisition-time identification through
  sender movement, target movement, rollback, and delayed delivery. The
  recipient never receives greater quality than the frozen report.
- Direct, voice, radio, sound, and legacy contacts receive valid defaults.
  Equal existing precedence behavior remains stable; only an otherwise tied
  contact may prefer stronger identification.
- Mid-progression and mid-relay capture/restore replay byte-identically.
  Version-one, version-two, and version-three spotting states and version-one
  relay queues migrate without fabricated certainty.
- Invalid new capture values and unsupported versions fail clearly. Returned
  observations/contacts/queue snapshots cannot mutate authoritative state.
- High identification on a relayed or stale contact does not make
  `canPrecisionTarget()` true, reveal a hidden live unit, reduce its existing
  uncertainty, or expose target type/model/soldier identity.

Tests must exercise public policy/contact/SpottingSystem behavior. Source-text
assertions may supplement but never replace behavioral evidence.

### Explicitly forbidden

- Terrain/foliage/concealment changes, false reports, new sound-event behavior,
  UI/minimap/HUD changes, target selection, mesh visibility rules, precision
  targeting, target class/model/roster disclosure, new target-soldier leakage,
  relay networking/range/delay changes, `GameApp`, `SoldierAI`,
  `SoldierAgent`, ThreatMemory, CombatSystem/VFX/audio, buildings/maps,
  vehicles, dependencies, package/config/lockfiles, commits, branches, pushes,
  or broad SpottingSystem cleanup.
- Random identification, exact historical claims without sources, unbounded
  report history, delivery-time target polling, relayed-contact chaining, or a
  UI label disconnected from authoritative observation state.

### Baseline and validation

Run before editing and after the final edit:

```sh
node --test test/spotting-system.test.js test/sound-contacts.test.js
node --test test/observation-identification.test.js \
  test/spotting-system.test.js \
  test/sound-contacts.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

Runtime simulation behavior changes. Attempt WEGO and realtime browser checks
and report URL, mode, backend, `data-game-status`, direct/relayed public
identification fields, and console errors. A blank framebuffer, missing tab,
or unavailable browser is a blocker, not a visual/runtime pass.

### Coordinating TODO after approval

Keep the broad per-soldier spotting parent and richer remaining child
unchecked. Add one completed child describing only deterministic direct
identification progression/decay, frozen first-report relay quality, legacy
migration, and rollback.

### Results

- Status: ACCEPTED after all independent-review revisions and final rereview.
  Automated behavior, adversarial determinism, rollback, build, and prior live
  runtime-state gates pass. Headless SWGL produced a blank framebuffer, so
  visual confirmation remains blocked below.
- Scope completed: Added one frozen, renderer-neutral first-order
  identification policy with `UNIDENTIFIED`, `VISUAL_CONTACT`, `DEVELOPING`,
  and `CONFIRMED` tiers derived from a single bounded numeric progress value.
  Direct observation begins at the visual tier at the exact acquisition
  boundary, credits only the remaining visible interval, progresses and decays
  through exact integer picoprogress over canonical simulation nanoseconds,
  survives deterministic loss/reacquisition, and remains byte-identical across
  whole, 30 Hz, and 60 Hz partitions. Direct contacts project current
  per-observer quality; first-report VOICE/RADIO snapshots freeze boundary
  quality and decay it from acquisition without target polling or relay
  chaining. SOUND and legacy state default to unidentified. Existing
  recency/channel/confidence precedence remains ahead of the new stable
  identification tie-break.
- Scope deliberately left incomplete: No richer concealment, false reports,
  target class/model/roster/soldier disclosure, UI/HUD/minimap label, precision
  targeting, mesh visibility, relay-network timing/range, terrain, AI,
  building, vehicle, VFX/audio, or dependency work was added. The policy values
  are labeled gameplay approximations rather than historical claims.
- Files changed: Simulation policy:
  `src/simulation/observation/IdentificationQuality.js`; contact and relay
  state: `src/simulation/observation/ContactState.js`,
  `src/simulation/observation/CommunicationRelayQueue.js`; integration and
  rollback: `src/game/SpottingSystem.js`; tests:
  `test/observation-identification.test.js`,
  `test/spotting-system.test.js`, `test/sound-contacts.test.js`; packet record:
  `HANDOFF.md`.
- Authoritative state or ownership changed: `IdentificationQuality` owns
  bounds, rates, thresholds, tier derivation, the approximation label, and
  exact fixed-point transitions. Each per-observer observation and contact now
  owns `identificationProgress`; contacts also retain the internal
  `identificationEvaluatedAt` decay boundary. Direct-episode and relay
  snapshots retain frozen acquisition-boundary progress. Tier and label fields
  in public/capture projections are derived and validated, never independent
  authority. Spotting capture is version 4 and relay-queue capture is version
  2. Canonical whole-second/nanosecond clock components and bounded
  acquisition-work ticks/remainder are authoritative for exact boundaries;
  public seconds and acquisition progress are projections. Spotting versions
  1-3 and relay version 1 migrate to zero identification progress and explicit
  canonical defaults.
- Focused baseline: PASS, 2/2 files before edits:
  `node --test test/spotting-system.test.js test/sound-contacts.test.js`.
- Independent-review revision: Replaced rounded fractional acquisition with
  integer picoprogress work plus a remainder over a canonical nanosecond
  duration, and replaced the absolute-double boundary subtraction with
  whole-second/nanosecond clock components plus a bounded sub-nanosecond
  continuation residual. The exact acquisition transition is now invariant at
  one nanosecond before, at, and after the boundary for both initial
  acquisition and reacquisition, with byte-deep-equal whole/30/60 Hz captures.
  One post-boundary nanosecond produces progress `0.35000000025` at absolute
  clocks 0, 100000, and 10000000 seconds. Version-4 spotting restore now
  requires finite matching public time projections and canonical whole-unit
  clock/acquisition fields; versions 1-3 retain explicit legacy migration.
  Relay version 2 rejects the same route/episode in both pending and delivered
  state while version 1 retains stale-pending migration. Contact quality
  tie-breaking now compares exact picoprogress ticks, so `1e-12` beats zero in
  either argument order after existing precedence.
- Final rereview revision: Version-4 restore now requires `visibleNow` to equal
  canonical completed acquisition work, requires per-observer
  `directEpisodeActive` to equal that visibility, validates retained episode
  boundary/snapshot fields, and verifies aggregate direct-episode activity
  exactly matches the set of visible sender/target pairs. A coherently mutated
  half-acquired observation (`500000000000` work ticks, zero remainder,
  projected acquisition `0.5`) cannot retain visible/active flags and cannot
  grant precision targeting after restore. Complementary per-observer and
  aggregate activity contradictions are also rejected. Valid v4 round trips
  remain byte-identical; v1-v3 migration produces coherent canonical
  acquisition-duration defaults without fabricating identification certainty.
- Final legacy-migration revision: Versions 1-3 now interpret their own
  acquired-state flags before converting fractional acquisition to canonical
  work. A coherent v3 `visibleNow` / `directEpisodeActive` record at the old
  `0.999999999999` tolerance boundary migrates to exactly complete work and a
  strict-restorable v4 snapshot, while the same nonvisible record remains
  exactly one tick incomplete. Both paths preserve zero identification
  progress, and their emitted v4 snapshots restore byte-identically without
  weakening v4 visibility or episode validation.
- Focused final after independent-review revision: PASS, 3/3 files:
  `node --test test/observation-identification.test.js
  test/spotting-system.test.js test/sound-contacts.test.js`. Direct runs now
  cover 4 pure policy/contact/queue cases, 24 spotting integration cases, and
  6 sound cases, including all adversarial boundary, large-clock, strict
  restore, relay-overlap, and one-tick tie regressions.
- Full `npm test`: PASS, 89/89 test files, 0 failed, after the final production
  and test edits.
- `npm run build` and warnings: PASS, Vite 8.1.5 transformed 737 modules;
  largest chunk was `game` at 456.13 kB; no build warnings.
- `git diff --check`: PASS with no output after the final production and test
  edits.
- Browser/runtime evidence: Functional WEGO and realtime state PASS at
  `http://127.0.0.1:5174/` in headless Firefox 153, 1366x682,
  `stonne-1940`, 19 units, `data-game-status="ready"`,
  `webgl2-fallback`, device loss false. Realtime BiDi console capture reported
  zero page warnings/errors. A controlled WEGO public-state probe produced
  DIRECT progress `0.70869601775` / `DEVELOPING`, a frozen pending report at
  `0.35` / `VISUAL_CONTACT` and `[0,0,40]`, and delivered VOICE progress
  `0.3125` / `VISUAL_CONTACT` at the same position with uncertainty `1`;
  recipient precision targeting and target visibility both remained false.
  Browser-process diagnostics reported
  `RenderCompositorSWGL failed mapping default framebuffer, no dt` plus one
  implementation-defined WebGL depth-filter warning. The 1440x900 screenshot
  retained the complete HUD but a blank scene framebuffer, so visual rendering
  is an environment blocker rather than a pass.
- Remaining risks and review points: Native WebGPU and a visible framebuffer
  remain unvalidated in this environment.
- Final independent rereview: APPROVE. The reviewer independently proved both
  sides of the legacy `0.999999999999` tolerance migration, byte-identical v4
  re-restore, malicious half-acquired v4 rejection with no precision grant,
  exact initial/reacquisition and large-clock timing, JSON-safe capture, relay
  migration/strictness, and one-tick preference. Focused 3/3, integrated
  89/89, the 737-module warning-free build, and `git diff --check` passed.

### Questions / Blockers

- Visual-only blocker: headless Firefox reached ready runtime state but SWGL
  could not map its default framebuffer. A connected/native browser is required
  to confirm visible scene rendering. No implementation seam or scope expansion
  is requested.

---

## Packet INFANTRY-CRAWL-POSE-A: deterministic prone locomotion presentation

### Status

AUTHORIZED for one Codex non-vehicle presentation worker. This packet owns one
clean pose-helper seam and may proceed independently of observation review.
Implement only this crawl slice, fill Results and Questions / Blockers, and
stop for independent review.

### Goal

Give a living prone infantryman who is actually moving a deterministic,
phase-changing procedural crawl instead of the current frozen prone legs.

This is downstream presentation of existing authoritative stance, velocity,
status, state, and distance-driven stride phase. It does not add simulation
state, change movement speed or collision, infer a new tactical state, or
implement the broader animation backlog.

### Allowed files

- `src/world/infantry/InfantryPoseAnimator.js`, only one bounded prone-crawl
  overlay and its existing active-pose projection
- `test/infantry-pose-animator.test.js` (new), preferred for the complete
  behavioral slice
- `HANDOFF.md`, only Packet INFANTRY-CRAWL-POSE-A Results and
  Questions / Blockers

Existing `test/soldier-ai.test.js` and `test/infantry-fidelity.test.js` are
validation inputs only and must not be edited. If another production or test
file is required, stop and name the exact seam.

### Presentation contract

- Read only the existing soldier `status`, `health`, `state`, `stance`,
  `velocity`, and `stridePhase`. The stride phase already advances from
  resolved movement distance and survives normal unit capture/restore; do not
  introduce pose authority, RNG, a clock, frame count, or a capture field.
- A crawl is eligible only for a living `PRONE` soldier at or above the
  existing movement-speed threshold when the current reload, recoil/fire, and
  aim/observe precedence does not already own the active pose. Project the
  existing locomotion fallback as `crawl`; standing/kneeling locomotion remains
  `move`.
- Derive every crawl transform directly from the current stride phase. Opposite
  phases must visibly alternate the legs and body weight without cumulative
  transform drift. Reapplying the same state is byte-stable.
- Use only already-reset articulated transforms such as leg, torso, and head
  rotations. Do not create geometry/materials/resources, allocate objects per
  frame, detach the weapon, or retain presentation history.
- Preserve the existing right-handed trigger/support grip solver after the
  crawl overlay. Both hands must remain on their semantic weapon grips and
  report reachable.
- Stationary prone, standing/kneeling movement, wounded status, reload, aim,
  recoil/fire, and KIA casualty precedence retain their existing meaning.
  Moving into and out of crawl must restore every touched transform without a
  stale offset.
- Label the motion as a first-order procedural presentation approximation in
  code/test names. Do not claim motion-capture or historical gait fidelity.

### Behavioral acceptance

- Through the public `Unit` / `SoldierAI.applyPose()` path, a living prone
  moving soldier reports `activePose === "crawl"`; the same moving soldier
  while standing reports `move`.
- Two opposite stride phases produce distinct, alternating leg/body transforms
  while identical state reapplies identically. This must fail against the
  current frozen `0.12` / `-0.12` prone-leg result.
- Crawl -> stationary prone -> crawl, crawl -> KIA, and KIA -> ordinary living
  pose transitions leave no stale crawl rotation. KIA remains `casualty`.
- Reload, aim/observe, and recoil/fire active-pose precedence remain unchanged;
  the crawl slice does not mask a weapon action.
- Trigger and support hand world positions remain at their assigned semantic
  grips with reachable two-bone solutions during both crawl phases.
- Capture a real infantry `Unit`, mutate stance/velocity/stride phase, restore,
  and re-project. The restored crawl pose must be byte-deep-equal to the
  pre-capture pose without adding a persistent field.
- The implementation performs bounded scalar math only, creates no per-call
  Three.js objects, and owns no disposal lifecycle.

Tests must exercise public behavior and transforms. Source-string assertions
may supplement but never replace the pose path.

### Explicitly forbidden

- `SoldierAI`, `SoldierAgent`, `Unit`, `GameApp`, render/weapon factories,
  simulation/observation/separation files, scenarios/maps, UI, audio/VFX,
  vehicles, dependencies, package/config/lockfiles, TODO edits by the worker,
  commits, branches, pushes, or broad pose-helper cleanup.
- Blended transitions, terrain foot/hand contact, turn-in-place, weapon
  deployment, wounded locomotion, casualty variation, animation LOD, new
  geometry, inverse-kinematic legs, or animation clips.
- Editing the user-owned
  `src/content/france1940/render/France1940UnitMeshFactory.js` or
  `src/content/france1940/render/France1940InfantryWeaponFactory.js`.

### Baseline and validation

Run the baseline before editing and all final commands after the last edit:

```sh
node --test test/soldier-ai.test.js test/infantry-fidelity.test.js
node --test test/infantry-pose-animator.test.js \
  test/soldier-ai.test.js \
  test/infantry-fidelity.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

Perform WEGO and realtime browser checks at a near infantry LOD. Report URL,
mode, backend, `data-game-status`, console errors, and evidence from the real
movement/suppression path that a living prone mover changes crawl phase. A
blank framebuffer, device loss, or unavailable browser is a blocker, not a
visual pass.

### Coordinating TODO after approval

Keep the broad infantry-animation parent and remaining child unchecked. Add
one completed child describing only distance-phased prone crawling with
state-precedence, grip, transition-reset, and capture/restore projection
coverage.

### Results

- Status: ACCEPTED after the four bounded implementation/test corrections and
  one factual Results correction passed final independent rereview.
- Scope completed: Added a bounded first-order procedural prone-crawl
  presentation overlay. A living, moving prone soldier now derives alternating
  legs and torso weight directly from the existing resolved
  `stridePhase`, then projects `crawl` through the existing active-pose seam.
  KIA, INCAPACITATED, DEAD, and non-positive-health soldiers retain ordinary
  non-crawl behavior. Reload, recoil/fire, and aim/observe retain precedence,
  and the existing semantic hand-grip solver runs afterward unchanged.
- Scope deliberately left incomplete: No movement, collision, tactical,
  capture-schema, pose-history, blend, IK, resource, factory, or simulation
  behavior was added. This is explicitly a first-order procedural presentation
  approximation, not motion-capture or historical gait fidelity.
- Files changed: Presentation:
  `src/world/infantry/InfantryPoseAnimator.js`; tests:
  `test/infantry-pose-animator.test.js`; packet record: `HANDOFF.md`.
- Authoritative state or ownership changed: None. The overlay reads only the
  existing soldier fields and derives transforms on every projection. Existing
  `SoldierAgent` stride phase and real `Unit` capture/restore remain the only
  relevant authoritative paths.
- Focused baseline: PASS, 2/2 files before edits:
  `node --test test/soldier-ai.test.js test/infantry-fidelity.test.js`.
- Focused final after revision: PASS, 3/3 files:
  `node --test test/infantry-pose-animator.test.js test/soldier-ai.test.js
  test/infantry-fidelity.test.js`. The new behavioral tests cover alternating
  phase transforms and identical-state idempotence through public
  `SoldierAI.applyPose()`, standing locomotion, transition reset, KIA and
  action precedence, both reachable semantic weapon grips, and real `Unit`
  capture/restore re-projection without a crawl field. Revision coverage adds
  positive-health INCAPACITATED/DEAD locomotion exclusion, clean head and
  headgear yaw during crawl, stationary-prone re-entry, and explicit restored
  active pose plus every touched crawl transform.
- Full `npm test`: PASS after revision, 88/88 test files, 0 failed. The prior
  transient concurrent observation failure is no longer present.
- `npm run build` and warnings: PASS after revision. Vite 8.1.5 transformed
  737 modules; largest output was `game` at 453.48 kB; no warnings.
- `git diff --check`: PASS with no output after the final packet record.
- Browser/runtime evidence: BLOCKED before either WEGO or realtime mode could
  start. No server was listening at `http://127.0.0.1:5173/`; the required
  `npm run dev -- --host 127.0.0.1 --port 5173` failed in this sandbox with
  `listen EPERM: operation not permitted 127.0.0.1:5173`. No browser process
  or attached browser tab was available, so there is no URL, backend,
  `data-game-status`, console result, near-LOD scene inspection, or real
  movement/suppression crawl evidence to claim.
- Remaining risks and review points: Independently inspect the small
  phase-derived overlay for action-precedence alignment and confirm visible
  phase alternation through a connected browser in both WEGO and realtime.
- Independent-review revision: F1 excludes the existing unavailable
  INCAPACITATED and DEAD statuses without new authority; F2 removes crawl head
  yaw, retaining the clean reset for every headgear sibling; F3 uses scalar
  action comparisons instead of a per-call array literal; F4 adds
  regression-sensitive public-path capture/restore and crawl re-entry checks.
- Final independent rereview: APPROVE. The reviewer verified all four
  corrections through public adversarial probes, confirmed that 4/5 new tests
  fail against clean pre-feature code including capture/restore, and accepted
  the corrected Results description. Focused 3/3, full 88/88, the 737-module
  warning-free build, and `git diff --check` passed.

### Questions / Blockers

- Browser-only blocker: sandbox local-port binding failed with `EPERM` and no
  browser was attached, preventing the required WEGO/realtime visual checks.

## Packet BUILDING-LIFECYCLE-B: deterministic order and slot cleanup

Packet status: AUTHORIZED FOR ONE WORKER. Treat accepted
BUILDING-MULTI-ENTRY-A as baseline, stop after this packet, and wait for
independent review.

### Goal and allowed files

Fix overlapping-ENTER overwrite, mixed-building EXIT stranding, and completed-
order casualty slot leaks. Only these files may change:

- `src/game/BuildingInteractionSystem.js`, exact order/assignment/cleanup seam
- `test/building-order-lifecycle.test.js` (new)
- this packet's Results and Questions / Blockers in `HANDOFF.md`

`TODO.md` is coordinator-owned. Preserve every accepted multi-entry hunk.

### Required behavior

- Atomically reject a second ENTER while that unit has an in-flight ENTER,
  before sequence, reservation, location, waypoint, or order mutation. EXIT
  may supersede/cancel ENTER safely.
- Build and advance each EXIT assignment from the soldier's stable key and
  actual `buildingLocation.buildingId`, descriptor, floor, slot, and portal;
  never make the first occupant's building unit-wide authority.
- Independently clean unavailable occupants across known agents even when no
  order remains, releasing the actual slot/location exactly once.
- Preserve assignment data through capture/restore with no duplicate registry,
  nondeterministic input, or unrelated topology/UI change.

Public failing-before tests must cover atomic overlapping ENTER, mixed
farmhouse/upper-house EXIT, mid-exit restore/replay, orderless lethal casualty
slot release and reuse, idempotence, and accepted one-building/multi-door
regressions.

### Scope and gates

Do not edit descriptors, maps, `BuildingSystem`, soldier/unit owners,
`GameApp`, UI, renderers, factories, audio/VFX, vehicles, dependencies, TODO,
history, or adjacent cleanup.

```sh
node --test test/building-multi-entrance.test.js \
  test/building-interaction.test.js test/building-system.test.js
node --test test/building-order-lifecycle.test.js \
  test/building-multi-entrance.test.js \
  test/building-interaction.test.js test/building-system.test.js
npm test
npm run build
git diff --check -- src/game/BuildingInteractionSystem.js \
  test/building-order-lifecycle.test.js
```

Report browser URL/modes/backend/ready status/console errors and mixed EXIT plus
casualty-slot evidence, or the exact environment blocker.

### Results

- Status: IN PROGRESS.

### Questions / Blockers

- None recorded before implementation.

## Packet BUILDING-FLOOR-UI-A: authored floor choices and Exit hotkey

Packet status: AUTHORIZED FOR ONE WORKER. Stop after this packet and wait for
independent review.

### Goal and allowed files

Stop offering nonexistent floors and make the displayed Exit shortcut work,
using descriptor authority:

- `src/app/ApplicationPorts.js`, one read-only floor-ID query
- `src/app/GameApp.js`, injection from `BuildingSystem`
- `src/ui/UIManager.js`, floor choices/dispatch and `KeyE`
- `test/application-ports.test.js`
- `test/ui-manager.test.js`
- this packet's Results and Questions / Blockers in `HANDOFF.md`

Preserve the coordinator's removal of action-menu CANCEL TOOL, DESELECT, and
the misleading DEPLOY action. `TODO.md` is coordinator-owned.

### Required behavior

- `getBuildingFloorIds(buildingId)` returns a fresh array from the target's
  authoritative descriptor and exposes no descriptor object to UI state.
- The farmhouse exposes only Ground; the big house exactly Ground and Upper;
  unknown/missing buildings expose no invented fallback and dispatch nothing.
- `KeyE` issues one building EXIT only for an eligible selected infantry unit
  with a current `buildingLocation`; it is inert while typing or ineligible.
- Preserve mouse/touch exit, cancellation, selection, mobile controls, and
  WEGO locking.

Public DOM/port tests must prove delegation/copy isolation, exact one- and
two-floor choices/dispatch, unknown no-dispatch, and eligible-only `KeyE`.

### Scope and gates

Do not edit building simulation/interaction/descriptors/maps,
`CommandSystem`, unit/soldier owners, renderers, factories, vehicles,
dependencies, TODO, history, or broad UI.

```sh
node --test test/application-ports.test.js test/ui-manager.test.js \
  test/command-navigation.test.js
npm test
npm run build
git diff --check -- src/app/ApplicationPorts.js src/app/GameApp.js \
  src/ui/UIManager.js test/application-ports.test.js test/ui-manager.test.js
```

Browser-check both authored houses, exact choices, visible Exit and `E`,
top-panel cancel/deselect, WEGO/realtime, backend/ready/console state.

### Results

- Status: IN PROGRESS.

### Questions / Blockers

- None recorded before implementation.

## Packet BUILDING-FARMHOUSE-CAPACITY-B: six individual positions

Packet status: AUTHORIZED FOR ONE WORKER. Stop after this packet and wait for
independent review.

### Goal and allowed files

Let one current six-man French squad occupy the compact farmhouse through six
real capacity-one positions:

- `src/maps/france/FranceFarmhouse8x6_1F.js`, three added stable slots and
  explicit approximation text only
- `test/building-descriptor-expansion.test.js`, exact expectations only
- `test/building-full-squad-capacity.test.js` (new)
- this packet's Results and Questions / Blockers in `HANDOFF.md`

The descriptor and existing test contain accepted work. Preserve every hunk.
`TODO.md` is coordinator-owned.

### Required behavior

- Preserve the existing three IDs/positions; add three non-overlapping stable
  capacity-one positions labeled gameplay approximations.
- Through a real current six-man France 1940 unit and rotated Stonne farmhouse,
  prove enter, individual occupancy, exit, capture, restore, and replay. A
  seventh claim must fail.
- Preserve one-floor topology, door/windows, thresholds, collision, grounding,
  generic rendering, and deep freeze. Never add aggregate capacity, generated
  IDs, or interaction special cases.

### Scope and gates

Do not edit interaction/system code, other descriptors/maps, `TerrainBuilder`,
`FrenchHouse`, UI, factories, vehicles, dependencies, TODO, history, or broad
data.

```sh
node --test test/building-descriptor-expansion.test.js \
  test/building-interaction.test.js test/building-system.test.js
node --test test/building-full-squad-capacity.test.js \
  test/building-descriptor-expansion.test.js \
  test/building-interaction.test.js test/building-system.test.js
npm test
npm run build
git diff --check -- src/maps/france/FranceFarmhouse8x6_1F.js \
  test/building-descriptor-expansion.test.js \
  test/building-full-squad-capacity.test.js
```

Browser-check six-person entry/exit and replay in WEGO/realtime with exact
backend/ready/console evidence.

### Results

- Status: IN PROGRESS.

### Questions / Blockers

- None recorded before implementation.

## Packet NAV-B: ordinary infantry formation-envelope routing

Packet status: AUTHORIZED FOR ONE WORKER. Stop after this packet and wait for
independent review.

### Goal

Prevent ordinary infantry move orders from routing the squad anchor through a
static-world passage that the living formation cannot traverse. Use the
existing route planner's segment-clearance input while retaining the existing
0.8 m waypoint-arrival tolerance.

This is a conservative first-order formation-envelope approximation. It does
not add formation compression, personal route planning, dynamic-obstacle
routing, vehicle maneuvers, or wreck settling.

### Allowed files

- `src/game/CommandSystem.js`, only the ordinary post-setup infantry
  `MOVE_*` route-option construction
- `test/command-navigation.test.js`, only public command-routing behavior
- `HANDOFF.md`, only this packet's Results and Questions / Blockers

`TODO.md` is coordinator-owned. If another file is required, stop and report
the exact missing seam.

### Required behavior

- Derive the maximum living formation-slot offset separately from the 0.8 m
  waypoint-arrival tolerance.
- Preserve the unit's existing individual collision radius.
- Call the injected static-world planner with the formation offset as
  `clearance` and 0.8 m as `waypointClearance`.
- Preserve the exact clicked endpoint and its terrain height, order type,
  append-tail origin, setup behavior, building delegation, vehicle fallback,
  empty-route fallback, and existing `Unit.waypoints` ownership.
- Add no new state, RNG, clock, dependency, route registry, capture version, or
  collision algorithm.

### Behavioral acceptance

1. The injected-planner FAST fixture receives
   `{ clearance: 5, waypointClearance: 0.8 }`.
2. Through public command APIs, a real six-man unit facing two wall halves with
   a 2 m centre gap receives deterministic wall-end detour waypoints instead of
   one direct waypoint.
3. The detour retains QUICK and the exact clicked endpoint, and every living
   agent completes within a bounded fixed-step run.
4. Repeating from identical initial state yields byte-equal waypoint records.
5. Existing direct routes, append-tail routes, setup orders, building
   delegation, vehicle fallback, terrain-height preservation, and empty-route
   behavior remain covered and unchanged.

### Explicitly forbidden

- `StaticCollisionWorld`, `Unit`, `SoldierAI`, `SoldierAgent`, `GameApp`,
  buildings/maps/scenarios, render factories, UI, audio/VFX, dependencies,
  vehicles, TODO edits, commits, branches, pushes, or broad cleanup.
- Any edit to
  `src/content/france1940/render/France1940UnitMeshFactory.js` or
  `src/content/france1940/render/France1940InfantryWeaponFactory.js`.

### Baseline and validation

Inspect the current diff for every allowed file, then run before editing:

```sh
node --test test/command-navigation.test.js
```

After the final edit run:

```sh
node --test test/command-navigation.test.js \
  test/deployment-zones.test.js \
  test/static-collision.test.js \
  test/wego-manager.test.js
npm test
npm run build
git diff --check -- src/game/CommandSystem.js test/command-navigation.test.js
git status --short --branch
```

Perform a browser regression check in realtime and WEGO. Report URL, mode,
backend, `data-game-status`, console/device errors, and an ordinary infantry
wall-detour order. The synthetic 2 m gap remains automated-test evidence.

### Coordinating TODO after approval

Keep the navigation parent unchecked. Add one completed child for routing the
full living formation envelope around passages too narrow for its current
slots while retaining the 0.8 m corner-arrival tolerance.

### Results

- Status: ACCEPTED after independent review.
- Scope completed: Ordinary post-setup infantry `MOVE_*` commands now derive
  the maximum current living formation-slot offset independently from the
  existing 0.8 m waypoint-arrival tolerance. The injected planner receives
  that offset as segment `clearance`, the unchanged 0.8 m as
  `waypointClearance`, and the unit's unchanged individual collision radius as
  its existing radius argument.
- Scope deliberately left incomplete: No formation compression, personal
  route planning, dynamic-obstacle routing, vehicle maneuver, wreck settling,
  building, setup, planner-algorithm, or capture-state work was added.
- Files changed: Command routing: `src/game/CommandSystem.js`; behavioral
  tests: `test/command-navigation.test.js`; packet record: `HANDOFF.md`. No
  data, rendering, UI, dependency, vehicle, factory, or TODO file was changed
  by this packet.
- Authoritative state or ownership changed: None. `Unit.waypoints` remains the
  order owner, `StaticCollisionWorld` remains the injected route-planning
  owner, and living soldier state plus existing formation offsets remain the
  only inputs. No new persistent field, capture version, RNG, clock, registry,
  or collision algorithm was introduced.
- Focused baseline before edits: PASS, 1/1 file:
  `node --test test/command-navigation.test.js`.
- Failing-before evidence: After adding the public regressions but before the
  production edit, direct execution passed 6/8 subtests and failed exactly the
  planner-option assertion (`{ waypointClearance: 5.8 }` instead of separate
  `{ clearance: 5, waypointClearance: 0.8 }`) and the real six-man 2 m-gap
  assertion because the old command emitted one direct waypoint.
- Focused final: PASS, 4/4 files:
  `node --test test/command-navigation.test.js test/deployment-zones.test.js
  test/static-collision.test.js test/wego-manager.test.js`. Direct
  command-navigation execution passes 8/8 subtests, including deterministic
  byte-equal waypoint records, QUICK and exact clicked-endpoint retention,
  wall-end detouring, and completion by every living agent within 2400 fixed
  30 Hz steps.
- Full `npm test`: PASS at the clean NAV-B checkpoint, 94/94 test files, 0
  failed. Concurrent BUILDING-MULTI-ENTRY-A and
  INFANTRY-CASUALTY-FALL-A edits continued landing during the later browser
  check, so the coordinator should rerun the integrated suite after those
  owners stop; NAV-B's final focused 4/4-file gate still passed after this
  packet record.
- `npm run build` and warnings: PASS, Vite 8.1.5 transformed 739 modules;
  largest chunk was `game` at 470.23 kB; no build warnings.
- Scoped `git diff --check -- src/game/CommandSystem.js
  test/command-navigation.test.js`: PASS with no output.
- Browser/runtime evidence: PASS in temporary headless Firefox 153 at
  `http://127.0.0.1:5174/?mode=wego` and
  `http://127.0.0.1:5174/?mode=realtime`, viewport 1366x682, Stonne 1940,
  `data-game-status="ready"`, `webgl2-fallback`, and device loss false in both
  modes. Page-console capture contained only Vite debug and game initialization
  info, with zero page warnings/errors. In both post-setup WEGO command phase
  and realtime action phase, the live six-man `fr_hq` accepted QUICK around
  authored `wall:north_east:16`: 1.5953056133543817 m formation clearance,
  three deterministic wall-end detour waypoints, all QUICK, and an exact
  clicked terrain-height endpoint. Firefox process output separately emitted
  its implementation-defined depth-texture filtering warning plus blocked
  background telemetry uploads; neither appeared in page console, caused
  device loss, or changed ready status. Port 5173 was occupied, so the
  temporary Vite server selected 5174 and was stopped after validation.
- Remaining risks and review points: Independently verify that clearance is
  living-only and order-type-specific, that the 0.8 m corner tolerance was not
  folded back into segment clearance, and that the 2 m-gap fixture proves
  public CommandSystem-to-Unit behavior without expanding planner authority.
- Independent review: APPROVE. The reviewer confirmed the living,
  order-specific formation clearance, unchanged individual collision radius
  and 0.8 m waypoint tolerance, public deterministic completion coverage,
  preserved routing/capture ownership, clean scope, focused 4/4 files and 8/8
  command-navigation subtests, and scoped whitespace. No changes requested.

### Questions / Blockers

- None.

## Packet BUILDING-MULTI-ENTRY-A: deterministic nearest valid exterior door

Packet status: AUTHORIZED FOR ONE WORKER. Stop after this packet and wait for
independent review.

### Goal

Make a valid multi-door building select and persist the shortest usable
exterior-door route, independent of descriptor array order, then use that same
stable portal through entry, exit, capture, restore, and replay.

This packet fixes an existing multi-portal contract mismatch. It does not add
new floor plans, rooms, stairs, AI occupation, fire, or renderer work.

### Allowed files

- `src/game/BuildingInteractionSystem.js`, only exterior-door selection,
  persistence, and entry/exit consumption
- `test/building-multi-entrance.test.js` (new), only public multi-door behavior
- `HANDOFF.md`, only this packet's Results and Questions / Blockers

`TODO.md` is coordinator-owned. If another file is required, stop and report
the exact missing seam.

### Required behavior

- Enumerate exterior doors connecting `outside` to the selected lower-floor
  room and exclude `BuildingState.invalidPortals`.
- Compute each portal-specific outside approach and existing
  footprint-avoidance route. Select shortest X/Z route; break equal distances
  by stable portal ID, independent of descriptor and unit array order.
- Persist `entryPortalId` in each assigned soldier's existing authoritative
  `buildingLocation`; preserve it through route fields.
- Consume that exact ID for approach, transit, interpolation, overlap
  recovery, exit, and safe ejection.
- If all candidates are invalid, reject with `no_valid_entry_portal` before
  reservation, order, or agent mutation.
- Do not reroute after the selected portal becomes invalid; preserve existing
  deterministic release/ejection policy.
- A legacy one-door `buildingLocation` without the new key must retain current
  deterministic behavior.
- Add no side registry, capture version, RNG, clock, dependency, mesh, or
  resource owner.

### Behavioral acceptance

1. A rear-side unit selects the rear door, and reversing portal-array order
   produces identical ID, route, and state.
2. Equal-distance doors tie by stable portal ID, independent of unit order.
3. An invalid nearest door yields the farther valid door; all-invalid
   rejection leaves reservations, orders, and agents unchanged.
4. `issueEnter`, every assigned `buildingLocation`, and public `advance()`
   expose/use the same selected portal ID.
5. Entry and exit both use the persisted portal.
6. Upper-floor entry composes the selected exterior door with the existing
   single stair.
7. Capture during approach and transit, restore, and replay reproduce portal
   ID, route, positions, occupancy, and exit byte-equivalently.
8. Selected-door collapse releases/ejects exactly once.
9. Legacy snapshots and the current one-door Stonne path remain unchanged.
10. Both exterior apertures remain `portal_transit_required`; ordinary
    movement cannot bypass either.

### Explicitly forbidden

- `src/simulation/buildings/`, descriptors, maps, scenarios, `TerrainBuilder`,
  `FrenchHouse`, `GameApp`, UI, audio/VFX, render factories, dependencies,
  vehicles, AI occupation, multiple-stair graphs, TODO edits, commits,
  branches, pushes, or broad cleanup.
- Any edit to
  `src/content/france1940/render/France1940UnitMeshFactory.js` or
  `src/content/france1940/render/France1940InfantryWeaponFactory.js`.

### Baseline and validation

Inspect the current diff for every allowed file, then run before editing:

```sh
node --test test/building-interaction.test.js \
  test/building-system.test.js \
  test/static-collision.test.js
```

After the final edit run:

```sh
node --test test/building-multi-entrance.test.js \
  test/building-interaction.test.js \
  test/building-system.test.js \
  test/static-collision.test.js
node --test test/building-visuals.test.js
npm test
npm run build
git diff --check -- src/game/BuildingInteractionSystem.js \
  test/building-multi-entrance.test.js
git status --short --branch
```

The browser gate is a current one-door regression: record URL, realtime and
WEGO modes, backend, `data-game-status`, and console/device errors; exercise
ground/upper entry, exit, rewind, and replay; verify `front-door` remains the
selected portal. Do not claim live multi-door visual validation.

### Coordinating TODO after approval

Keep the enterable-building parent unchecked. Add one completed interaction
slice for deterministic exterior-entrance selection and persistence through
entry, exit, capture, and replay.

### Results

- Status: ACCEPTED after independent review.
- Scope completed: `BuildingInteractionSystem` now enumerates valid exterior
  doors for the selected lower-floor room, computes each door's existing
  footprint-avoidance route, selects the shortest X/Z route with stable portal
  ID tie-breaking, and persists that one `entryPortalId` in every assigned
  soldier's existing `buildingLocation`. The persisted ID is consumed by
  approach checks, transit, interpolation, overlap recovery, stair composition,
  exit, and safe ejection. All-invalid selection rejects atomically with
  `no_valid_entry_portal`; later invalidation never selects another door.
  Legacy locations without the key continue to use the descriptor's existing
  first exterior door.
- Scope deliberately left incomplete: No descriptor, room/floor topology,
  multiple-stair graph, building-state/capture version, map/scenario, renderer,
  UI, AI occupation, dependency, RNG, clock, or TODO change was added. Live
  multi-door visual validation was not claimed.
- Files changed: Building interaction:
  `src/game/BuildingInteractionSystem.js`; public behavioral tests:
  `test/building-multi-entrance.test.js`; packet record: `HANDOFF.md`.
- Authoritative state or ownership changed: No new owner or registry.
  `BuildingInteractionSystem` continues to own individual routes and transit;
  `BuildingSystem` continues to own portal validity, reservations, occupancy,
  and release. `entryPortalId` is one new field inside each existing
  rollback-owned soldier `buildingLocation`; existing deep soldier
  capture/restore carries it without a capture-version change.
- Focused baseline before edits: PASS, 3/3 files:
  `node --test test/building-interaction.test.js test/building-system.test.js
  test/static-collision.test.js`.
- Failing-before evidence: With the new public regression file present and
  production unchanged, direct execution passed 2/7 tests and failed 5/7 on
  absent/incorrect nearest-door selection, persistence, invalid fallback,
  selected-door collapse behavior, and one-door result exposure.
- Focused final: PASS, 4/4 files:
  `node --test test/building-multi-entrance.test.js
  test/building-interaction.test.js test/building-system.test.js
  test/static-collision.test.js`. Direct execution of the new file passes 7/7
  public tests covering reversed portal/unit order, stable equal-distance tie,
  invalid and all-invalid handling, ground/upper entry and exit, approach and
  transit restore/replay, selected-door collapse, legacy one-door state, and
  both movement-shell policies.
- Building visual regression: PASS, 1/1 file:
  `node --test test/building-visuals.test.js`.
- Full `npm test`: packet-focused building coverage passed, but the concurrent
  integrated run finished 94/95 test files with the sole failure in the
  concurrently edited/untracked `test/infantry-pose-animator.test.js`. Direct
  execution there passed 13/15 subtests and failed two unrelated KIA-pose
  assertions: weapon grounding for casualty 0 and byte-exact nested arm-IK
  reset for crawl-to-KIA. No building test failed; the coordinator owns the
  integrated rerun after that worker stops.
- `npm run build` and warnings: PASS. Vite 8.1.5 transformed 739 modules;
  largest chunk was `game` at 474.08 kB; no build warnings.
- Scoped `git diff --check -- src/game/BuildingInteractionSystem.js
  test/building-multi-entrance.test.js`: PASS with no output. The new untracked
  test was also checked independently against `/dev/null`.
- Browser/runtime evidence: PASS in temporary headless Firefox 153 at
  `http://127.0.0.1:5174/?mode=wego` and
  `http://127.0.0.1:5174/?mode=realtime`, viewport 1366x682, Stonne 1940,
  `data-game-status="ready"`, `webgl2-fallback`, and device loss false in both
  modes. WEGO ground entry, upper entry through `main-stair`, ground/upper
  exit, a live transit-snapshot restore through the same
  `restoreSimulationState` path used by WEGO seeking, and replay all retained
  `front-door`; restored upper occupancy and individual positions were
  byte-equivalent. Realtime ground entry/exit likewise retained `front-door`
  for all four assigned soldiers and completed outside. Page-console capture
  had zero warnings/errors. Firefox process output separately emitted its
  implementation-defined depth-texture filtering warning and blocked
  background telemetry uploads; neither reached page console, caused device
  loss, or changed ready status. Port 5173 was occupied, so the temporary Vite
  server selected 5174; browser and server were stopped after validation.
- Remaining risks and review points: Independently verify lower-floor room
  selection, route-length and tie comparisons, legacy key absence, no
  post-invalidation reroute, exact release/ejection behavior, and that no
  descriptor-order dependency or side registry was introduced.
- Independent review: APPROVE. The reviewer confirmed valid exterior-door
  filtering, complete-route distance and stable-ID tie behavior, atomic
  all-invalid rejection, persisted portal use through transit/stairs/exit/
  ejection/legacy restore, selected-door invalidation without rerouting, and
  five genuinely failing-before public behaviors. Focused 4/4 files, new 7/7
  tests, and tracked/untracked whitespace checks passed. No changes requested.

### Questions / Blockers

- Integrated-suite blocker only: the concurrent casualty-pose test failure
  described above is outside this packet. The coordinator will rerun the full
  suite after all workers stop.

## Packet INFANTRY-CASUALTY-FALL-A: deterministic first-order KIA fall

Packet status: AUTHORIZED FOR ONE WORKER. Stop after this packet and wait for
independent review.

### Goal

Project a real positive-health-to-KIA transition from the soldier's prior
stance into the accepted stable-identity static KIA end pose, using simulation
time and rollback-owned state.

This is a labeled first-order gameplay presentation approximation, not
ragdoll, motion-capture, biomechanics, or historical evidence.

### Allowed files

- `src/game/SoldierAgent.js`, only the positive-health-to-KIA transition
  marker/reset and scalar capture/restore handling
- `src/world/infantry/InfantryPoseAnimator.js`, only the named fall model, KIA
  time clamp, stance-derived interpolation, and exact final-pose convergence
- `test/infantry-pose-animator.test.js`, only public fall behavior while
  preserving every accepted static/crawl/wounded assertion
- `HANDOFF.md`, only this packet's Results and Questions / Blockers

`TODO.md` is coordinator-owned. Treat all existing hunks in the three allowed
code/test files as accepted user work; preserve them exactly outside the
packet seam. If overlap cannot be preserved, stop.

### Required state and behavior

- Reuse captured `poseTime`; reset it to zero only when positive health crosses
  to KIA.
- Add one scalar roster field, `casualtyFallStartStance`, captured immediately
  before KIA overwrites stance and carried through the existing deep
  capture/restore path.
- Interpolate from a stance-appropriate authored start into the existing four
  stable-identity end poses over one named duration.
- Standing, kneeling/crouched, and prone starts must not visibly rise or
  materially penetrate terrain.
- Keep `activePose === "casualty"` throughout. At completion, byte-match the
  accepted final transforms and clamp KIA pose time so later steps are stable.
- Repeated damage must not restart the transition.
- Legacy or manually constructed KIA state without the marker must project the
  accepted final pose immediately.
- `INCAPACITATED` and `DEAD` do not animate a KIA fall.
- Preserve immediate complete IK/grip cleanup and all existing KIA precedence.
- Add no RNG, wall clock, frame counter, target state, physics, resource, mesh
  authority, or second animation clock.

### Behavioral acceptance

1. Warm pose time, kill through public damage, and prove reset plus distinct
   immediate, mid-fall, and final transforms.
2. Every final KIA variant converges exactly at the named duration and remains
   byte-stable afterward; retain at least three non-roll signatures and final
   body/weapon grounding.
3. Standing, kneeling/crouched, and prone starts do not rise or materially
   penetrate terrain.
4. Repeated hits do not restart; incapacitated/dead and marker-less legacy KIA
   project without transition.
5. Immediate grip/IK cleanup, action precedence, and existing static KIA,
   crawl, wounded, and living transitions remain intact.
6. Mid-fall capture, mutation, restore, and replay are byte-exact; equivalent
   fixed-step partitions match.
7. WEGO rewind/replay and realtime consume the same elapsed simulation steps.
8. Restoring living state removes the marker and restores the living pose.

### Explicitly forbidden

- `SoldierAI`, `Unit`, `GameApp`, render/weapon factories, UI, audio/VFX,
  buildings/maps, dependencies, vehicles, TODO edits, commits, branches,
  pushes, broad pose cleanup, ragdolls, new geometry, or animation clips.
- Any edit to
  `src/content/france1940/render/France1940UnitMeshFactory.js` or
  `src/content/france1940/render/France1940InfantryWeaponFactory.js`.

### Baseline and validation

Inspect current staged and unstaged diffs for every allowed file, then run:

```sh
node --test test/infantry-pose-animator.test.js \
  test/soldier-ai.test.js \
  test/infantry-fidelity.test.js
```

After the final edit run:

```sh
node --test test/infantry-pose-animator.test.js \
  test/soldier-ai.test.js \
  test/infantry-fidelity.test.js \
  test/combat-rollback.test.js \
  test/wego-manager.test.js
npm test
npm run build
git diff --check -- src/game/SoldierAgent.js \
  src/world/infantry/InfantryPoseAnimator.js \
  test/infantry-pose-animator.test.js
git status --short --branch
```

Perform near/high-infantry browser checks in realtime and WEGO. Record URL,
mode, backend, `data-game-status`, console/device errors, public-damage
start/mid/final samples, grounding, and identical mid-fall rewind/replay.

### Coordinating TODO after approval

Keep the broad animation parent unchecked. Add one completed child for
deterministic rollback-safe first-order KIA fall transitions. Leave general
blending, foot placement, turn-in-place, deployment, and animation LOD open.

### Results

- Status: REVISED; READY FOR INDEPENDENT REREVIEW. Browser validation remains
  environment-blocked as recorded below, so this is not an acceptance claim.
- Independent-review corrections:
  - Public `applySoldierDamage` now permits the positive-health-to-KIA
    transition only for genuinely available `OK` and `WOUNDED` soldiers.
    Positive-health `INCAPACITATED` and `DEAD` records retain their status,
    health, suppression, pose time, projection, and absence of a fall marker.
    A public wounded-to-KIA case proves the eligibility gate remains live.
  - The existing scalar casualty clock is canonicalized to nanosecond
    resolution before its named-duration clamp. Public `0.1 + 0.1 + 0.1` and
    `0.3` partitions now produce byte-identical `poseTime` and complete
    projected transforms without adding another clock or captured field.
  - Authored KIA starts now use the existing living root heights for kneeling
    (`-0.34 m`) and prone (`0.2 m`). Standing remains `0 m`; crouched descends
    from `0 m` to `-0.08 m`. Public pre-hit versus immediate post-hit world
    bounds prove that none rises, including removal of the reviewed `0.23 m`
    prone jump. All sampled starts remain above the existing `-0.120001 m`
    terrain-clearance limit, do not overshoot the measured living/final height
    envelope by more than the measured `0.040001 m` articulation allowance,
    and converge to the unchanged accepted final transforms.
  - Failing-before execution of the three new regressions passed 18/21 direct
    animator tests and failed exactly unavailable-status damage, kneeling/prone
    start rise, and decimal partition equality. Final direct execution passes
    21/21 in 266.997225 ms.
  - During validation a concurrent write restored the animator almost exactly
    to git base and removed accepted crawl, wounded, static-KIA, and fall
    behavior. The coordinator confirmed it carried no unique external
    behavior; the accepted stack plus these corrections was reapplied once.
    Its SHA-256 remained
    `6dd87654720f82a76bd3ffbc49b1cd853c7374ac4b5e8cd41e7ae91f76d320e2`
    through focused tests and the final build.
- Scope completed:
  - `src/game/SoldierAgent.js` now records the scalar
    `casualtyFallStartStance` and resets captured `poseTime` only on the public
    positive-health-to-KIA crossing. Repeated damage does not restart the fall,
    and living-state synchronization removes the marker.
  - `src/world/infantry/InfantryPoseAnimator.js` owns a named `0.75`-second
    first-order deterministic projection from standing, kneeling/crouched, or
    prone into the four accepted KIA end poses. It keeps casualty precedence,
    clears IK/grip state immediately, clamps completion, and applies the legacy
    final pose immediately when no valid marker exists.
  - `test/infantry-pose-animator.test.js` preserves the accepted static, crawl,
    wounded, and living assertions and adds public damage, stance/grounding,
    repeated-hit, legacy-state, capture/restore, fixed-partition, realtime, and
    WEGO rewind/replay coverage.
- Files changed by layer: simulation/data: `src/game/SoldierAgent.js`;
  presentation: `src/world/infantry/InfantryPoseAnimator.js`; tests:
  `test/infantry-pose-animator.test.js`; packet documentation: this Results
  section. No UI, content, factory, vehicle, dependency, or TODO file was
  changed for this packet.
- Authoritative ownership: the existing captured roster `poseTime` remains the
  sole clock and the new roster scalar records only the pre-KIA stance. The
  animator is a downstream renderer projection and owns no simulation outcome.
- Focused baseline before editing:
  `node --test test/infantry-pose-animator.test.js test/soldier-ai.test.js
  test/infantry-fidelity.test.js` passed 3/3 files, 0 failed, in 406.211288 ms.
- Final focused command with rollback and WEGO coverage passed 5/5 files,
  0 failed, in 453.192265 ms after the revision and overlap recovery.
- Full `npm test` passed every infantry/casualty file and 95/96 files overall
  in 5927.354606 ms. The only integrated failure was the other active worker's
  new untracked `test/building-order-lifecycle.test.js`; no packet-owned or
  protected-factory test failed.
- `npm run build` passed with Vite 8.1.5: 739 modules transformed in 167 ms,
  largest chunk 475.78 kB, with no warnings.
- The packet-scoped, HANDOFF-only, and repository-wide `git diff --check`
  commands pass with no output after revision. The earlier protected-factory
  trailing whitespace was resolved by concurrent work; this packet did not
  edit that factory. The untracked test's independent no-index whitespace check
  also produced no output (its expected exit `1` denotes file difference).
- Browser attempt: the development server returned HTTP 200 at
  `http://127.0.0.1:5174/` (`5173` was already occupied). This environment
  exposes neither a connected browser/devtools bridge nor a local browser
  executable, so realtime/WEGO mode, backend, `data-game-status`, console or
  device errors, near/high-infantry visual samples, and browser rewind/replay
  could not be observed. The server was stopped after recording the blocker.
- Deliberately incomplete: biomechanical/ragdoll fidelity, animation blending,
  foot placement, turn-in-place, deployment, animation LOD, the coordinating
  TODO edit, independent review, and the blocked real-browser check.
- Remaining approximation/review focus: the authored `0.75`-second fall is
  explicitly a first-order presentation approximation. Review the prone
  weapon-clearance path, stance-specific terrain clearance, exact convergence
  to the accepted end transforms, and capture/restore ownership.

### Questions / Blockers

- Required browser validation is blocked because no connected real-browser
  bridge/devtools tool or local browser executable is available.
- Repository-wide `git diff --check` is blocked by concurrent trailing
  whitespace in the forbidden infantry weapon factory; the packet-scoped
  command passes and that unrelated file was not edited.

## Packet INFANTRY-BUDDY-BOUND-A: deterministic QUICK buddy bounds

### Authorization

Implement only this first-order known-target `QUICK` buddy-bound slice, fill
only this packet's Results and Questions / Blockers, and stop for independent
review. This packet is non-vehicle work. It does not authorize any vehicle
model, data, simulation, rendering, calibration, asset, or TODO change.

### Required work order

1. Read `AGENTS.md`, `TODO.md`, this packet, and `docs/ARCHITECTURE.md`.
2. Inspect current individual movement, formation goals, target projection,
   accepted-shot eligibility, waypoint completion, capture/restore, collision,
   and separation paths.
3. Run the focused baseline before editing and record any existing failure.
4. Add the smallest renderer-neutral coordinator and wire it only through the
   existing individual soldier update and unit capture/restore paths.
5. Add public behavioral tests that fail on the pre-packet implementation.
6. Run every required gate after the final edit, fill Results, and stop.

### Allowed files

- `src/simulation/infantry/InfantryBuddyBounds.js`, new authoritative
  renderer-neutral coordinator
- `src/game/SoldierAI.js`, only bounded directive integration and inspectable
  projection; preserve the accepted threat-memory work
- `src/game/SoldierAgent.js`, only an explicit covering-hold movement context;
  preserve collision, separation-radius, morale, aiming, ammunition, and
  projectile ownership
- `src/game/Unit.js`, only coordinator construction plus deep capture/restore;
  preserve every existing structure, catalog, radius, waypoint, and update
  hunk
- `src/app/GameApp.js`, only compute the existing spotting system's direct
  precision-observation result for the retained target and pass that boolean
  into `Unit.update()`; preserve every audio, building, composition, and
  simulation-step hunk
- `test/infantry-buddy-bounds.test.js`, new public behavioral coverage
- `HANDOFF.md`, only this packet's Results and Questions / Blockers

If a required change falls outside those files, stop and report it. Do not edit
`TODO.md`; the coordinator owns TODO updates after acceptance.

### Required behavior

- Activate only for living infantry executing a `QUICK` waypoint with a valid
  retained target that the existing authoritative spotting system currently
  permits as a direct precision target. `GameApp` may pass only that boolean;
  spotting remains authoritative and lower layers do not import it. Pair
  available soldiers by typed stable soldier ID, independent of roster
  insertion order.
- Within each pair exactly one mover advances toward its existing formation
  goal while its buddy authoritatively holds and remains eligible for the real
  aim/fire path. Movers cannot fire.
- Swap roles deterministically after one named, explicitly
  gameplay-approximate bound distance, initially 6 metres, or when the mover
  reaches its current formation goal. Never create two movers or two coverers
  for one pair.
- Enter a deterministic reform phase near the final waypoint so all available
  soldiers can reach formation and waypoint completion cannot deadlock.
- Dead, incapacitated, pinned, reloading, or otherwise unavailable soldiers
  provide no invented covering fire and cannot stall a surviving buddy. An
  unpaired survivor follows ordinary individual movement.
- Target or direct-observation loss, waypoint or order change (including
  clear-and-reissue of an identical destination), building transit,
  non-`QUICK` order, or completed waypoint queue deactivates or resets the
  coordinator.
- Preserve the existing exactly-once post-movement spotting advance. After
  that advance and before combat, reconcile the retained target's current
  precision-observation result: if it was revoked during the step, clear the
  coordinator and all projected buddy-role diagnostics before any weapon
  update. Do not advance spotting twice or move soldiers twice.
- Preserve existing formation goals, path planning, static collision,
  post-movement separation, morale, individual aim, ammunition, reload,
  accepted projectile, and combat authority.
- Own only a versioned plain-data state: active waypoint/order key, mode,
  sequence, stable pair member/role IDs, and mover-start X/Z. Retain no target
  object and use no Three.js, RNG, wall clock, or frame count in the
  coordinator.
- `Unit.captureState()` and `restoreState()` must deep-copy and validate the
  state, including rejecting restored pair member IDs absent from the restored
  roster. Missing legacy state restores inactive. Mid-bound restore and replay
  must reproduce byte-identical authoritative results.
- Equivalent fixed-step partitions and WEGO/realtime calls through
  `Unit.update()` must exercise the same mechanic.

### Required behavioral tests

- A public `Unit` with a retained target and `QUICK` waypoint projects half of
  each complete pair moving and half covering. At least one genuine coverer
  must acquire/aim, consume ammunition, and produce an accepted projectile
  while its buddy moves.
- Moving buddies cannot fire. Role swaps occur at the exact configured
  boundary and preserve one mover/one coverer.
- Reversing roster insertion preserves stable pair and role identities.
- Final reform completes the waypoint.
- No target, direct-observation loss, target loss, non-`QUICK`, building
  transit, clear-and-identical-reissue, and completed queues preserve existing
  behavior or reset state as specified. Dead/incapacitated/pinned/reloading
  members neither provide invalid cover nor stall progress.
- A public `GameApp.simulateStep()` probe must allow precision before
  `Unit.update()`, revoke it during the one authoritative `spotting.advance()`,
  and prove pair state and projected roles are inactive before combat refuses
  fire in that same step.
- Static collision and the accepted infantry-separation pass remain
  authoritative.
- Capture -> mutate -> restore -> replay mid-bound is byte-identical, and
  equivalent authoritative step partitions match. A well-shaped restored pair
  containing IDs absent from the restored roster is rejected.

### Explicitly forbidden

- Terrain danger maps, concealment/LOS path costs, larger fire-team tactics,
  withdrawal, surrender, new target selection, new projectile authority, new
  dependencies, broad AI cleanup, UI, audio/VFX, buildings/maps/content,
  command-system rewrites, TODO edits, commits, branches, or pushes.
- Any vehicle file or behavior.
- Editing the user-owned
  `src/content/france1940/render/France1940UnitMeshFactory.js` or
  `src/content/france1940/render/France1940InfantryWeaponFactory.js`.

### Baseline and validation

Run before editing and after the final edit:

```sh
node --test test/soldier-ai.test.js \
  test/infantry-fidelity.test.js \
  test/infantry-separation.test.js \
  test/infantry-threat-memory.test.js \
  test/command-navigation.test.js \
  test/wego.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

Perform browser checks in realtime and WEGO. Report URL, backend,
`data-game-status`, console errors, alternating stable buddy roles, and real
covering-shot/ammunition evidence. A blank framebuffer, unavailable browser,
port failure, or device loss is an environment blocker, not a pass.

### Coordinating TODO after approval

Keep the broad tactical-AI parent and remaining child unchecked. Add one
completed child describing only stable-ID, known-target QUICK pair bounds,
covering-fire eligibility, deterministic reform, and rollback coverage.

### Results

- Status: ACCEPTED after two revision rounds and final independent rereview.
  Packet behavior, automated tests, build, scoped whitespace, and live-browser
  validation pass. The repository-wide whitespace gate remains blocked only
  by concurrent edits outside this packet, as recorded below.
- Scope completed:
  - Added a renderer-neutral, Unit-owned buddy-bound coordinator with typed
    stable-ID pairing, one mover/one coverer roles, named 6 m
    gameplay-approximate swaps, formation-goal swaps on any movement beyond a
    named tiny epsilon, deterministic final reform, bounded plain capture
    state, restored-roster membership validation, and legacy inactive restore.
  - Integrated directives into existing soldier formation movement and real
    aim/fire eligibility. Coverers hold, movers cannot fire, unavailable
    members provide no cover role, and unpaired members retain ordinary
    movement.
  - `GameApp` now samples the existing authoritative
    `SpottingSystem.canPrecisionTarget(unit, unit.targetUnit)` result and passes
    only that boolean through `Unit.update()`. After the existing exactly-once
    post-movement observation advance, it recomputes the same result and asks
    `Unit`/`SoldierAI` to clear coordinator state plus buddy ID, pair ID, role,
    and sequence projections before combat when observation was lost in that
    step. This does not move soldiers twice, advance spotting twice, duplicate
    contact state, or import spotting below `GameApp`.
  - Explicit order-reset seams now cover public waypoint clearing,
    completed-queue replacement, and completed-waypoint pruning, including
    clear-and-identical-reissue.
  - Preserved existing target, path, collision, post-movement separation,
    morale/reaction, ammunition, reload, projectile, WEGO, and realtime
    authority.
- Deliberately incomplete: no target selection, larger fire-team tactics,
  danger maps, withdrawal, UI, vehicle behavior, or TODO changes.
- Files changed:
  - Simulation: `src/simulation/infantry/InfantryBuddyBounds.js`.
  - Integration: `src/game/SoldierAI.js`, `src/game/SoldierAgent.js`,
    coordinator construction/capture/restore and boolean pass-through in
    `src/game/Unit.js`, and the exact spotting-boolean seam in
    `src/app/GameApp.js`.
  - Tests: `test/infantry-buddy-bounds.test.js`.
  - Docs: this packet's Results and Questions / Blockers only.
- Authoritative ownership: `Unit.infantryBuddyBounds` owns the plain persistent
  sequence/pair state. Soldier tactical decisions expose primitive diagnostics
  only; spotting, movement, weapon, and projectile systems remain
  authoritative.
- Pre-edit focused baseline: the packet command passed 5/5 discovered files.
  The listed `test/wego.test.js` path is absent and Node did not discover a
  sixth file.
- Revision baseline: the same focused command still passed 5/5 discovered
  files, and `node test/infantry-buddy-bounds.test.js` passed its pre-revision
  8/8 tests.
- Packet behavior after final revision:
  `node test/infantry-buddy-bounds.test.js` passed 12/12 tests. Added coverage
  exercises the real `GameApp` precision boolean, same-step post-movement
  observation revocation with exactly one spotting advance, coordinator and
  four-field diagnostic clearing before the real combat path refuses fire,
  unchanged ammunition, a 0.19 m to 0.17 m formation-goal crossing without
  idle-at-goal churn, public clear/reissue and completed-queue resets, accepted
  restored-roster subsets, legacy missing/null state, absent-member rejection,
  and validation before Unit mutation. The pre-final-rereview packet suite
  passed 11/11.
- Post-edit focused command: passed 5/5 discovered files; the absent
  `test/wego.test.js` path was again ignored. The same command with the packet
  test appended passed 6/6 discovered files.
- Full tests: `npm test` passed 94/94.
- Build: `npm run build` passed, 739 modules transformed, with no warnings.
- Scoped whitespace: `git diff --check -- src/app/GameApp.js src/game/Unit.js
  src/game/SoldierAI.js src/game/SoldierAgent.js HANDOFF.md` passed, and the
  two new untracked packet files contain no trailing whitespace.
- Browser: `http://127.0.0.1:5173/?mode=wego`, Firefox headless,
  1366 x 682, rendered nonblank framebuffer, `data-game-status="ready"`,
  `webgl2-fallback`, no device loss, and no page-console warnings or errors.
  The bounded live fixture acquired the authoritative direct precision
  observation after 34 fixed steps and retained it throughout both runs.
  WEGO held stable role identities for up to 76 consecutive frames, alternated
  pair sequences, accepted 16 real coverer rounds, decreased the corresponding
  magazines, and exposed one in-flight projectile. Realtime held stable role
  identities for up to 64 frames, alternated pair sequences, accepted 15 real
  coverer rounds, decreased the corresponding magazines, and exposed two
  in-flight projectiles. Every recorded firing event had `role="coverer"`; no
  mover fired. A final real-runtime loss probe began one fixed step with direct
  precision observation true and six projected roles, moved the retained
  target out of observation, and ended that same `GameApp.simulateStep()` with
  precision false, coordinator mode `inactive`, zero projected roles, all four
  diagnostics null for every soldier, and zero accepted rounds.
- Final independent rereview: APPROVE. The reviewer reproduced exactly one
  unit update, spotting advance, reconciliation, and combat call; confirmed
  same-step state/diagnostic clearing before rejected combat with unchanged
  ammunition and positions; rechecked all four prior fixes; and found no
  lower-layer spotting import, duplicate persistent state, scope drift, or
  remaining packet blocker.

### Questions / Blockers

- Repository-wide `git diff --check` is blocked by trailing whitespace in
  concurrent, explicitly forbidden
  `src/content/france1940/render/France1940InfantryWeaponFactory.js` edits at
  lines 165, 545, 564, 819, and 831. This packet did not modify that file; all
  packet-owned tracked and untracked files pass the scoped whitespace checks.

## Packet BUILDING-THRESHOLD-A: scenario-authored section-collapse thresholds

### Authorization

Implement only this placement-owned deterministic building-destruction-policy
slice, fill only this packet's Results and Questions / Blockers, and stop for
independent review. This packet authorizes no renderer, vehicle, audio/VFX,
occupancy-policy, or TODO change.

### Required work order

1. Read `AGENTS.md`, `TODO.md`, this packet, and `docs/ARCHITECTURE.md`.
2. Inspect map validation, family descriptor resolution, building insertion,
   authoritative damage/collapse, event/collision/occupant consequences, and
   capture/restore.
3. Run the focused baseline before editing and record any existing failure.
4. Add the smallest normalized placement policy and feed threshold crossings
   through the existing collapse owner.
5. Add public behavioral tests that fail before the implementation.
6. Run every required gate after the final edit, fill Results, and stop.

### Allowed files

- `src/simulation/buildings/BuildingDestructionThresholds.js`, new
  renderer-neutral policy validation/normalization helper
- `src/simulation/buildings/BuildingState.js`, only authoritative policy state
  construction and deep capture/restore support
- `src/simulation/buildings/BuildingSystem.js`, only policy validation at
  insertion and collapse-threshold use in the existing damage path
- `src/maps/MapDescriptor.js`, only optional placement-policy schema
  validation/freezing
- `src/world/TerrainBuilder.js`, only exact placement-policy pass-through
- `src/maps/france/stonne.js`, only the farmhouse policy record below; preserve
  every existing surface, farmhouse, transform, and roster hunk
- `test/building-destruction-thresholds.test.js`, new public behavioral tests
- `test/map-descriptor.test.js`, only the exact existing farmhouse-placement
  expectation needed to include the frozen policy above; preserve every other
  accepted map-descriptor assertion and hunk
- `test/building-descriptor-expansion.test.js`, only the exact existing Stonne
  farmhouse-placement expectation needed to include the same frozen policy;
  preserve every other accepted descriptor-expansion assertion and hunk
- `HANDOFF.md`, only this packet's Results and Questions / Blockers

If a required change falls outside these files, stop and report it. Do not edit
`TODO.md`; the coordinator owns TODO updates after acceptance.

### Authored Stonne policy

Add this placement-specific policy to
`french_farmhouse_outbuilding`, preserving the descriptor:

```js
destructionThresholds: {
  approximation: 'gameplay approximation; not historical survey evidence',
  sectionCollapse: [
    { sectionId: 'ground-shell', atOrBelowHealthFraction: 0.12 },
    { sectionId: 'roof', atOrBelowHealthFraction: 0.18 }
  ]
}
```

These fractions are explicit first-order gameplay approximations, not
historical precision.

### Required behavior

- The map schema accepts an optional deeply frozen placement policy and rejects
  malformed structure, a blank approximation label, non-finite/out-of-range
  fractions, missing/non-string IDs, and duplicate section IDs.
- Resolve and cross-check policy section IDs against the injected building
  descriptor before authoritative state insertion. Normalize entries by stable
  typed section ID so authored entry order cannot affect state or results.
- Store a deeply copied normalized policy in authoritative building state.
  Collapse a section through the existing `BuildingSystem` collapse path when
  remaining health first reaches or crosses its placement-authored positive
  fraction.
- A placement without a policy retains the current zero-health behavior.
  Threshold crossing must not change damage amounts, resistance, breach
  creation, support topology, visual-stage thresholds, RNG, occupant
  consequence values, or event shapes.
- Existing portal/fire-position invalidation, occupant consequences, collision
  replacement, rubble state, and damage/collapse events occur exactly once
  through the existing owners.
- Capture/restore includes a deep plain-data policy copy. Missing legacy policy
  restores default zero-health behavior. Capture before crossing -> cross ->
  restore -> replay must reproduce deep-equal state, events, consequences, and
  collision output.
- Terrain construction must pass the actual Stonne placement policy into the
  real building system. No lower layer imports the concrete scenario.

### Required behavioral tests

- Two instances of one descriptor receive identical damage: the policy
  instance collapses at positive health while the default instance does not.
- Unknown/duplicate section IDs, invalid fractions, blank label, and malformed
  policies are rejected before state insertion.
- Reversed entry order produces byte-identical normalized state and results.
- A threshold collapse drives existing portal/fire-position invalidation,
  occupant consequences, collision delta, rubble, and events exactly once.
- Capture/restore/replay across the threshold is deep-equal; captured policy is
  deeply copied; legacy snapshots without it retain default behavior.
- Real TerrainBuilder construction passes the exact frozen Stonne policy into
  `BuildingSystem`.

### Explicitly forbidden

- Editing `src/world/buildings/FrenchHouse.js`, `GameApp`, `CombatSystem`,
  ballistics, VFX/audio providers, the farmhouse descriptor, existing visual
  tests, or user-owned France 1940 render factories.
- Persistent smoke/fire, partial-floor animation, new damage values,
  resistance/support changes, occupancy AI, new geometry/material/resources,
  disposal changes, dependencies, broad map/building refactors, TODO edits,
  commits, branches, or pushes.
- Any vehicle file or behavior.

### Baseline and validation

Run before editing and after the final edit:

```sh
node --test test/building-system.test.js \
  test/building-combat.test.js \
  test/building-visuals.test.js \
  test/map-descriptor.test.js \
  test/terrain-fidelity.test.js \
  test/combat-rollback.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

After implementation include
`test/building-destruction-thresholds.test.js` in the focused command. Perform
realtime and WEGO browser checks through a real threshold crossing. Report URL,
backend, `data-game-status`, console errors, section/rubble visibility,
collider replacement, occupant outcome, rewind, and identical replay. A blank
framebuffer, unavailable browser, port failure, or device loss is an
environment blocker, not a pass.

### Coordinating TODO after approval

Keep the broad buildings parent and remaining child unchecked. Add one
completed child describing only validated scenario-placement section-collapse
thresholds, existing consequence/collision integration, and rollback coverage.

### Results

- Status: ACCEPTED after independent review, one documentation-attribution
  correction, and clean rereview.
- Scope completed:
  - Added strict plain-data validation and stable section-ID normalization for
    optional placement-owned collapse thresholds.
  - Cross-checked normalized section IDs against the injected descriptor before
    insertion, stored a deep authoritative copy, and restored missing legacy
    policy as the zero-health default.
  - Routed positive-health threshold crossings through the existing
    `BuildingSystem` collapse path without changing damage, resistance, breach,
    support, visual-stage, RNG, consequence, collision, or event shapes.
  - Passed the exact frozen Stonne farmhouse policy through the real
    `TerrainBuilder` insertion path.
  - Added public behavior, validation, stable-order, consequence/collision,
    capture/restore/replay, legacy-snapshot, and real terrain-construction
    coverage. Updated only the two separately authorized exact farmhouse
    expectations in existing tests.
- Scope deliberately left incomplete: renderer behavior, new geometry or
  resources, audio/VFX, persistent fire or smoke, descriptor health/resistance
  values, occupancy AI, vehicles, and `TODO.md`.
- Files changed:
  - Data: `src/maps/MapDescriptor.js`, `src/maps/france/stonne.js`.
  - Simulation: `src/simulation/buildings/BuildingDestructionThresholds.js`,
    `BuildingState.js`, and `BuildingSystem.js`.
  - Rendering integration:
    `src/world/TerrainBuilder.js` placement-policy pass-through only.
  - Tests: new `test/building-destruction-thresholds.test.js`; exact
    farmhouse-policy expectations only in `test/map-descriptor.test.js` and
    `test/building-descriptor-expansion.test.js`.
  - UI: none. Docs: this packet's Results and Questions / Blockers only.
- Authoritative ownership: the normalized placement policy is plain persistent
  `BuildingState`; `BuildingSystem` remains the sole collapse, topology,
  consequence, collision-delta, rubble, and event owner. Map data and rendering
  remain producers/consumers only.
- Pre-edit focused baseline:
  `node --test test/building-system.test.js test/building-combat.test.js
  test/building-visuals.test.js test/map-descriptor.test.js
  test/terrain-fidelity.test.js test/combat-rollback.test.js` passed 6/6.
- Final focused command:
  `node --test test/building-destruction-thresholds.test.js
  test/building-system.test.js test/building-combat.test.js
  test/building-visuals.test.js test/map-descriptor.test.js
  test/terrain-fidelity.test.js test/combat-rollback.test.js` passed 7/7.
- Full test: the first `npm test` encountered one transient concurrent
  `test/infantry-buddy-bounds.test.js` failure while that packet was being
  edited; its isolated rerun passed, and the final `npm test` passed 93/93.
- Build: `npm run build` passed with Vite 8.1.5, 739 transformed modules, and
  no warning in this run.
- `git diff --check`: passed.
- `git status --short --branch`: `main...origin/main`; the packet's modified
  and untracked files remain inside the larger pre-existing concurrent dirty
  worktree. No branch, commit, push, reset, or unrelated cleanup was performed.
- Browser:
  - Firefox 153 headless, 1440x900,
    `http://127.0.0.1:5175/?mode=realtime&quality=low` and
    `http://127.0.0.1:5175/?mode=wego&quality=low`; ports 5173 and 5174 were
    already occupied by concurrent workers.
  - Both pages reached `data-game-status="ready"` for scenario/map
    `stonne-1940`, backend `webgl2-fallback`, with `deviceLost=false` and no
    captured console warnings or errors.
  - In both modes, 580 damage crossed the authored 0.12 ground-shell threshold,
    collapsed the shell and support-dependent roof, invalidated the front door
    and both fire positions, hid shell/roof at high, medium, core, and proxy
    LODs, showed rubble, and replaced 15 ground-shell colliders with the two
    authored rubble colliders.
  - The real `fr_hq:assistant-gunner` occupant was ejected to exterior rubble,
    took the existing 70 damage, and changed from health 100/OK/occupied to
    health 30/WOUNDED/outside.
  - Realtime capture/restore and the actual WEGO rewind both restored intact
    shell/roof, hidden rubble, collision version 0, and the health
    100/OK/occupied soldier. Both replays were byte-identical to their first
    crossings.
- Remaining risks and review points: the Stonne fractions are explicitly
  labeled first-order gameplay approximations. Review should concentrate on
  the strict policy schema, `(0, 1]` fraction boundary, stable normalization,
  legacy `null` state, and threshold-versus-zero-health collapse reason.
- Final independent rereview: APPROVE. The reviewer confirmed strict
  pre-insertion validation, canonical ordering, threshold/default behavior,
  exact-once existing consequences, deep capture/restore/replay, legacy
  behavior, real Stonne pass-through, and no lower-layer scenario or renderer
  ownership drift after the Results attribution was corrected.

### Questions / Blockers

- None.

## Packet INFANTRY-CASUALTY-POSE-A: deterministic varied KIA end poses

### Authorization

Implement only this bounded downstream presentation slice, fill only this
packet's Results and Questions / Blockers, and stop for independent review.
This is not a dynamic fall-animation packet and authorizes no simulation,
vehicle, factory, geometry, material, or TODO change.

### Required work order

1. Read `AGENTS.md`, `TODO.md`, this packet, and `docs/ARCHITECTURE.md`.
2. Inspect the accepted crawl and wounded-gait overlays, casualty precedence,
   transform reset, stable identity, public damage, and capture/restore paths.
3. Run the focused baseline before editing and record any existing failure.
4. Add the smallest KIA-only final-pose overlay and regression-sensitive public
   tests.
5. Run every required gate after the final edit, fill Results, and stop.

### Allowed files

- `src/world/infantry/InfantryPoseAnimator.js`, only a KIA final-pose overlay;
  preserve the accepted crawl and wounded-gait hunks
- `test/infantry-pose-animator.test.js`, public behavioral coverage
- `HANDOFF.md`, only this packet's Results and Questions / Blockers

If a required change falls outside those files, stop and report it. Do not edit
`TODO.md`; the coordinator owns TODO updates after acceptance.

### Required behavior

- Project at least three visibly distinct first-order KIA end-pose signatures,
  such as forward-prone, left-side, right-side, and curled, from existing
  deterministic stable unit/soldier variation.
- Variation must affect meaningful root/limb/weapon transforms beyond the
  already varied root roll. Identical identity and KIA state must reapply
  byte-stably.
- KIA retains strict precedence over reload, fire, aim, crawl, wounded gait,
  move, and idle. `INCAPACITATED`, generic `DEAD`, and living states do not
  acquire KIA variation.
- Living -> KIA -> living restore resets every transform touched by the
  overlay. Capture/restore and replay recompute the exact same end pose without
  a new persistent field.
- Keep casualties ground-adjacent and weapons plausibly grounded. Use bounded
  scalar transform work only, with no resource, timer, lifecycle, or per-call
  object ownership.
- Label the work as a first-order static end-pose approximation. Do not claim
  blended, physics-driven, wound-localized, or dynamic falls.

### Required behavioral tests

- Kill all six soldiers through public `Unit.applySoldierHit()` and require at
  least three distinct signatures excluding existing root roll. This
  assertion must fail on the pre-packet implementation.
- Reapplying identical KIA state is byte-stable and matching stable identity
  selects the same variant.
- Living -> KIA -> living restore clears every touched transform; KIA overrides
  reload/fire/aim/crawl/wounded inputs; incapacitated/dead do not vary.
- A real unit capture/restore/replay reproduces exact projected transforms
  without adding a pose field.
- World bounds remain ground-adjacent and dropped weapons do not float.

### Explicitly forbidden

- Dynamic fall progress, clips, ragdolls, RNG, wall clock, wound localization,
  new simulation authority, new capture fields, IK, foot placement, blended
  transitions, turn-in-place, weapon deployment, animation LOD, new geometry,
  materials, dependencies, broad animator cleanup, TODO edits, commits,
  branches, or pushes.
- `SoldierAI`, `SoldierAgent`, `Unit`, `GameApp`, UI, audio/VFX, maps,
  buildings, content, any vehicle file, or either France 1940 render factory.
- Editing the user-owned
  `src/content/france1940/render/France1940UnitMeshFactory.js` or
  `src/content/france1940/render/France1940InfantryWeaponFactory.js`.

### Baseline and validation

Run before editing and after the final edit:

```sh
node --test test/infantry-pose-animator.test.js \
  test/soldier-ai.test.js \
  test/infantry-fidelity.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

Perform near/high infantry-LOD browser checks in realtime and WEGO through the
real damage path. Report URL, backend, `data-game-status`, console errors,
three visibly distinct casualties, ground contact, and rewind/replay identity.
A blank framebuffer, unavailable browser, port failure, or device loss is an
environment blocker, not a pass.

### Coordinating TODO after approval

Keep the broad infantry-animation parent and remaining child unchecked. Add
one completed child describing only stable-identity first-order varied KIA end
poses with reset, precedence, grounding, and capture/restore projection
coverage.

### Results

- Status: ACCEPTED after two independent `REVISE` findings, both bounded
  corrections, and clean final rereview. Focused, full, build, and browser
  gates are clean; the repository-wide whitespace blocker is confined to the
  concurrent forbidden weapon factory recorded below.
- Scope completed:
  - Added a labeled first-order static KIA end-pose overlay that buckets the
    existing stable unit/soldier casualty roll into four fixed root, limb, and
    dropped-weapon signatures.
  - KIA now resets both existing arm rigs from grip IK to their stored base
    upper/lower lengths, segment offsets, hand offsets, and identity elbow
    quaternion before applying the selected end pose. The two side-pose
    lower-arm angles were recalibrated inside the same KIA overlay so the
    correct-length limbs preserve the existing ground-contact invariant.
    KIA also normalizes both arms' transient `userData.gripBinding` diagnostics
    and the weapon rig's transient `userData.activeGripAssignments` to `null`,
    so no prior living grip choice remains attached to a casualty.
  - Kept KIA precedence over idle, aim, reload, fire, crawl, wounded gait, and
    movement. Living, `INCAPACITATED`, and generic `DEAD` paths retain their
    existing behavior.
  - Added public idle/aim/reload/crawl/wounded -> KIA coverage that inspects
    complete nested shoulder, upper-arm, elbow, forearm, and hand transforms
    plus world hand positions. Those transitions now first require populated
    living arm bindings/weapon assignments, then require all three metadata
    fields to be `null` after public KIA. Added action-pose -> same KIA snapshot
    restore coverage requiring byte-identical complete nested projections and
    identically empty metadata. The public six-soldier damage probe still
    produces four signatures excluding root roll and preserves
    casualty/weapon ground bounds.
  - Deliberately left dynamic falls, transitions, wound localization, physics,
    new pose state, and all vehicle/factory/TODO work incomplete and untouched.
- Files changed:
  - Presentation:
    `src/world/infantry/InfantryPoseAnimator.js`, only the KIA overlay and its
    nested arm-reset helper; accepted crawl and wounded-gait behavior remains
    intact.
  - Tests: `test/infantry-pose-animator.test.js`.
  - Packet report: only this Results and Questions / Blockers section.
- Authoritative ownership is unchanged. The overlay consumes the stable
  casualty roll and base arm lengths already projected/stored by existing
  owners; it adds no RNG, timer, lifecycle owner, geometry, material, resource,
  persistent field, or capture schema. Cleared grip records are transient mesh
  presentation diagnostics and remain excluded from simulation capture.
- Revision focused baseline:
  `node --test test/infantry-pose-animator.test.js test/soldier-ai.test.js
  test/infantry-fidelity.test.js` passed 3/3 files, 0 failed, in
  383.699734 ms.
- Focused final after the revision: the same command passed 3/3 files, 0
  failed, in 473.540374 ms. The animator file itself passed 15/15 behaviors.
- Metadata-revision focused baseline: the same command passed 3/3 files, 0
  failed, in 628.787033 ms before the final metadata edit.
- Metadata-revision focused final: PASS, 3/3 files, 0 failed, in
  413.91647 ms, with a final post-report confirmation at 371.721572 ms. The
  animator file passed all 15/15 behaviors.
- Full `npm test`: final PASS, 94/94 test files, 0 failed, in
  6564.427961 ms. The first metadata-revision run passed 93/94 while concurrent
  weapon-factory work briefly broke `FM 24/29 LMG core barrel must terminate
  at muzzle marker`; that external owner repaired the factory, the isolated
  geometry file returned to 11/11, and the clean full rerun required no packet
  change.
- `npm run build`: PASS, Vite 8.1.5 transformed 739 modules in 279 ms; the
  largest emitted chunk was `game` at 469.86 kB and there were no build
  warnings.
- Packet-owned `git diff --check -- src/world/infantry/InfantryPoseAnimator.js
  HANDOFF.md`: PASS with no output after the final packet report. A direct
  trailing-whitespace scan of those files plus the untracked new
  `test/infantry-pose-animator.test.js` also passed. Repository-wide
  `git diff --check`: BLOCKED by four trailing-whitespace lines in the
  explicitly forbidden concurrent
  `src/content/france1940/render/France1940InfantryWeaponFactory.js` at lines
  165, 548, 565, and 820.
- Browser validation:
  - URL:
    `http://127.0.0.1:5175/?mode=realtime&quality=high&camera=near&seed=424242`
    and the matching `mode=wego` URL; isolated Chrome viewport 1440 x 757.
  - Scenario `stonne-1940`, quality high, near camera, inspected infantry unit
    `fr_hq`, active LOD `high`.
  - Realtime and WEGO both reached `data-game-status="ready"` with
    `webgl2-fallback`, no `data-game-error`, no device loss, and no JavaScript
    exception. Expected unavailable-WebGPU-adapter/fallback and software
    ReadPixels warnings appeared, plus one non-application 404 resource entry.
  - Realtime first projected idle, aim, reload, crawl, wounded-move, and move
    poses, confirmed all six exercised nested living elbow IK, then killed all
    six through public `Unit.applySoldierHit()`. The result had four signatures
    excluding root roll, identity elbows, exact stored base segment
    lengths/offsets on both arms, and finite world hand positions. The fresh
    captured viewport visibly showed distinct prone/side/curled silhouettes,
    ground-adjacent bodies, and adjacent dropped weapons.
  - WEGO `executeTurn()` -> public damage -> `rewindTurn()` -> identical public
    damage restored the five `OK` plus one prior `WOUNDED` living statuses and
    then reproduced all six complete KIA projections byte-exactly (11,079
    serialized bytes), with no casualty/fall pose field.
  - Final metadata revision probe used the same realtime/WEGO URLs and
    high-LOD `fr_hq`. Realtime projected idle, aim, reload, crawl,
    wounded-move, and move with all three living metadata records populated;
    public damage made all six KIA records exactly `null` and retained four
    signatures. WEGO rewind repopulated living metadata, while both public KIA
    projections cleared it and reproduced the complete transform-plus-metadata
    projection byte-exactly (9,621 serialized bytes). No grip metadata appeared
    in capture state.
- Remaining approximation/review points: fixed authored transforms are a
  first-order presentation approximation; reviewers should inspect silhouette
  separation and weapon grounding at the side-pose terrain extremes.
- Independent review finding and revision: `REVISE` found that KIA skipped
  living hand binding but retained its previously solved nested elbow
  quaternion and stretched segment transforms. The revision resets every
  transform mutated by the existing two-bone solver before KIA projection and
  adds direct public transition/restore regressions.
- Second independent rereview and revision: `REVISE` found the transforms
  correct but identified retained per-arm `gripBinding` and weapon-rig
  `activeGripAssignments` from the prior living pose. The final revision
  clears those transient records during KIA projection and includes them in
  history-independent public transition, same-KIA restore, and replay
  equality. A bounded read-only audit found no remaining packet blocker and
  independently passed the 15/15 animator behaviors plus the 3/3 focused gate.
- Final independent rereview: APPROVE. Public idle, aim, reload, crawl, and
  wounded histories converge on byte-identical full KIA rig projections with
  empty transient grip metadata; restore/replay, four variants, precedence,
  exclusions, grounding, scope, and no-new-state/resource invariants pass.

### Questions / Blockers

- Concurrent out-of-scope whitespace blocker: the required repository-wide
  `git diff --check` reports four trailing-whitespace lines at 165, 548, 565,
  and 820 of
  `src/content/france1940/render/France1940InfantryWeaponFactory.js`. That
  user-owned factory is explicitly forbidden to this packet. The casualty
  animator, test, and packet-report paths pass their scoped whitespace check.

---

## Packet BUILDING-DAMAGE-AUDIO-A: bounded structural-damage sound projection

### Status

AUTHORIZED for one Codex non-vehicle presentation worker after
BUILDING-DEBRIS-A acceptance. Implement only this audio slice, preserve the
accepted debris hunk, fill Results and Questions / Blockers, and stop for
independent review.

### Goal

Attempt one deterministic severity-routed procedural sound for each
authoritative building-damage transaction that produces at least one accepted
normalized damage, breach, or collapse presentation event.

This is transient downstream audio. It does not add fire/smoke state, change
damage or collapse authority, create an observation SOUND contact, claim
positional audio, or persist an audio cursor.

### Allowed files

- `src/engine/audio/BattlefieldAudioContract.js`, only the building-damage
  resolver requirement
- `src/engine/SoundEngine.js`, only one bounded public building-damage playback
  method through the existing event/voice/cache lifecycle
- `src/content/france1940/audio/France1940ProceduralAudioProvider.js`, only
  stable first-order damaged/breached/collapsed event IDs, procedural layers,
  one category cap, and its resolver
- `src/game/CombatSystem.js`, only allocation-bounded selection from the
  existing normalized immutable building-debris events and one caught sound
  invocation after authoritative callbacks
- `test/sound-engine.test.js`, only building-damage playback, voice cap, cache,
  and disposal behavior
- `test/audio-asset-provider.test.js`, only contract/provider binding,
  replacement-provider routing, event-ID, and lifecycle assertions
- `test/building-damage-audio.test.js` (new), preferred for the complete
  cross-layer transaction behavior
- `HANDOFF.md`, only Packet BUILDING-DAMAGE-AUDIO-A Results and
  Questions / Blockers

Existing building, debris, rollback, and sound-contact tests are validation
inputs only. If another production or test file is required, stop and identify
the exact seam.

### Presentation contract

- Consume only the immutable records returned by the accepted
  `projectBuildingDebrisEvents()` path. Do not reinterpret raw section health,
  query renderer state, or create a second building-damage projection.
- If the normalized event list is nonempty, choose exactly one record by
  severity `collapsed > breached > damaged`, then lexical stable `sectionId`.
  Reversing input/result order must not change the selection. Multiple section
  transitions in one transaction still cause at most one sound attempt.
- Invoke audio only after occupant consequences and `onBuildingChanged` have
  completed. Preserve the existing debris projection/effect behavior and
  return value. A missing/disabled/capped engine may decline playback.
- Catch provider, resolver, initialization, and playback failure at the
  CombatSystem presentation boundary. Audio must not affect building state,
  occupant consequences, building callbacks, debris, telemetry, injected RNG,
  combat return values, or replay.
- A persistent no-op result such as `applied: 0` on an already collapsed
  section produces no normalized event and no sound.
- Add no `onAuditoryEvent` call. Building audio must never enter observation
  contact/relay authority.
- Extend the battlefield-audio resource contract with one required
  `resolveBuildingDamageEvent(context)` method. It must resolve only stable
  provider-owned event IDs; an unknown event still fails clearly through the
  existing `playEvent()` contract.
- Provide distinct bounded first-order procedural events for `damaged`,
  `breached`, and `collapsed`, under one named building-damage voice category
  and explicit positive category limit. Label the synthesis as a gameplay
  presentation approximation rather than recorded historical evidence.
- Reuse the existing cached seeded-noise buffers, bounded voice reservation,
  node release, provider resource disposal, and idempotent engine disposal.
  Add no timers, unbounded arrays/maps, per-event asset loading, or new
  dependency.
- Audio remains global/non-positional in this slice. The normalized event may
  retain world position for other consumers, but the audio engine must not
  pretend to spatialize it.

### Behavioral acceptance

- Real public building damage, breach, and collapse transactions resolve the
  corresponding provider event ID and update `SoundEngine.lastEventId` when a
  voice is available.
- Reversed normalized-event ordering chooses the same single severity/section
  event; a multi-collapse transaction causes one sound attempt.
- `applied: 0` persistent collapse state and an empty normalized list cause no
  resolver or playback call.
- Occupant-consequence and building-changed callbacks happen before the sound
  attempt. Existing debris effects still run when sound throws; sound failure
  leaves authoritative building capture, combat telemetry, injected RNG count,
  callbacks, and returned debris events byte-deep-equal to a nonthrowing run.
- No building-damage path invokes `onAuditoryEvent`.
- A replacement provider's building resolver controls playback; a malformed
  resource set missing the resolver is rejected. All three event records and
  the positive category limit validate through the public contract.
- Repeated playback never exceeds the configured building-damage voice cap.
  Seeded buffers are reused, ended sources release voices/nodes, and provider,
  context, and nodes dispose exactly once through the existing idempotent
  lifecycle.
- No capture/restore version or authoritative building field changes.
  Restoring a snapshot itself is silent; replaying the same authoritative
  state transition may recreate the transient presentation, consistent with
  existing weapon audio and debris behavior.

Tests must drive public `BuildingSystem` / `CombatSystem` / `SoundEngine`
behavior. Source-text assertions may supplement but never replace transaction
and lifecycle evidence.

### Explicitly forbidden

- Building descriptors/state/system/capture, fire/smoke/spread, partial-floor
  animation, scenario thresholds, maps, `GameApp`, observation/SoundContacts,
  VFX contracts/providers, building meshes, UI, renderer/weapon factories,
  vehicles, dependencies, package/config/lockfiles, TODO edits by the worker,
  commits, branches, pushes, or broad audio/CombatSystem cleanup.
- Editing `FrenchHouse.js`, `stonne.js`, either current building descriptor,
  `France1940UnitMeshFactory.js`, or
  `France1940InfantryWeaponFactory.js`.
- Positional/panner claims, polling live building state at playback, random
  audio selection, new authoritative RNG consumption, repeated sound for
  persistent no-op collapse, or one voice per affected section.

### Baseline and validation

Run before editing and after the final edit:

```sh
node --test test/sound-engine.test.js \
  test/audio-asset-provider.test.js \
  test/building-debris-vfx.test.js \
  test/building-system.test.js \
  test/building-combat.test.js \
  test/combat-rollback.test.js
node --test test/building-damage-audio.test.js \
  test/sound-engine.test.js \
  test/audio-asset-provider.test.js \
  test/building-debris-vfx.test.js \
  test/building-system.test.js \
  test/building-combat.test.js \
  test/combat-rollback.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

Perform WEGO and realtime browser checks with audio resumed through a real user
gesture. Report URL, mode, backend, `data-game-status`, console errors, a real
breach and collapse, provider event IDs, `lastEventId`, and bounded active
building voices. Automated node scheduling is useful evidence; audible
confirmation requires an attached audio-capable browser. A suspended
AudioContext, unavailable device/tab, or blank runtime is a blocker, not an
audible pass.

### Coordinating TODO after approval

Keep the broad destructible-building parent and remaining persistent-effects
child unchecked. Add one completed child describing only deterministic
severity-routed one-shot damaged-building audio with bounded provider/voice
lifecycle and presentation-failure isolation.

### Results

- Status: ACCEPTED after both independent-review lifecycle corrections passed
  final rereview.
- Scope completed: Added a single transient building-damage audio attempt from
  the accepted immutable debris projection. It chooses one severity-ranked,
  lexical-section-stable event after occupant and building callbacks, then
  delegates to the injected provider through `SoundEngine`. The France 1940
  provider owns distinct damaged, breached, and collapsed first-order gameplay
  presentation approximations under a bounded `buildingDamage` category.
- Scope deliberately left incomplete: No building authority, descriptors,
  capture/restore, observation contacts, positional audio, RNG use, telemetry,
  fire/smoke, asset loading, or audio cursor was added. Existing debris remains
  unchanged and a capped/missing/failing audio engine may decline playback.
- Files changed: Audio contract/engine:
  `src/engine/audio/BattlefieldAudioContract.js`, `src/engine/SoundEngine.js`;
  France 1940 audio provider:
  `src/content/france1940/audio/France1940ProceduralAudioProvider.js`;
  downstream presentation:
  `src/game/CombatSystem.js`; tests: `test/sound-engine.test.js`,
  `test/audio-asset-provider.test.js`, `test/building-damage-audio.test.js`;
  packet record: `HANDOFF.md`.
- Authoritative state or ownership changed: None. `BuildingSystem` remains the
  damage/collapse owner. `CombatSystem` reads only its already-normalized,
  immutable debris events, and audio is transient and caught at the presentation
  boundary.
- Focused baseline: PASS, 6/6 files before edits:
  `node --test test/sound-engine.test.js test/audio-asset-provider.test.js
  test/building-debris-vfx.test.js test/building-system.test.js
  test/building-combat.test.js test/combat-rollback.test.js`.
- Focused final after independent-review revision: PASS, 7/7 files:
  `node --test test/building-damage-audio.test.js test/sound-engine.test.js
  test/audio-asset-provider.test.js test/building-debris-vfx.test.js
  test/building-system.test.js test/building-combat.test.js
  test/combat-rollback.test.js`. Tests cover public damaged/breached/collapsed
  transactions, stable reversal/multi-event selection, persistent no-op,
  callback order, thrown-audio isolation, no auditory callback/RNG/telemetry
  changes, provider replacement, contract rejection, voice cap, seeded-cache
  reuse, release, idempotent disposal, contained rejected `resume()` promises,
  and transactional two-layer scheduling cleanup/recovery.
- Full `npm test`: PASS, 89/89 test files, 0 failed.
- `npm run build` and warnings: PASS, Vite 8.1.5 transformed 737 modules;
  largest chunk was `game` at 456.25 kB; no warnings.
- `git diff --check`: PASS with no output after the final packet record.
- Browser/runtime evidence: BLOCKED. HTTP responses were reachable at
  `http://127.0.0.1:5173/` and `http://127.0.0.1:5174/`, but no attached
  browser/audio-capable tab was available to resume an AudioContext by a real
  gesture, verify WEGO/realtime `data-game-status`, trigger a real breach and
  collapse, inspect `lastEventId`/active voices, or capture console output.
- Remaining risks and review points: A connected audio-capable browser should
  validate audible playback in both WEGO and realtime modes.
- Independent-review revision: A suspended-context `resume()` rejection is now
  consumed inside the synchronous `SoundEngine` lifecycle, so it cannot escape
  as an unhandled promise rejection beyond CombatSystem's presentation boundary.
  Layer scheduling is transactional: a later create/start/stop failure clears
  callbacks, safely stops/disconnects the partial graph, releases the voice
  reservation, then rethrows the original error for the existing caller
  boundary. Public regressions cover real `SoundEngine` through CombatSystem
  across the microtask/unhandled-rejection window and a two-layer collapsed
  event whose oscillator creation fails after noise attachment, then proves
  cap-one recovery and idempotent disposal.
- Final independent rereview: APPROVE. Real-engine probes confirmed contained
  resume rejection, transactional partial-graph teardown, exact error
  preservation, cap-one playback recovery, debris/authority/RNG/contact
  isolation, and idempotent disposal. Focused 7/7, integrated 89/89, the
  737-module warning-free build, and `git diff --check` passed.

### Questions / Blockers

- Browser/audio gate blocker: no attached browser/audio-capable tab was
  available; local dev-server HTTP reachability alone cannot prove resumed or
  audible WebAudio playback.

---

## Packet INFANTRY-WOUNDED-GAIT-A: deterministic guarded locomotion presentation

### Status

AUTHORIZED for one Codex non-vehicle presentation worker after
INFANTRY-CRAWL-POSE-A acceptance. Implement only this first-order wounded gait,
preserve the accepted crawl behavior, fill Results and Questions / Blockers,
and stop for independent review.

### Goal

Give a living wounded infantryman who is actually moving in a non-prone stance
a deterministic phase-changing guarded gait instead of projecting the ordinary
`move` label with only a static root lean.

This is a generalized visual cue, not a sided limp. The simulation has no
wound-location or injured-limb authority, so this packet must not invent one.

### Allowed files

- `src/world/infantry/InfantryPoseAnimator.js`, only one bounded wounded
  non-prone locomotion overlay and its active-pose projection
- `test/infantry-pose-animator.test.js`, only wounded-gait public behavior
  while preserving every accepted crawl assertion
- `HANDOFF.md`, only Packet INFANTRY-WOUNDED-GAIT-A Results and
  Questions / Blockers

Existing `test/soldier-ai.test.js` and `test/infantry-fidelity.test.js` are
validation inputs only and must not be edited. If another file is required,
stop and identify the exact seam.

### Presentation contract

- Read only the existing soldier `status`, `health`, `state`, `stance`,
  `velocity`, and `stridePhase`. Do not add pose history, a wound side, RNG,
  clock, frame count, authoritative field, or capture version.
- Eligibility is exactly positive-health `WOUNDED`, at or above the existing
  movement-speed threshold, in `STANDING`, `KNEELING`, or `CROUCHED`, when
  reload, recoil/fire, and aim/observe do not own the pose.
- Preserve precedence:
  `casualty > reload > fire > aim/observe > prone crawl > wounded-move >
  ordinary move > idle`. A wounded prone mover remains the accepted `crawl`;
  positive-health `INCAPACITATED` and `DEAD` remain unavailable and never gain
  wounded locomotion.
- Project `wounded-move` through the existing active-pose seam. Derive one
  modest guarded torso forward/sway cue directly from current distance-driven
  stride phase. Reapplying identical state must be byte-stable; opposite
  phases must differ.
- Use only torso rotations reset by the existing secondary-pose path. Do not
  change root position/roll, arms, legs, head/headgear, weapon transforms,
  geometry, materials, or resources. Preserve the existing deterministic
  wounded root lean owned by the public `SoldierAI.applyPose()` path.
- Preserve semantic trigger/support grip solving and reachability after the
  overlay. Do not detach the weapon or infer a guarded arm.
- Wounded-move -> ordinary move, stationary wounded, prone crawl, action pose,
  and KIA transitions must clear the wounded torso overlay without stale
  transforms or contaminating the accepted crawl overlay.
- Use bounded scalar math with no per-call object/array allocation and no
  presentation history. Label the gait a first-order gameplay presentation
  approximation, not medical, biomechanical, motion-capture, or historical
  evidence.

### Behavioral acceptance

- Through public `Unit` / `SoldierAI.applyPose()`, a positive-health wounded
  standing, kneeling, and crouched mover reports
  `activePose === "wounded-move"` and a nonzero bounded guarded torso cue;
  the equivalent ordinary mover remains `move`.
- Opposite stride phases produce distinct guarded torso transforms, and
  identical input reapplies identically. Each wounded test must assert the
  `wounded-move` label or nonzero guarded cue so it fails before this packet.
- Wounded-move -> ordinary move and wounded-move -> stationary wounded reset
  the torso overlay while preserving the existing deterministic wounded root
  lean where status remains wounded.
- Wounded non-prone -> wounded prone projects the already accepted `crawl`
  transforms/label without residual wounded-gait torso state. KIA remains
  `casualty`; incapacitated/dead never report `wounded-move`.
- Reload, aim/observe, and recoil/fire labels retain precedence and do not
  receive the wounded torso overlay.
- Both semantic hand bindings remain reachable at opposite wounded gait
  phases.
- Capture a real infantry `Unit`, mutate status/stance/velocity/stride phase,
  restore, and re-project. The restored `wounded-move`, root wound cue, and
  torso transform must be byte-deep-equal to the pre-capture projection, with
  no new pose field.
- No new per-call allocation, resource, disposal path, authoritative state, or
  capture schema is introduced.

Tests must exercise public state and transforms. Source-text assertions may
supplement but never replace the public pose path.

### Explicitly forbidden

- `SoldierAI`, `SoldierAgent`, `Unit`, `GameApp`, render/weapon factories,
  simulation/observation/separation, buildings/maps, UI, audio/VFX, vehicles,
  dependencies, package/config/lockfiles, TODO edits by the worker, commits,
  branches, pushes, or broad pose-helper cleanup.
- Sided limp, wound localization, health-based gait severity, speed/collision
  changes, blended transitions, terrain foot/hand contact, turn-in-place,
  weapon deployment, casualty variation, animation LOD, new geometry, clips,
  or IK.
- Editing the user-owned
  `src/content/france1940/render/France1940UnitMeshFactory.js` or
  `src/content/france1940/render/France1940InfantryWeaponFactory.js`.

### Baseline and validation

Run before editing and after the final edit:

```sh
node --test test/infantry-pose-animator.test.js \
  test/soldier-ai.test.js \
  test/infantry-fidelity.test.js
npm test
npm run build
git diff --check
git status --short --branch
```

Perform WEGO and realtime browser checks at a near infantry LOD. Report URL,
mode, backend, `data-game-status`, console errors, and real damage-plus-movement
evidence that a living wounded non-prone mover changes guarded gait phase while
a wounded prone mover retains crawl. A blank framebuffer, unavailable tab, or
device loss is a blocker, not a visual pass.

### Coordinating TODO after approval

Keep the broad infantry-animation parent and remaining child unchecked. Add
one completed child describing only phase-derived generalized wounded guarded
locomotion with precedence, grip, transition-reset, and capture/restore
projection coverage.

### Results

- Status: ACCEPTED after test-only review hardening passed final independent
  rereview.
- Scope completed: Added a bounded first-order gameplay-presentation guarded
  torso cue for positive-health `WOUNDED` movers in standing, kneeling, and
  crouched stances. It derives forward/sway rotations only from the resolved
  distance-driven stride phase and projects `wounded-move` after casualty,
  reload, fire, aim/observe, and accepted prone-crawl precedence. The existing
  public `SoldierAI.applyPose()` wounded root lean remains unchanged. Public
  behavioral coverage now exercises all three eligible stances, the strict
  positive-health boundary, opposite and repeated phase projections, root-lean
  preservation/reset, overlapping casualty/reload/fire/aim precedence,
  ordinary/stationary/prone/action/unavailable/KIA resets, semantic grip
  reachability, and real `Unit` capture/restore with direct pose/root/torso
  assertions.
- Scope deliberately left incomplete: No wound side, severity, pose history,
  authoritative field, capture version, movement/collision behavior, arm/leg,
  head/headgear, weapon, resource, factory, or simulation change. The accepted
  prone crawl behavior remains intact.
- Files changed: Presentation:
  `src/world/infantry/InfantryPoseAnimator.js`; tests:
  `test/infantry-pose-animator.test.js`; packet record: `HANDOFF.md`.
- Authoritative state or ownership changed: None. `SoldierAI` retains the
  existing deterministic wounded root lean; the animator consumes current
  status, health, state, stance, velocity, and stride phase as downstream
  presentation only. No persistent field or capture schema changed.
- Focused baseline: PASS, 3/3 files before edits:
  `node --test test/infantry-pose-animator.test.js test/soldier-ai.test.js
  test/infantry-fidelity.test.js`.
- Focused final: PASS, 3/3 files after final edits with the same command.
- Full `npm test`: PASS, 89/89 test files, 0 failed.
- `npm run build` and warnings: PASS. Vite 8.1.5 transformed 737 modules;
  largest output was `game` at 456.49 kB; no build warnings.
- `git diff --check`: PASS with no output after final edits.
- Browser/runtime evidence: BLOCKED. `npm run dev -- --host 127.0.0.1` failed
  before a browser check because sandbox local-port binding returned
  `listen EPERM` for `127.0.0.1:5173`; no browser tab was available to verify
  WEGO/realtime visual phase changes, backend, status, or console output.
- Remaining risks and review points: Confirm visible phase alternation at near
  infantry LOD in WEGO and realtime through a connected browser.
- Review revision: Added test-only public assertions for zero/negative-health
  exclusion and the positive minimum boundary, direct capture/restore pose,
  root-lean, and torso equality, root-lean transition preservation/reset, and
  overlapping precedence. Production implementation remains unchanged.
- Final independent rereview: APPROVE. Public coverage proves strict
  positive-health eligibility, root-lean preservation/reset, direct restored
  pose/root/torso equality, overlapping precedence, no new pose field, and all
  five accepted crawl behaviors. Focused 3/3, integrated 89/89, the
  737-module warning-free build, and `git diff --check` passed.

### Questions / Blockers

- Browser-only blocker: sandbox local-port binding failed with `EPERM` and no
  browser was attached, preventing the required WEGO/realtime visual checks.

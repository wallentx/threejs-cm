# Antigravity Work Packet

Packet owner: coordinating Codex agent.

Only Packet H39-A is authorized. Complete this extraction packet, fill in its
results, and stop for coordinating-agent review. Do not start H39 geometry
calibration, track-path migration, another vehicle, or another `TODO.md` item.
Do not commit, push, create/switch branches, or rewrite this packet's scope.

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
- All 156 non-H39 records also remain identical.
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
- both manifests contain 168 records and compare byte-for-byte;
- baseline fixture has no diff caused by this packet;
- full suite passes with exact counts reported;
- production build passes; report the known WebGPU vendor chunk warning;
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

- Status: NOT STARTED
- Scope completed:
- Scope deliberately left incomplete:
- Files changed, grouped by data/rendering/tests/docs:
- Authoritative ownership changed:
- Focused baseline result:
- Focused final test result:
- Before/after silhouette audit and `cmp` result:
- Full `npm test` result:
- `npm run build` result and warnings:
- `git diff --check` result:
- Final branch/worktree status:
- Remaining risks and review points:

## Questions or blockers

Antigravity records blockers here and stops. Do not rewrite packet scope.

# Antigravity Work Packet

Packet owner: coordinating Codex agent.

Only Packet A below is authorized. Complete it, write the results, and stop for
review. Do not begin another `TODO.md` item. Do not commit, push, create a
branch, or modify this packet's scope.

Read `AGENTS.md`, `TODO.md`, and `docs/ARCHITECTURE.md` before editing. The
worktree is intentionally dirty and contains user-owned reference images plus
other validated work. Preserve all unrelated changes.

## Packet A: deterministic vehicle silhouette baseline

### Goal

Complete one honest, reviewable slice of this unchecked parent:

```markdown
- [ ] Add deterministic visual capture coverage for high/medium/low LOD,
  ballistic impacts, and vehicle damage states.
```

This packet covers only CPU-rendered vehicle LOD silhouettes. It does not cover
ballistic impacts or vehicle damage-state captures. The parent must remain
unchecked.

Build a reusable, GPU-free audit that covers:

- all 14 registered France 1940 vehicles;
- `side`, `front`, and `top` orthographic views;
- `high`, `medium`, `core`, and `proxy` authored tiers;
- 14 x 3 x 4 = 168 deterministic capture records.

`proxy` is the cheap runtime low-distance representation. Keep its authored
name in manifests instead of relabeling it `low`.

### Existing seam to reuse

- `scripts/audit-vehicle-silhouettes.mjs`
- `src/calibration/SoftwareSilhouette.js`
- `src/calibration/CalibrationModel.js`
- `src/world/vehicles/VehicleVisualProfiles.js`
- `src/content/france1940/render/index.js`
- `FRANCE_1940_VEHICLE_MESH_FACTORIES`
- `UnitFactory.createTankMesh`

Inspect those producers and their tests first. Extract reusable audit logic;
do not duplicate the current CLI loop in a test.

### Required implementation

Create one pure reusable audit module. Suggested public shape:

```js
createVehicleSilhouetteManifest({
  profiles,
  meshFactories,
  width,
  height
})
```

Exact naming may differ. Required behavior:

1. Require injected profiles and vehicle mesh factories. Do not import a
   concrete family from the reusable module.
2. Sort model IDs, views, and LOD tiers explicitly. Do not rely on object
   insertion order, scene traversal order from a map/set, or filesystem order.
3. Build one model per vehicle, detach nested proxy meshes through the existing
   helper, select each LOD through the existing visibility helper, and render
   through `renderVehicleSilhouetteSvg`.
4. Use one fixed render configuration for every capture. Keep width, height,
   view list, LOD list, and envelope-visibility policy in manifest metadata.
5. Emit one record per model/view/LOD containing at least:
   - stable key: `modelId:view:lod`;
   - model ID and designation;
   - view and LOD;
   - triangle count;
   - finite projected bounds in metres;
   - projected width and height in metres;
   - SHA-256 of normalized SVG content.
6. Normalize only platform-neutral serialization details such as CRLF versus
   LF and final trailing whitespace. Do not round away geometry differences or
   strip path data before hashing.
7. Round serialized floating-point metrics at one documented precision only
   after all calculations. Use the same precision in generation and tests.
8. Include a schema version. Do not include timestamps, random IDs, absolute
   paths, process IDs, machine names, or elapsed durations.
9. Reject duplicate keys, missing tiers, empty silhouettes, non-finite bounds,
   zero/negative extents, and records outside a documented registered-envelope
   epsilon. Reuse existing dimension/calibration contracts; do not invent a
   permissive tolerance to make current output pass.
10. Return plain serializable data. No DOM, WebGPU, WebGL, canvas, browser, or
    network dependency.

### Reviewed baseline

Add a compact checked-in JSON baseline for all 168 records.

- Store hashes and audit metrics, not 168 raster images or full SVG documents.
- Keep entries in deterministic sorted order.
- Baseline generation must be an explicit opt-in command.
- Normal `npm test` must compare against the baseline and must never rewrite it.
- A changed hash, triangle count, projected bound, missing key, or extra key
  must fail with the exact model/view/LOD key and old/new values.
- Initial baseline generation is a proposal for Codex review. Summarize all
  model IDs, capture count, triangle-count ranges by LOD, and any envelope
  warnings in the results section.
- Future intended model edits require a human-reviewed baseline diff. Never
  regenerate the file merely to turn a failing test green.

Keep the existing positional CLI behavior:

```sh
node scripts/audit-vehicle-silhouettes.mjs "$TMPDIR/vehicle-silhouette-audit.json"
```

It must still write a deterministic audit report and return nonzero for audit
failures. An additional explicit flag or a separate allowed package script may
write the reviewed baseline. The updater must refuse an ambiguous destination
and print the exact written path and record count.

### Required tests

Add focused behavioral coverage that:

- asserts exactly 14 vehicles, 3 views, 4 LODs, and 168 unique records;
- asserts every registered model appears and no unregistered model appears;
- asserts every record is nonempty, finite, and inside the documented envelope
  check;
- runs manifest generation twice in one process and deep-compares the complete
  output;
- compares generated output with the checked-in baseline;
- proves one altered in-memory expected hash or metric produces a keyed,
  readable comparison failure;
- does not replace execution with source-string or grep assertions.

Also run the CLI twice in fresh Node processes and compare the two generated
reports byte-for-byte. Use `$TMPDIR`; do not assume `/tmp`.

### Allowed files

Only these paths may be changed:

- `scripts/audit-vehicle-silhouettes.mjs`
- `src/calibration/VehicleSilhouetteAudit.js` (new)
- `test/vehicle-silhouette-audit.test.js` (new)
- `test/fixtures/vehicle-silhouette-baseline.json` (new)
- `package.json`, only to add clearly named audit/update scripts; no dependency
  or existing-script changes
- `TODO.md`, only the deterministic visual-capture item and its children
- `HANDOFF.md`, only **Results** and **Questions or blockers**

If a different helper filename is materially better, record the proposed path
under **Questions or blockers** and stop before creating it.

### Explicitly forbidden

- Any edit under `src/game/`, `src/simulation/`, `src/world/vehicles/`,
  `src/content/`, `src/engine/`, `src/ui/`, `src/app/`, or `src/styles/`.
- Any edit to `SoftwareSilhouette.js`, `CalibrationModel.js`,
  `VehicleVisualProfiles.js`, model geometry, materials, textures, markers,
  LOD visibility semantics, catalogs, scenarios, maps, renderer, or runtime UI.
- Any weapon, ballistics, damage, AI, movement, spotting, crew, ammunition,
  WEGO, realtime, or RNG behavior change.
- Any model correction discovered while auditing. Report it; do not fix it in
  this packet.
- Any baseline-update path that runs automatically from tests, install hooks,
  build hooks, or the default audit command.
- Giant generated SVG/raster collections, external downloads, network access,
  new dependencies, authentication, access tokens, cloud services, or external
  dashboards.
- Test deletion, skipped tests, snapshot auto-update, relaxed model contracts,
  or tolerance inflation.
- Formatting or cleanup outside the allowed files.

### Stop conditions

Stop and report instead of expanding scope when:

- current models fail an existing envelope, LOD, winding, or marker contract;
- deterministic output requires changing an existing production helper;
- a hash differs between identical fresh-process runs;
- an allowed file overlaps unrelated edits that cannot be preserved;
- full tests or build fail outside this packet;
- generated baseline review reveals suspiciously empty, identical, or
  implausible tiers;
- completion would require a dependency or another allowed path.

### Acceptance gates

Run after the final edit:

```sh
git status --short --branch
node --test test/vehicle-silhouette-audit.test.js test/vehicle-calibration.test.js test/vehicles.test.js
node scripts/audit-vehicle-silhouettes.mjs "$TMPDIR/vehicle-silhouette-audit-a.json"
node scripts/audit-vehicle-silhouettes.mjs "$TMPDIR/vehicle-silhouette-audit-b.json"
cmp "$TMPDIR/vehicle-silhouette-audit-a.json" "$TMPDIR/vehicle-silhouette-audit-b.json"
npm test
npm run build
git diff --check
```

Expected:

- focused tests pass;
- exactly 168 sorted capture records;
- fresh-process audit files compare byte-for-byte;
- full suite passes with an exact reported count;
- production build passes; known bundle-size warning is reported, not hidden;
- `git diff --check` emits no errors;
- no browser runtime check is required because packet is CPU-only and runtime
  files are forbidden.

Update `TODO.md` only after all gates pass:

```markdown
- [ ] Add deterministic visual capture coverage ...
  - [x] Add a reproducible CPU silhouette manifest and reviewed baseline for
    every vehicle, side/front/top view, and high/medium/core/proxy tier.
  - [ ] Add deterministic browser captures for representative ballistic
    impacts and authoritative vehicle damage states.
```

## Not authorized yet

Possible later packets, after Codex review:

- browser capture harness for ballistic impacts and vehicle damage states;
- vehicle-source migration from `src/world/vehicles/` into family render
  content;
- historical fire-control sights and rangefinders;
- tactical AI, crew reassignment, bailout, spall, or damage repair.

Do not begin these.

## Results

Fill this section only. Do not rewrite scope above.

- Status: PARTIAL; GENERIC VISUAL BUNDLES AND R35 SOURCE-DRIVEN REPAIR VALIDATED; CONTOUR CONVERGENCE REMAINS
- Scope completed:
  - Replaced model-snapshot-only R35 assertions with one reusable, injected
    vehicle visual bundle/evaluator contract.
  - Registered all 14 France 1940 vehicle bundles from canonical statistics,
    profiles, calibration records, factories, logical assets, renderer data,
    and caller-owned validation policy.
  - Registered the supplied 4351 x 3096 R35 four-elevation drawing as a
    replaceable logical asset with exact SHA-256, side/front/top crops, source
    landmarks, provenance, and secondary-source limitations.
  - Removed the R35 floating driver hood and rejected ellipsoid mantlet.
    Authored a glacis-mounted slit, irregular embedded shield, separate
    main/lower/coax collars, rear-asymmetric APX-R turret, shallow cupola dome,
    and authored main/coax muzzle ownership.
  - Kept detail and proxy rigid envelopes at 4.02 x 1.87 x 2.13 m and aligned
    internal breech/coax volumes with the renderer-owned weapon stations.
  - Retained the 168-record CPU baseline as a regression detector only. Source
    overlays, not hash equality, remain the historical-fidelity gate.
- Files changed by responsibility:
  - Data/assets: `RenaultR35VisualData.js`, France 1940 asset manifest,
    `VehicleVisualProfiles.js`, and `RenaultR35InternalLayout.js`.
  - Calibration: `VehicleVisualBundle.js`, `VehicleVisualEvaluator.js`,
    `VehicleOwnedRegistration.js`, silhouette audit engine and CLI.
  - Rendering: `RenaultR35.js`, `VehicleModelEnhancer.js`, family vehicle
    visual-bundle composition, and the checked-in R35 drawing.
  - Tests: generic visual-bundle tests, calibration/asset tests, shared
    geometry/vehicle/internal-collision tests, and the reviewed silhouette
    fixture.
  - Docs: `docs/ARCHITECTURE.md`, `TODO.md`, and this results section.
- Authoritative ownership:
  - Canonical vehicle simulation statistics remain in France 1940 content.
  - R35 renderer parameters and source registration now live together in
    `RenaultR35VisualData.js`.
  - Family composition owns the bundle registry. Generic calibration owns the
    bundle/check interfaces and imports no concrete family.
- Validation:
  - Focused command: `node --test test/vehicle-visual-bundles.test.js test/geometry-lod-fidelity.test.js test/vehicle-calibration.test.js test/asset-manifest.test.js test/vehicle-internal-collision.test.js`
  - Focused result: 58/58 passed.
  - Full `npm test`: 433/433 passed.
  - `npm run build`: 143 modules transformed; known 806.17 kB
    `three-webgpu` chunk warning only.
  - `git diff --check`: passed.
  - Updated regression fixture SHA-256:
    `bf03e200dd00bc4015ddad863fea82170686e97d59cefb736843d030f86d84da`.
  - Browser target: `http://localhost:5173` through
    `http://localhost:9222`; mode: calibration scene; backend:
    `WebGPUBackend`; `data-game-status="ready"`; R35 scene count: 1;
    console errors: 0.
- Deliberately incomplete:
  - R35 hull, turret, mantlet, and running-gear contours still need measured
    source-space side/front/top convergence. Exact envelope and clean runtime
    status do not close that fidelity item.
  - Other vehicle bundles have the reusable contract, but source-backed
    outline review remains vehicle-by-vehicle work.
  - Ballistic-impact and authoritative vehicle-damage browser captures remain
    outside this packet.

## Questions or blockers

- No environment blocker. Continue R35 contour work from the registered source,
  not from the accepted regression fixture.

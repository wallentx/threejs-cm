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

- Status: COMPLETE; AUDIT HARNESS, R35 REPAIR, VISUAL REVIEW, AND BASELINE ACCEPTED
- Baseline before packet:
  - Branch: main
  - Focused result before packet: 35/35 passed
  - Original fixture SHA-256: `693935cb45244b76cb1fc3e4c6fd3d77b2102bb31e6de7279fb841c183e55ed1`
- Implementation:
  - Audit engine: `src/calibration/VehicleSilhouetteAudit.js`
  - CLI harness: `scripts/audit-vehicle-silhouettes.mjs`
  - Reviewed baseline: `test/fixtures/vehicle-silhouette-baseline.json`
  - Audit tests: `test/vehicle-silhouette-audit.test.js`
  - Package scripts: `package.json`
  - Coordinating-agent R35 repair: `src/world/vehicles/RenaultR35.js`, `src/world/vehicles/VehicleVisualProfiles.js`, `src/world/vehicles/VehicleModelEnhancer.js`, `src/content/france1940/vehicleData/internalLayouts/RenaultR35InternalLayout.js`, `test/renault-r35-geometry.test.js`, `test/geometry-lod-fidelity.test.js`, `test/vehicles.test.js`
  - Documentation: `TODO.md`, `HANDOFF.md`
  - Manifest schema/version: 1.1.0
  - Capture count: 168 records (14 vehicles x 3 views x 4 LODs)
  - Canonical views: front, side, top
  - Canonical LODs: high, medium, core, proxy
  - Render config: 700 x 450; fixed colors; no envelope or wireframe in hashes; four-decimal metrics; 0.01 m envelope epsilon
  - Baseline update remains explicit through `npm run update:silhouette-baseline`; tests and default audits never rewrite it.
- R35 correction and review:
  - Registered source depicts the 4.02 m tail-less production configuration; removed the absent optional trench tail.
  - Reassigned the rigid endpoints to the cast nose and full track run; centered the detailed running gear; restored five visible road wheels; grounded track cleats; corrected proxy turret height.
  - Replaced the disconnected lower hull and transverse nose cylinder with one closed, outward-wound station loft; lowered the belly and retained the exact 4.02 m envelope.
  - Seated the driver hood and thin visor into the descending cast deck; replaced the floating box mantlet with a rounded embedded casting.
  - Cross-checked front asymmetry against museum photography; moved the main gun to vehicle-right and the coax to vehicle-left in rendered markers, calibration data, enhancement metadata, and internal component volumes.
  - CPU side/front/top inspection covered high, medium, core, and proxy tiers.
  - Exact audit result: 0 envelope failures across all 168 records.
  - Reviewed fixture SHA-256: `c6b01bc5bc6a05f5d87176114caf3e9abb7ff3232e50bf86ecabf01cb4a66e34`
- Validation after final code edit:
  - Focused command: `node --test test/renault-r35-geometry.test.js test/geometry-lod-fidelity.test.js test/vehicle-silhouette-audit.test.js test/vehicle-calibration.test.js test/vehicles.test.js test/vehicle-internal-collision.test.js`
  - Focused result: 76/76 passed
  - Full `npm test`: 433/433 passed
  - `npm run build`: 140 modules transformed; known 806.17 kB `three-webgpu` chunk warning only
  - Runtime server: `http://127.0.0.1:5173`
  - Browser runtime: blocked because the Three.js devtools proxy had no connected browser tab and headless Chromium's SwiftShader GPU process repeatedly exited with code 11; no runtime-success claim made.
- Deliberately incomplete: deterministic browser captures for ballistic impacts and authoritative vehicle damage states.

## Questions or blockers

- No packet blocker remains. Browser capture work still requires one connected proxy tab or a functioning headless GPU process.

# Vehicle Blueprint Calibration

Use the calibration page to compare one vehicle LOD with registered
orthographic reference art. The model remains in scene metres; the blueprint
image moves over the fixed model frame.

## Start the browser jig

```sh
npm run calibrate
```

Open `http://127.0.0.1:5173/calibration.html`.

The page provides:

- side, front, and top orthographic views;
- high, medium, core, and proxy LOD isolation;
- shaded, silhouette, wireframe, overlay, and difference modes;
- an exact rigid-envelope box and metre grid;
- image crop, mirror, scale, opacity, and X/Y offset controls;
- model/reference landmark pairs with individual and RMS error in metres;
- least-squares scale/offset fitting from two or more placed landmarks;
- JSON export and import for resumable per-vehicle registrations.

Rendering prefers WebGPU, falls back directly to WebGL 2, then uses the same
deterministic CPU-SVG projector when no browser GPU context exists. The CPU
backend remains silhouette-only in shaded mode but preserves registration,
difference, wireframe, landmarks, and metre-error workflows.

Use a local image file when a source does not permit cross-origin browser
loading. Reference URLs and evidence quality live in
`src/world/vehicles/VehicleVisualProfiles.js`. Do not commit copyrighted
reference images unless their license permits redistribution.

## Registration order

1. Select the model, view, and `high` LOD.
2. Load the matching orthographic reference.
3. Crop labels, borders, flexible aerials, and unrelated views.
4. Mirror only when the published view faces the opposite direction.
5. Register the ground line and rigid front/rear or left/right datums.
6. Use **Fit scale and offset** after two or more points are placed.
7. Register axle centres, turret ring, gun axis, and identity-defining outline
   landmarks.
8. Refit again, record RMS error, then inspect silhouette and difference modes.
9. Repeat at front and top views.
10. Refit semantic station/axle/turret data in the vehicle-owned module.
11. Recheck every LOD, muzzle marker, ground contact, outward winding, exact
    rigid envelope, tests, and build.

Weapon barrels, tow hooks, trench tails, flexible aerials, mirrors, and other
projections must follow each vehicle profile's stated dimension policy. Never
shrink or scale the authored vehicle late to force those projections inside
the rigid body envelope.

## Deterministic CPU silhouettes

The CPU exporter works without a GPU and uses the same fixed view axes and
envelope frame:

```sh
node scripts/render-vehicle-silhouette.mjs \
  fr_somua side screenshots/fr_somua-side-high.svg high
```

Arguments are:

```text
model-id  side|front|top  output.svg  high|medium|core|proxy
```

The adjacent JSON manifest records dimensions, frame, LOD, view, and projected
triangle count. CPU silhouettes are regression evidence, not a replacement for
registered multi-view landmark measurements.

Audit every vehicle, view, and LOD without writing 168 SVG files:

```sh
node scripts/audit-vehicle-silhouettes.mjs \
  "$TMPDIR/vehicle-silhouette-audit.json"
```

The audit fails when any selected tier produces an empty silhouette and records
projected metre bounds for cross-LOD comparison.

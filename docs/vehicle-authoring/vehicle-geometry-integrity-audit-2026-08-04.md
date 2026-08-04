# Vehicle geometry integrity audit - 2026-08-04

## Scope and result

This audit and first repair slice cover all 15 production France 1940 vehicle
mesh factories at the `high`, `medium`, `core`, and `proxy` LODs, from fixed
front, side, and top views. It looks specifically for visually detached parts
and faces that can disappear under Three.js front-face culling.

The initial audit confirmed the concern. Thirteen of the 15 vehicles produced
at least one disconnected silhouette island in one or more audited views.
Panhard 178 and Panzer II remained connected in the CPU silhouette views, but
the Panhard APX 3 turret had locally inconsistent cap winding and the Panzer II
has an exposed open-edge mantlet. A follow-up directed-edge audit, prompted by
live visual feedback, identified the Hotchkiss H39 as the worst invisible-face
case. The Renault D2 was the worst disconnected-part case before the screenshot
follow-up joined its turret race and track shoulders.

The first repair slice corrects every locally inconsistent closed-loft winding
case found by the audit and seats the reported floating S35 rear engine deck.
It deliberately leaves historically ambiguous detached parts for measured
vehicle-specific follow-up. The reviewed silhouette baseline was not changed.

## Method

1. Enumerated the production registry in
   `src/content/france1940/render/vehicleMeshFactories.js`.
2. Instantiated every factory and forced each of the four production LODs.
3. Generated 180 deterministic CPU silhouette views (15 vehicles x 4 LODs x
   3 views) with the existing calibration projection.
4. Rasterized each silhouette at 600 x 400 and ran 8-neighbour connected-
   component analysis. This catches view-dependent gaps that a 3D AABB test
   misses.
5. Audited every visible `BufferGeometry` after vertex welding for non-finite
   values, invalid indices, degenerate or duplicate triangles, non-manifold
   edges, open boundary edges, whole-component signed volume, directed shared-
   edge orientation, and negative world transforms. Directed edges are
   essential: a mesh can have positive total volume while individual cap faces
   are wound backward.
6. Measured each visible rigid part against its nearest visible part with a
   conservative 0.075 m AABB-gap threshold, then traced findings to their
   authoring source using Panoptes and exact source ranges.

Transient sheets and machine output were written under
`$TMPDIR/vehicle-audit-sheets/` and `$TMPDIR/vehicle-projected-connectivity/`;
they are diagnostic artifacts, not reviewed source evidence.

## Roster results

LOD abbreviations are H = high, M = medium, C = core, and P = proxy. A
"silhouette island" means visible geometry is separated in that fixed view; it
does not by itself prove the part is historically misplaced. Wheels and track
links are still listed when the model omits the mechanical support that would
keep them from reading as floating.

| Vehicle | Detached or floating evidence | Front-face/open-edge evidence | Priority |
| --- | --- | --- | --- |
| AMC 35 | H side: `DriverVisor` is 0.176 m from its nearest rendered part; H/M/C side: small running-gear islands | Closed and outward-wound | P1 |
| Char B1 bis | H/M/C/P front and side: cupola/hatch assembly is visibly separated from the turret | Closed and outward-wound | P0 |
| Hotchkiss H39 | Repaired cast-hull belly: H/M/C/P now descend to the photo-constrained road-wheel-axis datum instead of floating at the upper track run; individual lower links remain intentionally separated by the open running-gear silhouette | Repaired: the 112 detailed/proxy hull, turret, and track-guard cap conflicts are now zero | Fixed hull seating; remaining track migration is P1 |
| Laffly S20TL | H/M/C/P front: two wheel assemblies are separate from the body; every side LOD has detached front/belly rollers; core/proxy roller gaps reach 0.21 m | Six half-torus fenders have 12 uncapped boundary edges each while using `FrontSide` | P0 |
| Panhard 178 | No disconnected front/side/top silhouette at any LOD; no >0.075 m rigid-part gap | Repaired: detailed and proxy APX 3 cap conflicts are now zero | Fixed in first slice |
| Renault D2 | Repaired: a closed installation-owned race fills the 55 mm deck-to-turret interval, while source-profiled hull shoulders now reach both inner track edges in H/M/C/P; the narrow lower center hull remains intentionally open between the tracks as shown by the registered front/rear elevations | Closed and outward-wound; new detailed/proxy race collars are included in the closed-part contract | Fixed major islands; high antenna/detail review remains P1 |
| Renault R35 | H/M/C side: small ground-level running-gear islands; P side: proxy gun is separated from the turret | `R35_APXR_Cupola` and `R35_ProxyAPXRRoofBoss` have open bottoms, but both are seated into other geometry; inspect seams while fixing the proxy gun | P1 |
| SOMUA S35 | Repaired: rear engine-deck lower edges follow the cast-hull roof within 0.015 m; lowered core/proxy mantlets now seat the main barrel at every LOD, and the high-detail MAC 31 overlaps the mantlet face | Turret dome has an open bottom but is seated into the turret shell; corrected mantlet collision and rendered envelopes share one installation record | Fixed reported deck and gun installation; dome seam remains P1 review |
| Opel Blitz | H/M/C/P side and top: front and rear bumpers are separate islands; measured bumper gaps are 0.19-0.28 m | Four half-torus fenders have 14 uncapped boundary edges each while using `FrontSide` | P0 |
| Panzer II C | No disconnected front/side/top silhouette at any LOD | `PanzerIIC_RoundedMantlet` is an uncapped partial sphere with 24 boundary edges; this can expose a culled interior at oblique views | P1 |
| Panzer III D | M/C/P front: outer fender/guard islands; C side: main barrel is separated by 0.10 m; H side: small detached detail | Cupola is intentionally open-ended and covered by articulated half hatches, but the cupola and both hatch leaves (including proxy clones) retain open boundaries that need seam/culling review | P0 |
| Panzer 35(t) | H/P front: commander hatch/roof plate is separated; C side: main barrel is separated; H side adds tiny detached details | Closed and outward-wound | P1 |
| Panzer 38(t) | H side: detached coax/detail; C/P side: main barrel is separated; P front: two fender/guard islands | Repaired: all 104 detailed/proxy hull, upper-hull, and turret cap conflicts are now zero | P0 remaining islands |
| Panzer IV D | H side: both headlamps are unsupported; each has a measured 0.085 m gap, plus one tiny detached detail | Closed and outward-wound | P1 |
| Sd.Kfz. 231 6-Rad | P side: proxy gun barrel is separated from its turret | Repaired: detailed/proxy turret cap conflicts are now zero | P1 remaining gun |

## Geometry integrity totals

- No non-finite vertices.
- No invalid triangle indices.
- No degenerate triangles at the audit epsilon.
- No duplicate triangles.
- No non-manifold edges.
- No whole closed component with negative signed volume. This does not imply
  locally consistent winding.
- No negative-determinant transforms or runtime mirroring.
- The initial audit found 280 shared edges used in the same direction by both
  adjacent triangles across 16 closed custom-loft meshes in four vehicles.
  These were local winding errors even though each mesh's total signed volume
  was positive:
  - Hotchkiss H39: 112 conflicts across detailed/proxy hulls and turrets plus
    both track guards.
  - Panzer 38(t): 104 conflicts across detailed/proxy lower hulls, upper hulls,
    and turrets.
  - Panhard 178: 32 conflicts across detailed/proxy APX 3 turrets.
  - Sd.Kfz. 231: 32 conflicts across detailed/proxy turrets.
- Twenty distinct open `FrontSide` meshes across six vehicles:
  - Laffly: six fenders.
  - Opel Blitz: four fenders.
  - Renault R35: detailed cupola and proxy roof boss.
  - SOMUA S35: turret dome.
  - Panzer II: rounded mantlet.
  - Panzer III: detailed/proxy cupola and left/right hatch leaves.

After the first repair slice, the same directed-edge audit completes all 15
factories with zero same-direction conflicts on H39, Panhard 178, Panzer 38(t),
and Sd.Kfz. 231. The 20 intentionally or accidentally open `FrontSide` meshes
remain queued because cap winding and open-boundary policy are separate issues.

The open-mesh count deliberately includes composite pieces whose open bottom
is buried in another mesh. Those are culling/seam review items, not automatic
proof of a visible hole. The exposed ends of the Laffly and Opel fenders and
the Panzer II partial-sphere mantlet are direct repair candidates.

## Highest-value repair order

Completed first: H39, Panhard 178, Panzer 38(t), and Sd.Kfz. 231 closed-loft
cap winding; S35 rear engine-deck seating; H39 lower cast-hull seating against
the road-wheel axis from official museum survivor-photo evidence; D2 turret-race
and source-profiled track-shoulder continuity.

1. Laffly S20TL and Opel Blitz: add modeled supports where required, cap fender
   ends with outward winding, and join or bracket the bumpers/rollers without
   changing their exact envelopes.
2. Char B1 bis: seat the detailed and proxy cupola/hatch stack on the APX 4
   turret roof.
3. Panzer III, Panzer 38(t), and Sd.Kfz. 231: reconnect remaining gun/fender
   islands and validate the Panzer III cupola/hatches both closed and open.
4. R35, Panzer 35(t), AMC 35, Panzer IV, and H39 running gear: repair the named
   isolated weapons, visor, lamps, hatches, and unsupported running-gear
   islands, then inspect oblique views.
5. Panzer II: cap or replace the rounded mantlet while preserving its authored
   profile.

Each repair should be made in the owning vehicle module or vehicle-owned visual
data, not in `VehicleModelEnhancer`. Acceptance requires front/side/top review
at all four LODs plus an oblique backface-culling view; a new silhouette hash
alone is not acceptance.

## Existing baseline drift found during the audit

`npm run audit:silhouettes` generated all 180 records but currently exits 1
because the reviewed baseline has unaccepted drift for Char B1 bis high,
multiple Panzer III LODs, and broad Panzer IV changes. The Panzer IV core rigid
height is especially different (2.595 m current versus 2.305 m baseline).
These differences were not accepted or written into the baseline during this
audit. They must be reviewed separately from the floating/open-face repairs.

Focused validation after the first repair slice:

- `$TMPDIR/vehicle-edge-orientation-audit.mjs`: completed all 15 factories;
  every repaired closed loft now has zero same-direction conflicts.
- `npm run test:file -- test/hotchkiss-h39-blueprint.test.js
  test/panhard-178-blueprint.test.js test/somua-s35-blueprint.test.js
  test/panzer38t-blueprint.test.js test/sdkfz231-blueprint.test.js`: 24 passed.
- `npm run test:file -- test/renderer-backend.test.js`: 6 passed, including the
  missing/native `GPUShaderStage` bootstrap behavior.
- `npm test`: all 6 capped core files passed, 75 tests total.
- `npm run build`: passed after transforming 818 modules. It retains the known
  chunk-size warning plus existing `densityFog`, `rangeFog`, and `screen` export
  warnings from Three's bundled TSL compatibility entry.
- `git diff --check`: passed after the final edits.
- `npm run audit:silhouettes`: generated all 180 records. Expected hashes changed
  for repaired face ordering and S35 deck placement; the older Char B1 bis,
  Panzer III, and Panzer IV unaccepted drift remains. The baseline was preserved.
- Firefox BiDi reached the real sandbox bootstrap and cleared the
  `GPUShaderStage` module error, then reported the current headless-host blocker:
  `http://127.0.0.1:5174/?mode=sandbox`, `data-game-status="error"`, no active
  backend, and no WebGL context (`this.gl is null`). Chromium's GPU process also
  crashes on this Termux host, so live backface-culling acceptance remains
  blocked by the environment rather than reported as a pass.

## Validation boundary

The CPU silhouette renderer intentionally unions all submitted triangles and
does not emulate Three.js depth testing or material-side culling. Therefore:

- disconnected islands are strong evidence of a visible gap;
- topology and winding results are strong evidence about mesh integrity;
- seated open bottoms require an oblique live-render check before being called
  a visible defect;
- the report does not claim historical placement correctness.

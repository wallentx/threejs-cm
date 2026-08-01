# TODO

Rolling development checklist for the Combat Mission-style prototype.
Update this file whenever scope changes and whenever an item is completed or dropped.

Status:

- `[ ]` planned
- `[x]` completed
- `~~strikethrough~~` intentionally dropped

## Work queue and routing

This short queue controls dispatch; the detailed checkboxes below remain the
authoritative scope and completion record.

### Bugfixes

- **FIX NOW / P0 — completed:** restore visible procedural battlefield VFX; see
  the validated WebGPU-migration slice below.
- **FIX NOW / P0 — partial:** retain an engaged enemy as a decaying gray
  last-known world contact after direct LOS is lost. The frozen, non-targetable
  3D projection is implemented and independently approved; deterministic
  negative observation of an empty reported area remains queued below.
- **QUEUED / P1:** allow every living member of an ordered infantry unit onto
  the requested building floor while retaining finite individual window
  positions; see the unchecked building-capacity slice below.
- **FIX NOW / P1 — completed:** show the transparent building/interior
  presentation only while an occupying friendly unit is selected, preserve
  that projection through high/medium/core/proxy LOD and rollback, and remove
  each section's opaque window cards on collapse so no black apertures float
  over rubble.
- **NEEDS REPRODUCTION / P1:** unexpected enemy blinking while current LOS is
  valid, unexplained vehicle immobilization, and infantry waypoint/path
  divergence must each receive a current bounded reproduction before
  implementation is dispatched.
- **QUEUED / P0:** reject or constrain battle-setup rosters whose expanded
  living infantry count exceeds the authoritative 256-candidate separation
  limit; the accepted 78-formation / 354-soldier maximum currently enters an
  error state on the first realtime step at candidate 257.
- **QUEUED / P1:** eliminate the native-WebGPU startup console error
  `Cannot read properties of null (reading 'getCanvasTarget')`; an experimental
  Vulkan Chrome profile remains ready on WebGPU after the error, but a clean
  initialization is required before hardware validation is complete.
- **FIX NOW / P1 — active follow-up:** retain the completed photo-backed Char
  B1 bis correction and finish exact multiview source registration from a
  locally held, non-redistributed drawing; see the remaining slice below.

### New features

- **QUEUED / P1:** pre-match mixed movement and building-entry route planning.
- **QUEUED / P1:** give the Char B1 bis distinct turret- and hull-weapon target
  controls, ammunition ownership, and automatic hull-group fire selection; see
  the unchecked Char B1 multi-mount slice below.
- **QUEUED / P1:** concealment-aware infantry route choice and broader tactical
  AI beyond the completed bounded movement slices.
- Remaining feature work is selected explicitly before it is packetized; one
  worker receives one cohesive vertical slice at a time.

### Optimizations

- **FIX NOW / P0 — completed bounded block:** the building-run broadphase cut
  exact building OBB work per LOS by 99.61%, the direct-precision index cut its
  profiled inclusive cost from 1,699.502 ms to 7.683 ms, the revisioned terrain
  run index avoided 50,927 exact box tests in one live canonical step, and
  deterministic attention scheduling evaluated 1,689 of 8,400 cold candidates
  (-79.9%) while active contacts retain 10 Hz service. A valid post-change FPS
  sample remains part of the representative-hardware capture below.
- **FIX NOW / P1 — completed bounded block:** squad-local infantry resource
  pooling cut exact-force geometries 51.1% and materials 97.4%; far-proxy
  instancing cut proxy drawables from 1,178 to 242 (-79.5%); and explicit
  medium/core shadow ownership cut configured casters from 13,102 to 4,534
  (-65.4%) without changing individual soldier, weapon, pose, hit-volume,
  casualty, selection, or high-detail ownership.
- **QUEUED / P2:** finish representative native-WebGPU/WebGL performance at
  near, design, and far cameras plus mobile hardware; the measured desktop
  design and WebGL near/far slices are recorded below.
- Optimization packets require a measured baseline and a measured after-state;
  they do not preempt reproduced playability regressions.

Vehicle authoring, refits, physics, crew, and vehicle-specific damage remain
paused for Codex and reserved for the Antigravity handoff unless the user marks
a specific vehicle packet **FIX NOW**. Cross-cutting regressions such as the
shared VFX compiler failure may be fixed independently when explicitly
authorized.

## Current priorities

- [ ] Complete the Three.js r185 WebGPU renderer migration.
  - [x] Upgrade Three.js from r160 to r185; make `WebGPURenderer` primary with its direct WebGL 2 fallback; use explicit asynchronous initialization and pipeline warmup; replace deprecated `Clock` use with the visibility-aware `Timer`; retain opaque-background alpha behavior; and expose the active backend and current-frame diagnostics.
  - [x] Harden fallback reconstruction so shadow settings and device-loss reporting survive renderer replacement, failed WebGL initialization propagates, and native WebGPU reaches the live ready state.
  - [ ] Validate native WebGPU on representative desktop and mobile hardware, then establish WebGPU post-processing conventions; the bounded VFX slice now establishes TSL/node-material-only custom-effect ownership, but hardware validation remains.
  - [ ] Remove the native-WebGPU startup `null.getCanvasTarget` console error reproduced on Chrome 152 with an AMD RDNA2 adapter; retain ready-state and direct WebGL2 fallback behavior, and add a behavioral initialization regression before claiming a clean backend launch.
- [ ] Complete measured runtime optimization on representative desktop and mobile hardware.
  - [x] First bounded render/main-thread pass: reduce default high-tier pixel work from a 2.0 to 1.5 device-pixel-ratio cap, reduce its directional shadow map from 2048 to 1024, retain the previous settings as explicit `quality=ultra`, limit shadow casters to authored core/proxy silhouettes, exclude blended/UI meshes, replace visibility projection's nested target/observer/unit scan with indexed observation traversal, cache projection between authoritative spotting steps, and bound floating badges to 30 Hz and the minimap to 10 Hz.
  - [x] Realtime/VFX pass: sample authoritative observation at a rollback-owned deterministic 10 Hz, avoid rebuilding unchanged building LOS colliders, and replace CPU-stacked vehicle fire/smoke plus pooled impact/explosion/muzzle-flash meshes with bounded WebGPU TSL sprite effects while preserving simulation-owned hits, damage, and muzzle origins.
    - [x] Correct TSL explosion sprite presentation after the geometry-to-sprite migration: preserve metre-scale blast visibility and lift the centered sprite above its authoritative ground-impact position instead of leaving a sub-metre, terrain-occluded flash.
    - [x] Repair the r185 invisible-VFX regression: resolve renderer, node-material, and TSL imports to one Three.js singleton; replace non-finite JavaScript shader-node subtraction with TSL arithmetic; reject divergent Vite identities and non-finite VFX graphs; and confirm a live WebGL2-fallback explosion renders visible pixels without TSL, shader, or page errors.
  - [x] Add an on-demand top-bar profiling panel with rolling FPS, average/p95 frame time, renderer backend, draw calls, submitted triangles, geometry/texture counts, and active LOD counts; add independent FOV, infantry/vehicle hit-volume, vehicle-component, vehicle-crew, and formation-AI overlays that project the live authoritative mechanisms and dispose their GPU resources.
  - [ ] Capture native WebGPU/WebGL fallback frame time, draw calls, submitted triangles, active shadow casters, GPU memory, and long tasks at near/design/far cameras on representative hardware; desktop design and WebGL near/far slices are complete, while native-WebGPU near/far and mobile remain.
    - [x] Desktop laptop slice: connect the real Three.js DevTools bridge at 1920x1080; confirm the default 16-unit design/high battle holds 60 FPS on both WebGL2 fallback and experimental native WebGPU; reproduce the valid 56-unit / 252-soldier scene at 17.4 FPS paused and 1.7 FPS realtime on WebGL2 versus 1.6 FPS realtime on WebGPU; show that far LOD removes 84% of draws and 92% of triangles for only an 11% realtime improvement; reject badges as the dominant cause; attribute 55.3% CPU self time to oriented-box LOS/spotting/precision targeting; and record 35.1 MB estimated GPU resources, five potentially orphaned textures, no device loss, high host memory pressure, and the exact temporary Vulkan/WebGPU launch profile. Native near/far and mobile captures remain.
  - [ ] Make high-unit spotting and precision targeting scale without changing deterministic observation outcomes: reject out-of-range targets before LOS, spatially prefilter building/terrain occluders, avoid repeated equivalent oriented-box traversal, preserve the authoritative 10 Hz cadence, and prove identical contacts plus capture/restore and frame-partition results before accepting measured performance gains.
    - [x] First output-neutral slice: compute the exact lifted observer-eye/target-aim distance before LOS, skip LOS only when it is strictly beyond the current capability/target range, preserve the exact-range boundary and target-person ordering, and validate zero unnecessary out-of-range calls with 55/55 focused tests, 129/129 full test files, a clean build, and independent approval.
    - [x] Add a conservative building world-AABB broadphase before exact oriented-box LOS while preserving stable collider order and dirty/restore rebuild behavior; on the identical 56-unit / 252-soldier native-WebGPU battle it rejected 97.2511% of building runs, reduced exact OBB work per LOS from 52.997 to 0.206962 (-99.61%), improved FPS from 0.6923 to 1.0000 (+44.44%), and reduced average frame time from 1,444.38 ms to 999.97 ms (-30.77%) after independent approval.
    - [x] Replace repeated full observation-map precision checks with an uncaptured raw-ID observer-unit/target-unit index rebuilt only after authoritative spotting advance and restore; preserve direct `visibleNow` eligibility, sampled casualty/split lifecycle, v1-v5 restore, frame-partition and reordered-input equivalence, and reduce the identical stress profile from 1,699.502 ms to 7.683 ms inclusive after independent approval.
    - [x] Define an immutable revisioned terrain sight-occluder snapshot, group its 25 scenario obstacles into five stable authored runs, conservatively reject non-intersecting runs before exact insertion-ordered box tests, preserve mutable legacy fallback behavior, and expose uncaptured diagnostics; one native-WebGPU canonical step rejected 10,144 of 10,436 run tests and avoided 50,927 exact box tests.
    - [x] Add deterministic attention scheduling after output-neutral broadphases are measured: keep firing, moving, close, partially acquired, and active contacts at 10 Hz; phase distant stationary cold candidates across stable-ID ticks with 0-0.4 second initial latency and no retroactive acquisition credit; preserve rollback and reordered-input equivalence; and use a capture/restored recent-fire timer set only by emitted projectiles so the real infantry, vehicle, and structure execution paths remain urgent. The exact native-WebGPU step evaluated 1,689 of 8,400 eligible cold pairs (-79.9%).
  - [ ] Reduce infantry draw, geometry, material, and shadow submissions across LODs without losing individual soldier, weapon, pose, hit-volume, casualty, or selection ownership; measure paused 252-soldier design/high performance before and after.
    - [x] Pool infantry geometry and materials within each squad without changing the 28,536 individual mesh nodes, articulation, or disposal owner; exact-force geometry references fell from 11,372 to 5,558 (-51.1%) and material references from 28,536 to 748 (-97.4%).
    - [x] Instance only the far-proxy presentation per squad while retaining every individual soldier hierarchy and renderer source; exact-force proxy drawables fell from 1,178 to 242 (-79.5%) with high/medium/core output and zero proxy-shadow policy unchanged.
    - [x] Limit medium/core shadow ownership to existing identity-defining silhouette meshes while preserving all visible geometry and high/proxy policies; exact-force configured casters fell from 13,102 to 4,534 (-65.4%).
    - [ ] Capture a valid post-change native-WebGPU frame distribution and near/design shadow-silhouette comparison; renderer counters and ready/backend state are recorded, but the available `requestAnimationFrame` sample did not produce valid timing evidence.
  - [ ] Determine whether the five textures reported as potentially orphaned after repeated battle reloads are retained leaks or DevTools false positives; prove bounded renderer memory across repeated setup -> battle -> setup cycles.
  - [ ] Validate battle setup against expanded individual rosters before launch: either cap accepted formations so living infantry never exceeds the deterministic 256-candidate separation limit or replace that bounded algorithm with a proven scalable equivalent; never allow the current accepted 354-soldier setup to fail only after realtime begins.
  - [ ] Reduce vehicle submission overhead without breaking articulation or damage ownership; the 15 factories currently contain 1,485 mesh objects and can expose 1,313 visible high-tier meshes before the shadow pass.
  - [ ] Batch static terrain presentation where identity permits.
    - [x] Add a terrain-conforming, alpha-tested, non-blended fence-card profile with aligned front, back, top, and end faces; use it for the five scenario-authored farmhouse enclosure runs; retain authoritative oriented movement collision without making the cutout fence an opaque LOS blocker; preserve the village masonry profile; and reduce those boundaries from 51 submitted masonry meshes to 25 masonry plus 5 fence-card meshes.
    - [x] Give each fence panel independent health, collision, collapsed presentation, deterministic capture/restore, vehicle mass/speed/momentum crushing, and radius-falloff explosive damage while retaining one submitted mesh per authored run.
    - [x] Let individual infantry vault fence colliders only during QUICK or FAST orders, with rollback-owned vault progress and state-driven presentation.
    - [ ] Batch remaining compatible static terrain meshes by material and LOD without merging collision, navigation, or destructible identity.
- [ ] Complete engine, game-family, map, scenario, and asset-layer separation.
  - [x] Define ownership and one-way import rules in `docs/ARCHITECTURE.md` and `AGENTS.md`.
  - [x] Add a pre-battle startup wizard for the current `Bridge` map: select France or Germany for both sides, choose a gameplay-scale formation package or an independently counted a-la-carte force, apply Regular-current or alternate enemy experience/leadership difficulty, deterministically deploy complete forces inside their faction zones facing each other, and construct `GameApp` only after Start Battle.
    - [x] Restore explicit French and German platoon HQ choices to a-la-carte selection and every predefined force package, including binocular-equipped leaders and rollback-safe radio-operator command-net endpoints.
    - [x] Keep the initial Create Battle header nation-neutral and remove the redundant numbered step bubbles; show the actual selected matchup only in the final force review.
  - [x] Add a separately selectable `Stonne` map from the supplied aerial reference: rolling 300 m terrain, north-south and eastern crossroads, five reused enterable rural structures, orchard fencing, crop/pasture/woodland surface composition, 152 deterministic trees rendered in four instanced submissions, opposing setup bands, and no invented river or bridge.
    - [x] Reduce shared mature-tree crown geometry from detail-1 to detail-0 icosahedra and trunk radial segments from eight to six while preserving the same instanced placements and tree dimensions.
  - [ ] Replace Stonne's screenshot-registered approximation with georeferenced contours, road widths and grades, field/wood boundaries, exact building footprints, and source-backed 1940 terrain evidence; connect woodland and crop records to authoritative concealment, movement cost, and vehicle-access policy instead of leaving foliage presentation-only.
  - [ ] Expand battle setup beyond the first slice with additional registered maps and game families, saved force presets, historically sourced formation hierarchies, scenario budgets/availability rules, objectives/weather, and AI policies beyond existing experience and leadership soft factors.
  - [x] Extract the Stonne roster, placements, setup zones, seed, initial selection, and camera target into a plain-data scenario descriptor.
  - [x] Add generic scenario instantiation and deployment-footprint validation under `src/scenario/`.
  - [x] Inject setup-zone records into `TerrainBuilder` instead of importing scenario state from the world layer.
  - [x] Document current infantry, vehicle-state, ballistics, rendering, VFX, and HUD seams in `docs/ARCHITECTURE.md`.
  - [x] Extract France 1940 weapon, vehicle, formation, faction, and presentation data behind a family registry.
    - [x] Registry foundation: add an injected validated family registry; extract frozen faction, vehicle-ownership, infantry-formation, and presentation records; preserve stable formation-member IDs through equipment, radio, simulation, and rollback state; resolve Stonne formations and vehicle IDs before live `Unit` construction; and migrate direct `Unit` construction away from staged family compatibility adapters.
    - [x] Weapon-ownership slice: move all 26 canonical weapon records, defaults, aliases, and provenance under France 1940 content; expose one frozen catalog through the family registry; retain `game/WeaponCatalog.js` as a strict-identity compatibility re-export.
    - [x] Move vehicle definitions, provenance helpers, armor/internal-layout data, and visual-factory registrations under `src/content/france1940/`; retain narrow legacy re-export shims until consumers migrate.
      - [x] Simulation-data slice: move the single frozen 14-vehicle catalog, provenance helpers, armor shape, and all internal layouts under France 1940 content; move generic armor math under simulation; retain strict-identity `VehicleCatalog` and SOMUA shape compatibility re-exports.
      - [x] Move the complete 14-model visual-factory registration into `content/france1940/render/`; inject it through scenario construction, direct calibration tools, and silhouette scripts; and migrate remaining direct `Unit` callers through explicit family-aware construction.
  - [x] Extract Stonne terrain coordinates, surfaces, structures, foliage, and obstacles into a map descriptor; validate and deeply freeze the plain map record; inject it into scenario loading, deployment, terrain rendering, collision, navigation, and structure visual adapters.
  - [ ] Inject family catalogs and visual factories into generic unit, ballistics, UI, and world systems.
  - [x] Inject the selected family registry into scenario loading and validate faction, formation, weapon, and vehicle ownership before construction.
  - [x] Inject matching family vehicle visual factories from composition through `ScenarioRuntime` and `Unit` into generic `UnitFactory`; reject family mismatches and missing scenario vehicle renderers before constructing any units.
  - [x] Inject strict-identity family catalog ports through scenario construction; migrate `Unit`, `SoldierAgent`, `VehicleSystems`, `CombatSystem`, `UIManager`, and composition off direct legacy weapon/vehicle catalog imports; resolve restored projectiles through their attacker's family port; and reject forged lookup results before constructing units.
  - [x] Move canonical France 1940 structure data behind an injected strict-identity structure port; retain `StructureCatalog` as a compatibility re-export; and remove generic `Unit`'s direct structure-catalog import.
  - [ ] Move remaining France-specific procedural visual profiles/factories out of generic world paths and inject remaining family presentation dependencies.
    - [x] Move France 1940 infantry-body and bunker mesh construction behind family-owned infantry/structure factory registries; inject exact faction presentation records into `Unit`; make generic `UnitFactory` dispatch-only apart from its family-colored vehicle selection disc; reject forged presentation and missing infantry, vehicle, or structure renderers before constructing units.
    - [x] Move MAS 36, FM 24/29, MAS 38, Kar98k, MG 34, and MP 40 visual contracts, geometry, grip markers, and muzzle markers out of generic `world/infantry` exports into the France 1940 render package; retain only family-neutral pose animation in the generic infantry path.
    - [x] Remove the direct-`Unit` France 1940 visual/catalog adapters: require stable IDs, factions, types, resolved infantry rosters, catalog ports, and visual factories; inject those dependencies through scenario and split-unit construction; and keep family defaults confined to a test-only helper.
    - [ ] Move vehicle geometry/profiles from their remaining generic world paths.
  - [ ] Add logical asset manifests and replaceable family asset packs.
    - [x] Foundation slice: add renderer-neutral deeply frozen manifest records, runtime-provider binding, explicit ordered pack replacement, family/dependency/kind validation, and a France 1940 core pack; bind the stable vehicle-surface asset through composition to all 15 vehicle factories and prove a replacement pack reaches a live model.
    - [x] Add stable logical records and validated replaceable runtime providers for both France 1940 infantry models and the MG 34 bunker; bind source-pack and implementation identity onto live meshes; reject mismatched generators and invalid renderer results.
      - [x] Enhance France 1940 French Chasseurs and German Grenadiers with custom sculpted character geometries (chest/waist torso loft, bicep/forearm arms, quadricep/calf legs, contoured military boots with instep/heel/toe caps), smooth 3D character head loft (jawline, nose bridge, brow, ears, crown, zero floating eyeballs/mouth cutouts, texture-ready), single organic cupped character hands (curved palm, thumb ridge, cupped fingers, sleeve cuffs, exact IK wrist alignment), continuous M1926 Adrian helmet dome with integrated visor/neck-guard (zero gap), contoured M1926 comb crest arch and emblem badge, M35 Stahlhelm dome with flared skirt & lugs (zero gap), French M1935 capote folded coat-tails, German M35 Feldbluse cargo pockets, leather Y-straps with metal D-rings, belt buckles, ANP 31 gas mask bag / German corrugated gas mask canister with ribbed bands, canteen caps & straps, mess tins, blanket rolls with leather straps, and wool puttees/jackboots with soles.
    - [x] Move ground, river, bridge-road, masonry, and foliage material ownership behind one replaceable France 1940 terrain-surface provider; inject it through `GameApp`; keep generic terrain geometry/collision map-driven; bind live source identity; and validate idempotent material disposal.
    - [ ] Add logical records and replaceable providers for VFX, audio, calibration references, and future external model/texture files; add external load/dispose lifecycle and missing-asset fallback policy.
      - [x] Calibration-reference slice: move the SOMUA side-sheet URL behind a stable family asset ID; resolve it through a replaceable pack-owned registry; inject that registry into the jig; and remove the hardcoded model/path fallback from generic calibration code.
      - [x] Battlefield-VFX slice: move projectile/tracer meshes, pooled impacts and explosions, vehicle smoke/fire/sparks/scorch/blasts, capacity/style records, and GPU-resource disposal behind one replaceable family provider; inject it into combat and damage presentation without moving hit or damage authority.
      - [x] Add bounded TSL/node-material sprite fire, smoke, impact, explosion, and modeled-muzzle flash presentation with stepped high-frame-rate animation and no `ShaderMaterial`, `RawShaderMaterial`, or `onBeforeCompile` fallback.
      - [ ] Add audio providers plus external model/texture loading, disposal, and missing-asset fallback policy.
        - [x] Battlefield-audio slice: replace generic `garand`/`mg42` labels and hardcoded synthesis with a logical France 1940 audio provider; resolve rifle, machine-gun, submachine-gun, light-cannon, medium-cannon, explosion, and UI events from actual weapon class/caliber; inject the provider into `SoundEngine`; preserve bounded voices and cached deterministic noise; bind source-pack identity; and dispose provider, WebAudio graph, buffers, and context on page exit.
        - [x] External-image lifecycle slice: route logical calibration-reference URLs through a generic deduplicating image service; retain logical/source-pack identity; reject unsafe URL schemes; support explicit throw, unavailable, and fallback-URL policies; permit retry after failure; cancel pending loads; release cached images; revoke owned blob URLs; and dispose the calibration runtime on page exit.
        - [ ] Add external model/texture/audio loading, ownership-aware disposal, and equivalent explicit missing-asset fallback policies.
          - [x] External-texture service foundation: wrap each deduplicated image resource in one injected disposable texture; retain URL, fallback, logical, and source-pack identity; bound cached ownership; release image handles; and cancel pending work on shutdown. Live family texture/model/audio binding remains.
          - [x] External-audio service foundation: fetch and asynchronously decode validated external audio into bounded deduplicated resources with explicit throw, unavailable, and fallback-URL policy; enforce identity-safe cache keys and true LRU ownership; abort pending fetches; and release decoded buffers on eviction, resource disposal, and shutdown. Live family audio/model binding remains.
          - [x] External-model service foundation: add a format-neutral injected fetch, source-release, parse, clone, instance-dispose, template-dispose pipeline; retain strict request identity and explicit fallback policy; bound template ownership with clone leases and deferred LRU disposal; aggregate cleanup failures; and cancel late work on shutdown. Concrete family model records, format adapters, and live unit/structure binding remain.
- [ ] Move browser lifecycle and simulation orchestration from `main.js` into a narrow application/runtime facade.
  - [x] Extract browser startup, renderer/system construction, scenario loading, fixed-step orchestration, rollback hooks, interaction, and diagnostics into injected `GameApp`; keep `main.js` composition-only; remove concrete faction, weapon, and mesh-name assumptions from the facade; and isolate deterministic faction scheduling in a browser-free tested index.
  - [x] Replace full-`GameApp` UI/editor access with frozen explicit query, command, and building-event ports; route selected-unit actions through named commands; inject family presentation and map dimensions into the HUD/minimap; and restrict editor world mutation to an explicit authoring port.
  - [ ] Refresh a single Three.js devtools proxy tab and confirm the extracted runtime reaches `data-game-status="ready"`; automated tests and production build pass, but the current MCP bridge has no connected browser tab.
- [ ] Replace spherical vehicle hit volumes with mesh-accurate armor plates and named collision zones.
  - [x] First deterministic slice: replace vehicle spheres with swept, model-local named hull/turret/cab/cargo volumes; rotate turret plates with turret yaw; expose stable plate/volume IDs, exact impact normals, local impact points, top/bottom zones, and explicit thickness fallbacks across all 15 vehicles.
  - [x] SOMUA vertical slice: share renderer/collision hull and turret station contours; resolve swept triangle plates with exact slopes; add mantlet, cupola, and left/right track zones; route track penetrations to the track component; label each thickness source and approximation.
  - [ ] Replace approximate OBB faces for the remaining 13 vehicles with vehicle-specific sloped convex plates derived from their authored hull/turret station tables; add missing wheel, deck, roof, belly, and internal zones with historical thickness provenance.
- [x] Replace stance-blind infantry torso spheres with named stance- and facing-aware compound swept hit volumes; aim at the same torso authority and expose resolved hit-volume telemetry.
- [ ] Add a shot-inspection debug view: trajectory, impact angle, velocity, armor thickness, penetration, and damage result.
  - [x] Rough pass: detailed inspectable impact telemetry fields (shooter, target, range, speed, angle, armor, penetration, crew result) and data-ballistics-stats DOM dataset.
  - [x] Add stable armor plate/volume identity, model-local impact position, world impact normal, and the exact armor-thickness source zone to impact telemetry.
  - [x] Distinguish stopped, penetrating, and continuing ricochet outcomes; show rebound speed, retained energy, angle, reason, and deflection count in the latest-shot inspector.
  - [x] Record bounded rollback-safe flight paths and add selectable reusable 3D trajectory, impact-normal, and rebound-vector overlays with a visible clear control and GPU-resource disposal tests.
  - [ ] Live-validate trajectory selection and clearing under native WebGPU after the devtools proxy is reduced to one active tab.
- [ ] Add ricochet continuation, projectile breakup, behind-armor spall, and residual penetration energy.
  - [x] Deterministic ricochet slice: continue oblique stopped cannon AP from the exact plate normal inside the remaining swept substep; apply explicit energy loss and a two-deflection limit; prevent immediate same-plate re-hits; preserve unique impact-event identity, telemetry, VFX scars, and WEGO capture/restore.
  - [x] Intact-perforator residual-energy slice: infer a labeled ballistic limit from the current penetration curve; conserve entry-plate energy; deplete finite energy through ordered crew/module volumes; require defeat of the true exit plate; continue the same projectile from the far armor face; preserve distance, identity, telemetry, and WEGO rollback; and permit deterministic follow-on hits.
  - [x] Harden residual continuation: consume rollback-safe in-vehicle transit time; conserve sub-threshold terminal energy; distinguish closed-shell exit armor from single-resistance track/mantlet envelopes; and terminate explosive ammunition before the intact-perforator path.
  - [ ] Replace the labeled generic ricochet approximation with projectile-and-plate-specific critical-angle and retained-energy data; add projectile breakup and behind-armor spall.
- [ ] Model internal vehicle modules: engine, transmission, fuel, ammunition racks, optics, radio, turret traverse, gun breech, and tracks.
  - [x] First authoritative pass: named component health, installed/operational state, deterministic zone-weighted damage, fire and ammunition-explosion events, degraded mobility/traverse/reload/fire behavior, and WEGO capture/restore.
  - [x] SOMUA vertical slice: add immutable model-local crew and module volumes; trace successful penetrations inward from the exact armor impact; order intersections by distance and stable ID; damage only intersected crew/components; expose the path in telemetry and the shot inspector; preserve deep WEGO capture/restore; and label compartment bounds as gameplay approximations.
  - [x] Panzer III Ausf. D vertical slice: separate its internal layout into a vehicle-owned data module; model the five crew positions, front transmission, rear engine/fuel, side ammunition racks, radio, hull/coax MGs, turret crew, breech, optics, and traverse; and validate front, side, rear, turret-yaw, and plate-to-path behavior.
  - [x] Renault R35 and Hotchkiss H39 vertical slice: add separate two-man internal-layout records with model-backed opposite-side driver positions, front drives, rear powerpacks, side ammunition stowage, one-man turret crew, breech, coax, optics, and traverse; validate front, side, rear, turret, and plate-to-path behavior.
  - [x] AMC 35 and Panhard 178 vertical slice: add independent blueprint-registered layouts for the AMC's right-side driver and two-man APX 2 turret and the Panhard's dual left-side drivers, radio, rear powerpack, and two-man APX 3 turret; validate crew ownership, installed components, ordered paths, and armor-entry integration.
  - [x] Laffly S20TL and Opel Blitz vertical slice: add independent unarmored-transport layouts with model-backed cab/bonnet stations, separate driver and vehicle-commander volumes, engine, transmission, and fuel; validate exact installed-component sets, ordered paths, and zero-armor penetration integration without inventing ammunition or weapon modules.
  - [x] Panzer II Ausf. C and Panzer 35(t) vertical slice: add independent early-light-tank layouts with distinct front- and rear-drive arrangements, model-backed bow crew and turret stations, radios, ammunition racks, fuel, powerpacks, breeches, optics, traverse, and exact installed MG modules; validate ordered crew/module paths and armor-entry integration.
  - [x] Panzer 38(t) and Sd.Kfz. 231 6-Rad vertical slice: add independent layouts for the tracked tank's front drive, right bow MG, and rear powerpack and the armored car's front engine, central transmission, dual drivers, rear radio station, and rear fighting compartment; validate exact crew/component ownership, ordered paths, and armor-entry integration.
  - [x] Char B1 bis and Panzer IV Ausf. D vertical slice: complete model-local layouts for all 15 catalog vehicles; distinguish the B1's rear drive, asymmetric hull crew and armament, one-man APX 4 turret, and supported component contract from the Panzer IV's front drive, separate bow crew, and three-man turret; validate exact crew/component ownership, ordered paths, and armor-entry integration.
  - [x] Apply deterministic residual-energy depletion to ordered internal crew/module paths, aggregate duplicate component volumes, stop downstream damage after exhaustion, and expose the complete entry-to-exit energy chain.
  - [x] Add a bounded direct-hit HE vehicle terminal slice: explicit armored-enclosed, unarmored-enclosed, and open protection classes; exterior plate/component damage; model-local radial crew/module candidates; distance falloff; stable deterministic intents; injected-RNG secondary effects; telemetry, HUD inspection, and rollback replay.
  - [ ] Add projectile breakup, behind-armor spall interaction, partition- and shielding-aware blast, fuze and fragment models, and component repair/abandonment rules.
- [ ] Add crew task reassignment, replacement-gunner delays, bailout decisions, and abandoned vehicles.
  - [x] Gameplay-approximation slice: add a catalog-driven Panzer III commander-to-main-gunner task transfer with a deterministic 12-second delay, main-gun lockout, stable crew-ID selection, and deep rollback coverage.
  - [x] First unbuttoned-commander slice: add a rollback-owned BUTTONED/UNBUTTONED posture and command action; expose the living role-owning commander through a swept model-local hit volume; let small arms wound or kill that crewman; auto-button after casualty, vehicle burning, destruction, or role loss; and render a family-owned commander torso, headgear approximation, and binocular pose above the hatch.
  - [ ] Replace the generic exposed-commander volume and fixed headgear meshes with vehicle-specific hatch datums, articulated open hatch geometry, source-calibrated French/German 1940 tanker headgear, and authored per-LOD crew figures.
    - [x] Panzer III/SOMUA standard slice: give the Panzer III Ausf. D a vehicle-owned turret-relative commander station, two-leaf opening cupola hatch retained through core/proxy LOD, and a 1940 black padded Panzer-beret figure; explicitly keep the French-service SOMUA S35 buttoned and replace its fictional top hatch with the original closed cupola roof.
    - [ ] Author source-registered hatch/exposure/headgear records and distinct crew LOD figures for remaining vehicles; replace generic derived volumes only after each represented variant's real opening policy is verified.
  - [ ] Render every real stable-ID vehicle crewman at an authored station, then add deterministic hatch-owned bailout, dismounted targetable survivors, abandonment, interruption, and deep replay.
- [ ] Add infantry transport embarkation, carried-passenger ownership, capacity, vehicle-relative presentation, casualties, disembarkation, and deep WEGO replay for real transport vehicles.
- [ ] Add weapon sighting, target acquisition, aim time, range estimation, and fire-control delays.
  - [x] Deterministic first slice: give every infantryman, vehicle main gun, and auxiliary mount persistent target, phase, aim-progress, required-time, estimated-range, and range-error state; derive aim work from weapon/platform, range, experience, stance, suppression, wounds, target motion, optics, traverse, crew availability, and measured shooter motion; reset on target change; retain tracking through automatic bursts and feeds; apply the estimate to physical holdover and dispersion; expose read-only HUD/telemetry state; and preserve deep WEGO capture/restore with frame-partition, target-switch, cadence, and rollback tests.
  - [x] Add a renderer-neutral individual marksmanship/optic foundation with stable soldier profiles, injected optic capabilities, neutral defaults, independent observation, aim-work, range-error, dispersion, concealment-signature, and shot-retention factors, explicit approximation labels, and order-independent resolution. France 1940 optic records, formation allocation, and live spotting/fire-control wiring remain.
  - [x] Aim direct vehicle fire at authored armor center mass or a stable living target soldier; add explicit AUTO, AP, HE, and MG target modes while preserving the already-loaded main-gun round and deterministically selecting the next reload type.
    - [x] Precision/retargeting correction: preserve a clicked vehicle surface point as a rollback-owned model-local aim intent that follows target translation/rotation; give the main gun and each auxiliary mount an independent stable living pixeltruppen target; shift only after that soldier becomes unavailable; and validate combined AUTO turret-HE plus machine-gun fire against infantry.
  - [ ] Add historical sight, reticle, optic, and rangefinder records; angular target tracking and lead; explicit stabilization behavior; crew target handoff and command delay; and vehicle-specific ranging methods.
- [ ] Add per-soldier spotting, last-known contacts, and command-and-control relay.
  - [x] Renderer-neutral first slice: living-observer acquisition with stance, motion, concealment, and range factors; explicit binocular equipment; frozen/decaying contacts; deterministic same-unit, voice, and operational same-net radio relay; vehicle radio damage; projection and deep capture/restore APIs.
  - [x] Wire one authoritative post-movement spotting step, direct-only precision targeting, contact-based HUNT cueing, hidden live enemy meshes, frozen uncertainty markers on the tactical map, and WEGO capture/restore.
  - [x] Add deterministic accepted-shot weapon reports and short-lived displaced SOUND contacts for in-range living enemies; preserve uncertainty without precision targeting, hidden-mesh exposure, target-soldier leakage, or same-step relay; and capture/restore the contacts with version-one compatibility.
  - [x] Add deterministic first-report VOICE/RADIO delay: freeze the acquisition report, deliver it at the exact gameplay-approximation boundary through a bounded stable-ID queue, revalidate endpoints, preserve contact precedence, and capture the authoritative fractional clock for byte-identical rollback and frame partitioning.
  - [x] Add deterministic direct identification progression and decay, frozen first-report relay quality, strict legacy/new-state migration, and exact rollback/frame-partition behavior without precision-target leakage.
  - [x] Add a deterministic 500 ms render-only grace after direct LOS loss and retain that bridge while a previously acquired observer again has a valid sight path, so consecutive 10 Hz misses and precision reacquisition cannot blink an otherwise visible enemy mesh; revoke direct contacts and precision targeting immediately, keep stale/relayed contacts hidden, and preserve exact capture/restore, legacy migration, and frame-partition behavior.
  - [x] Project stale confirmed contacts into the 3D world as frozen gray last-known markers or identification-appropriate proxies whose opacity and uncertainty come from the existing authoritative contact snapshot; never move them with the hidden live unit, reveal current facing/damage, or permit direct precision targeting; retain area-fire/support targeting at the reported location; preserve per-unit/C2 ownership and source-casualty consequences; and capture/restore the projection inputs without making presentation authoritative.
    - [ ] Add deterministic negative observation: when an eligible observer has clear LOS over the frozen contact's uncertainty region and the reported unit is not observably present there, revoke or downgrade that unit's contact; otherwise let confidence, identification, and uncertainty decay normally until expiry or reacquisition.
  - [x] Add a renderer-neutral foliage-concealment foundation with stable circular/oriented canopy volumes, ordered three-dimensional sight-path measurements, overlap-aware density, distinct observer/target/intervening effects, bounded non-occluding observation factors, and input-order invariance. Map-foliage adaptation and live `SpottingSystem` consumption remain.
  - [x] Conceal occupied building soldiers until an individual attacks from an assigned fire port; clear outside firing solutions at completed entry and prevent hidden occupants from entering spotting and infantry fire-control target sets.
  - [x] Make HIDE an authoritative infantry fire hold across outside, building-approach, transit, occupied, exit-waiting, and exiting phases; include deployed mortar fire and reset individual fire-control targets until HIDE is released.
  - [x] Add individual observer capabilities: formation-owned squad-leader binoculars activate only while that soldier is OBSERVING; binoculars extend range, accelerate acquisition, and narrow FOV; vehicle drivers, gunners, and commanders use role-owned hull/turret vision slots, gun sights, cupola views, and damage-sensitive optics; unbuttoned commanders gain a longer-range narrow binocular view.
  - [ ] Replace first-order range/acquisition/FOV multipliers with vehicle- and optic-specific manual data, model each sight and viewport direction/height, add scan/traverse behavior, and connect the existing foliage-exposure measurements to live spotting.
  - [ ] Add richer terrain/foliage concealment, broader sound-contact modeling, false reports, and command-delay modeling.
- [ ] Add ammunition bearers, ammunition transfer, shared LMG belts/magazines, and vehicle ammunition handling.
  - [x] Same-squad feed slice: give the French FM 24/29 and German MG 34 assistant gunners explicit conserved support loads; transfer them only after a deterministic proximity delay using final post-transit individual positions; preserve reserve/reload ownership, interruption, stable IDs, and deep rollback. Cross-unit resupply, carrier movement, shared feed objects, split-team handling, and vehicle ammunition remain.
- [ ] Add historically sourced France 1940 specialist weapons, roles, and formation-dependent distribution.
  - [ ] Add Brandt Mle 1935 60 mm company mortar teams and Brandt 81 mm battalion/heavy-weapons mortar teams with stable crew roles, carried ammunition, setup/deployment, indirect-fire ballistics, observers/communications, ranging, suppression, realtime/WEGO behavior, and deep rollback; verify exact allocation and crew strength per formation rather than applying one universal table.
    - [x] First playable on-map 60 mm slice: add one provisional French Brandt Mle 1935 team with stable gunner, assistant, and ammunition-bearer ownership; timed setup/pack state; casualty and individually conserved ammunition gates; a modeled tube/baseplate/bipod and true muzzle; deterministic high-angle variable-charge projectile flight through the existing swept collision, HE blast, telemetry, and audio paths; conditional deploy UI; fixed-step cadence; and deep unit/projectile rollback. The four-person roster, Berthier carbine distribution, ammunition quantity, setup/pack/cadence/range/charge/effect values, and visual geometry are explicitly labeled gameplay or renderer approximations.
    - [x] Add a deterministic renderer-neutral fire-mission lifecycle with stable mission/observer/team/target/shot IDs, authorization and availability gates, request and correction delays, a real ranging projectile acknowledgement, observed correction, bounded fire-for-effect sequencing, rollback state, and indirect-shot telemetry identity. Live target-command routing, external observers, communications networks, and impact-observation wiring remain.
    - [x] Add a dedicated on-map `TARGET HE` area order for mortar teams: press/tap sets the center, drag expands a terrain-conforming circle from the weapon/range-derived default dispersion without moving the camera, release records a rollback-owned area order, the first bomb waits one simulation second, later bombs use reload cadence, and ordinary squad `TARGET` never fires the mortar.
    - [ ] Verify France 1940 Brandt 60 mm smoke ammunition identity, issue, carried quantity, ballistics, and effect from a primary source before exposing `TARGET SMOKE`; keep unsupported smoke out of production state instead of inventing a round.
    - [ ] Replace the provisional 60 mm roster and allocation with formation-specific primary TO&E evidence; add observer/communications authorization, ranging and correction, fire missions, displacement behavior, crew replacement, recoverable casualty-owned rounds, and mortar-specific operating poses.
    - [ ] Add historically verified 81 mm battalion/heavy-weapons teams as a separate weapon, formation, ammunition, ballistic, and presentation slice rather than scaling the 60 mm approximation.
  - [ ] Add designated marksmen/snipers with scoped Lebel Mle 1886/93 and documented formation-dependent scoped Berthier variants; model optics, shooter skill, observation, concealment, aim, and ammunition as individual state rather than a generic sniper bonus.
  - [ ] Add regular Lebel Mle 1886/93, Berthier long-rifle variants, and the Berthier mousqueton Mle 1892 M16; use provenance-backed mixed issue for riflemen and mounted, artillery, vehicle, driver, messenger, logistics, and collective-weapon personnel, including assistant gunners, without claiming that every support role received the same carbine.
    - [x] Canonical data foundation: add immutable Lebel Mle 1886/93, Berthier Mle 1907/15 M16, provisional Berthier mousqueton Mle 1892 M16, and APX 1916-equipped Lebel records; map official museum evidence only to the identities and contexts it directly supports; and label unresolved exact mousqueton provenance, ballistics, reload, feed, carried-ammunition, optic-allocation, and role-distribution approximations. Formation allocation, individual optic behavior, distinct runtime meshes, and a direct official/archive reference for the exact Mle 1892 M16 designation remain.
- [ ] Add coaxial and hull machine guns with their real crew dependencies and ammunition stores.
  - [x] First functional pass across all 15 vehicles: cataloged mount identity, crew dependency, feed/reserve state, reload and cyclic cadence, exact rendered muzzle ownership, independent projectiles, component failure, telemetry, and WEGO capture/restore.
  - [x] Correct verified right-side coax placement on H39, Panzer III/IV, Panzer 35(t)/38(t), and Sd.Kfz. 231; place the Char B1 hull MG right of its 75 mm gun; align visible barrels with muzzle markers; explicitly mark unresolved mount sides provisional.
  - [x] Add explicit MG-only targeting and an automatic weapon policy that withholds vehicle MGs from armored and area targets while retaining them against infantry.
  - [ ] Model the Char B1 bis as two distinct cannon groups: retain normal `TARGET AP` / `TARGET HE` for the turret 47 mm SA 35; add `TARGET HULL APHE` / `TARGET HULL HE` for the hull 75 mm ABS gun; and add `TARGET HULL AUTO` to coordinate that 75 mm gun with the hull MAC 31 according to target suitability, crew availability, mount limits, loaded round, and conserved ammunition. Give both cannons and the hull MG separate stable mount IDs, targets, aim/fire/reload state, crew dependencies, magazines/reserves, telemetry, UI summaries, and deep WEGO capture/restore. Verify from primary sources before canonicalizing the reported 74-round 75 mm load with only 7 APHE rounds, and keep any interim split explicitly provisional.
    - [x] Separate-hull-cannon slice: add named `hull_main` muzzle/component/state; driver-gunner and loader dependencies; 67 HE plus 7 APHE typed ammunition; exact documented shell masses, explosive fills, muzzle velocities, L.710 11.5-degree FOV/range ladders, 15-rpm theoretical rate, 6-rpm APHE/first-six-HE rate, a labeled 3-rpm midpoint for later fused HE, and recorded -15/+25-degree elevation limits; expose `TARGET HULL HE` and `TARGET HULL APHE`; pivot the stopped hull toward the target through a bounded Naeder gameplay approximation; and preserve typed state through capture/restore. `TARGET HULL AUTO`, runtime enforcement of vertical elevation limits, primary-source verification, sight-direction spotting integration, and full UI telemetry remain.
  - [ ] Replace explicitly labeled mount-ammunition and reload approximations with vehicle-specific archival values; add mount traverse/elevation limits, aim delay, and target-sharing rules.
- [ ] Replace provisional new-vehicle ammunition splits, penetration values, and movement rates with cited archival firing tables and vehicle manuals.
- [ ] Improve infantry tactical AI: cover selection, bounds, spacing, danger areas, fire-and-movement, withdrawal, and casualty response.
  - [x] First environmental-reaction pass: per-soldier incoming-fire source/impact/intensity memory, deterministic shielding-cover scoring, spacing correction, casualty response, inspectable decisions, and rewind-safe state.
  - [x] Automated 5-tier morale and suppression recovery: READY (normal), CAUTIOUS (crouched scanning, 0.75x pace), DUCKING (low profile, 0.45x pace), TAKING_COVER (reroute to hard cover), PINNED / COWERING (prone head-covered hold), and ROUTED / FLEEING (sprint away from threat origin vector). Base 18 pts/sec out-of-fire recovery with cover (+8 pts/sec) and leadership (+6 pts/sec) bonuses.
  - [x] Make pinning less abrupt: raise individual and squad pin thresholds, add aggregate morale hysteresis, and recover squad suppression at 14 points/sec once existing per-soldier recent-fire timers expire versus 4 points/sec while fire remains recent; preserve exact frame partitions and rollback without adding duplicate pressure state.
    - [x] Correct blast/armor suppression routing: HE blast suppresses infantry only when an individual is inside the blast radius with distance falloff; stopped small arms against enclosed armor add no vehicle suppression; non-explosive armor hits use spark-only impact VFX; and intact vehicle movement is no longer disabled by infantry morale labels.
  - [x] Repair individual-fire regression: retain LOS, range, aperture, movement, ordered-target, actual target-position, practical burst cadence, accepted-shot ammunition, deterministic selection, squad pinning, and legacy ammunition restore invariants.
  - [x] Add bounded rollback-safe per-soldier incoming-fire memory with stable event IDs, deterministic decay/expiry/selection, strongest-threat cover consumption, and partition-identical canonical timing.
  - [x] Add stable-ID known-target QUICK buddy bounds with one mover and one real covering-fire owner per pair, direct-observation loss reconciliation, deterministic role swaps and final reform, unavailable-member handling, and deep rollback coverage.
  - [x] Add explicit SNEAK, CRAWL, and ASSAULT orders with individual stance, speed, fire, formation, interruption, realtime/WEGO, and rollback behavior.
    - [x] First-order SNEAK slice: add an infantry-only command and mobile-visible control; deterministic slow crouched individual movement in a staggered file; no fire until physical deceleration completes; threat, morale, casualty, unavailable-member, buddy-bound, and building precedence; obstacle/building-order preservation; pose projection; and existing-state rollback coverage.
    - [x] Add distinct CRAWL and ASSAULT slices: CRAWL keeps individual soldiers prone in a slower narrow formation with moving fire prohibited, while ASSAULT advances through stable-ID six-metre buddy bounds with crouched movers, kneeling stationary coverers, real covering fire, final reform, and target-independent continuation. Preserve obstacle/building routes, mobile-visible controls, fixed-step WEGO/realtime equivalence, generalized buddy-bound state migration, and deep rollback.
  - [x] Pace ordinary squad anchors to living individual movement speed and apply bounded cohesion slowdown when the formation trails, while preserving explicit movement profiles, buddy bounds, and building-owned routes.
  - [x] Add a bounded renderer-neutral infantry danger-map foundation with stable observed-threat, incoming-impact, and casualty evidence; canonical integer-tick decay; deterministic capacity retention; factorized point queries; bounded ordered route-segment scoring; and deep atomic capture/restore. Event feeds, AI ownership, concealment/LOS weighting, and live route choice remain.
  - [ ] Add terrain danger maps, concealment/LOS-aware movement, broader fire-team bounds and fire-and-movement beyond direct-target QUICK pairs, withdrawal, surrender, and persistent memory of observed threats.
- [ ] Improve vehicle AI: hull-down positioning, turret-first observation, threat facing, reverse movement, and damaged-vehicle behavior.
- [ ] Add deterministic movement collision and tactical navigation.
  - [x] First static-world slice: renderer-neutral oriented collider records for terrain-conforming walls, the village building, bridge parapets and abutments, river exclusion, and bunker/rubble; swept vehicle capsules and soldier circles prevent tunneling, retain stand-off, stop-and-slide, route cross-river orders through the bridge, use bridge deck height, and survive WEGO capture/restore without a physics dependency.
  - [x] Harden static movement: collide the infantry squad anchor, wait for living soldiers to finish their individual routes, bind split teams, route near-bank destinations from actual river exclusions, and run live/seek simulation through the same fixed 30 Hz steps.
  - [x] Add stable visibility-graph detours around intervening static walls for building-entry orders; preserve bridge stages, use individual and formation clearance at route corners, and keep target-building portal routing under the building interaction layer.
  - [x] Ordinary-infantry command slice: expand post-setup move orders through the injected deterministic bridge/static-obstacle graph from the live position or pending queue tail; preserve order types, formation-safe early-acceptance clearance, exact destination height, append behavior, and existing waypoint rollback ownership.
  - [x] Route the full living infantry formation envelope around passages too narrow for its current slots while retaining the 0.8 m waypoint-arrival tolerance.
  - [x] Add deterministic stable-ID personal-space resolution for living individual infantry, projected through static-world collision with bounded passes and rollback-owned positions.
  - [x] Route ordinary vehicle move orders around intervening static blockers with footprint and turn clearance, including appended routes from the pending queue tail.
  - [x] Treat every vehicle, including disabled vehicles and wrecks, as a deterministic transient oriented blocker during fixed-step movement so vehicles cannot overlap or pass through one another.
  - [ ] Add reverse-aware vehicle maneuvers and deterministic wreck settling.
- [ ] Add enterable multi-floor buildings.
  - [x] Add a renderer-neutral two-floor French house descriptor with a door, stair route, four individual slots per floor, window firing ports, deterministic slot reservations, timed transit, casualty release, and deep capture/restore.
  - [x] Replace the solid house box with a terrain-grounded, segmented door/window/floor/stair/roof model and high/medium/core/proxy LOD tiers; separate projectile/LOS apertures from a movement shell that blocks windows and reserves doors for authorized transit.
  - [x] Wire infantry ENTER GROUND, ENTER UPPER, and EXIT orders; individual approach, door/stair transit, occupancy and casualty release; window firing arcs; roster state; realtime/WEGO simulation; and capture/restore.
  - [x] Fade occupied/interior-transit buildings consistently across every LOD so individual troops and floor changes remain visible; restore opacity on final exit and rollback.
  - [x] Restrict occupied-building transparency to selected friendly occupying units and immediately restore opaque presentation after switching, enemy inspection, or clearing selection; preserve equivalent fade behavior at high/medium/core/proxy LOD distances without changing authoritative occupancy, and restore selection-derived presentation after rollback.
  - [x] Hide high/medium/core/proxy opening detail and opaque window cards when their owning section collapses, then restore the same renderer-owned meshes on rollback instead of leaving black apertures floating over rubble.
  - [x] Keep authored footprint, facade openings, floor line, roof profile, damage state, and visual identity consistent across all building LOD tiers.
  - [x] Route occupied-infantry FACE orders through authoritative window ownership: retain and replay the requested directional bias, fill all unreserved same-floor firing positions in that arc before overflow positions, place a binocular-equipped observer first, temporarily shift toward a live target already tracked by an occupant, and return to the requested bias when tracking ends.
  - [x] Restore MOVE-click floor selection, individual-occupancy exit controls, and consistent open/closed door-leaf state across every LOD.
  - [x] Enforce authored ENTER target capacity: assign only real valid requested-floor slots, exclude occupied, reserved, and rollback-owned pending claims, preserve deterministic partial acceptance and lifecycle release, and replay pending transit without a new side registry.
  - [ ] Replace authored slots as a floor-capacity limit: every living member of an ordered unit must be able to occupy the requested floor, finite window/fire-port positions remain individually reserved, and all remaining occupants receive deterministic interior support positions with visible placement, exit/casualty cleanup, and deep capture/restore.
  - [x] Add a second frozen compact one-floor farmhouse descriptor with three real individual slots, generic building/visual-system reuse, rotation-aware terrain grounding, and one explicit non-overlapping Stonne placement.
  - [x] Deterministically select the shortest valid exterior-door route and persist that stable portal through entry, stairs, exit, ejection, capture, restore, and replay.
  - [x] Add paired rear-facade firing windows to both floors of the large house; bind them to the existing rear individual slots, preserve projectile/LOS apertures and movement blockers, and render their openings across every LOD.
  - [x] Preserve authoritative per-soldier stair-transit and occupied-floor height through pose resets so movement upstairs remains visibly continuous.
  - [ ] Generalize the authored-house slice into reusable building/map records with more floor plans, entrances, interior routes, firing positions, capacity rules, and AI-selected occupation.
- [ ] Add destructible buildings with persistent tactical consequences.
  - [x] Add section health/resistance, projectile breaches, aperture state, support-loss collapse, rubble colliders, deterministic occupant damage/ejection, collision deltas, and rollback-safe events.
  - [x] Wire live projectile and blast hits, combat telemetry, occupant casualties, dynamic movement/LOS collider refresh, rollback-safe visual restoration, and visibly breached/collapsed/rubble states across every house LOD.
  - [x] Project bounded material-specific one-shot debris VFX from authoritative section damage, breach, and collapse transitions, with deterministic deduplication, provider-owned styles, pooled lifecycle, and no repeat burst for persistent no-op collapse state.
  - [x] Add deterministic severity-routed one-shot damaged-building audio with bounded provider/voice lifecycle, no-op suppression, and presentation-failure isolation.
  - [x] Add validated scenario-placement section-collapse thresholds with stable normalization, existing portal/occupant/rubble/collision consequences, legacy default behavior, and deep rollback replay.
  - [x] Add a renderer-neutral persistent building-hazard foundation with explicit combustible sections and directed adjacency, accepted damage/extinguish intents, deterministic heat/fire/smoke/fuel evolution, burnout, occupant hazard intents, bounded histories, and deep frame-partition/replay coverage. Current-house definitions, live damage/occupant integration, and fire/smoke presentation remain.
  - [ ] Add persistent smoke/fire spread and partial-floor collapse animation.
- [ ] Add terrain and structure collision to projectile sweeps.
  - [x] First structure slice: targetable German MG34 bunker with authoritative reinforced-concrete health, penetrative/direct and blast damage, firing shutdown, visible rubble state, and WEGO capture/restore.
  - [x] Add current 3D building-section sweeps with door/window/breach pass-through, earliest-hit ordering against units and vehicles, resistance/penetration, blast damage, and support collapse.
  - [x] Replace endpoint-only terrain impact with a deterministic bounded height-field sweep that resolves the earliest sampled crossing, exposes its actual spacing-derived refinement tolerance, preserves hit ordering, and replays without new persistent projectile state.
- [ ] Improve procedural infantry firing, reload, transition, casualty, and movement animations.
  - [x] Rough pass: stable base pose reset, weapon recoil profiles (LMG, SMG, Rifle), top-fed LMG reload posture, and clear KIA casualty pose.
  - [x] Bind two-segment arms to exact trigger, support, and feed-specific reload grips; add deterministic breathing, head scanning, weapon sway, weight shift, and recognizable period-weapon defining parts.
  - [x] Preserve a visually right-handed stock/shoulder relationship through idle, aim, fire, and reload; put MAS 36/Kar98k actions and verified FM 24/29, MAS 38, and MG 34 charging handles on the right while retaining the MP 40's left-side handle.
  - [x] Add distance-phased procedural prone crawling with weapon-action precedence, semantic grip retention, clean pose transitions, unavailable-status exclusion, and capture/restore re-projection coverage.
  - [x] Add phase-derived generalized wounded guarded locomotion with strict positive-health eligibility, action/crawl precedence, grip retention, clean transition resets, and capture/restore re-projection coverage.
  - [x] Add four stable-identity first-order KIA end poses with complete rig and transient-grip reset, action precedence, grounding, and capture/restore replay coverage.
  - [ ] Add blended state transitions, foot placement, turn-in-place, weapon deployment, dynamic casualty fall transitions beyond static end poses, and animation LOD.
- [ ] Improve suspension, track movement, terrain grounding, and wreck physics; evaluate deterministic Rapier specifically for bounded dynamic rigid-body needs.
  - [x] Replace opaque rectangular track slabs on all ten tracked vehicles with shared instanced closed-belt links, cleats, named wheels/sprockets/idlers, and open far-LOD belt-and-wheel silhouettes.
  - [x] Keep authoritative static movement collision game-side and deterministic; reserve a direct Rapier evaluation for dynamic wrecks, suspension, and ragdolls instead of replacing ballistics, building topology, or rollback state.
  - [x] First terrain-dynamics slice: derive deterministic four-point support pitch, roll, and ride height from each vehicle envelope; critically damp the authoritative hull pose; apply it to rendered hulls, muzzle markers, armor, and internal volumes; and preserve deep fixed-step capture/restore. Per-wheel suspension travel and vehicle-specific support datums remain.
  - [ ] Animate link travel and wheel rotation from actual distance, conform suspension to terrain, shed damaged tracks, and add deterministic wreck settling.
- [ ] Expand visible vehicle damage into component-local damage variants, persistent wrecks, and layered audio.
  - [x] First presentation pass: resolved impact sparks/scorch, engine smoke, persistent fire, destruction/secondary-explosion bursts, disabled-gun droop, component status, mount state, and ammunition HUD.
  - [x] Bound combat presentation churn: cached WebAudio noise buffers, capped/released audio voices, shared projectile resources, and capped reusable impact/explosion visuals.
  - [x] Catastrophic-damage physics slice: make an authoritative ammunition secondary explosion launch a turret with dimension-derived impulse, gravity, bounded substeps, bounce, friction, settlement, event provenance, deep rollback state, LOD-aware presentation, and removal of the former attached turret armor/internal volumes.
  - [ ] Add authoritative progressive fuel fires and staged ammunition cookoff, broken/shed tracks, dent/hole decals aligned to armor normals, damaged wheels, deformed engine/gun/turret variants, leaking fuel, crew bailout visuals, persistent wreck smoke lifecycle, and component-specific sounds.
- [ ] Continue battlefield scale and environmental-fidelity pass.
  - [x] Define one metre-scale contract and normalize authored infantry to a 1.75 m standing reference.
  - [x] Replace oversized wall slabs with 72 closed, terrain-conforming masonry segments and matching collision bounds.
  - [x] Replace the later map-spanning wall layout with two bounded, gated domestic-lot/farmstead enclosures around actual building footprints; preserve matching grounded geometry, collision, stable enclosure/gate identity, and formation-safe navigation. The enclosure placement is explicitly scenario-authored rather than claimed as a surveyed historical Stonne boundary.
  - [x] Unify river bed, water, banks, and bridge dimensions so water stays visible and the bridge reaches both banks.
  - [x] Add a level terrain-conforming house foundation, calibrated house/bridge/tree dimensions, and metre-density masonry UVs.
  - [x] Scenario-surface polygon slice: validate plain texture-space polygons alongside legacy rectangles; render deterministic ordered Canvas paths; and replace the three provisional Stonne field rectangles plus north/south road rectangle with irregular scenario-authored boundaries.
  - [x] Scenario-authored riverbank surface slice: render two bounded terrain-conforming north/south strips through an injected family material role while preserving existing height, collision, navigation, water, and bridge authority.
  - [x] Scenario surface-detail slice: add an irregular southeast field, two strictly inset field-detail polygons, and a wider north/south road shoulder beneath the unchanged road through the existing ordered visual-only layer owner.
  - [ ] Finish remaining scenario-authored ground-surface layering and field/road material refinement.
  - [ ] Expand the village, vegetation, fences, rubble, and small terrain props with authored near/medium/far representations.
- [ ] Add additional authored LOD models and measure transition popping at near, design, and far cameras.
  - [ ] Add the missing distinct infantry LOD models: retain the authored high-detail soldiers, derive stripped medium/core meshes where their silhouettes remain valid (or author replacements where they do not), preserve faction, helmet, weapon, and pose identity, keep a viable far proxy, and measure transition popping.
    - [x] Add distinct articulated eight-sided medium and six-sided core body geometry for both factions, retain helmet/weapon/grip/muzzle/pose identity, reuse bounded squad resources, preserve the far proxy, and measure per-tier triangle/object counts plus silhouette-envelope continuity. Live camera-transition capture remains.
  - [ ] Blueprint-calibrate all 15 vehicle envelopes, profiles, running gear, turrets, and weapon projections.
    - [x] Add a family-owned visual-bundle registry that composes each vehicle's canonical statistics, profile, calibration record, mesh factory, surface assets, source drawing references, renderer parameters, and validation policy for reusable generic checks.
    - [x] Correct the requested vehicle identities: replace the 8-wheel Sd.Kfz. 231 with the 6-Rad and replace the Laffly V15T tractor with the Laffly S20TL 6x6 troop carrier.
    - [x] Add one provenance-backed visual contract for every catalog vehicle, centralizing historical dimensions, construction, running-gear count, and defining silhouette landmarks.
    - [x] Blueprint-calibrate the Panzer IV Ausf. D, Panzer 35(t), and Panzer 38(t) detailed envelopes, track widths, hull lengths, and turret/deck stacks.
    - [x] Blueprint-calibrate the AMC 35, Panzer II Ausf. C, and Char B1 bis detailed envelopes while separating hull dimensions from gun projection.
    - [x] Rebuild Renault R35, Hotchkiss H39, and Panhard 178 around blueprint-specific cast/armored hull lofts, running gear, deck contacts, and exact rigid envelopes.
    - [ ] Refit R35, H39, and Panhard 178 profiles against registered source elevations/data sheets; record exact versus inferred datums and preserve authored far hull/turret/gun/running-gear silhouettes through enhancement.
      - [x] Extract the current H39 renderer parameters and provenance into one family-owned visual-data bundle without changing any runtime silhouette.
      - [x] Register the user-supplied R35 side/front/top raster, crop rectangles, rigid landmarks, source identity, and explicit secondary-source limitations as a replaceable family asset.
      - [x] Replace the R35 floating driver hood and generic ellipsoid mantlet with a direct glacis slit, source-shaped frontal shield, separate main/lower/coax collars, and authored main/coax muzzle ownership.
      - [x] Converge the R35 hull, source-shaped mudguards, suspension plates and spring packs, cast turret/cupola, shield/collars, five road wheels, lower rear idler, and tail-less running-gear contours against registered side/front/top evidence; use a wheel-supported quasi-static track path rather than the old oval, and retain defining mudguard/cupola silhouettes in proxy/core LOD.
      - [x] Restore the source-registered R35 forward casting through the rigid front datum after the station refit accidentally truncated it behind the drive sprocket; preserve a closed outward-facing nose cap in core and proxy geometry.
      - [x] Add an independent model-opacity control to the blueprint calibrator so reference and rendered geometry can be faded separately across render modes.
      - [ ] Converge H39 and Panhard 178 contours against registered source-space side/front/top evidence.
    - [ ] Replace legacy oval/capsule tracks on every remaining tracked vehicle with vehicle-owned sprocket, idler, road-wheel, and return-roller support records.
      - [x] Establish the R35 reference implementation: one deterministic wheel-supported path, labeled renderer-only tension/gravity approximations, and the same path shape at detail and proxy LOD.
      - [x] Migrate the Char B1 bis detailed and proxy tiers to one vehicle-owned, 22-support, wheel-solved track path with distinct rear drive sprocket, front idler, and documented 3x4 + 3 + 1 support-wheel identity; retain exact support locations as photo-constrained inference rather than blueprint fact.
      - [ ] Migrate the H39, S35, AMC 35, Panzer II/III/IV, Panzer 35(t), and Panzer 38(t); never use their current capsule geometry as blueprint-calibration evidence.
      - [ ] Couple track shape to authoritative suspension travel and track/component damage if dynamic running gear becomes a simulated mechanic; the current R35 path is static presentation geometry.
    - [x] Repair the registered tail-less R35 configuration: remove the absent optional trench tail, extend the base track/nose to the 4.02 m envelope, restore the five-wheel spacing, seat detailed track cleats at ground level, and constrain the proxy turret to 2.13 m.
    - ~~[x] Seat a separate R35 driver hood and rounded generic mantlet.~~ Dropped after source overlay showed both abstractions contradicted the supplied drawing.
    - [x] Refit AMC 35, Laffly S20TL, and Char B1 bis against registered side elevations and published mechanical dimensions; preserve exact envelopes, ground contact, running gear, weapon projections, and authored far silhouettes.
    - [ ] Correct and revalidate the Char B1 bis with current source-registration tooling: repair invisible or inward-wound faces; replace the oversized circular hull-gun mantlet with source-shaped geometry; place the driver's vision block at its source-backed hull datum rather than above the deck; register the drive sprocket, idler, road wheels, return rollers, and track supports from suitable side/front/top blueprints; replace the legacy oval track with the shared support-solved path at detailed and proxy LOD; and inspect keyed side/front/top overlays plus all four runtime tiers before accepting a new baseline.
      - [x] Photo-backed correction: repair local winding and degeneracy; replace the circular hull-gun disc with an irregular closed collar; seat the driver visor in its armored projection; author the compound 3x4 + 3 + 1 support-wheel identity; share one support-solved path across detailed/proxy tiers; retain driver, hull-gun, APX 4/cupola, and both gun silhouettes through all four LODs; preserve the official 6.37 x 2.46 x 2.79 m envelope and standard ground tolerance; record four traceable licensed evidence crops plus official/mechanical provenance; and accept only the 12 independently reviewed Char B1 silhouette keys.
      - [ ] Use a verified exact B1 bis multiview drawing as local-only calibration evidence: keep the raster out of the repository, retain its source URL, identity, dimensions, SHA-256, crops, transforms, and measured side/front/top pixels in vehicle-owned data, and revalidate wheel centers, cross-sections, casting curvature, suspension-plate contours, mantlet, visor, APX 4/cupola, gun axes, and all four LODs before claiming full blueprint calibration.
        - [x] Retain the held drawing's exact identity, dimensions, SHA-256, side/front/top crops, independent registrations, rigid landmarks, corrected/disputed feature pixels, and explicit inference limits in deeply frozen vehicle-owned data; preserve those authored transforms for local upload without adding an image URL or redistributing raster/annotation bytes.
        - [ ] Load the held raster through an attached Three.js DevTools browser tab and inspect side/front/top overlays at high/medium/core/proxy LOD; use only visually verified, correctly identified pixels for any further wheel, cross-section, suspension, mantlet, visor, turret, cupola, or gun-axis geometry change.
    - [x] Refit Panzer II Ausf. C, Panzer 35(t), and Panzer 38(t) against registered reference elevations; converge hull, turret, running-gear, and gun silhouettes while preserving exact envelopes and articulated far proxies.
    - [x] Refit Panzer IV Ausf. D against a registered multiview reference; converge its stepped hull, four-bogie suspension, faceted turret, short KwK 37, MG mounts, and articulated far proxy.
    - [x] Refit Sd.Kfz. 231 6-Rad against a registered multiview reference; preserve its exact three-axle envelope, tandem rear wheels, horseshoe turret, weapon projections, and articulated far proxy.
    - [x] Blueprint-calibrate the SOMUA S35 cast hull, nine-wheel suspension, and APX stack plus the Opel Blitz bonnet, cab, dual-rear-tire bed, and canvas profile.
    - [x] Blueprint-calibrate the Panzer III Ausf. D exact envelope, eight-wheel suspension, stepped hull, three-man turret/cupola, weapon projections, and articulated proxy.
    - [x] Validate all 15 rigid envelopes and model contracts automatically, then inspect representative near and formation-distance silhouettes in the live scene.
    - [x] Add an isolated orthographic calibration jig with side, front, and top blueprint registration; silhouette, wireframe, overlay, and difference modes; explicit LOD selection; landmark-error readouts in metres; resumable JSON; and deterministic GPU-free SVG silhouettes.
    - [ ] Add a review-driven blueprint-to-parametric vehicle wizard with view detection, editable rigid datums, labeled wheel/support circles, cross-view component polygons, uncertainty, and explicit export approval.
      - [x] Build a pure-LLM Renault D2 proof: provenance and image identity, five proposed view crops, side/front/top metre registration, editable source-pixel component/support data, an injected generic loft/compiler seam, high/medium/core/proxy geometry, GLB/OBJ/STL export, annotated crops, and fixed overlay evidence.
      - [x] Integrate the Renault D2 as a clearly provisional playable vehicle with canonical crew/armor/armament records, internal modules, radio and coax ownership, material/LOD bindings, calibration asset, exact silhouette coverage, and a Stonne scenario spawn; retain human-review-pending visual metadata.
      - [ ] Add browser upload/source selection, OpenCV proposals, LLM proposal import, human crop/datum/support/polygon editing, cross-view vertex correspondence, and resumable authoring JSON.
    - [x] Add per-vehicle calibration records for source image, crop, scale, origin, mirror state, ground line, axle centers, turret ring, gun axis, and defining outline landmarks.
      - [x] Add provenance-backed side/front/top record schemas and validated JSON import/export for all 15 vehicles.
      - [x] Record selected-source transforms and vehicle-specific mechanical/outline landmarks in vehicle-owned calibration metadata, explicitly labeling exact, registered, inferred, and unavailable views.
      - [x] Preload directly loadable vehicle-owned source rasters, crops, mirror/rotation transforms, and registered rigid landmarks into the jig's editable default state; automatically fit seeded landmarks while keeping unavailable or qualitative views explicitly empty.
    - [ ] Refit every detailed vehicle against available registered source outlines; retain exact envelopes while reducing contour and landmark error, without pretending unavailable or unregistered views are measured.
  - [x] Rough pass: authored medium & proxy LOD models for French/German infantry, SOMUA S35, and Panzer III.
  - [x] Seat R35/H39 turrets on their cast decks, keep Panzer III rear deck and period helmet/firearm silhouettes at core distance, preserve French helmet identity in the far proxy, and add per-triangle winding/LOD regressions.
  - [x] Authored all 15 standalone 1940 vehicle 3D models in `src/world/vehicles/` (SOMUA S35, R35, D2, H39, AMC 35, Panhard 178, Laffly S20TL, Char B1 bis, Panzer II, Panzer III, Panzer 35(t), Panzer 38(t), Sd.Kfz. 231 6-Rad, Opel Blitz, and Panzer IV Ausf. D).
  - [x] Integrated all 15 models into `UnitFactory`, `VehicleCatalog`, crew/armor/ammunition state, selection, LOD switching, scenario spawning, WEGO, and realtime; removed the legacy inline SOMUA/Panzer III mesh branches.
  - [x] Replace single-box new-vehicle proxies with sectioned hull, running-gear, turret, and gun silhouettes.
  - [x] Add distinct high, medium, core, and far-proxy runtime tiers for every unit.
  - [x] Add vehicle-profile fidelity metadata for cast, riveted, boxy, armored-car, and truck construction.
  - [x] Add a deterministic cached PBR surface pack to all 15 vehicles with explicit paint/track/rubber/metal/canvas/wood slots, metre-driven UVs, and cheaper proxy materials.
  - [x] Enforce the shared `+Z`-forward local frame (`-X` right, `+X` left); correct infantry limbs, firing grips, rifle actions, vehicle MGs/visors, and track-side semantics; retain blueprint or museum provenance for resolved asymmetric mounts.
  - [ ] Replace procedural paint approximations with vehicle-specific, historically sourced liveries, markings, UV atlases, and damage variants.
- [ ] Add deterministic visual capture coverage for high/medium/low LOD, ballistic impacts, and vehicle damage states.
  - [x] Add a reproducible CPU silhouette manifest and reviewed regression baseline for every vehicle, side/front/top view, and high/medium/core/proxy tier; document that hashes detect changes but do not prove historical fidelity.
  - [ ] Add deterministic browser captures for representative ballistic impacts and authoritative vehicle damage states.
- [x] Remove the remaining 500 kB production chunk warning.
  - [x] Split application code from the Three.js vendor chunk; the application bundle is about 250 kB, while the minified Three.js chunk remains about 501 kB.
  - [x] Reassess code splitting after the WebGPU renderer migration; route the exact WebGPU alias through Three's modular source entry and use Rolldown execution-order-safe groups for core, nodes, common renderer, WebGPU, and WebGL fallback code, keeping every production chunk below 500 kB.
  - [x] Keep the warning visible during reassessment instead of suppressing it by raising Vite's warning threshold.
  - [x] Preserve Termux and desktop-Linux build/test portability by using Rolldown-compatible functional chunk assignment, the Node system temp-directory API in test setup, and standard buffered `execFile` output capture.

## Completed

- [x] Add repo-local agent-agnostic workflow skills for blueprint vehicle authoring, deterministic simulation slices, delegated-work quality gating, and live WebGPU/Three.js runtime debugging.
- [x] Give every infantryman independent AI, health, suppression, movement, stance, target, and attack state.
- [x] Remove dead infantrymen from available firepower.
- [x] Spawn infantry projectiles from each visible weapon muzzle.
- [x] Give every infantryman an individual magazine, reserve ammunition, reload timer, burst state, and fire cadence.
- [x] Add data-driven French and German small-arms definitions with caliber, muzzle velocity, rate of fire, magazine size, reload time, and carried ammunition.
- [x] Add data-driven SA 35 and KwK 36 AP/HE ammunition.
- [x] Add deterministic projectile flight with gravity, drag, dispersion, swept hit detection, and terrain impact.
- [x] Add hull/turret and front/side/rear armor zones with impact-angle-adjusted penetration.
- [x] Keep disabled and knocked-out vehicle armor physically present in swept projectile collision; separate authoritative destruction from legacy component-status summaries so living crews and functional weapons remain combat participants.
- [x] Model SOMUA S35 three-man crew and Panzer III five-man crew.
- [x] Disable firing when the gunner is dead, reloading when the loader is unavailable, and movement when the driver is dead.
- [x] Add vehicle turret traverse, loaded-round state, AP/HE selection, reload timing, ammunition stores, and recoil.
- [x] Increase SOMUA S35 fidelity with cast hull, APX turret, SA 35 gun, suspension, road wheels, cupola, and detail parts.
- [x] Correct inverted SOMUA S35 cast-hull end-cap faces and add a winding regression test.
- [x] Rebuild the Panzer III silhouette, running gear, turret, cupola, and 3.7 cm KwK 36.
- [x] Add high, medium, core, and low-proxy distance LOD behavior with quality-tier thresholds.
- [x] Add infantry reload and recoil poses plus vehicle gun recoil.
- [x] Remove right-side camera-control strip.
- [x] Start all French and German formations facing one another.
- [x] Add working realtime mode with an unbounded live clock and unlocked command entry.
- [x] Keep the WEGO mode with rewind, seek, playback speed, and deterministic snapshots.
- [x] Preserve in-flight projectiles, shot sequence, impact telemetry, and rollback-safe vehicle damage marks across WEGO seek and replay.
- [x] Add visible realtime/WEGO controls on mobile.
- [x] Add CANCEL TOOL, DESELECT, Escape, right-click, and empty-ground deselection.
- [x] Make visible friendly and hostile unit models plus their badges explicit selection/inspection surfaces; keep badges pass-through while a command tool owns the pointer, keep friendly models out of opposing-target raycasts, and preserve separate command authority.
- [x] Keep the current orbit target and camera framing unchanged across ordinary model/badge selection, inspection, deselection, empty-ground clicks, and right-button camera panning; intentionally frame a unit on model/badge double-click.
- [x] Preview the complete model-click selection on hover with yellow support-surface rings around every living infantryman, declared equipment such as mortars, or the vehicle footprint plus a matching yellow badge border; update hover transitions synchronously, keep render-object pools isolated per unit so differently sized footprints cannot leak across transitions, conform footprints to terrain, and let opaque models occlude them.
- [x] Center each floating badge independently of its name and damage rows, and hide the whole badge when a nearer visible unit model blocks its camera ray.
- [x] Raise floating badge anchors from 3.5 to 5.5 metres, add a fixed 48-pixel upward screen clearance that survives long camera range, and reduce badge size from 34 to 28 pixels so unit models remain readable underneath.
- [x] Add Shift/Ctrl/Command model-click multi-selection with shared formation-preserving move, target, and face orders plus per-unit path and target overlays.
- [x] Hide command actions and squad roster/weapons content when no unit is selected while preserving the HUD footprint.
- [x] Keep the tactical map visible in portrait mobile layout.
- [x] Add a top tactical-map toggle and reflow the hidden-map desktop HUD with a wider crew/system panel, a rightmost command panel, narrower role-first roster cards, and more readable desktop text.
- [x] Remove the non-authoritative aggregate vehicle health percentage from floating badges and the crew/system header while preserving exact component health and meaningful fire/knockout conditions.
- [x] Keep portrait HUD space stable as a two-by-two grid with internally scrollable command content.
- [x] Expand the portrait Squad Roster & Weapons panel through the tactical map's right-column row whenever the map is hidden, keep crew cards in compact content-height rows, use two mobile columns, and pin AMMO to the panel bottom so scrolling starts only when the remaining roster space is exhausted.
- [x] Size the portrait Unit Soft Factors panel to its content, give the remaining left-column height to Actions, and enlarge its tabs while preserving the existing total HUD height and right-column roster/map split.
- [x] Enforce complete friendly and enemy unit footprints inside their command-phase deployment boxes.
- [ ] Add pre-match route planning: a destination inside the friendly deployment box immediately repositions the complete unit, while destinations beyond it queue visible round-start orders from the deployed position; support appended mixed FAST, SNEAK, ASSAULT, building-entry, and requested-floor stages through match start with the same deterministic movement/building transitions used after deployment.
- [x] Make initial setup-area overlays terrain-conforming, raycast-inert, and removable at match start; relocate valid full unit footprints immediately during the opening command phase.
- [x] Allow new movement orders after turn one by pruning completed waypoint queues.
- [x] Add automated coverage for individual ammunition, ballistics, armor, crews, muzzle origins, LOD, realtime, and subsequent-turn orders.
- [x] Add shared repository agent guidance for simulation invariants, rough-pass tracking, validation, and handoff discipline.
- [x] Define a bounded Antigravity work packet covering low-risk visual, diagnostic, responsive-UI, and build tasks.

## Dropped

- ~~[ ] Use ammo.js as the weapon-ballistics and armor-penetration system.~~ It is a rigid-body physics engine binding, not a historical ammunition or armor model.
- ~~[ ] Restore the permanent right-side camera-control strip.~~ Camera controls remain available through direct map interaction and existing shortcuts.

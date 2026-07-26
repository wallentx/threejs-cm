# TODO

Rolling development checklist for the Combat Mission-style prototype.
Update this file whenever scope changes and whenever an item is completed or dropped.

Status:

- `[ ]` planned
- `[x]` completed
- `~~strikethrough~~` intentionally dropped

## Current priorities

- [ ] Complete the Three.js r185 WebGPU renderer migration.
  - [x] Upgrade Three.js from r160 to r185; make `WebGPURenderer` primary with its direct WebGL 2 fallback; use explicit asynchronous initialization and pipeline warmup; replace deprecated `Clock` use with the visibility-aware `Timer`; retain opaque-background alpha behavior; and expose the active backend and current-frame diagnostics.
  - [ ] Validate native WebGPU on representative desktop and mobile hardware, then establish TSL/node-material and WebGPU post-processing conventions before adding custom shader effects.
- [ ] Complete engine, game-family, map, scenario, and asset-layer separation.
  - [x] Define ownership and one-way import rules in `docs/ARCHITECTURE.md` and `AGENTS.md`.
  - [x] Extract the Stonne roster, placements, setup zones, seed, initial selection, and camera target into a plain-data scenario descriptor.
  - [x] Add generic scenario instantiation and deployment-footprint validation under `src/scenario/`.
  - [x] Inject setup-zone records into `TerrainBuilder` instead of importing scenario state from the world layer.
  - [x] Document current infantry, vehicle-state, ballistics, rendering, VFX, and HUD seams in `docs/ARCHITECTURE.md`.
  - [ ] Extract France 1940 weapon, vehicle, formation, faction, and presentation data behind a family registry.
  - [ ] Extract Stonne terrain coordinates, surfaces, structures, foliage, and obstacles into a map descriptor.
  - [ ] Inject family catalogs and visual factories into generic unit, ballistics, UI, and world systems.
  - [ ] Add logical asset manifests and replaceable family asset packs.
  - [ ] Move browser lifecycle and simulation orchestration from `main.js` into a narrow application/runtime facade.
- [ ] Replace spherical vehicle hit volumes with mesh-accurate armor plates and named collision zones.
- [ ] Add a shot-inspection debug view: trajectory, impact angle, velocity, armor thickness, penetration, and damage result.
  - [x] Rough pass: detailed inspectable impact telemetry fields (shooter, target, range, speed, angle, armor, penetration, crew result) and data-ballistics-stats DOM dataset.
- [ ] Add ricochet continuation, projectile breakup, behind-armor spall, and residual penetration energy.
- [ ] Model internal vehicle modules: engine, transmission, fuel, ammunition racks, optics, radio, turret traverse, gun breech, and tracks.
  - [x] First authoritative pass: named component health, installed/operational state, deterministic zone-weighted damage, fire and ammunition-explosion events, degraded mobility/traverse/reload/fire behavior, and WEGO capture/restore.
  - [ ] Replace abstract zone-weighted selection with model-local module volumes, penetration paths, spall interaction, localized crew exposure, and component repair/abandonment rules.
- [ ] Add crew task reassignment, replacement-gunner delays, bailout decisions, and abandoned vehicles.
- [ ] Add weapon sighting, target acquisition, aim time, range estimation, and fire-control delays.
- [ ] Add per-soldier spotting, last-known contacts, and command-and-control relay.
  - [x] Renderer-neutral first slice: living-observer acquisition with stance, motion, concealment, and range factors; explicit binocular equipment; frozen/decaying contacts; deterministic same-unit, voice, and operational same-net radio relay; vehicle radio damage; projection and deep capture/restore APIs.
  - [x] Wire one authoritative post-movement spotting step, direct-only precision targeting, contact-based HUNT cueing, hidden live enemy meshes, frozen uncertainty markers on the tactical map, and WEGO capture/restore.
  - [ ] Add richer terrain/foliage concealment, sound contacts, identification quality, false reports, and command-delay modeling.
- [ ] Add ammunition bearers, ammunition transfer, shared LMG belts/magazines, and vehicle ammunition handling.
- [ ] Add coaxial and hull machine guns with their real crew dependencies and ammunition stores.
  - [x] First functional pass across all 14 vehicles: cataloged mount identity, crew dependency, feed/reserve state, reload and cyclic cadence, exact rendered muzzle ownership, independent projectiles, component failure, telemetry, and WEGO capture/restore.
  - [x] Correct verified right-side coax placement on H39, Panzer III/IV, Panzer 35(t)/38(t), and Sd.Kfz. 231; place the Char B1 hull MG right of its 75 mm gun; align visible barrels with muzzle markers; explicitly mark unresolved mount sides provisional.
  - [ ] Replace explicitly labeled mount-ammunition and reload approximations with vehicle-specific archival values; add mount traverse/elevation limits, aim delay, and target-sharing rules.
- [ ] Replace provisional new-vehicle ammunition splits, penetration values, and movement rates with cited archival firing tables and vehicle manuals.
- [ ] Improve infantry tactical AI: cover selection, bounds, spacing, danger areas, fire-and-movement, withdrawal, and casualty response.
  - [x] First environmental-reaction pass: per-soldier incoming-fire source/impact/intensity memory, deterministic shielding-cover scoring, spacing correction, casualty response, inspectable decisions, and rewind-safe state.
  - [x] Automated 5-tier morale and suppression recovery: READY (normal), CAUTIOUS (crouched scanning, 0.75x pace), DUCKING (low profile, 0.45x pace), TAKING_COVER (reroute to hard cover), PINNED / COWERING (prone head-covered hold), and ROUTED / FLEEING (sprint away from threat origin vector). Base 18 pts/sec out-of-fire recovery with cover (+8 pts/sec) and leadership (+6 pts/sec) bonuses.
  - [ ] Add terrain danger maps, concealment/LOS-aware movement, buddy bounds, fire-and-movement, withdrawal, surrender, and persistent memory of observed threats.
- [ ] Improve vehicle AI: hull-down positioning, turret-first observation, threat facing, reverse movement, and damaged-vehicle behavior.
- [ ] Add deterministic movement collision and tactical navigation.
  - [x] First static-world slice: renderer-neutral oriented collider records for terrain-conforming walls, the village building, bridge parapets and abutments, river exclusion, and bunker/rubble; swept vehicle capsules and soldier circles prevent tunneling, retain stand-off, stop-and-slide, route cross-river orders through the bridge, use bridge deck height, and survive WEGO capture/restore without a physics dependency.
  - [x] Harden static movement: collide the infantry squad anchor, wait for living soldiers to finish their individual routes, bind split teams, route near-bank destinations from actual river exclusions, and run live/seek simulation through the same fixed 30 Hz steps.
  - [x] Add stable visibility-graph detours around intervening static walls for building-entry orders; preserve bridge stages, use individual and formation clearance at route corners, and keep target-building portal routing under the building interaction layer.
  - [ ] Add unit-to-unit separation, generalize obstacle-graph routing beyond building-entry orders, add reverse-aware vehicle maneuvers, and add deterministic wreck settling.
- [ ] Add enterable multi-floor buildings.
  - [x] Add a renderer-neutral two-floor French house descriptor with a door, stair route, four individual slots per floor, window firing ports, deterministic slot reservations, timed transit, casualty release, and deep capture/restore.
  - [x] Replace the solid house box with a terrain-grounded, segmented door/window/floor/stair/roof model and high/medium/core/proxy LOD tiers; separate projectile/LOS apertures from a movement shell that blocks windows and reserves doors for authorized transit.
  - [x] Wire infantry ENTER GROUND, ENTER UPPER, and EXIT orders; individual approach, door/stair transit, occupancy and casualty release; window firing arcs; roster state; realtime/WEGO simulation; and capture/restore.
  - [x] Fade occupied/interior-transit buildings consistently across every LOD so individual troops and floor changes remain visible; restore opacity on final exit and rollback.
  - [x] Keep authored footprint, facade openings, floor line, roof profile, damage state, and visual identity consistent across all building LOD tiers.
  - [ ] Generalize the authored-house slice into reusable building/map records with more floor plans, entrances, interior routes, firing positions, capacity rules, and AI-selected occupation.
- [ ] Add destructible buildings with persistent tactical consequences.
  - [x] Add section health/resistance, projectile breaches, aperture state, support-loss collapse, rubble colliders, deterministic occupant damage/ejection, collision deltas, and rollback-safe events.
  - [x] Wire live projectile and blast hits, combat telemetry, occupant casualties, dynamic movement/LOS collider refresh, rollback-safe visual restoration, and visibly breached/collapsed/rubble states across every house LOD.
  - [ ] Add material-specific debris VFX, persistent smoke/fire spread, partial-floor collapse animation, damaged-building sound, and scenario-authored destruction thresholds.
- [ ] Add terrain and structure collision to projectile sweeps.
  - [x] First structure slice: targetable German MG34 bunker with authoritative reinforced-concrete health, penetrative/direct and blast damage, firing shutdown, visible rubble state, and WEGO capture/restore.
  - [x] Add current 3D building-section sweeps with door/window/breach pass-through, earliest-hit ordering against units and vehicles, resistance/penetration, blast damage, and support collapse.
- [ ] Improve procedural infantry firing, reload, transition, casualty, and movement animations.
  - [x] Rough pass: stable base pose reset, weapon recoil profiles (LMG, SMG, Rifle), top-fed LMG reload posture, and clear KIA casualty pose.
  - [x] Bind two-segment arms to exact trigger, support, and feed-specific reload grips; add deterministic breathing, head scanning, weapon sway, weight shift, and recognizable period-weapon defining parts.
  - [x] Preserve a visually right-handed stock/shoulder relationship through idle, aim, fire, and reload; put MAS 36/Kar98k actions and verified FM 24/29, MAS 38, and MG 34 charging handles on the right while retaining the MP 40's left-side handle.
  - [ ] Add blended state transitions, foot placement, turn-in-place, crawling, weapon deployment, wounded locomotion, varied casualty falls, and animation LOD.
- [ ] Improve suspension, track movement, terrain grounding, and wreck physics; evaluate deterministic Rapier specifically for bounded dynamic rigid-body needs.
  - [x] Replace opaque rectangular track slabs on all ten tracked vehicles with shared instanced closed-belt links, cleats, named wheels/sprockets/idlers, and open far-LOD belt-and-wheel silhouettes.
  - [x] Keep authoritative static movement collision game-side and deterministic; reserve a direct Rapier evaluation for dynamic wrecks, suspension, and ragdolls instead of replacing ballistics, building topology, or rollback state.
  - [ ] Animate link travel and wheel rotation from actual distance, conform suspension to terrain, shed damaged tracks, and add deterministic wreck settling.
- [ ] Expand visible vehicle damage into component-local damage variants, persistent wrecks, and layered audio.
  - [x] First presentation pass: resolved impact sparks/scorch, engine smoke, persistent fire, destruction/secondary-explosion bursts, disabled-gun droop, selected-vehicle health, component status, mount state, and ammunition HUD.
  - [x] Bound combat presentation churn: cached WebAudio noise buffers, capped/released audio voices, shared projectile resources, and capped reusable impact/explosion visuals.
  - [ ] Add dent/hole decals aligned to armor normals, damaged wheels and tracks, deformed engine/gun/turret variants, leaking fuel, crew bailout visuals, persistent wreck smoke lifecycle, and component-specific sounds.
- [ ] Continue battlefield scale and environmental-fidelity pass.
  - [x] Define one metre-scale contract and normalize authored infantry to a 1.75 m standing reference.
  - [x] Replace oversized wall slabs with 72 closed, terrain-conforming masonry segments and matching collision bounds.
  - [x] Unify river bed, water, banks, and bridge dimensions so water stays visible and the bridge reaches both banks.
  - [x] Add a level terrain-conforming house foundation, calibrated house/bridge/tree dimensions, and metre-density masonry UVs.
  - [ ] Replace provisional rectangular ground fields with scenario-authored surface layers, irregular field boundaries, roads, and riverbank materials.
  - [ ] Expand the village, vegetation, fences, rubble, and small terrain props with authored near/medium/far representations.
- [ ] Add additional authored LOD models and measure transition popping at near, design, and far cameras.
  - [x] Rough pass: authored medium & proxy LOD models for French/German infantry, SOMUA S35, and Panzer III.
  - [x] Seat R35/H39 turrets on their cast decks, keep Panzer III rear deck and period helmet/firearm silhouettes at core distance, preserve French helmet identity in the far proxy, and add per-triangle winding/LOD regressions.
  - [x] Authored 12 standalone 1940 vehicle 3D models in `src/world/vehicles/` (R35, H39, AMC 35, Panhard 178, Laffly V15T, Char B1 bis, Panzer II, Panzer 35(t), Panzer 38(t), Sd.Kfz. 231, Opel Blitz, Panzer IV Ausf. D).
  - [x] Integrated all 12 models into `UnitFactory`, `VehicleCatalog`, crew/armor/ammunition state, selection, LOD switching, scenario spawning, WEGO, and realtime.
  - [x] Replace single-box new-vehicle proxies with sectioned hull, running-gear, turret, and gun silhouettes.
  - [x] Add distinct high, medium, core, and far-proxy runtime tiers for every unit.
  - [x] Add vehicle-profile fidelity metadata for cast, riveted, boxy, armored-car, and truck construction.
  - [x] Add a deterministic cached PBR surface pack to all 14 vehicles with explicit paint/track/rubber/metal/canvas/wood slots, metre-driven UVs, and cheaper proxy materials.
  - [ ] Replace procedural paint approximations with vehicle-specific, historically sourced liveries, markings, UV atlases, and damage variants.
- [ ] Add deterministic visual capture coverage for high/medium/low LOD, ballistic impacts, and vehicle damage states.
- [ ] Remove the remaining 500 kB production chunk warning.
  - [x] Split application code from the Three.js vendor chunk; the application bundle is about 250 kB, while the minified Three.js chunk remains about 501 kB.
  - [ ] Reassess code splitting after the WebGPU renderer migration; the r185 WebGPU vendor chunk is about 806 kB minified and the application chunk is about 384 kB.

## Completed

- [x] Give every infantryman independent AI, health, suppression, movement, stance, target, and attack state.
- [x] Remove dead infantrymen from available firepower.
- [x] Spawn infantry projectiles from each visible weapon muzzle.
- [x] Give every infantryman an individual magazine, reserve ammunition, reload timer, burst state, and fire cadence.
- [x] Add data-driven French and German small-arms definitions with caliber, muzzle velocity, rate of fire, magazine size, reload time, and carried ammunition.
- [x] Add data-driven SA 35 and KwK 36 AP/HE ammunition.
- [x] Add deterministic projectile flight with gravity, drag, dispersion, swept hit detection, and terrain impact.
- [x] Add hull/turret and front/side/rear armor zones with impact-angle-adjusted penetration.
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
- [x] Hide command actions and squad roster/weapons content when no unit is selected while preserving the HUD footprint.
- [x] Keep the tactical map visible in portrait mobile layout.
- [x] Keep portrait HUD space stable as a two-by-two grid with internally scrollable command content.
- [x] Enforce complete friendly and enemy unit footprints inside their command-phase deployment boxes.
- [x] Make initial setup-area overlays terrain-conforming, raycast-inert, and removable at match start; relocate valid full unit footprints immediately during the opening command phase.
- [x] Allow new movement orders after turn one by pruning completed waypoint queues.
- [x] Add automated coverage for individual ammunition, ballistics, armor, crews, muzzle origins, LOD, realtime, and subsequent-turn orders.
- [x] Add shared repository agent guidance for simulation invariants, rough-pass tracking, validation, and handoff discipline.
- [x] Define a bounded Antigravity work packet covering low-risk visual, diagnostic, responsive-UI, and build tasks.

## Dropped

- ~~[ ] Use ammo.js as the weapon-ballistics and armor-penetration system.~~ It is a rigid-body physics engine binding, not a historical ammunition or armor model.
- ~~[ ] Restore the permanent right-side camera-control strip.~~ Camera controls remain available through direct map interaction and existing shortcuts.

# Repository Architecture

This document defines the target module boundaries for growing the proof of
concept without turning `src/main.js` into a shared merge point. The current
code does not yet match every boundary below; known exceptions and migration
steps are listed explicitly.

## Target layout

```text
src/
|-- main.js                         # Composition root; wiring only
|-- app/
|   `-- GameApp.js                  # Browser lifecycle and top-level facade
|-- engine/                         # Generic Three.js, camera, audio, input
|-- simulation/                     # Renderer-neutral tactical state and rules
|   |-- model/
|   |-- systems/
|   `-- ports/
|-- scenario/
|   |-- ScenarioRuntime.js          # Runs one loaded scenario
|   |-- FamilyRegistry.js           # Registry type and content validation
|   |-- loadScenario.js             # Future dedicated loader boundary
|   `-- schema.js                   # Future stable data contracts
|-- content/
|   `-- france1940/
|       |-- index.js                # Family registration surface
|       |-- factions.js
|       |-- formations.js
|       |-- presentation.js
|       |-- weapons.js
|       |-- vehicles.js
|       `-- render/                 # Family-specific mesh factories
|-- maps/
|   `-- france/
|       `-- stonne.js               # Terrain, zones, landmarks, placements
|-- scenarios/
|   `-- france1940/
|       `-- stonne1940.js           # Sides, units, map ID, victory setup
|-- ui/                             # HUD and minimap; runtime facade client
|-- editor/                         # Scenario/map authoring clients
|-- assets/
|   |-- manifest.js                 # Logical asset IDs to URLs or generators
|   `-- france1940/                 # Family-owned external assets
`-- styles/

test/
|-- engine/
|-- simulation/
|-- scenario/
|-- content/
|-- maps/
`-- integration/
```

Empty target directories should be created only when work lands there. Existing
procedural models remain source code under their owning content or engine
boundary; `assets/` is for external textures, models, audio, and their manifest.

## Implemented foundation

The first boundary slice now exists:

- `src/engine/Renderer.js` owns the Three.js r185 `WebGPURenderer`, explicit
  asynchronous backend initialization, pipeline warmup, active-backend
  diagnostics, and automatic WebGL 2 fallback. Browser rendering imports
  `three/webgpu` through one exact Vite alias so core classes and addons share
  one Three.js instance. Simulation state and outcomes remain CPU-authoritative.
- `src/scenario/ScenarioRuntime.js` validates and instantiates plain scenario
  records without knowing Stonne. With an injected family registry, it resolves
  ordered infantry rosters and validates vehicle ownership before any live
  `Unit` exists. Family-tagged scenarios require that registry; the no-registry
  compatibility path is restricted to untagged legacy descriptors.
- `src/scenario/FamilyRegistry.js` validates isolated, composition-owned family
  registrations. It checks stable record IDs, faction presentation and vehicle
  ownership, unique stable formation-member IDs, and every weapon reference without
  importing Three.js, the browser, a concrete family, or a global singleton.
- `src/content/france1940/` now owns frozen faction, vehicle-affiliation,
  formation, presentation, and weapon records. Its entry point receives only
  the existing vehicle catalog from composition as a migration adapter rather
  than importing the legacy game layer. Scenario equipment and radio records
  address stable formation-member IDs, not array positions.
- `src/content/france1940/weapons.js` owns the single frozen 26-record weapon
  map, default materialization, legacy display-name aliases, and lookup.
  `src/game/WeaponCatalog.js` is a narrow strict-identity re-export, so current
  consumers and rollback weapon IDs continue to resolve the same objects while
  catalog-port injection remains staged work.
- `src/scenario/DeploymentRules.js` validates complete unit footprints against
  injected setup-zone records.
- `src/scenarios/france1940/stonne1940.js` owns the Stonne roster, positions,
  setup zones, startup selection, camera target, family ID, and seed.
- `TerrainBuilder` receives setup-zone records. It no longer exports a
  Stonne-specific deployment constant or deployment rule.
- `src/world/WorldScale.js` owns the shared metre and standing-infantry
  reference; `TerrainScale.js` owns bounded environmental dimensions.
- `src/world/vehicles/VehicleMaterialLibrary.js` owns cached procedural vehicle
  surfaces, explicit material slots, physical UV projection, and proxy material
  policy independently from vehicle geometry factories.
- `src/world/vehicles/TrackedRunningGear.js` owns reusable, named track belts,
  wheels, sprockets, idlers, and their LOD contract. Vehicle factories supply
  dimensions and materials instead of rebuilding track logic.
- `src/calibration/VehicleOwnedRegistration.js` adapts plain, vehicle-owned
  blueprint metadata into editable jig defaults. The jig preloads only
  directly loadable registered rasters and keeps unavailable or qualitative
  views explicit instead of inventing registrations.
- `src/world/infantry/InfantryWeaponFactory.js` owns weapon geometry and semantic
  grip/muzzle markers. `InfantryPoseAnimator.js` owns render-only pose binding;
  neither module decides whether a soldier may fire.
- `src/game/VehicleSystems.js` owns canonical vehicle component, damage-event,
  and auxiliary-mount state. `Unit` owns each vehicle instance and exposes a
  plain `getVehicleDamageReport()` snapshot.
- `src/simulation/observation/` owns renderer-neutral equipment, command-net,
  relay, and immutable contact helpers. `SpottingSystem` temporarily adapts
  legacy live units into that state without mutating meshes.
- `src/simulation/collision/StaticCollisionWorld.js` owns deterministic static
  X/Z collision queries and bridge-routing records. `TerrainBuilder` publishes
  plain oriented footprints from authored walls, structures, bridge parts, and
  river exclusions; rendered meshes are never queried as authoritative
  collision state.
- `src/simulation/vehicles/VehicleArmorCollision.js` owns renderer-neutral
  swept intersection against catalog-supplied model-local armor volumes.
  Vehicle-owned shape tables may feed both renderer geometry and triangle-plate
  collision descriptors; unconverted vehicles retain the named OBB fallback.
  Stable plate IDs, normals, local impact points, thickness provenance, and
  turret-relative rotation feed ballistics and localized component damage;
  rendered vehicle meshes never decide a hit.
- `src/simulation/buildings/` owns renderer-neutral building descriptors,
  portal topology, occupancy, section damage, collapse, consequences, events,
  collision snapshots, and deep capture/restore.
- `src/game/BuildingInteractionSystem.js` adapts unit orders and individual
  soldiers to the building topology. It owns approach, reservation, timed
  door/stair transit, occupied firing slots, exit, and casualty cleanup.
- `src/world/buildings/FrenchHouse.js` projects one descriptor and its runtime
  damage state into high/medium/core/proxy meshes. `TerrainBuilder` replaces
  only that building's movement records when state changes; spotting and
  ballistics query the current 3D section snapshot directly.
  Every LOD uses the same descriptor sections, openings, floor line, and roof
  profile. `BuildingInteractionSystem` exposes a read-only interior-presence
  count that `TerrainBuilder` projects as reversible material fade; this
  presentation path never changes collision, LOS, occupancy, or transit.
- `src/world/VehicleDamageEffects.js` reads resolved damage and impact telemetry
  to render bounded fire, smoke, sparks, blast, scorch, and disabled-gun cues.
  It never decides damage.
- `src/ui/VehicleStatusPresenter.js` converts plain vehicle snapshots into HUD
  view data. `UIManager` renders that view without becoming simulation state.
- `main.js` selects a scenario and composes the runtime. It no longer contains
  the Stonne order of battle. It constructs the selected family registry and
  injects it into scenario loading.

## Current vertical-slice seams

These seams are usable now, before the staged directory migration is complete:

| Concern | Authoritative owner | Read-only consumer |
| --- | --- | --- |
| Family identity, faction vehicle ownership, formations, presentation records | `content/france1940/*`, injected `FamilyRegistry` | Scenario resolution; future UI/render consumers |
| France 1940 weapon definitions and aliases | `content/france1940/weapons.js` | Family registry and legacy `WeaponCatalog` compatibility consumers |
| Legacy vehicle definitions | `VehicleCatalog` through the France 1940 family adapter | Scenario validation, Unit initialization, HUD labels |
| Individual infantry state and choices | `SoldierAgent`, `SoldierAI` | Infantry pose renderer, roster HUD |
| Vehicle crew, components, mounts, ammo, damage events | `Unit`, `VehicleSystems` | Combat telemetry, damage report |
| Static movement collision and bridge routing | `StaticCollisionWorld`, plain terrain collider records | `Unit`, `SoldierAgent`, terrain height adapter |
| Building topology, occupancy, damage, collapse, consequences | `simulation/buildings/*` | Building interaction, collision, spotting, ballistics, renderer |
| Infantry building orders and portal transit | `BuildingInteractionSystem` | Unit movement, combat eligibility, roster HUD |
| Authored building meshes and damage presentation | `world/buildings/*`, descriptor data | Three.js scene, LOD projection only |
| Projectile and armor resolution | `CombatSystem`, `BallisticsSystem` | Telemetry, VFX, shot inspector |
| Renderer-neutral projectile impact mechanics | `simulation/ballistics/*` | `BallisticsSystem`, deterministic replay |
| Shot trajectory presentation | `world/debug/ShotTrajectoryOverlay` | `UIManager`, resolved telemetry only |
| Infantry meshes, weapons, grip/muzzle markers | `UnitFactory`, `world/infantry/*` | Soldier pose animation |
| Vehicle meshes, articulated markers, LOD | `UnitFactory`, `world/vehicles/*` | Unit animation, damage VFX |
| Vehicle blueprint source transforms | Vehicle model metadata, `VehicleOwnedRegistration` adapter | Calibration jig only |
| Vehicle armor collision and named impact plates | `VehicleCatalog`, `simulation/vehicles/VehicleArmorCollision` | Ballistics, telemetry, component damage |
| Vehicle internal crew/module collision, penetration paths, and direct HE effects | `VehicleCatalog`, `simulation/vehicles/VehicleInternalCollision`, `simulation/ballistics/VehicleExplosiveEffects`, `Unit`, `VehicleSystems` | Ballistics telemetry, shot inspector |
| Vehicle damage presentation | `VehicleDamageEffects` | Three.js scene only |
| Vehicle status projection | `VehicleStatusPresenter` | `UIManager` only |
| Individual observations and relayed contacts | `SpottingSystem`, `simulation/observation/*` | Targeting cues, visibility/contact presentation |
| Rendering backend and frame diagnostics | `engine/Renderer` | Composition root and browser diagnostics |

State flows one way:

```text
family registry / catalog data
    |
    v
Unit / SoldierAgent / VehicleSystems
    |
    +---> CombatSystem / BallisticsSystem ---> resolved telemetry
    |                                             |
    +---> plain damage report                     v
    |                                  VehicleDamageEffects
    v
VehicleStatusPresenter
    |
    v
UIManager
```

Armor deflection policy lives under `simulation/ballistics/` as plain numeric
state. `BallisticsSystem` supplies resolved plate geometry and penetration.
`ArmorTerminalEffects` converts the current penetration curve into a labeled
first-order ballistic-limit energy budget, then depletes that finite energy
through ordered internal intersections. It is pure, renderer-neutral, and does
not mutate units. This model covers intact rigid-projectile residual velocity;
projectile breakup, plug mass, and armor debris remain separate future work.
`VehicleExplosiveEffects` separately converts a direct HE detonation into
plain exterior, crew, and component damage intents. It never feeds HE into the
intact-projectile energy path.

`CombatSystem` owns projectile continuation, unique impact-event ordering,
presentation events, and capture/restore. A ricochet or intact perforator
remains the same authoritative projectile and may generate multiple
independently identified impacts. An intact perforator resumes beyond the true
far face of the entered armor volume only after its computed interior transit
time has elapsed; post-exit velocity, traveled distance, penetration count,
delay, and temporary same-volume ignore state survive rollback. Explosive
projectiles detonate at the first vehicle impact and never enter or resume the
intact-penetrator path. Direct vehicle HE uses the catalog's coarse
`armored_enclosed`, `unarmored_enclosed`, or `open` protection class. A stopped
burst on enclosed armor may damage only the struck exterior plate or named
track/mantlet component. An open, unarmored, or armor-penetrated compartment
queries nearby authored internal volumes and applies bounded distance falloff.
Crew and component selection is stable; only existing fire/ammunition
secondary-effect checks consume the injected deterministic RNG. The result,
including every intent and its approximation provenance, is deep-copied into
telemetry and capture/restore. VFX and the shot inspector consume those records
without changing flight or damage. Projectiles retain a bounded, sampled
world-space trajectory in capture/restore state. Each impact snapshots the path
up to that event; `ShotTrajectoryOverlay` projects a selected snapshot through
reusable line buffers and clears on rewind.

Vehicles with an authored `internalLayout` use a second renderer-neutral swept
query after a successful armor penetration. The external named armor plate
remains the authoritative entry point. `VehicleInternalCollision` casts inward
along the projectile direction, transforms immutable model-local crew/module
boxes with hull and turret yaw, and returns intersections ordered by distance
and stable volume ID. The terminal-energy resolver assigns every reached volume
an entry energy, deposited energy, exit energy, deterministic damage severity,
and approximation provenance; downstream volumes disappear once the round
stops. `VehicleArmorCollision` separately finds the true exit face of the same
armor volume. Closed hull, turret, and cupola shells declare
`exitArmorPolicy: opposite_face`, so an outgoing round must defeat the named far
plate. Single-resistance auxiliary envelopes such as a track run or mantlet
declare `exitArmorPolicy: none`; their entry resistance is charged once and
their far geometric boundary adds no duplicate armor demand. A penetrator that
falls below its continuation threshold deposits the remaining terminal energy
at its stopping point and exposes zero residual energy.
`Unit` and `VehicleSystems` damage only reached crewmen and installed
components, aggregating duplicate component volumes before mutation. Vehicles
without an internal layout retain the labeled zone-weighted fallback.
For direct HE, `VehicleInternalCollision` also measures point-to-oriented-box
surface distance and returns stable radial candidates. This first blast model
is deliberately unoccluded: compartment partitions, local shielding, fragment
cones, pressure, explosive filler, and fuze behavior remain explicit future
work rather than hidden precision.
Per-vehicle records live under
`game/vehicleData/internalLayouts/` so one vehicle can be refined without
editing generic collision or damage code. All 14 current catalog vehicles own
separate layouts: SOMUA, Renault R35, Hotchkiss H39, AMC 35, Panhard 178,
Laffly S20TL, Char B1 bis, Panzer II, Panzer III, Panzer 35(t), Panzer 38(t),
Sd.Kfz. 231, Opel Blitz, and Panzer IV. Compartment bounds remain explicit
gameplay approximations; this slice does not claim projectile breakup or
behind-armor spall. A layout may reference only
components installed by `VehicleSystems`; visible but not yet simulated
armament, such as the Char B1 bis hull 75 mm, must not gain a nonfunctional
damage component through geometry data alone.

Rendering helpers may expose named markers and consume state. They must not
write combat outcomes back into simulation objects. UI presenters may summarize
state. They must not issue hidden state mutations.

Building state follows the same one-way rule:

```text
map building descriptor
          |
          v
BuildingSystem <--- CombatSystem / BallisticsSystem
      |                         |
      |                         `---> resolved hit telemetry
      +---> BuildingInteractionSystem ---> SoldierAgent location
      +---> current collision/LOS records
      `---> FrenchHouse visual projection
```

One authoritative descriptor defines sections, portals, floors, slots, firing
ports, and transforms. Ballistics, spotting, movement, occupancy, and rendering
must consume current state derived from that descriptor; none may infer
gameplay from rendered triangles. Ballistic/LOS openings and movement portals
remain separate policies: a window can pass sight and fire but never ordinary
movement, while a door crossing requires a reservation owned by
`BuildingInteractionSystem`.

Static-world movement collision intentionally uses bounded deterministic math
instead of a rigid-body dependency. Vehicles sweep a catalog-sized capsule
(a fixed-orientation chain of circles); soldiers sweep individual circles.
Both stop at the earliest stable-ID-sorted contact and project remaining motion
onto the contact tangent. This prevents wall and bridge tunneling even for a
large simulation delta while preserving useful movement along cover. Bridge
navigation is a plain crossing record, and bridge deck height is sampled
through the terrain movement-height adapter. `StaticCollisionWorld` also owns
the renderer-neutral visibility graph used to detour an entry formation around
intervening world obstacles. `BuildingInteractionSystem` separately owns the
target building's local footprint, door approach, reservation, and portal
route; composition may concatenate both routes but neither layer imports the
other. Dynamic suspension, wreck settling, and ragdolls remain separate bounded
candidates for a future physics evaluation.

## Responsibilities

| Area | Owns | Must not own |
| --- | --- | --- |
| Composition root | Construction, registrations, dependency injection, browser startup | Battle data, combat rules, mesh construction |
| Engine | Renderer, camera, scene adapters, audio, input primitives, asset loading | Factions, weapons, scenarios, victory rules |
| Simulation | Units, orders, WEGO clock, spotting, ballistics, damage, morale, support effects | Three.js objects, DOM nodes, France-specific catalogs |
| Scenario runtime | Loaded-session state, deterministic clock/RNG, save/restore, subsystem sequencing | Hard-coded Stonne or France 1940 records |
| Scenario loader | Validation and resolution of IDs through injected registries | Rendering, global registries, browser state |
| France 1940 content | Weapons, vehicles, formations, faction data, family-specific visuals | Runtime orchestration, map geometry, UI |
| Maps and scenarios | Terrain specification, zones, placements, side composition, objectives | Generic simulation algorithms or engine setup |
| UI and editor | HUD, minimap, controls, authoring workflows | Direct scene mutation or private simulation state |
| Assets | Stable logical IDs, files, loading metadata, procedural/external source choice | Gameplay behavior |

## Allowed import direction

An arrow means the source may import the target's public entry point.

```text
main.js / app
|---> scenario runtime ---> simulation
|          |-----------> engine
|          `-----------> scenario loader
|                              |---> scenario schema
|                              `---> injected registries
|---> UI / editor ----------> runtime facade
`---> registrations
       |---> scenarios ---> maps
       |       `-------> content IDs
       `---> content
              |---> simulation contracts
              `---> engine contracts / asset IDs

engine -----------> assets
maps -------------> asset IDs / scenario schema
simulation -------> shared math and data only
```

Rules:

1. `main.js` is the only module allowed to import every top-level area. Keep it
   declarative: register families and scenarios, construct `GameApp`, then start.
2. Lower layers never import `main.js`, `GameApp`, UI, editor, or a concrete
   scenario.
3. Simulation code does not import `three`, DOM APIs, engine modules, world mesh
   factories, or family catalogs. Pass plain records and narrow ports instead.
4. Generic engine code contains no battle, faction, vehicle, or weapon names.
5. Scenario definitions are data-first. They reference map, unit, vehicle,
   weapon, and asset IDs; the loader resolves those IDs through injected
   registries.
6. UI and editor code use the runtime facade and commands/events. They do not
   reach into scene internals or mutate unit arrays directly.
7. Each area exposes a small public entry point. Cross-area imports use that
   entry point rather than deep-importing implementation files.
8. Asset consumers use logical IDs. Only the asset service resolves URLs,
   generated geometry, caching, and fallback behavior.

## Ownership for independent work

| Workstream | Primary ownership | Integration-only files |
| --- | --- | --- |
| Engine/rendering | `src/engine/**` | `src/main.js`, global registration |
| Tactical simulation | `src/simulation/**` and focused tests | Runtime wiring |
| Building interaction adapter | `src/game/BuildingInteractionSystem.js`, interaction tests | `src/main.js`, command/UI wiring |
| Building presentation | `src/world/buildings/**`, visual tests | Terrain registration and runtime sync |
| Scenario runtime/loader | `src/scenario/**` | Concrete family registrations |
| France 1940 content | `src/content/france1940/**` | Global registries |
| Maps/scenarios | `src/maps/**`, `src/scenarios/**` | Runtime construction |
| UI/editor | `src/ui/**`, `src/editor/**`, related styles | Simulation internals |
| Assets | `src/assets/**` and external asset files | Content behavior |
| Integrator | `src/main.js`, `src/app/**`, registration assembly | Domain implementation |

High-fan-out files such as `src/main.js`, public barrels, and registration
assembly have one integrator owner at a time. Contributors add exports and
registration records within their owned area, then hand the small wiring change
to the integrator. Tests should mirror the owned boundary; cross-boundary tests
belong in `test/integration/`.

## Extension examples

| Change | Add or change | Avoid changing |
| --- | --- | --- |
| Add a France 1940 vehicle | Family vehicle data, family mesh factory, optional asset manifest entry, content tests | Simulation algorithms, `main.js` scenario setup |
| Add another France 1940 battle | One map specification, one scenario definition, registration entry, loader test | Renderer, combat systems, existing Stonne files |
| Add a new historical family | New `src/content/<family>/**` package and registrations | France 1940 package, generic runtime |
| Add a terrain visual feature | Generic engine adapter plus map-level parameters | Scenario unit rosters, UI |
| Add a HUD panel | UI component using a runtime query/event | Unit internals, concrete scenario data |
| Add an external model | Asset file and manifest record; content references its logical ID | Hard-coded URL in simulation or scenario files |

## Current legacy exceptions

These are tolerated migration inputs, not patterns to copy:

- `src/main.js` currently combines composition, browser lifecycle, deterministic
  RNG, simulation sequencing, and save/restore. The Stonne roster has moved to
  its scenario descriptor.
- `src/world/TerrainBuilder.js` combines Three.js terrain rendering, Stonne map
  authorship, and obstacle metadata. Setup-zone data and validation have moved
  out, but map geometry remains hard-coded.
- `src/game/Unit.js` imports `UnitFactory` and Three.js, combining mutable
  tactical state with scene and mesh ownership.
- Several `src/game/**` systems use Three.js vectors or scene objects directly.
  This includes commands, spotting, combat effects, support, ballistics, and
  soldier agents.
- `VehicleCatalog.js` still places France 1940 family data inside the nominally
  generic game layer. The family registration receives it as an explicit
  legacy adapter. `WeaponCatalog.js` remains only as a compatibility re-export;
  direct consumer injection has not replaced that shim yet.
- `src/world/UnitFactory.js` and `src/world/vehicles/**` combine content
  selection with procedural rendering. They are the source for the future
  `content/france1940/render/` boundary.
- `UIManager` reads catalog data and receives the full `Game` object;
  `MapEditor` also receives the full game and mutates scene state.
- `window.__CMBN_GAME__`, DOM data attributes, and direct DOM logging expose
  runtime internals for debugging and capture automation.
- No scenario registry, map data package, or asset manifest exists yet. A
  bounded family registry and scenario resolver exist, while presentation
  records, the vehicle catalog, and family visual factories still lack injected
  runtime consumers.

Do not block useful work solely to remove these exceptions. New code should use
the target boundary, while touched legacy code should move one dependency at a
time.

## Staged migration

1. **Stabilize contracts.** Continue the existing family-registry and scenario
   resolver foundation with a scenario schema, scenario registry, runtime
   facade, and boundary tests without changing visible behavior.
2. **Extract family data.** Faction, vehicle-affiliation, formation,
   presentation, and weapon records now live in `content/france1940/`. Move
   vehicle records next; keep temporary re-exports from legacy catalogs so
   existing callers continue to work.
3. **Extract Stonne data.** Move terrain parameters and deployment zones into
   `maps/france/stonne.js`; move forces and setup into
   `scenarios/france1940/stonne-1940.js`.
4. **Introduce the loader and runtime.** Resolve scenario IDs through injected
   registries, construct units from loaded records, and move RNG, step
   sequencing, and save/restore out of `main.js`.
5. **Separate state from presentation.** Split tactical unit/agent state from
   meshes and effects. Adapt Three.js vectors at the engine boundary and move
   family mesh factories under France 1940 content.
6. **Narrow UI and editor access.** Replace full-game references with runtime
   queries, commands, and events. Route map edits through map/scenario authoring
   services.
7. **Add the asset service.** Introduce logical IDs and a manifest before adding
   external media; keep procedural fallbacks deterministic.
8. **Remove shims.** Delete legacy re-exports and globals only after imports,
   focused tests, integration tests, and the production build confirm no
   remaining consumers.

Each stage must leave the application runnable. Prefer adapters and temporary
re-exports over a repository-wide move that forces unrelated work into one
commit.

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
|   |-- ApplicationPorts.js         # Explicit UI/editor query and command ports
|   |-- FactionRosterIndex.js       # Pure deterministic side scheduling views
|   `-- GameApp.js                  # Browser lifecycle and top-level facade
|-- engine/                         # Generic Three.js, camera, audio, input
|-- simulation/                     # Renderer-neutral tactical state and rules
|   |-- combat/
|   |   `-- FireControl.js          # Pure aim work and range estimation
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
|       |-- catalogPorts.js        # Read-only runtime catalog boundary
|       |-- assets/manifest.js     # Plain logical family asset records
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
|   `-- AssetManifest.js            # Generic validation and pack resolution
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
- `src/content/france1940/` now owns frozen faction, formation, presentation,
  weapon, vehicle, armor-shape, provenance, internal-layout, and logical asset
  records.
  Scenario equipment and radio records address stable formation-member IDs,
  not array positions.
- `src/content/france1940/weapons.js` owns the single frozen 26-record weapon
  map, default materialization, legacy display-name aliases, and lookup.
  `src/game/WeaponCatalog.js` remains a narrow strict-identity compatibility
  re-export for external and test callers.
- `src/content/france1940/vehicles.js` owns the single frozen 14-record vehicle
  map and every vehicle-owned internal-layout module.
  `src/game/VehicleCatalog.js` is a narrow strict-identity compatibility
  re-export. Generic line-of-fire armor math now lives under
  `src/simulation/ballistics/ArmorMath.js`.
- `src/content/france1940/catalogPorts.js` exposes frozen weapon and vehicle
  lookup ports over those exact registered records. Composition injects the
  ports through `ScenarioRuntime`; the loader validates family identity,
  canonical record identity, every ID lookup, and faction vehicle defaults
  before constructing any unit. `Unit`, `SoldierAgent`, `VehicleSystems`,
  `CombatSystem`, and `UIManager` consume those ports instead of importing
  France-specific catalogs. Projectile restore resolves a saved weapon through
  the restored attacker's port.
- `src/simulation/combat/FireControl.js` owns pure, renderer-neutral target-key,
  aim-time, aim-progress, tracking-retention, and deterministic range-estimate
  rules. Each `SoldierAgent`, vehicle main gun, and auxiliary mount owns its
  persistent fire-control state. `Unit` supplies crew, traverse, optics, and
  mount alignment; `GameApp` supplies retained targets plus actual fixed-step
  shooter motion; `CombatSystem` consumes the estimate for projectile holdover
  and dispersion and copies the inputs into telemetry. HUD presenters remain
  read-only. Capture/restore deep-copies this state, and partition/replay tests
  verify that render timing does not change aim work. Version 1 is explicitly a
  gameplay approximation: it has no historical reticle, optic, rangefinder,
  target-lead, stabilization, or crew-handoff records yet.
- `src/content/france1940/render/` owns faction-to-presentation binding plus
  infantry, structure, and vehicle mesh-factory registrations. Composition
  injects matching visual factories through `ScenarioRuntime` and `Unit` into
  generic `UnitFactory`; scenario loading validates exact registered
  presentation identity and rejects missing infantry, structure, or vehicle
  renderers before constructing any unit. Calibration and silhouette tools
  inject the vehicle registry directly.
- `src/assets/AssetManifest.js` validates and deeply freezes portable logical
  asset records, binds runtime providers outside those records, and composes
  immutable base/replacement packs. Replacement is explicit, ordered,
  family-scoped, kind-preserving, and dependency-validated; there is no global
  asset singleton.
- `src/content/france1940/assets/manifest.js` owns stable logical IDs for
  procedural unit/terrain surfaces, battlefield VFX, battlefield audio, and
  calibration reference media. Its renderer-side runtime pack binds
  deterministic procedural providers, while URL records remain portable data.
  Composition resolves those bindings into vehicle/unit factories, terrain
  surfaces, pooled combat and vehicle-damage effects, a weapon-aware audio
  event bank, and a family calibration-reference registry. Logical reference
  URLs load through `ExternalImageAssetService`, which deduplicates concurrent
  requests, retains pack identity, applies explicit missing-image policy, and
  owns cancellation, cached-image release, and blob-URL revocation. Tests
  replace the core pack and verify alternate providers and reference URLs reach
  live consumers.
- `src/app/GameApp.js` owns browser startup, system construction, scenario
  loading, the fixed-step loop, rollback hooks, interaction, and diagnostics
  behind one injected application boundary. It imports no concrete family,
  map, or scenario. Player faction, family/catalog/visual ports, map,
  structures, and scenario all arrive from composition.
- `src/app/FactionRosterIndex.js` builds immutable faction and opposition views
  in registered family order while retaining live unit insertion order. It is
  browser-free and rebuilt only when the runtime roster changes, keeping combat
  sequencing deterministic without per-step faction filtering.
- `src/app/ApplicationPorts.js` exposes frozen named UI queries, commands, and
  the building-move event subscription without leaking `GameApp`, `WegoManager`,
  `CommandSystem`, renderer objects, or mutable subsystem records to UI clients.
  A separate editor port limits authoring access to height queries, obstacle
  publication, scene-object insertion, and notifications.
- `UIManager`, `Minimap`, and `MapEditor` consume those ports. Faction flags and
  colors resolve through family presentation records, and minimap projection
  uses injected map dimensions instead of Stonne constants.
- `src/maps/MapDescriptor.js` defines and validates renderer-neutral, deeply
  frozen map records, including bounded surface recipes, material values,
  globally stable feature IDs, bridge/channel alignment, map extents, and
  deployment-zone bounds. `src/maps/france/stonne.js` owns the selected map
  extent, elevation waves, surfaces, river, bridge, wall runs, structure
  placement, foliage, and deployment zones.
- `src/scenario/DeploymentRules.js` validates complete unit footprints against
  injected setup-zone records.
- `src/scenarios/france1940/stonne1940.js` owns the Stonne roster, positions,
  startup selection, camera target, map/family IDs, and seed.
- `ScenarioRuntime` validates the selected map ID before constructing units and
  validates deployment against that map's zones.
- `TerrainBuilder` receives one map descriptor plus narrow structure visual
  adapters. It derives rendering, terrain height, collision, navigation, and
  setup-zone meshes from the same feature records without importing Stonne or
  a concrete building descriptor.
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
- `main.js` is now composition-only. It selects the scenario/map/family,
  constructs catalog, asset, visual, and structure adapters, declares the
  player faction, installs error handling, and constructs `GameApp`.

## Current vertical-slice seams

These seams are usable now, before the staged directory migration is complete:

| Concern | Authoritative owner | Read-only consumer |
| --- | --- | --- |
| Family identity, faction vehicle ownership, formations, presentation records | `content/france1940/*`, injected `FamilyRegistry` | Scenario resolution; future UI/render consumers |
| France 1940 weapon definitions and aliases | `content/france1940/weapons.js` | Injected `catalogPorts.weapons`; legacy compatibility re-export |
| France 1940 vehicle, armor, crew, mount, and internal-layout definitions | `content/france1940/vehicles.js`, `content/france1940/vehicleData/*` | Injected `catalogPorts.vehicles`; legacy compatibility re-export |
| Stonne terrain and placement records | `maps/france/stonne.js`, validated by `maps/MapDescriptor.js` | Scenario loader, `TerrainBuilder`, command/deployment systems |
| Individual infantry state and choices | `SoldierAgent`, `SoldierAI` | Infantry pose renderer, roster HUD |
| Weapon target acquisition, aim work, tracking, and range estimation | `simulation/combat/FireControl.js` plus per-soldier and per-mount state | `GameApp` target/motion inputs, `CombatSystem` holdover/telemetry, HUD presenters |
| Vehicle crew, components, mounts, ammo, damage events | `Unit`, `VehicleSystems` | Combat telemetry, damage report |
| Static movement collision and bridge routing | `StaticCollisionWorld`, plain terrain collider records | `Unit`, `SoldierAgent`, terrain height adapter |
| Building topology, occupancy, damage, collapse, consequences | `simulation/buildings/*` | Building interaction, collision, spotting, ballistics, renderer |
| Infantry building orders and portal transit | `BuildingInteractionSystem` | Unit movement, combat eligibility, roster HUD |
| Authored building meshes and damage presentation | `world/buildings/*`, descriptor data | Three.js scene, LOD projection only |
| Projectile and armor resolution | `CombatSystem`, `BallisticsSystem` | Telemetry, VFX, shot inspector |
| Renderer-neutral projectile impact mechanics | `simulation/ballistics/*` | `BallisticsSystem`, deterministic replay |
| Shot trajectory presentation | `world/debug/ShotTrajectoryOverlay` | `UIManager`, resolved telemetry only |
| Infantry body meshes, faction presentation, and bunker mesh | `content/france1940/render/*` | Injected `UnitFactory`, Soldier pose animation |
| Period infantry weapons and grip/muzzle markers | `content/france1940/render/France1940InfantryWeaponFactory.js` | Family infantry mesh factories |
| Family-neutral infantry pose solving | `world/infantry/InfantryPoseAnimator.js` | `SoldierAI` |
| Vehicle visual selection | `content/france1940/render/*` | Injected `UnitFactory`, calibration and silhouette tools |
| Logical asset identity and pack replacement | `assets/AssetManifest.js`, `content/france1940/assets/*` | Composition-bound family render providers |
| External image loading, cache, fallback, and ownership | `assets/ExternalImageAssetService.js` | Calibration-reference consumer; browser lifecycle only |
| Projectile, impact, explosion, and vehicle-damage VFX resources | `world/vfx/ProceduralBattlefieldVfxProvider.js`, family VFX asset binding | `CombatSystem`, `VehicleDamageEffects`; presentation only |
| Weapon, explosion, and UI audio event profiles | `content/france1940/audio/*`, family audio asset binding | Injected generic `SoundEngine`; presentation only |
| Browser lifecycle and faction scheduling | `app/GameApp.js`, `app/FactionRosterIndex.js` | Composition, scenario runtime, UI/editor clients |
| UI/editor application boundary | `app/ApplicationPorts.js` | `UIManager`, `Minimap`, `MapEditor` |
| Vehicle meshes, articulated markers, LOD | `world/vehicles/*` during staged source migration | Family visual registry, Unit animation, damage VFX |
| Vehicle blueprint source transforms and reference URLs | Vehicle model metadata, family asset manifest, calibration-reference registry, `VehicleOwnedRegistration` adapter | Calibration jig only |
| Vehicle armor collision and named impact plates | France 1940 vehicle content, `simulation/vehicles/VehicleArmorCollision` | Ballistics, telemetry, component damage |
| Vehicle internal crew/module collision, penetration paths, and direct HE effects | France 1940 vehicle content, `simulation/vehicles/VehicleInternalCollision`, `simulation/ballistics/VehicleExplosiveEffects`, `Unit`, `VehicleSystems` | Ballistics telemetry, shot inspector |
| Vehicle damage presentation | `VehicleDamageEffects` | Three.js scene only |
| Vehicle status projection | `VehicleStatusPresenter` | `UIManager` only |
| Individual observations and relayed contacts | `SpottingSystem`, `simulation/observation/*` | Targeting cues, visibility/contact presentation |
| Rendering backend and frame diagnostics | `engine/Renderer` | Composition root and browser diagnostics |

State flows one way:

```text
family registry / injected catalog ports
    |
    v
Unit / SoldierAgent / VehicleSystems
    |
    +---> FireControl ---> CombatSystem / BallisticsSystem ---> resolved telemetry
    |                           |                                  |
    +---> plain damage report   |                                  v
    |                           +-----------------------> VehicleDamageEffects
    v
VehicleStatusPresenter
    |
    v
UIManager
```

`GameApp` may feed a unit target into fire control only after
`SpottingSystem.canPrecisionTarget` confirms direct precision observation and
LOS/range remain valid. A still-valid target is retained to avoid artificial
per-step target switching. Relayed contacts remain useful presentation and
tactical cues but do not grant precision fire.

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
`content/france1940/vehicleData/internalLayouts/` so one vehicle can be refined without
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

- `src/app/GameApp.js` remains a high-fan-out integration class even though
  browser lifecycle has left `main.js` and UI/editor now consume explicit
  ports. Subsystem construction and orchestration can be split further without
  widening client access.
- `src/world/TerrainBuilder.js` still combines Three.js terrain presentation
  with plain collider publication, but Stonne authorship is now injected
  through `MapDescriptor` and family terrain materials arrive through a
  replaceable surface provider. Structure meshes remain temporary world-layer
  adapters selected by composition.
- `src/game/Unit.js` imports `UnitFactory` and Three.js, combining mutable
  tactical state with scene and mesh ownership.
- Several `src/game/**` systems use Three.js vectors or scene objects directly.
  This includes commands, spotting, combat effects, support, ballistics, and
  soldier agents.
- `VehicleCatalog.js` and `WeaponCatalog.js` remain strict-identity
  compatibility re-exports for external and test callers. Production
  composition injects family catalog ports. Generic `Unit` now requires a
  stable ID, faction, type, resolved infantry roster, catalog ports, and visual
  factories; it owns no France 1940 defaults.
- `src/world/UnitFactory.js` consumes injected infantry, structure, and vehicle
  factory maps. It owns only registry dispatch and a generic family-colored
  vehicle selection disc. France 1940 infantry-body and bunker construction now
  live under `content/france1940/render/`, alongside all six period infantry
  weapon visual contracts and rigs. Procedural vehicle modules/profiles still
  live under `src/world/vehicles/**` during staged migration.
- `UIManager` still renders live `Unit` records supplied through its query port;
  immutable HUD view models are a future seam. `MapEditor` still authors
  temporary Three.js boxes, but publishes them only through its explicit
  editor port.
- `window.__CMBN_GAME__`, DOM data attributes, and direct DOM logging expose
  runtime internals for debugging and capture automation.
- No scenario registry exists yet. Logical asset manifests and replacement
  resolution now cover vehicle surfaces, both infantry mesh models, and the
  MG 34 bunker plus ground, water, bridge, masonry, foliage, battlefield VFX,
  battlefield audio, and calibration-reference media. External image loading,
  ownership, and fallback policy now cover calibration references; external
  Three.js models/textures and decoded audio still lack equivalent lifecycle
  coverage.

Do not block useful work solely to remove these exceptions. New code should use
the target boundary, while touched legacy code should move one dependency at a
time.

## Staged migration

1. **Stabilize contracts.** Continue the existing family-registry and scenario
   resolver foundation with a scenario schema, scenario registry, runtime
   facade, and boundary tests without changing visible behavior.
2. **Extract family data.** Faction, formation, presentation, weapon, vehicle,
   armor-shape, provenance, internal-layout, and vehicle visual-registration
   records now live in `content/france1940/`. Injected strict-identity catalog
   ports serve production consumers. Temporary catalog re-exports remain for
   external and test imports, while all `Unit` construction now receives
   explicit catalog and visual dependencies.
3. **Extract Stonne data.** Terrain parameters, surfaces, features, structures,
   foliage, and deployment zones now live in `maps/france/stonne.js`; forces
   and setup live in `scenarios/france1940/stonne1940.js`.
4. **Introduce the loader and runtime.** Scenario IDs now resolve through
   injected registries, units construct from loaded records, and browser
   lifecycle, RNG, fixed-step sequencing, and save/restore now live behind
   `GameApp`. Next split its UI/editor-facing surface into narrow ports.
5. **Separate state from presentation.** Split tactical unit/agent state from
   meshes and effects. Adapt Three.js vectors at the engine boundary. France
   1940 infantry-body, bunker, period infantry-weapon, and factory-registration
   ownership has moved under family content; vehicle geometry/profiles remain
   staged world-layer migrations.
6. **Narrow UI and editor access.** Replace full-game references with runtime
   queries, commands, and events. Route map edits through map/scenario authoring
   services.
7. **Add the asset service.** The renderer-neutral manifest, provider binding,
   explicit replacement resolver, vehicle-surface consumer, infantry mesh
   providers, bunker mesh provider, terrain-surface provider, battlefield-VFX
   provider, battlefield-audio provider, and replaceable
   calibration-reference registry now exist. A bounded external-image loader
   owns calibration URL caching, fallback, and disposal. Extend that same
   boundary to external models, textures, and decoded audio while keeping
   procedural fallbacks deterministic.
8. **Remove shims.** Delete legacy re-exports and globals only after imports,
   focused tests, integration tests, and the production build confirm no
   remaining consumers.

Each stage must leave the application runnable. Prefer adapters and temporary
re-exports over a repository-wide move that forces unrelated work into one
commit.

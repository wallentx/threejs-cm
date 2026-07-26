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
|   |-- loadScenario.js             # Validates and resolves scenario data
|   |-- schema.js                   # Stable data contracts
|   `-- registries.js               # Registry types, not family registrations
|-- content/
|   `-- france1940/
|       |-- index.js                # Family registration surface
|       |-- weapons.js
|       |-- vehicles.js
|       |-- formations.js
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

- `src/scenario/ScenarioRuntime.js` validates and instantiates plain scenario
  records without knowing Stonne.
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
- `src/world/VehicleDamageEffects.js` reads resolved damage and impact telemetry
  to render bounded fire, smoke, sparks, blast, scorch, and disabled-gun cues.
  It never decides damage.
- `src/ui/VehicleStatusPresenter.js` converts plain vehicle snapshots into HUD
  view data. `UIManager` renders that view without becoming simulation state.
- `main.js` selects a scenario and composes the runtime. It no longer contains
  the Stonne order of battle.

## Current vertical-slice seams

These seams are usable now, before the staged directory migration is complete:

| Concern | Authoritative owner | Read-only consumer |
| --- | --- | --- |
| Weapon and vehicle definitions | `WeaponCatalog`, `VehicleCatalog` | Unit initialization, HUD labels |
| Individual infantry state and choices | `SoldierAgent`, `SoldierAI` | Infantry pose renderer, roster HUD |
| Vehicle crew, components, mounts, ammo, damage events | `Unit`, `VehicleSystems` | Combat telemetry, damage report |
| Static movement collision and bridge routing | `StaticCollisionWorld`, plain terrain collider records | `Unit`, `SoldierAgent`, terrain height adapter |
| Projectile and armor resolution | `CombatSystem`, `BallisticsSystem` | Telemetry, VFX, shot inspector |
| Infantry meshes, weapons, grip/muzzle markers | `UnitFactory`, `world/infantry/*` | Soldier pose animation |
| Vehicle meshes, articulated markers, LOD | `UnitFactory`, `world/vehicles/*` | Unit animation, damage VFX |
| Vehicle damage presentation | `VehicleDamageEffects` | Three.js scene only |
| Vehicle status projection | `VehicleStatusPresenter` | `UIManager` only |
| Individual observations and relayed contacts | `SpottingSystem`, `simulation/observation/*` | Targeting cues, visibility/contact presentation |

State flows one way:

```text
catalog data
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

Rendering helpers may expose named markers and consume state. They must not
write combat outcomes back into simulation objects. UI presenters may summarize
state. They must not issue hidden state mutations.

Static-world movement collision intentionally uses bounded deterministic math
instead of a rigid-body dependency. Vehicles sweep a catalog-sized capsule
(a fixed-orientation chain of circles); soldiers sweep individual circles.
Both stop at the earliest stable-ID-sorted contact and project remaining motion
onto the contact tangent. This prevents wall and bridge tunneling even for a
large simulation delta while preserving useful movement along cover. Bridge
navigation is a plain crossing record, and bridge deck height is sampled
through the terrain movement-height adapter. Dynamic suspension, wreck
settling, and ragdolls remain separate bounded candidates for a future physics
evaluation.

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
- `VehicleCatalog.js` and `WeaponCatalog.js` place France 1940 family data inside
  the nominally generic game layer.
- `src/world/UnitFactory.js` and `src/world/vehicles/**` combine content
  selection with procedural rendering. They are the source for the future
  `content/france1940/render/` boundary.
- `UIManager` reads catalog data and receives the full `Game` object;
  `MapEditor` also receives the full game and mutates scene state.
- `window.__CMBN_GAME__`, DOM data attributes, and direct DOM logging expose
  runtime internals for debugging and capture automation.
- No scenario registry, map data package, content registry, or asset manifest
  exists yet. A bounded scenario runtime/loader now exists.

Do not block useful work solely to remove these exceptions. New code should use
the target boundary, while touched legacy code should move one dependency at a
time.

## Staged migration

1. **Stabilize contracts.** Add scenario schema, registry interfaces, runtime
   facade, and boundary tests without changing visible behavior.
2. **Extract family data.** Move weapon, vehicle, and formation records into
   `content/france1940/`. Keep temporary re-exports from legacy catalogs so
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

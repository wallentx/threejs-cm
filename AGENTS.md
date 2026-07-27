# Repository Agent Instructions

## Project goal

Build a deterministic, browser-based 1940 tactical combat simulation inspired by Combat Mission's Pixeltruppen model.

Combat Mission parity is a direction, not a claim. Prefer a smaller mechanic that is genuinely simulated over a broad visual placeholder.

## Start every task here

1. Read `TODO.md`.
2. Inspect the live implementation related to the selected item.
3. Choose one bounded item or one cohesive vertical slice.
4. Preserve unrelated work and existing behavior.
5. Update `TODO.md` after validation.

Do not commit or push unless the user asks.

## Antigravity and fast-agent quality gate

`HANDOFF.md` is the scope contract for Antigravity. It is not a backlog.

- Work on one authorized packet only. Stop when that packet is complete.
- Files, behaviors, and TODO items not listed in the packet are out of scope.
- Do not start the next attractive task, perform a broad cleanup, or "finish"
  adjacent systems without a new packet.
- Do not edit `AGENTS.md` or broaden `HANDOFF.md`. Only the coordinating agent
  defines policy and scope. A packet may permit updating its results section.
- Treat high-fan-out composition files, public registries, shared catalogs,
  and package configuration as integration-owned unless the packet explicitly
  lists the exact file and permitted change.
- Do not create, switch, or push branches. Do not commit. Leave integration and
  history management to the coordinating agent.

Required work order:

1. Read this file, `TODO.md`, `HANDOFF.md`, and any architecture document named
   by the packet.
2. Run the packet's focused baseline before editing. Record any pre-existing
   failure instead of hiding it.
3. Inspect current producers, consumers, capture/restore paths, tests, and
   disposal or ownership paths for the selected seam.
4. Make the smallest cohesive change inside the allowed files.
5. Add behavioral tests that would have failed before the change.
6. Run focused tests, full `npm test`, `npm run build`, and
   `git diff --check`. Perform the required browser check when runtime code was
   touched.
7. Update `TODO.md` conservatively and fill in the packet results. Then stop
   for review.

Quality rules:

- Passing syntax, a source-string assertion, a screenshot, or a rough visual
  impression does not prove simulation behavior.
- Never make a test pass by deleting it, skipping it, weakening an invariant,
  broadening a tolerance without measured evidence, or merely changing the
  expected value to match a regression.
- Never replace behavioral coverage with grep/source-text coverage when the
  behavior can be exercised through a public API.
- Never mark an unchecked parent complete while any clause remains. Add one
  indented completed slice and preserve explicit remaining work.
- Never claim a command passed unless it ran after the final edit. Report exact
  commands, test counts, failures, build warnings, and runtime status.
- Never describe a GPU/device-loss, missing browser, or bridge timeout as a
  successful runtime check. Record it as an environment blocker.
- A diagnostic must read the real authoritative mechanism. A control that
  changes only a label, mock, or disconnected debug state is counterproductive.
- Do not use a compatibility adapter as the new canonical owner. Do not copy a
  catalog, scenario coordinate, model dimension, asset ID, or family default
  into a generic layer.
- Do not add placeholder behavior under a production name. Label first-order
  approximations in code, telemetry, tests, and TODO text.

Dirty-worktree rules:

- Assume every existing modification and untracked file belongs to the user or
  another worker.
- Before editing, inspect `git status --short --branch` and the diff for every
  allowed file.
- Preserve unrelated edits. Never reset, revert, overwrite, format, rename, or
  delete work outside packet scope.
- Do not touch user reference images or generated comparison artifacts unless
  the packet names each file.
- If an allowed file contains overlapping work that cannot be preserved, stop
  and report the conflict.

Required handoff report:

- Scope completed and scope deliberately left incomplete.
- Files changed, grouped by data, simulation, rendering, UI, tests, and docs.
- Authoritative state or ownership changed.
- Focused test command and result.
- Full test command and exact result.
- Build command and result, including warnings.
- `git diff --check` result.
- Browser URL, mode, backend, `data-game-status`, and console errors, or the
  exact environment blocker.
- Remaining risks, approximations, and recommended review points.

## TODO protocol

- `[ ]` means planned or incomplete.
- `[x]` means implemented and validated.
- `~~strikethrough~~` means intentionally dropped, with a reason.
- A rough pass does not automatically complete a broad item.
- For partial work, keep the parent unchecked and add an indented completed sub-item:

```markdown
- [ ] Add internal vehicle modules.
  - [x] Rough pass: engine and track damage states.
  - [ ] Add transmission, fuel, ammunition racks, optics, and gun breech.
```

- Split oversized items when that makes remaining work explicit.
- Do not strike an item merely because it is difficult.
- Add newly agreed work to `TODO.md`; do not silently expand scope.

## Core simulation invariants

### Individual ownership

- Every infantryman owns health, suppression, movement, stance, target, weapon, magazine, reserve ammunition, reload state, and firing state.
- Dead or incapacitated soldiers cannot observe, move, reload, or fire.
- Removing one soldier removes that soldier's firepower. Never compensate with unit-level "magic" shots.
- Vehicle crewmen own roles and health. Gunner loss disables firing; loader loss prevents future reloads; driver loss prevents movement unless a modeled replacement takes over.
- Shared UI summaries may report state but must never become authoritative simulation state.

### Fire and damage

- Every shot starts at the firing weapon's modeled muzzle marker.
- Visual tracers are downstream evidence of a simulated projectile. They must not determine hits.
- Do not reintroduce preselected `willHit` results or target-proximity damage.
- Projectile flight uses scene metres and simulation seconds.
- Resolve hits through swept collision so fast projectiles cannot tunnel.
- Armor results must use impact location, nominal thickness, impact angle, projectile velocity, and ammunition type.
- Crew, module, suppression, and visual damage must follow the resolved impact result.

### Determinism and rollback

- WEGO and realtime must use the same `simulateStep` mechanics.
- Use the game's injected deterministic RNG for simulation. Do not use `Math.random()`, wall-clock time, or frame count for combat outcomes.
- New persistent simulation fields must be included in capture and restore paths.
- Rewinding and replaying from the same seed and orders must produce the same outcome.
- Keep simulation frame-rate independent. Use fixed or bounded substeps for fast motion.

### Buildings

- Keep topology, floors, portals, slots, section health, breaches, collapse,
  rubble, and occupant consequences renderer-neutral under
  `src/simulation/buildings/`.
- `BuildingInteractionSystem` owns individual reservations, approach,
  door/stair transit, occupied firing positions, exit, and casualty cleanup.
  Ordinary unit movement must not bypass those transitions.
- Separate aperture policies by purpose. Windows may pass sight and fire but
  never movement. Door movement requires an authorized building transition.
- Building meshes consume authoritative state. They do not decide collision,
  line of sight, penetration, collapse, or occupant damage.
- Keep route ownership split: `StaticCollisionWorld` handles intervening world
  obstacles, while `BuildingInteractionSystem` handles the target building's
  local footprint, door/stair route, and reservations. Compose these paths at
  the application boundary; do not make either domain import the other.
- Ballistics, spotting, movement, and rendering must derive current building
  state from the same descriptor and stable section/portal IDs.
- Capture and restore building state, individual building locations,
  reservations, transit progress, damage, breaches, collapse, and events.
- Test damage followed by restore; intact meshes, collision, LOS, occupancy,
  and portal state must all return.

## Historical data

- Put canonical France 1940 weapon data in
  `src/content/france1940/weapons.js`.
- Put canonical France 1940 vehicle crew, armor, armament, communications, and
  provenance data in `src/content/france1940/vehicles.js`; put large
  vehicle-owned shapes and internal layouts under
  `src/content/france1940/vehicleData/`.
- `src/game/WeaponCatalog.js` and `src/game/VehicleCatalog.js` are narrow
  compatibility re-exports. Never add records, fallbacks, or divergent values
  there.
- Prefer primary manuals, official museums, and archival military publications.
- Record whether a value is historical, inferred, or a gameplay approximation.
- Do not invent precision. A documented range or labeled approximation is better than an unsupported exact number.
- Keep ammunition type, caliber, projectile mass, muzzle velocity, rate of fire, feed capacity, reload time, carried ammunition, penetration, and explosive effect separate.

## Three.js model contract

- `+Y` is up, `+Z` is forward, vehicle right is `-X`, vehicle left is `+X`,
  and dimensions use metres.
- Reuse `src/world/WorldScale.js` and `TerrainScale.js`; do not add hidden
  per-model scale multipliers or duplicate physical constants.
- Do not repair handedness with a negative root scale or runtime mirror. Author
  the correct side, preserve outward winding, and keep asymmetric weapons,
  visors, hatches, rifle actions, and infantry grips historically handed.
- Model identity must survive silhouette-only viewing.
- Vehicle dimensions and defining features belong in one named data table or metadata object.
- `UnitFactory` dispatches injected factories. Do not put a new vehicle
  constructor, historical dimensions, or faction switch there.
- Edit an authored vehicle in its owning model module. Do not use
  `VehicleModelEnhancer` or a generic post-process to overwrite calibrated
  hull, turret, running-gear, or asymmetric features.
- Articulated parts must be named and exposed through `userData` when simulation or animation controls them.
- Weapon meshes require a muzzle marker. Vehicle guns require turret and barrel references.
- New detail meshes must participate in LOD:
  - `core`: required authored silhouette
  - `medium`: mid-distance geometry
  - `high`: close detail
  - `proxy`: far model
  - `ui`: selection and diagnostic geometry
- Every detailed unit needs a viable far proxy.
- Vehicle surfaces use explicit slots through `VehicleMaterialLibrary`; keep
  detailed UV density metre-driven and far proxies on their cheaper map policy.
- Do not solve fidelity by leaving all geometry active at every distance.
- Preserve shadows, material ownership, and resource disposal.
- Model changes need evidence at side, front, and top where sources exist:
  exact rigid envelope, ground contact, major mechanical datums, silhouette,
  outward winding, marker alignment, and all four runtime LOD tiers. Never add
  close detail that disappears into an incorrect medium/core silhouette.
- Track proxies must preserve open running-gear identity. Do not replace tracks
  with opaque black slabs.

## Animation and AI

- Animation must reflect state: moving, aiming, firing, recoil, reloading, pinned, wounded, casualty, turret traverse, and damaged mobility.
- Do not animate weapons independently from their simulated firing state.
- Infantry movement remains individual even when following a squad formation.
- Prefer explainable tactical decisions with inspectable state over random wandering.
- Cover choice, threat response, spacing, bounds, and withdrawal should be testable separately.

## UI and controls

- Maintain both WEGO and realtime modes.
- Realtime runs continuously and permits orders while running.
- WEGO supports command/action phases, deterministic rewind, seeking, and additional orders after every turn.
- Command tools must be cancellable.
- Selection must be clearable through visible controls plus Escape/right-click/empty-ground interaction.
- Core mode and command controls must remain available on mobile. Do not hide them with `.hide-mobile`.
- Do not restore the permanent right-side camera-control strip.
- Do not add authentication, access tokens, cloud services, or external dashboards to run the local game.
- Panels declared layout-stable must retain their grid footprint when selection
  content is empty. Clear stale controls, make the panel `inert` and
  `aria-disabled`, hide internal content, then restore content and interactivity
  after reselection. Explicitly conditional panels may opt out. Cover the
  selected -> empty -> selected transition in UI tests.

## Dependencies

- Three.js renders; game modules own tactics, ballistics, armor, and damage.
- Browser rendering uses Three.js r185 `WebGPURenderer` through the exact
  `three` -> `three/webgpu` Vite alias, with its direct WebGL 2 fallback.
  Initialize it explicitly before the game loop. Keep the active backend
  visible in diagnostics.
- New custom renderer effects must use TSL/node materials and current WebGPU
  post-processing APIs. Do not add `ShaderMaterial`, `RawShaderMaterial`, or
  `onBeforeCompile` paths that silently bind the game to WebGL.
- ammo.js is not a weapon-ballistics system.
- "Raven SDK" means Rapier. Do not add a wrapper based only on a Three.js
  example or addon.
- Keep deterministic static-world collision game-side. Evaluate direct
  deterministic Rapier only for a bounded dynamic need such as suspension,
  wreck settling, or ragdolls, stepped by the authoritative fixed simulation
  loop and covered by replay tests.
- Do not add a dependency when a small deterministic game-side system is clearer and cheaper.
- Explain and validate any new runtime dependency before marking its TODO item complete.

## Code-change discipline

- Preserve the existing ES-module architecture.
- Read `docs/ARCHITECTURE.md` before cross-cutting changes.
- Keep `src/main.js` as the composition root; do not add battle rosters, map
  coordinates, weapon tables, vehicle tables, or mesh construction there.
- Put generic scenario validation and instantiation in `src/scenario/`.
- Put concrete battle records in `src/scenarios/<family>/` as plain data with
  no Three.js, DOM, runtime, or renderer imports.
- Generic engine, simulation, and world code must receive concrete scenario
  and family data through arguments or registries. Do not import a concrete
  scenario from a lower layer.
- Treat high-fan-out composition files and public registries as
  integration-owned files. Parallel workers should own separate layer folders
  and leave small wiring changes for one integrator.
- Avoid broad rewrites for isolated TODO items.
- Keep family data, deterministic simulation, Three.js presentation, DOM/UI,
  and tests in separate modules. Do not make one convenience module own all
  layers.
- Keep simulation logic out of rendering-only helpers.
- Keep renderer/browser imports out of `src/simulation/` and plain content
  records. UI summaries and mesh `userData` never become simulation authority.
- Do not use `Math.random()`, `Date.now()`, `performance.now()`, animation-frame
  count, unordered collection traversal, or GPU results for authoritative
  outcomes. Presentation may use nondeterminism only when it cannot feed back
  into simulation, telemetry, replay, or tests.
- New persistent fields require deep capture/restore coverage and a replay or
  frame-partition test. New target references require stable IDs, not retained
  object-only identity.
- Preserve real projectile, ammunition, crew, component, and muzzle ownership.
  Do not introduce aggregate unit fire, target-proximity damage, preselected
  hit flags, or visual tracers that decide outcomes.
- Avoid per-frame geometry/material creation and unbounded hot-loop allocation.
- Avoid per-shot audio-node leaks, unbounded telemetry arrays, repeated loader
  work, and duplicated GPU resources. Pool or bound transient effects and
  dispose explicit owners.
- Dispose removed Three.js resources.
- Preserve low-tier operation and mobile layouts.
- Keep diagnostics meaningful; a debug control must affect the real mechanism.
- Do not add dependencies, authentication, access tokens, cloud services, or
  external dashboards without explicit user approval and a validated need.

## Definition of done

An item is complete only when relevant parts below are satisfied:

1. Authoritative simulation state exists.
2. Rendering and UI expose that state without replacing it.
3. WEGO capture/restore includes new persistent state.
4. Realtime and WEGO both still work.
5. Focused automated tests cover the mechanic and its failure cases.
6. `npm test` passes.
7. `npm run build` passes.
8. `git diff --check` passes.
9. Browser runtime reaches `data-game-status="ready"` for affected UI/runtime work.
10. `TODO.md` accurately records completed, partial, remaining, or dropped scope.

The current production bundle-size warning is known. Do not treat it as a build failure, but do not worsen it casually.

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

## Historical data

- Put weapon data in `src/game/WeaponCatalog.js`.
- Put vehicle crew, armor, and armament data in `src/game/VehicleCatalog.js`.
- Prefer primary manuals, official museums, and archival military publications.
- Record whether a value is historical, inferred, or a gameplay approximation.
- Do not invent precision. A documented range or labeled approximation is better than an unsupported exact number.
- Keep ammunition type, caliber, projectile mass, muzzle velocity, rate of fire, feed capacity, reload time, carried ammunition, penetration, and explosive effect separate.

## Three.js model contract

- `+Y` is up, `+Z` is forward, and dimensions use metres.
- Model identity must survive silhouette-only viewing.
- Vehicle dimensions and defining features belong in one named data table or metadata object.
- Articulated parts must be named and exposed through `userData` when simulation or animation controls them.
- Weapon meshes require a muzzle marker. Vehicle guns require turret and barrel references.
- New detail meshes must participate in LOD:
  - `core`: required authored silhouette
  - `medium`: mid-distance geometry
  - `high`: close detail
  - `proxy`: far model
  - `ui`: selection and diagnostic geometry
- Every detailed unit needs a viable far proxy.
- Do not solve fidelity by leaving all geometry active at every distance.
- Preserve shadows, material ownership, and resource disposal.

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

## Dependencies

- Three.js renders; game modules own tactics, ballistics, armor, and damage.
- ammo.js is not a weapon-ballistics system.
- Consider ammo.js only for a bounded rigid-body need such as suspension, collision response, wrecks, or ragdolls.
- Do not add a dependency when a small deterministic game-side system is clearer and cheaper.
- Explain and validate any new runtime dependency before marking its TODO item complete.

## Code-change discipline

- Preserve the existing ES-module architecture.
- Avoid broad rewrites for isolated TODO items.
- Keep simulation logic out of rendering-only helpers.
- Avoid per-frame geometry/material creation and unbounded hot-loop allocation.
- Dispose removed Three.js resources.
- Preserve low-tier operation and mobile layouts.
- Keep diagnostics meaningful; a debug control must affect the real mechanism.

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


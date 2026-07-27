---
name: threejs-cm-simulation-slice
description: Implement or revise a deterministic gameplay mechanic in the threejs-cm tactical simulation. Use for infantry AI, spotting, movement, ballistics, armor, crew, vehicle components, buildings, morale, weapons, WEGO, realtime, rollback, or any feature that must cross authoritative state, presentation, UI, and behavioral tests.
---

# Three.js CM simulation slice

## Establish authority

1. Confirm repository root and read `AGENTS.md`, `TODO.md`, and
   `docs/ARCHITECTURE.md`.
2. Inspect dirty state and the selected mechanic's producers, consumers,
   capture/restore path, rendering projection, UI projection, tests, and
   ownership/disposal path.
3. Choose one bounded mechanic or cohesive vertical slice. Preserve explicit
   remaining work under an unchecked TODO parent.
4. Write down authoritative owner and stable IDs before editing.

Never allow mesh state, UI text, tracers, sounds, telemetry, or GPU output to
decide simulation results.

## Design deterministic state

Define plain renderer-neutral state and transitions:

- use injected deterministic RNG only;
- use simulation seconds and fixed/bounded substeps;
- use stable IDs for targets, crew, components, buildings, portals, weapons,
  projectiles, and events;
- keep collection traversal ordered;
- avoid wall clock, `Math.random()`, animation frames, and object-only identity;
- bound persistent histories and transient allocations;
- include every persistent field in deep capture and restore.

For individual actors, preserve individual ownership. Dead or incapacitated
actors cannot observe, move, reload, or fire. Removing one actor removes that
actor's contribution.

For fire and damage, begin at modeled muzzle, simulate projectile flight, use
swept collision, and derive armor, internal, crew, module, suppression, and
visual results from resolved impacts.

## Implement by layer

Follow this order:

```text
family content/data
        |
        v
renderer-neutral authoritative state and transition
        |
        +--> capture/restore and deterministic replay
        |
        +--> rendering/VFX/audio projection
        |
        `--> read-only UI/telemetry projection
```

- Put France 1940 facts under `src/content/france1940/`.
- Put generic mechanics under the appropriate `src/simulation/` domain.
- Compose cross-domain systems at application/runtime boundary.
- Keep Three.js and DOM imports out of content and simulation.
- Keep scenario instances as plain data.
- Dispose presentation resources without altering authoritative state.

Do not create compatibility adapters as new owners or copy catalogs into
generic layers.

## Test behavior

Add tests that fail before implementation and exercise public behavior:

- success, rejection, casualty, disabled-role, and exhausted-ammunition cases;
- fixed-step/frame-partition invariance;
- capture, mutate, restore, and replay equivalence;
- stable ordering under reordered inputs;
- realtime and WEGO use of same mechanic;
- rendering/UI projection without authority;
- bounded event/resource behavior when relevant.

Avoid source-string tests when public behavior can be exercised. Never update
expected results merely to match a regression.

## Validate and report

Run focused tests, `npm test`, `npm run build`, and `git diff --check` after
final edit. Perform browser validation for runtime/UI changes.

Report:

- authoritative owner and new persistent fields;
- capture/restore changes;
- deterministic inputs and ordering;
- presentation/UI consumers;
- exact tests and results;
- approximations and remaining TODO work;
- browser backend/status or exact blocker.

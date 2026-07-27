---
name: threejs-cm-runtime-debug
description: Diagnose and validate the live threejs-cm browser runtime, Three.js scene, WebGPU renderer, WebGL fallback, memory, performance, materials, or visual output. Use when asked to run the game, inspect localhost, verify data-game-status, use threejs-devtools-mcp, capture screenshots, locate scene objects, investigate choppiness, or debug renderer initialization.
---

# Three.js CM runtime debug

## Establish live target

1. Confirm repository root and read `AGENTS.md`, `TODO.md`, and affected runtime
   architecture.
2. Inspect status before editing.
3. Check `http://127.0.0.1:5173/` before starting another server.
4. If absent and user wants game running, start repository dev command on port
   5173 and keep process/session identity.
5. Confirm HTTP response before browser claims.

Do not add authentication, tokens, cloud services, or permanent debug UI.

## Validate browser runtime

Record:

- URL and viewport;
- `document.body.dataset.gameStatus`;
- `document.body.dataset.gameError` when present;
- active renderer backend and fallback status from live diagnostics;
- console errors and warnings;
- selected mode and scenario;
- scene object or feature under inspection.

Required success is `data-game-status="ready"` in a real browser. Loading,
error, device loss, missing GPU, missing browser tab, or bridge timeout is not
success.

## Use Three.js devtools

Prefer this sequence:

1. Point proxy to port 5173.
2. Capture console before mutating debug state.
3. Search scene by stable object name or semantic `userData`.
4. Inspect scene tree only to depth needed.
5. Capture normal and annotated screenshots.
6. Take performance snapshot for draw calls, triangles, instances, and object
   counts.
7. Run disposal/memory check for hidden geometry, orphaned resources, and
   unbounded growth.
8. Use bounding boxes or temporary highlights for a named object.
9. Disable temporary overlays/highlights after inspection.

Treat MCP timeout as missing browser attachment. Do not repeatedly call timed
out tools and describe silence as scene health.

## Diagnose from evidence

Use live evidence to narrow source:

- renderer init/fallback: renderer facade and backend diagnostics;
- missing object: scenario -> visual registry -> unit factory -> scene;
- wrong material: asset binding -> material pack -> mesh slots;
- wrong LOD: camera distance -> tier selection -> mesh visibility;
- memory/choppiness: per-frame allocations, audio voices, loaders, pooled VFX,
  duplicate geometry/material/texture ownership, and disposal;
- visual geometry: stable names, world transforms, bounds, winding, and
  blueprint evidence.

Headless Chromium on Termux may fail GPU context creation. Report exact error,
then use connected real browser or devtools proxy; never treat headless failure
as application regression without corroboration.

## Change discipline

Make runtime edits only when user asks for a fix. Keep diagnostics connected to
real mechanism. Avoid permanent overlays, WebGL-only shader paths, duplicate
render loops, and per-frame resource creation.

After a fix, run focused tests, `npm test`, `npm run build`,
`git diff --check`, then repeat live check. Report known bundle warning
separately from runtime failure.

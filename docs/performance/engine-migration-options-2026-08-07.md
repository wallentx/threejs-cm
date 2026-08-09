# Rendering and Engine Migration Options

Date evaluated: 2026-08-07

Candidates: Babylon.js, PlayCanvas, Bevy, Fyrox, and Rend3

## Executive conclusion

Do not migrate this project for performance alone.

The measured 252-soldier stress case was dominated by deterministic line of
sight, spotting, and precision-targeting work rather than rendering. Switching
from WebGL2 to WebGPU barely changed realtime performance, while removing 84%
of draw calls and 92% of submitted triangles improved realtime performance by
only 11%. Later algorithmic optimizations produced much larger gains.

The lowest-risk direction is to retain Three.js and continue measured
optimization. If a replacement engine is still desired for strategic reasons,
Babylon.js is the lowest-risk complete alternative and PlayCanvas is the best
candidate for a focused web-renderer bake-off. Bevy has the highest theoretical
ceiling, but only as part of a much larger Rust and possibly native-platform
rewrite. Fyrox and Rend3 are poor fits for the current browser-first project.

See the repository's [recorded performance profile](../../TODO.md#optimizations),
[current priorities](../../TODO.md#current-priorities), and
[architecture boundaries](../ARCHITECTURE.md#implemented-foundation).

## Current-project evidence

At the time of this evaluation, the repository contained approximately:

- 80,027 lines of source JavaScript.
- 59 directly Three.js-coupled source files containing 42,839 lines.
- 104 Three.js-coupled test files.
- 15,021 lines in the renderer-neutral `src/simulation/` layer.
- 14,311 lines in `src/game/`, some of which still interact with Three.js.

The existing architecture already separates much authoritative simulation and
content data from presentation. That makes a JavaScript renderer migration
possible without discarding everything. It does not make the rendering work
small: all procedural vehicle and infantry factories, terrain presentation,
materials, picking, LOD, camera handling, debug overlays, calibration tools,
TSL effects, and Three-VFX integration would still need conversion.

The most important recorded runtime observations are:

1. The default 16-unit battle held 60 FPS under both WebGL2 and experimental
   native WebGPU.
2. The 56-unit, 252-soldier stress scene measured 17.4 FPS while paused but only
   1.7 FPS realtime on WebGL2 and 1.6 FPS realtime on WebGPU.
3. Far LOD removed 84% of draw calls and 92% of triangles but improved realtime
   performance by only 11%.
4. Oriented-box LOS, spotting, and precision targeting represented 55.3% of CPU
   self time in that profile.
5. Output-neutral broadphases, indexing, and deterministic scheduling later
   eliminated orders of magnitude more authoritative work than a renderer swap
   could address.

These observations mean that a renderer migration could improve paused scenes,
camera movement, mobile rendering, and visually denser battles. It is unlikely
to solve high-unit realtime simulation performance by itself.

## Estimate assumptions

The estimates below are planning ranges, not measured benchmark results.

- "Whole-game benefit" means improvement in total frame time for the current
  high-unit realtime workload after reaching equivalent feature parity.
- "Rendering-bound benefit" means improvement when simulation is paused or
  cheap and graphics submission or GPU time dominates.
- Engineer-month estimates assume one experienced engineer working full time,
  preserving deterministic WEGO/realtime behavior, browser support, tests,
  visual features, debug tooling, and asset ownership.
- Stabilization includes browser compatibility, mobile behavior, regression
  coverage, performance measurement, and visual parity. It does not include
  unrelated new gameplay features.

| Candidate | Likely whole-game benefit | Rendering-bound benefit | Migration estimate | Assessment |
| --- | ---: | ---: | ---: | --- |
| Babylon.js | 0-10% | 10-30% | 6-10 engineer-months | Best low-risk alternative |
| PlayCanvas | 0-15% | 15-40% | 6-11 engineer-months | Best renderer bake-off candidate |
| Bevy | 20-60% CPU frame-time reduction only after a full Rust port | 0-25% in-browser; potentially more on native platforms | 16-28 engineer-months | Strategic Rust/native rewrite only |
| Fyrox | Possibly slower browser rendering; Rust simulation could help separately | -25% to +10% | 16-28 engineer-months | Poor browser fit |
| Rend3 | Indeterminate; little whole-game benefit by itself | Theoretical 0-30% | 20-36+ engineer-months | Reject as a project foundation |

## Babylon.js

Babylon.js would be the least disruptive complete replacement. It remains a
JavaScript/TypeScript engine, works with a local npm and Vite workflow, and can
coexist naturally with the current DOM HUD. It maintains WebGPU and WebGL side
by side, supports Node Material and compute on WebGPU, and provides mature
scene, asset, debugging, and optimization tools.

Potential benefits:

- Thin instances could reduce infantry, vegetation, track-link, and repeated
  static-prop submission overhead.
- Active-mesh and material freezing could reduce per-frame work in mostly
  static battlefield scenes.
- Built-in octrees, asset tooling, inspector support, particles, and engine
  diagnostics could replace some custom presentation infrastructure.
- The existing JavaScript simulation, content records, DOM UI, Vite build, and
  most application ports could remain in place.

Costs and disadvantages:

- Three.js geometry, scene graph, matrix, raycasting, material, animation, LOD,
  resource-disposal, and renderer APIs would all need conversion.
- Three.js TSL materials and `vanilla-vfx` are not portable to Babylon.js.
- Procedural vehicle factories and silhouette/calibration tools depend heavily
  on Three.js geometry and traversal semantics.
- Babylon's engine conventions would overlap with systems that this project
  intentionally keeps authoritative and renderer-neutral.
- It would not accelerate LOS, targeting, armor, rollback, or AI unless those
  systems were separately optimized or rewritten.

Assessment: Babylon.js is the strongest alternative if Three.js itself becomes
an unacceptable maintenance burden. It is unlikely to make the stress
simulation dramatically faster.

Primary sources:

- [Babylon.js WebGPU support](https://doc.babylonjs.com/setup/support/webGPU/)
- [Babylon.js instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/instances/)
- [Babylon.js repository](https://github.com/BabylonJS/Babylon.js/)
- [Babylon.js license](https://github.com/BabylonJS/Babylon.js/blob/master/license.md)

## PlayCanvas

PlayCanvas has the strongest browser-rendering performance case in this group.
Its MIT-licensed engine can be installed and used locally without adopting the
hosted editor. It supports static and dynamic batching, hardware instancing,
multi-draw, compressed assets, particles, profiling, and automatic backend
selection.

Potential benefits:

- Multi-draw could reduce CPU submission overhead for the many sub-meshes in
  authored vehicles and compatible terrain.
- Built-in batching could reduce draw calls without manually merging every
  presentation mesh.
- The browser-first asset, texture-compression, profiling, and streaming paths
  are well aligned with the current deployment target.
- The existing DOM UI, JavaScript simulation, Vite workflow, and content data
  could remain.
- Its null rendering backend could help selected headless tests and tools.

Costs and disadvantages:

- PlayCanvas still labels WebGPU as beta; WebGL2 is its mature backend.
- Custom shader paths may require both WGSL and GLSL to preserve WebGPU and
  WebGL2 behavior.
- Dynamic batching has movement and instance-count constraints. Hardware
  instancing also does not automatically provide per-instance frustum culling.
- PlayCanvas's entity-component model does not naturally match the current
  authoritative `Unit` and individual-soldier ownership. It should remain a
  presentation layer rather than becoming simulation authority.
- Three.js procedural geometry, TSL VFX, picking, debug overlays, and
  calibration would still require extensive rewrites.

Assessment: PlayCanvas is the first candidate to benchmark if the specific
objective is fewer draw submissions. It may offer slightly more rendering
upside than Babylon.js, with greater WebGPU maturity risk.

Primary sources:

- [PlayCanvas engine](https://github.com/playcanvas/engine)
- [PlayCanvas graphics backends](https://developer.playcanvas.com/user-manual/graphics/)
- [PlayCanvas batching](https://developer.playcanvas.com/user-manual/graphics/advanced-rendering/batching/)
- [PlayCanvas hardware instancing](https://developer.playcanvas.com/user-manual/graphics/advanced-rendering/hardware-instancing/)
- [PlayCanvas multi-draw](https://developer.playcanvas.com/user-manual/graphics/advanced-rendering/multi-draw/)

## Bevy

Bevy is the only candidate with a plausible route to a large authoritative
simulation-performance improvement. Reaching that benefit requires moving the
simulation into optimized Rust and data-oriented storage; merely replacing the
renderer would not provide the main advantage.

Potential benefits:

- Rust removes JavaScript garbage-collection pressure and gives explicit
  control over data layouts and allocation.
- Dense ECS tables can make soldier, observation, projectile, and animation
  operations more cache-friendly and easier to vectorize.
- Bevy's retained render world, batching, sparse uploads, GPU-side work, and
  change detection target large dynamic scenes.
- Native builds could use stronger parallel and GPU-driven rendering paths
  while sharing much code with the browser build.
- Rust's type system could strengthen stable-ID, snapshot-schema, and authority
  boundaries if the port were carefully designed.

Costs and disadvantages:

- This would be a rewrite rather than a renderer migration.
- Bevy's standard task execution remains single-threaded on Wasm, so browser
  builds do not automatically receive native parallelism.
- A hybrid JavaScript-simulation plus Bevy-renderer design would introduce
  Wasm/JavaScript synchronization and copying without gaining Bevy's primary
  simulation advantage.
- The DOM HUD, editor, debug sandbox, asset services, procedural models, and
  large test suite would need bridges or rewrites.
- Browser download size, Rust compilation time, browser debugging, and exact
  snapshot compatibility would require new infrastructure.
- Bevy continues to warn about missing features, sparse documentation in some
  areas, and frequent breaking releases.

Assessment: Bevy has the highest theoretical ceiling, but it is sensible only
if the project deliberately becomes a Rust project with native desktop as an
important target. It is not a cost-effective renderer replacement.

Primary sources:

- [Bevy 0.19 release and renderer work](https://bevy.org/news/bevy-0-19/)
- [Bevy WebGPU overview](https://bevy.org/news/bevy-webgpu/)
- [Bevy task execution](https://docs.rs/bevy/latest/bevy/tasks/index.html)
- [Bevy stability warning](https://bevy.org/learn/quick-start/introduction/)
- [Bevy setup and Wasm optimization](https://bevy.org/learn/quick-start/getting-started/setup/)

## Fyrox

Fyrox is a feature-rich Rust engine with an integrated scene editor, UI,
physics, animation, audio, and WebAssembly exports. Version 1.0 was released in
March 2026. Its browser renderer is the decisive mismatch for this project:
Fyrox currently uses OpenGL ES 3.0/WebGL2 on WebAssembly rather than WebGPU.

Potential benefits:

- Rust simulation and explicit memory control.
- A complete integrated scene editor and asset pipeline.
- Built-in physics, animation, audio, UI, batching, and occlusion facilities.
- More traditional, complete game-engine tooling than Bevy currently offers.

Costs and disadvantages:

- The browser version would give up this project's current WebGPU path.
- Fyrox's scene graph, UI, assets, editor, and plugin model would encourage a
  near-total application rewrite.
- TSL/WebGPU VFX would need WebGL-compatible replacements.
- The Rust CPU advantage is not unique to Fyrox and could be tested with a
  bounded Rust/Wasm simulation module without replacing the renderer.
- Traditional engine physics and scene ownership could conflict with the
  project's deterministic game-side collision and rollback requirements.
- Fyrox's own documentation says its renderer predates `wgpu` and would be
  difficult to migrate; browser compute shaders are unavailable under WebGL2.

Assessment: Fyrox may be attractive for a new native Rust game, but it is a
poor match for this browser-first WebGPU project.

Primary sources:

- [Fyrox repository](https://github.com/FyroxEngine/Fyrox)
- [Fyrox 1.0 release](https://fyrox.rs/blog/post/fyrox-game-engine-1-0-0/)
- [Fyrox graphics server](https://fyrox-book.github.io/rendering/server.html)
- [Fyrox shader and compute limitations](https://fyrox-book.github.io/rendering/shaders.html)
- [Fyrox WebAssembly builds](https://fyrox-book.github.io/shipping/wasm.html)

## Rend3

Rend3 is a low-level Rust renderer built on `wgpu`, not a game engine. It
provided a render graph, PBR routines, shadows, tonemapping, glTF helpers,
GPU/CPU culling, buffer management, and skeletal-animation helpers.

Potential benefits:

- Direct control over `wgpu`, render graphs, GPU culling, buffers, and resource
  lifetime.
- Minimal interference with the project's gameplay architecture.
- Rust and native-platform potential.

Costs and disadvantages:

- The repository was archived on 2025-06-07 and is read-only.
- Rend3 explicitly is not an engine; input, audio, UI, scene ownership,
  particles, LOD, picking, assets, editor tooling, browser lifecycle, and debug
  infrastructure would need to be built or integrated separately.
- The latest published crate remains version 0.3.0.
- A maintained fork would eventually be required for `wgpu` and browser API
  changes.
- Rend3 offers no inherent improvement to authoritative gameplay simulation.
- Reproducing the current visual feature set would take longer than Bevy while
  yielding a less complete foundation.

Assessment: Rend3 is not a responsible foundation for this project.

Primary sources:

- [Archived Rend3 repository](https://github.com/BVE-Reborn/rend3)
- [Rend3 API](https://docs.rs/rend3/latest/rend3/)
- [Rend3 render routines](https://docs.rs/rend3-routine)

## Recommended direction

1. Keep Three.js and finish representative native-WebGPU, WebGL2, and mobile
   performance captures already tracked in `TODO.md`.
2. Continue spatial indexing and deterministic scheduling for spotting, LOS,
   targeting, and AI.
3. Batch the remaining compatible static terrain and reduce vehicle submission
   overhead without losing articulation or damage ownership.
4. If CPU performance remains limiting, prototype one hot deterministic kernel,
   such as batched LOS candidate rejection, in standalone Rust/Wasm. Benchmark
   it with bulk typed-array input to avoid per-object boundary overhead.
5. If an engine comparison remains desirable, build one recorded-transform
   bake-off in Babylon.js and PlayCanvas using 252 soldiers, all vehicle
   classes, shadows, vegetation, impact VFX, picking, and identical
   near/design/far cameras.

## Final ranking

```text
Current Three.js + targeted optimization
|
+-- Need a different web engine?
|   +-- Babylon.js: lowest migration risk
|   `-- PlayCanvas: strongest rendering experiment
|
+-- Willing to rewrite for Rust/native?
|   `-- Bevy
|
`-- Poor fits
    +-- Fyrox: browser renderer regression
    `-- Rend3: archived and not an engine
```

The next decision should be based on a measured Babylon.js/PlayCanvas rendering
prototype or a bounded Rust/Wasm simulation-kernel benchmark, not on an engine
feature list alone.

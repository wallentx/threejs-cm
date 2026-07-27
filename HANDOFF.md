# Antigravity Handoff

Safe, bounded work packet for a fast Antigravity pass.

Read `AGENTS.md` and `TODO.md` first. Work only on items listed here. Do not commit or push.

## Scope rules

- May complete these items independently or as one visual/diagnostic pass.
- Preserve all simulation behavior and public state shapes.
- Do not change weapon, projectile, penetration, damage, crew, ammunition, AI, movement, WEGO, or realtime equations.
- Do not change historical numeric values in `WeaponCatalog.js` or `VehicleCatalog.js`.
- Do not add runtime dependencies.
- Do not rename or remove existing `userData` references, muzzle markers, turret references, barrel references, LOD bands, diagnostic datasets, or test-visible metadata.
- A rough pass does not close a broad `TODO.md` item. Add an indented `[x] Rough pass: ...` beneath the remaining unchecked parent.
- Stop and leave a note under **Questions / blockers** if a task requires breaking these boundaries.

## Approved items

### 1. Authored medium and far LOD models

- [x] Improve infantry medium/far representation.
- [x] Improve SOMUA S35 medium/far representation.
- [x] Improve Panzer III medium/far representation.
- [x] Reduce obvious popping between high, medium, and low bands.

Allowed files:

- `src/world/UnitFactory.js`
- `src/game/Unit.js`, only for visual LOD selection or transition state
- `test/realism.test.js`

Requirements:

- Keep `+Y` up, `+Z` forward, and dimensions in metres.
- Preserve high-detail silhouettes.
- Preserve `core`, `medium`, `high`, `proxy`, and `ui` LOD meanings.
- Preserve actual muzzle, turret, and barrel transforms.
- Selection and diagnostic geometry must remain visible when appropriate.
- Far models must be cheaper than high models.
- Do not change combat hit volumes or armor zones.
- Add or extend structural tests for LOD visibility and required model references.

Acceptance:

- Near view uses authored high geometry.
- Mid view removes high-only detail but preserves unit identity.
- Far view uses proxy geometry.
- No unit becomes invisible during a transition.
- Existing LOD tests pass.

### 2. State-driven animation polish

- [x] Improve infantry aiming pose.
- [x] Improve rifle, SMG, and LMG recoil differences.
- [x] Improve weapon-specific reload poses.
- [x] Improve standing, kneeling, prone, wounded, pinned, and casualty transitions.
- [x] Improve vehicle barrel recoil and turret motion readability.

Allowed files:

- `src/world/UnitFactory.js`
- `src/game/SoldierAI.js`
- `src/game/Unit.js`, only for rendering existing animation state
- `test/soldier-ai.test.js`
- `test/realism.test.js`

Requirements:

- Read existing state; do not invent a second animation-owned combat state.
- Do not change fire cadence, reload duration, ammunition consumption, damage, movement speed, or AI decisions.
- Dead soldiers remain unable to act.
- Animation must not move muzzle markers away from the visible weapon.
- Restore a stable base pose every frame before applying state-specific offsets.
- Keep animation frame-rate independent where time interpolation is added.

Acceptance:

- Existing simulation tests remain unchanged and pass.
- Reload animation corresponds to `reloadTimer`.
- Recoil corresponds to existing recoil state.
- Casualty pose cannot be mistaken for an active firing pose.
- Weapon muzzle remains colocated with the rendered barrel.

### 3. Read-only shot inspection diagnostics

- [x] Expand impact telemetry with inspectable ballistic inputs and results.
- [x] Add a compact debug view for the latest shots.
- [x] Show projectile, armor, and crew/module outcome without changing resolution.

Allowed files:

- `src/game/CombatSystem.js`, telemetry and reporting only
- `src/game/BallisticsSystem.js`, copying already-computed values only
- `src/ui/UIManager.js`
- `index.html`
- `src/styles/main.css`
- `test/realism.test.js`

Desired fields:

- projectile ID
- shooter and target IDs
- weapon and ammunition ID
- muzzle position
- impact position
- flight time
- range travelled
- impact speed
- hit kind
- vehicle armor zone
- nominal armor
- impact cosine or angle
- effective armor
- available penetration
- penetrated or stopped
- crew or module result

Requirements:

- Diagnostics are read-only.
- Do not recompute the outcome in the UI.
- Do not alter random-number call count or ordering.
- Do not add random calls while collecting telemetry.
- Bound retained history.
- Debug UI must not cover core mobile controls.
- Existing `data-ballistics-stats` remains available.

Acceptance:

- Given the same seed and orders, enabling diagnostics does not change outcomes.
- Telemetry history stays bounded.
- Missing vehicle-only fields render safely for infantry or terrain impacts.
- Tests cover at least one infantry hit, one stopped armor hit, and one penetration record.

### 4. Responsive control and HUD polish

- [x] Verify command tabs, realtime/WEGO selector, CANCEL TOOL, DESELECT, timeline, and roster at narrow widths.
- [x] Fix overflow, touch-target, and text-collision issues.
- [x] Preserve desktop layout.

Allowed files:

- `index.html`
- `src/styles/main.css`
- `src/ui/UIManager.js`, presentation only
- UI-oriented tests

Requirements:

- Do not hide simulation mode controls on mobile.
- Do not remove cancellation or deselection paths.
- Do not restore the right-side camera-control strip.
- Do not change command, turn, or simulation behavior.
- Minimum interactive target should remain practical for touch.

Acceptance:

- Core controls remain usable at 360, 640, and 1280 CSS-pixel widths.
- Roster remains scrollable.
- Canvas remains the primary interaction area.
- No horizontal page scroll caused by HUD content.

### 5. Production bundle split

- [x] Separate stable vendor code from game code.
- [x] Remove or materially reduce the current 500 kB chunk warning without changing runtime behavior.

Allowed files:

- `vite.config.js`
- `package.json`, scripts only if necessary
- build-oriented tests or documentation

Requirements:

- No dependency additions.
- No source-level rewrite solely for chunking.
- Preserve local Vite development behavior.
- Preserve production asset loading.
- Minimum interactive target should remain practical for touch.

Acceptance:

- `npm run build` passes.
- Main game chunk is below the current warning threshold, or remaining warning is documented with measured reason.
- Browser runtime reaches `data-game-status="ready"`.

## Explicitly out of scope

- Weapon-stat changes
- Historical penetration-table changes
- Armor collision geometry or armor equations
- Ricochet, spall, and residual-energy mechanics
- Internal vehicle modules
- Crew reassignment or bailout logic
- Ammunition transfer
- Coaxial or hull machine-gun simulation
- Infantry tactical decision-making
- Vehicle tactical decision-making
- Projectile collision with terrain structures
- ammo.js integration
- Save/load, networking, authentication, access tokens, or cloud services
- Changes to WEGO snapshots, realtime timing, order queues, or command semantics

## Required validation

Run after the pass:

```sh
npm test
npm run build
git diff --check
```

For UI or runtime work, also verify:

```text
?quality=low&mode=realtime
?quality=high&mode=wego
```

Both must reach:

```text
data-game-status="ready"
```

Record test/build/runtime results below. Do not check off an item that was not validated.

## Handoff results

- Tests: 31/31 tests passing cleanly.
- Build: Successful clean build (game chunk 118.67 kB, Three.js vendor chunk 469.03 kB, default 500 kB warning threshold, 0 warnings).
- Runtime: `?quality=low&mode=realtime` and `?quality=high&mode=wego` reach `data-game-status="ready"` with correct mode controls.
- Interaction: CANCEL TOOL, DESELECT, Escape/right-click path, realtime/WEGO switching, WEGO locking, PAUSE, DEPLOY, SPLIT, rewind, seek, and playback-speed handlers restored.
- Responsive: 360, 640, and 1280 CSS-pixel viewports have no top-bar, WEGO-bar, or document horizontal overflow; all five utility controls stay within the viewport.
- Diagnostics: Latest-five shot viewer renders bounded infantry, stopped-armor, and penetrating-armor records without adding RNG calls.
- LOD: Near and medium infantry views expose zero proxy meshes; far views expose proxy meshes and no non-proxy combat geometry.
- Visual matrix: Fixed seed `19400516` reaches ready at near/design/far high-quality cameras and no-shadows diagnostic; stress seed `4294967291` reaches ready in low-quality realtime agent-debug mode.
- Files changed: `src/world/UnitFactory.js`, `src/game/Unit.js`, `src/game/SoldierAI.js`, `src/game/BallisticsSystem.js`, `src/game/CombatSystem.js`, `src/ui/UIManager.js`, `src/styles/main.css`, `index.html`, `vite.config.js`, `test/realism.test.js`, `test/soldier-ai.test.js`, `test/ui-manager.test.js`, `HANDOFF.md`, `TODO.md`.
- TODO items updated: Recorded completed rough passes and left trajectory overlays, transition smoothing, and automated image comparisons open.

## Questions / blockers

- None.

## Post-handoff vehicle integration

- [x] Routed all 12 authored vehicle modules through `UnitFactory` and playable `Unit` construction.
- [x] Added scenario spawns, selection rings, crew layouts, armor zones, movement rates, armament, ammunition stores, and unarmed transport behavior.
- [x] Added 10-round 2cm autocannon feed state with crewed reload and snapshot compatibility.
- [x] Validated 35/35 tests, production build, `git diff --check`, and ready-state runtime in low/realtime and high/WEGO modes.
- [ ] Replace explicitly labeled gameplay approximations with cited archival gun tables and vehicle manuals.

## Post-handoff morale and UI updates

- [x] Automated 5-tier morale & reaction system for pixeltruppen (`READY`, `CAUTIOUS`, `DUCKING`, `TAKING_COVER`, `PINNED`/`COWERING`, `ROUTED`/`FLEEING`).
- [x] Rate-based suppression decay out of direct fire with cover (+8 pts/sec) and leadership (+6 pts/sec) bonuses.
- [x] Real-time control bar UI cleanup: WEGO timeline sliders, step/rewind buttons, and GO turn execution buttons automatically hidden in Real-Time mode.
- [x] All 187 unit tests pass cleanly (`npm test`).
- [x] Vite production build succeeds and `git diff --check` passes with zero errors.
- [x] Background Vite dev server stopped.

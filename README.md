# Combat Mission: Battle of France 1940 - Three.js WebGL Proof of Concept

A 3D tactical simulation proof of concept built with Three.js and WebGL. It adapts Combat Mission's WEGO structure and interface conventions into a playable Stonne 1940 scenario, using the included **Combat Mission: Battle for Normandy** manual as a design reference rather than claiming a Normandy scenario.

![WebGL PoC](https://img.shields.org/badge/CMBN-WebGL%20PoC-green)

---

## Key Features & CMBN Mechanics

### 1. Game Modes & WEGO Engine
- **WEGO System (Turn-based Simultaneous Execution)**:
  - **Command Phase**: Plan waypoint paths, set target lines, configure facing vectors, and manage unit soft factors.
  - **60-Second Action Phase**: Execute orders simultaneously with real-time 3D ballistics and physics.
  - **VCR Controls**: State-backed timeline seeking, Play/Pause, 5s Step Forward/Back, turn rewind, and simulation-correct 2x/4x playback.
- **Real-Time Mode**: Instant execution of orders with spacebar pause.

### 2. Command & Control (C2) and Soft Factors
- **Leadership & Soft Factors**: Experience (Regular, Veteran, Crack), Morale (OK, Pinned, Shaken, Panic, Broken), Suppression meter (0-100), Fatigue (Ready, Tired, Exhausted), Leadership bonuses.
- **C2 Links**: Voice & Radio communication channels maintaining hierarchy between Platoon HQ and squads.
- **Autonomous Pixeltruppen**: Every infantryman is a `SoldierAgent` object that owns position, velocity, movement decisions, reaction delay, formation goal, target memory, facing, stance, suppression, numeric health, weapon cadence, and casualty state.
- **Individual Combat**: Each agent independently searches visible enemies, chooses a soldier target, aims, fires from its own position, consumes ammunition, takes damage, becomes wounded, or is killed. Squad orders remain the command layer.
- **Articulated 1940 Infantry**: French khaki/blue-grey and German feldgrau figures use separate gait limbs, period helmet profiles, web gear, packs, boots, rifles, SMGs, and light-machine-gun silhouettes.

### 3. Authentic Tactical Commands
- **Movement (F5)**: FAST (yellow sprint vector), QUICK (green tactical move), HUNT (orange cautious advance, stops on contact), MOVE (blue walk), REVERSE (red vehicle back-up), PAUSE (15s delay).
- **Combat (F6)**: TARGET, TARGET LIGHT, FACE, and CLEAR TARGET.
- **Special (F7)**: HIDE and DEPLOY WEAPON.
- **Admin (F8)**: SPLIT SQUAD creates a separate scout team with divided roster and ammunition.

### 4. 3D Stonne Battlefield & Obstacle Physics
- **Battlefield Terrain**: 3D heightfield map with a river crossing, farm fields, rolling hills, village structures, and setup zones.
- **SOMUA S35**: Dimensioned cast sectional hull, APX 1 CE one-man turret, 47mm SA 35, engine deck, suspension skirts, and nine road wheels per side.
- **Walls & Obstacles**: Stone walls and buildings participate in deterministic line-of-sight blocking.
- **Structures & Vegetation**: Normandy stone farmhouses, wooden barns, oak trees, pine trees, wooden fences, and bomb craters.

### 5. 3D Ballistics & Combat Engine
- **Tracers & Shells**: Visual 3D bullet tracers, 75mm tank shell trajectories, muzzle flashes, and dirt cloud explosions.
- **Armor State**: Vehicle component state is represented in the unit model; detailed penetration remains future work.
- **Suppression Mechanics**: Incoming fire increases unit suppression meter, forcing troops to drop prone or panic.

### 6. Off-Map Artillery & Air Support
- **Support Roster**: 81mm Mortars, 105mm Howitzers, and P-47 Thunderbolt air strikes.
- **Parameters**: Support-system code models spotters, mission weight, delay, radius, and repeated impacts; a complete call-for-fire UI remains future work.

### 7. authentic CMBN HUD & Controls
- **Camera System**: 9 Height Presets (`1` Ground Eye-Level to `9` Top-Down Overhead View), WASD/QE navigation, Orbit/Pan/Zoom.
- **HUD Panels**: Unit Info Panel, Squad Roster, Vehicle Damage Report, 4-Tab Command Panel with 3x3 relative button grid.
- **Tactical Minimap**: 2D canvas map with terrain contours, unit markers, and camera frustum.
- **Floating Icons**: 3D tactical unit badges with NATO/unit symbols and state indicators.
- **Experimental Map Editor**: The editor subsystem can place bocage and simple buildings; full editor controls and save/load remain future work.

---

## Running the PoC Locally

### Development Server
```bash
npm run dev
```

### Production Build
```bash
npm run build
```

### Tests
```bash
npm test
```

### Reproducible visual modes
Use query parameters to reproduce graphics checks:

- `seed=19400516` fixes simulation randomness.
- `camera=near|design|far` selects a camera bookmark.
- `quality=high|low` controls pixel ratio and shadows.
- `debug=final|no-shadows|no-fog|agents` isolates presentation systems or shows soldier-to-formation steering lines.

---

## References
- Combat Mission: Battle for Normandy Manual (Battlefront.com)

---
name: threejs-cm-vehicle-authoring
description: Author, refit, calibrate, or integrate vehicles in the threejs-cm tactical game from blueprint and historical evidence. Use for new vehicle bundles, model-fidelity work, wheel and track registration, hull or turret geometry, weapon markers, LOD construction, silhouette audits, runtime catalog integration, or calibration-tool changes in this repository.
---

# Three.js CM vehicle authoring

## Establish scope

1. Confirm repository root contains `AGENTS.md`, `TODO.md`, and
   `docs/ARCHITECTURE.md`. Stop if working elsewhere.
2. Read those files completely. Treat `AGENTS.md` as policy authority.
3. Inspect current status and diffs before touching dirty files.
4. Classify work:
   - **Refit:** preserve canonical identity and edit owning vehicle data/model.
   - **New vehicle:** build one complete bundle, then wire it through family
     registries at one integration point.
   - **Authoring tooling:** keep compiler and calibration code vehicle-neutral.
5. Add agreed remaining work to `TODO.md`; do not broaden task silently.

## Build evidence before geometry

Create or update vehicle-owned immutable data containing:

- stable vehicle and model IDs;
- rigid dimensions in metres and exact dimension policy;
- source URLs, local asset path when permitted, image dimensions, and SHA-256;
- side/front/top crops and independent pixel-to-metre registrations;
- ground, rigid envelope, wheel/support, turret-ring, gun-axis, and muzzle
  datums;
- component polygons or station/ring records;
- status for every value: historical, registered, inferred, or gameplay
  approximation;
- unresolved source conflicts and human-review state.

Never use the current mesh, track proxy, or regression baseline as historical
ground truth. Prefer source-space pixels plus published dimensions.

Use `src/content/france1940/vehicleData/RenaultD2AuthoringData.js` and
`docs/vehicle-authoring/renault-d2/` as workflow examples, not reusable D2
numbers.

## Author geometry

Maintain repository frame: `+Y` up, `+Z` forward, right `-X`, left `+X`.

- Produce closed outward-wound hull, turret, cupola, and plate geometry.
- Model asymmetric parts on correct authored side. Never repair handedness
  through negative root scale.
- Place gun and auxiliary weapon meshes from registered datums.
- Expose turret, barrel, main muzzle, auxiliary muzzle, proxy turret, proxy
  barrel, running gear, and animated components through stable `userData`.
- Keep main and auxiliary muzzle markers parented to actual moving mounts.
- Derive track shape from vehicle-owned sprocket, idler, road-wheel, and
  return-roller supports. Separate visible wheel radius from track contact
  radius when mechanically necessary.
- Keep rigid geometry inside exact envelope. Mark weapons, flexible aerials,
  and surface detail with correct envelope roles.
- Supply `high`, `medium`, `core`, and `proxy` tiers. Preserve identifying hull,
  turret, gun, and open running-gear silhouette at distance.
- Bind material slots through `VehicleMaterialLibrary`; do not create hidden
  scale fixes or activate every detail at every distance.

## Integrate one bundle

Keep owners separate:

```text
historical gameplay record  -> src/content/france1940/vehicles.js
large visual parameters     -> src/content/france1940/vehicleData/
internal layout             -> vehicleData/internalLayouts/
mesh construction           -> owning model module or generic injected compiler
visual profile              -> VehicleVisualProfiles
calibration/source asset    -> calibration records and family asset manifest
factory registration        -> content/france1940/render/
scenario presence           -> plain scenario data
```

Model crew roles, radio, ammunition, main gun, auxiliary mounts, armor,
movement, internal modules, and provenance. Ensure gunner, loader, driver,
radio, component damage, and individual ammunition ownership use existing
authoritative simulation paths.

Do not put concrete statistics or constructors into `UnitFactory`, generic
simulation, calibration compiler, or `main.js`.

## Validate

Run validation after final edits:

1. Vehicle-specific authoring and geometry tests.
2. Catalog, factory, visual-bundle, internal-layout, muzzle, LOD, and scenario
   integration tests.
3. Generate CPU side/front/top evidence for all four LODs.
4. Run silhouette audit to a temporary candidate first.
5. Update checked-in silhouette baseline only through explicit update command,
   only after exact envelope validation passes and shape change is intentional.
   A hash records current geometry; it never approves historical accuracy.
6. Run `npm test`, `npm run build`, and `git diff --check`.
7. For runtime changes, open the game in a real browser and record URL, renderer
   backend, `data-game-status`, console errors, scene presence, and screenshots.

Treat missing GPU, device loss, or devtools timeout as blocked browser
validation, never success.

## Report

State:

- vehicle/configuration represented;
- exact, registered, inferred, and approximate data;
- bundle owners and registries changed;
- scenario location;
- focused/full/build/diff results with exact counts;
- browser/backend result;
- remaining visual and historical review work.

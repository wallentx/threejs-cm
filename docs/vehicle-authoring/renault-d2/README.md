# Renault D2 blueprint-to-parametric authoring proof

Status: playable provisional France 1940 vehicle. Runtime integration proves
the bundle seam; it does not approve the shape. Every LLM-placed pixel, circle,
polygon, and inferred cross-section still requires human review.

This packet tests a maintainable version of:

```text
secondary five-view drawing
          |
          v
LLM view split + pixel landmarks + component markup
          |
          v
published rigid dimensions place each view in metre space
          |
          v
plain parametric vehicle definition
          |
          v
generic Three.js geometry compiler
          |
          +--> high / medium / core / proxy scene geometry
          +--> fixed side / front / top evidence
          +--> GLB / OBJ / STL
          |
          v
human overlay review and manual cleanup
```

It deliberately does not use a current game mesh as its reference. The source
drawing and published dimensions own the datums. Generated silhouette hashes
are change evidence only; matching a previous hash does not mean the shape is
historically correct.

## Result

The proof produces one data-driven Renault D2 model from a five-view sheet.
The model has:

- a sixteen-station hull loft;
- an independently placed five-ring turret loft;
- a four-ring faceted cupola instead of a generic dome;
- a source-shaped extruded mantlet;
- independently mounted main and coaxial guns with muzzle markers;
- fifteen road-wheel circles per side;
- front idler, rear drive sprocket, seven return rollers, and a
  support-derived quasi-static track path;
- source-shaped mudguards and suspension skirts;
- high, medium, core, and proxy LOD ownership;
- fixed CPU-rendered side, front, and top silhouettes;
- GLB, OBJ, and STL exports.

The compiler contains no Renault D2 identity or France 1940 catalog import.
`meshPrefix`, geometry, dimensions, source evidence, validation policy, and
semantic component data arrive through an injected definition. This makes the
compiler reusable for another vehicle bundle instead of turning Renault D2
numbers into generic defaults.

## Runtime integration

The Stonne scenario now spawns `RENAULT_D2` at the French setup line. Its
canonical family bundle owns:

- three crewmen: commander/gunner/loader, driver, and radio operator;
- provisional series-2 SA 35 AP/HE ammunition;
- independently crewed coaxial MAC 31 feed and rendered muzzle;
- coarse 40 mm armor zones and explicit model-local internal volumes;
- deterministic movement, damage, replay, material, and four-tier LOD paths;
- the checked-in blueprint source asset and human-review-pending registration.

Catalog ammunition split, movement rates, radio fit, internal volume placement,
and armor collision slopes remain labeled approximations. Gameplay inclusion
must not be read as historical or visual approval.

## Source records and confidence

| ID | Source | Used for | Confidence and limitation |
|---|---|---|---|
| `renault-d2-secondary-orthographic-sheet` | [The-Blueprints five-view PNG](https://www.the-blueprints.com/blueprints-depot/tanks/tanks-r/renault-d2-tourelle-apx-4.png) | side/front/top silhouette, wheel circles, hull/turret/component registration | Secondary illustration. No printed dimensions. Independent raster-axis scaling and human review required. |
| `shd-char-d2-archive-record` | [Service historique de la Defense archive record AA/206/4/H/2/31](https://www.servicehistorique.sga.defense.gouv.fr/ark/950463) | confirms surviving 1932 Char D2 technical fascicles | Primary archive catalog record, but the underlying plates were not available digitally in this pass. |
| `unabcc-renault-d2-technical-sheet` | [Renault D2 technical sheet](https://www.unabcc.org/app/download/8279653/Renault%2BD2%2B-%2BFiche%2Btechnique.pdf) | rigid envelope, hull height, running gear, crew, drive/idler location, no-tail configuration | Secondary compilation based on chars-francais.net. Use until primary manual measurements are transcribed. |

Local source image:
[renault-d2-tourelle-apx-4.png](../../../public/assets/blueprints/france1940/renault-d2-tourelle-apx-4.png)

```text
pixels: 1573 x 2133
SHA-256: 93cf038753a8510e80907e2bcadd267da7dc594ddba081c4619bd486a2cc19d9
```

The source filename calls the turret `APX-4`; the technical sheet calls the D2
turret an `APX 1`. The generated part is therefore described as a
source-sheet-constrained turret. The packet does not silently resolve that
historical conflict.

## Published dimensions

| Datum | Value | Current authority |
|---|---:|---|
| Rigid length | 5.460 m | secondary technical sheet |
| Rigid width | 2.220 m | secondary technical sheet |
| Rigid height | 2.670 m | secondary technical sheet |
| Hull height | 1.755 m | secondary technical sheet |
| Combat mass | 20 t | secondary technical sheet |
| Crew | 3 | secondary technical sheet |
| Road wheels | 15 per side | secondary technical sheet and drawing |
| Drive sprocket | rear | secondary technical sheet and drawing |
| Idler | front | secondary technical sheet and drawing |
| Trench tail | absent | secondary technical sheet |

The model uses the repository coordinate contract: `+Y` up, `+Z` forward,
vehicle right `-X`, and metres.

## LLM view split and registration

All source pixels below remain editable data in
`RenaultD2AuthoringData.js`. They are not hidden inside the compiler.

| View | Crop `(x, y, w, h)` px | Rigid pixel datums | Metre registration |
|---|---|---|---|
| Side | `(8, 64, 950, 506)` | front `x=14`, rear `x=949`, ground `y=561`, top `y=77` | length and height scaled independently |
| Opposite side | `(626, 432, 929, 497)` | review-only | asymmetric evidence; not accepted for metre registration |
| Front | `(182, 1162, 440, 505)` | right `x=222`, left `x=590`, ground `y=1654`, top `y=1194` | width and height scaled independently |
| Rear | `(1100, 1160, 433, 510)` | review-only | cooling/rear review; not accepted for metre registration |
| Top | `(396, 1734, 904, 395)` | front `x=408`, rear `x=1289`, right `y=1746`, left `y=2120` | length and width scaled independently |

Annotated review crops:

- [side](generated/blueprint-side.svg)
- [opposite side](generated/blueprint-oppositeSide.svg)
- [front](generated/blueprint-front.svg)
- [rear](generated/blueprint-rear.svg)
- [top](generated/blueprint-top.svg)

Color meanings:

| Color | Proposed component |
|---|---|
| orange | running gear, tracks, and mudguards |
| green | hull |
| blue | turret |
| yellow | mantlet and gun |
| purple | engine deck or cooling group |
| cyan circles | road wheels |
| red circles | idler and drive sprocket |
| violet circles | return rollers |
| red crosses | rigid and mechanical landmarks |

## Parametric ownership

```text
RenaultD2AuthoringData.js
|
|-- source records and image identity
|-- crop rectangles and per-view rigid transforms
|-- source-pixel landmarks, component polygons, and support circles
|-- published dimensions and explicit historical conflict
|-- metre-space hull stations and turret/cupola rings
|-- mantlet, gun, coax, mudguard, skirt, and detail parameters
|-- LOD policy and acceptance status
|
`--> ParametricVehicleCompiler.js
     |
     |-- validates injected schema and mechanical consistency
     |-- builds closed outward-wound lofts
     |-- builds semantic components and muzzle markers
     |-- reuses support-derived track geometry
     `-- emits one named Three.js hierarchy
```

Source-space evidence stays beside each derived datum. The compiler does not
run OpenCV, make historical decisions, or import the D2 bundle.

## Fixed-view evidence

High-LOD blueprint overlays:

- [side overlay](generated/overlay-side.svg)
- [front overlay](generated/overlay-front.svg)
- [top overlay](generated/overlay-top.svg)

Every LOD is also rendered without a GPU:

| LOD | Side | Front | Top |
|---|---|---|---|
| high | [SVG](generated/model-side-high.svg) | [SVG](generated/model-front-high.svg) | [SVG](generated/model-top-high.svg) |
| medium | [SVG](generated/model-side-medium.svg) | [SVG](generated/model-front-medium.svg) | [SVG](generated/model-top-medium.svg) |
| core | [SVG](generated/model-side-core.svg) | [SVG](generated/model-front-core.svg) | [SVG](generated/model-top-core.svg) |
| proxy | [SVG](generated/model-side-proxy.svg) | [SVG](generated/model-front-proxy.svg) | [SVG](generated/model-top-proxy.svg) |

The first visual review already caught and corrected three problems:

1. Unclipped source transforms leaked neighboring elevations into overlays.
2. The inferred hull was too wide in front/top views.
3. A generic hemispherical cupola did not follow the faceted drawing.

Remaining uncertainty:

- wheel and return-roller circles are LLM placements, not accepted human
  registrations;
- hidden hull belly and cross-sections are inferred between views;
- the suspension-skirt thickness and openings are approximations;
- turret variant and exact casting curvature remain unresolved;
- radiator, visor, antenna, hatch, and fastener depth is first-pass geometry;
- current quasi-static track mass and tension are renderer approximations;
- source copyright/redistribution terms require review before public release.

## Exported geometry

- [all LODs GLB](generated/renault-d2-all-lods.glb)
- [high LOD OBJ](generated/renault-d2-high.obj)
- [high LOD STL](generated/renault-d2-high.stl)
- [deterministic artifact manifest](generated/manifest.json)

Three.js has maintained GLTF, OBJ, and STL exporters, but no maintained FBX
exporter. GLB is the canonical interchange result. If FBX is required, import
the GLB into Blender and export FBX there; do not make a third-party FBX writer
a runtime game dependency.

Rebuild:

```sh
npm run author:renault-d2
```

Optional output directory:

```sh
node scripts/build-renault-d2-authoring.mjs --output "$TMPDIR/renault-d2"
```

The build verifies the source image SHA-256 before generating anything.

## What tests prove

`test/parametric-vehicle-authoring.test.js` exercises the compiler through its
public API. It checks:

- immutable source/dimension ownership;
- source image identity;
- an alternate injected vehicle identity, proving the compiler does not own
  Renault D2 names;
- schema rejection for inconsistent barrel and station datums;
- required semantic parts and all four LOD bands;
- positive closed winding for lofted parts;
- published envelope/ground contact within the explicit authoring tolerance;
- shared detailed/proxy track supports;
- independent main/coax mount sides and exact muzzle markers.

It does not assert that the generated geometry is correct because it matches
the current geometry. Shape acceptance remains a human review of source
registration and side/front/top overlays.

## Manual cleanup gate

Before production registration:

- [ ] Human-adjust every rigid landmark on side, front, and top.
- [ ] Human-adjust idler, sprocket, all road wheels, and return rollers.
- [ ] Review the opposite-side and rear crops for real asymmetry.
- [ ] Resolve APX 1 versus APX-4 from primary documentation.
- [ ] Trace hull, turret, mantlet, cupola, mudguard, and skirt polygons in every
      accepted view.
- [ ] Add or confirm vertex correspondence across views.
- [ ] Replace inferred hidden hull rings with primary section data if found.
- [ ] Review side/front/top high, core, and proxy overlays.
- [ ] Inspect normals, UV density, materials, shadow behavior, and disposal in
      the live WebGPU renderer.
- [ ] Add canonical vehicle stats, armor, crew, armament, availability, profile,
      calibration, and mesh-factory registration in one integration packet.
- [ ] Add simulation and replay tests before the D2 becomes playable.

## Wizard v2 boundary

The future browser wizard can sit above the same plain definition:

```text
Upload/source URL
  -> image identity and license/provenance review
  -> OpenCV line/whitespace proposal for view rectangles
  -> LLM semantic proposal
  -> human accepts/moves crops and rigid datums
  -> mobility choice: tracked / wheeled / half-track
  -> editable wheel circles and labels
  -> editable component polygons and cross-view vertex correspondence
  -> metre-space preview from the generic compiler
  -> fixed-view overlay/error report
  -> explicit export and review state
```

OpenCV should propose edges, circles, and image regions. It must not become the
authority for vehicle identity or measurements. The LLM should emit reviewable
data plus uncertainty, never directly mutate a production vehicle. Human edits
change the plain bundle; the same compiler and validation checks rebuild the
preview.

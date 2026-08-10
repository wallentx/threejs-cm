import * as THREE from 'three';
import {
  SOMUA_S35_COMMANDER_STATION
} from '../../content/france1940/vehicleData/CommanderStations.js';
import {
  SOMUA_S35_VISUAL_DATA
} from '../../content/france1940/vehicleData/SomuaS35VisualData.js';
import {
  createSomuaS35ReferenceAssemblyArrays,
  SOMUA_S35_REFERENCE_ASSEMBLY_SUMMARY,
  SOMUA_S35_REFERENCE_GUN_MUZZLE,
  SOMUA_S35_REFERENCE_REGISTRATION
} from '../../content/france1940/vehicleData/SomuaS35ReferenceGeometry.js';
import {
  SOMUA_S35_WEAPON_INSTALLATION as WEAPON_INSTALLATION
} from '../../game/vehicleData/SomuaS35Shape.js';
import { setVehicleMaterialSlot } from './VehicleMaterialLibrary.js';

const MODEL_ID = 'fr_somua';
const S35 = Object.freeze({
  length: 5.38,
  width: 2.12,
  height: 2.62,
  turretPivot: Object.freeze([0, 1.55, 0.55])
});

export const SOMUA_S35_BLUEPRINT_CALIBRATION = Object.freeze({
  version: 'somua-s35-glb-shell-closure-v5',
  coordinateFrame: '+Y up, +Z forward, -X vehicle right',
  variantScope: 'SOMUA S35, French service, 1940',
  rigidEnvelopeMeters: Object.freeze({
    length: S35.length,
    width: S35.width,
    height: S35.height
  }),
  sources: Object.freeze([
    Object.freeze({
      title: 'User-supplied SOMUA S35 four-elevation drawing',
      artifact: SOMUA_S35_VISUAL_DATA.blueprint.imageUrl,
      imageUrl: SOMUA_S35_VISUAL_DATA.blueprint.imageUrl,
      sha256: SOMUA_S35_VISUAL_DATA.blueprint.sha256,
      use: 'registered mechanical landmarks and independent dimensional review',
      quality: SOMUA_S35_VISUAL_DATA.blueprint.limitations
    }),
    Object.freeze({
      title: SOMUA_S35_REFERENCE_REGISTRATION.source.title,
      artifact: SOMUA_S35_REFERENCE_REGISTRATION.source.localPath,
      sha256: SOMUA_S35_REFERENCE_REGISTRATION.source.sha256,
      author: SOMUA_S35_REFERENCE_REGISTRATION.source.author,
      license: SOMUA_S35_REFERENCE_REGISTRATION.source.license,
      url: SOMUA_S35_REFERENCE_REGISTRATION.source.sourceUrl,
      use: 'complete production exterior topology, fittings, running gear, turret, and gun installation',
      quality: SOMUA_S35_REFERENCE_REGISTRATION.quality
    }),
    Object.freeze({
      title: 'Somua S 35 collection record',
      publisher: 'Musée des Blindés',
      url: 'https://museedesblindes.fr/les_chars/somua-s35/',
      use: 'official museum evidence for vehicle identity, armament, cast turret, and original closed cupola',
      quality: 'official survivor record; cupola was later modified by German forces'
    }),
    Object.freeze({
      title: 'TM 30-42, Handbook on the French Military Forces',
      publisher: 'United States War Department',
      url: 'https://www.govinfo.gov/content/pkg/GOVPUB-W-PURL-gpo119422/pdf/GOVPUB-W-PURL-gpo119422.pdf',
      use: 'period technical context and dimensional corroboration',
      quality: 'official wartime intelligence manual'
    })
  ]),
  imageRegistration: Object.freeze({
    sourceImagePixels: SOMUA_S35_VISUAL_DATA.blueprint.imagePixels,
    views: SOMUA_S35_VISUAL_DATA.blueprint.views,
    quality: SOMUA_S35_VISUAL_DATA.blueprint.registrationPolicy
  }),
  datums: Object.freeze({
    exact: Object.freeze({
      groundLineY: 0,
      hullRearZ: -S35.length * 0.5,
      hullFrontZ: S35.length * 0.5,
      rigidHalfWidth: S35.width * 0.5,
      rigidHeightY: S35.height,
      roadWheelsPerSide: 9,
      weaponIdentity: '47 mm SA 35'
    }),
    sourceRegistered: Object.freeze({
      sourceRigidBounds: SOMUA_S35_REFERENCE_REGISTRATION.source.rigidSourceBounds,
      scaleMetersPerSourceUnit:
        SOMUA_S35_REFERENCE_REGISTRATION.scaleMetersPerSourceUnit,
      turretPivot: S35.turretPivot,
      exteriorNodeCount:
        SOMUA_S35_REFERENCE_ASSEMBLY_SUMMARY.sourceExteriorNodeCount,
      quality:
        'complete non-interior GLB exterior registered to the published rigid envelope; source topology is deterministically reduced offline'
    }),
    registeredInferred: Object.freeze({
      quality:
        'source-owned hull and APX geometry are registered to the published envelope; simplified LOD topology remains renderer-owned'
    })
  }),
  allowedDivergences: Object.freeze([
    'embedded source textures are replaced by the project vehicle material library',
    'interior-only primitives are omitted because the runtime vehicle is externally viewed',
    'floating tools, tow-chain, net, canvas, dark turret insert, and layered vision-port meshes are omitted because they read as source defects after reduction; the source twin exhaust remains',
    'the primary hull and APX shell retain GLB source triangles and close each source boundary independently after any LOD reduction; no shared center-fan repair geometry is emitted',
    'small painted and door fittings are kept as a separately owned high-detail assembly so they cannot become hull armor or contaminate proxy topology',
    'retained open GLB fittings are reduced first and closed afterward so simplification cannot reopen their exterior faces',
    'remaining blinn4 fittings share the painted-armor material instead of retaining a visually inconsistent source finish',
    'offline LOD simplification reduces triangles without introducing substitute box geometry'
  ])
});

function signedVolume(geometry) {
  const position = geometry.attributes.position;
  const index = geometry.index;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let volume = 0;
  for (let offset = 0; offset < index.count; offset += 3) {
    a.fromBufferAttribute(position, index.getX(offset));
    b.fromBufferAttribute(position, index.getX(offset + 1));
    c.fromBufferAttribute(position, index.getX(offset + 2));
    volume += a.dot(b.clone().cross(c)) / 6;
  }
  return volume;
}

function geometryFromReferenceAssembly(assembly) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(assembly.positions, 3)
  );
  geometry.setIndex(assembly.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = `S35_${assembly.key}_Geometry`;
  const emittedTriangleCount = geometry.index.count / 3;
  geometry.userData = {
    sourceNodeNames: [...assembly.sourceNodeNames],
    referenceSourceNodeNames: [...assembly.sourceNodeNames],
    sourceParts: assembly.sourceParts.map(part => ({ ...part })),
    sourceMaterialNames: [...assembly.sourceMaterialNames],
    sourceTriangleCount: assembly.sourceTriangleCount,
    sourceVertexCount: assembly.sourceVertexCount,
    emittedTriangleCount,
    emittedVertexCount: geometry.attributes.position.count,
    windingRepair: assembly.windingRepair,
    sourceSha256: SOMUA_S35_REFERENCE_REGISTRATION.source.sha256,
    sourceLicense: SOMUA_S35_REFERENCE_REGISTRATION.source.license,
    registration: SOMUA_S35_REFERENCE_REGISTRATION,
    geometryProvenance:
      'GLB-derived exterior assembly with post-reduction boundary-loop closure',
    cleanArmorShell: false,
    signedVolumeCubicMeters: signedVolume(geometry)
  };
  return geometry;
}

function material(slot) {
  const definitions = {
    paint: ['#52613a', 0.80, 0.08, 'paint'],
    wheel: ['#59663c', 0.84, 0.10, 'paint'],
    track: ['#252a28', 0.91, 0.34, 'track'],
    metal: ['#333735', 0.56, 0.58, 'metal'],
    canvas: ['#716b4d', 0.94, 0.01, 'canvas'],
    wood: ['#665039', 0.88, 0.02, 'wood'],
    net: ['#343c2d', 0.93, 0.02, 'canvas']
  };
  const [color, roughness, metalness, vehicleSlot] = definitions[slot]
    ?? definitions.metal;
  return setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness
  }), vehicleSlot);
}

function createMaterials() {
  const materials = Object.fromEntries(
    ['paint', 'wheel', 'track', 'metal', 'canvas', 'wood', 'net']
      .map(slot => [slot, material(slot)])
  );
  materials.glass = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#81979a',
    roughness: 0.18,
    metalness: 0.08,
    transparent: true,
    opacity: 0.72
  }), 'metal');
  materials['light-white'] = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#e7ddbd',
    emissive: '#6b624d',
    emissiveIntensity: 0.22,
    roughness: 0.30
  }), 'metal');
  materials['light-red'] = setVehicleMaterialSlot(new THREE.MeshStandardMaterial({
    color: '#8a231b',
    emissive: '#3c0805',
    emissiveIntensity: 0.20,
    roughness: 0.36
  }), 'metal');
  return materials;
}

function assemblyName(assembly) {
  const named = {
    static_body_core_paint: 'S35_SourceExteriorHull',
    static_body_core_track: 'S35_SourceTracks',
    static_body_core_wheel: 'S35_SourceRunningGear',
    static_body_proxy_paint: 'S35_ProxyExteriorHull',
    static_body_proxy_track: 'S35_ProxyTracks',
    static_body_proxy_wheel: 'S35_ProxyRunningGear',
    static_bodyDetail_high_paint: 'S35_SourceExteriorDetails',
    static_engineDeck_core_paint: 'S35_SlopingEngineDeck',
    static_engineDeck_proxy_paint: 'S35_ProxySlopingEngineDeck',
    static_exhaust_core_metal: 'S35_TwinExhaust',
    static_exhaust_proxy_metal: 'S35_ProxyTwinExhaust',
    turret_body_core_paint: 'S35_APX1CE_TurretBody',
    turret_body_proxy_paint: 'S35_ProxyAPXTurret',
    turret_cupola_core_paint: 'S35_ClosedObservationCupola',
    turret_cupola_proxy_paint: 'S35_ProxyClosedObservationCupola',
    turret_cupolaRoof_core_paint: 'S35_ClosedCupolaRoof',
    turret_cupolaRoof_proxy_paint: 'S35_ProxyClosedCupolaRoof',
    turret_sideDoor_core_paint: 'S35_APX1CE_SideDoor',
    turret_sideDoor_proxy_paint: 'S35_ProxyAPX1CESideDoor',
    turret_rightPortOuter_core_paint: 'S35_APX1CE_RightPortOuter',
    turret_rightPortOuter_proxy_paint: 'S35_ProxyAPX1CERightPortOuter',
    turret_rightPortInset_medium_track: 'S35_APX1CE_RightPortInset',
    turret_rightPortGlass_high_glass: 'S35_APX1CE_RightPortGlass',
    turret_rightPortIndicator_medium_track: 'S35_APX1CE_RightVisionSlot',
    turret_leftPortOuter_core_paint: 'S35_APX1CE_LeftPortOuter',
    turret_leftPortOuter_proxy_paint: 'S35_ProxyAPX1CELeftPortOuter',
    turret_leftPortInset_medium_track: 'S35_APX1CE_LeftPortInset',
    turret_leftPortGlass_high_glass: 'S35_APX1CE_LeftPortGlass',
    turret_leftPortIndicator_medium_track: 'S35_APX1CE_LeftVisionSlot',
    turret_mantlet_core_paint: 'S35_SA35_Mantlet',
    turret_mantlet_proxy_paint: 'S35_ProxySA35Mantlet',
    turret_gun_core_paint: 'S35_SA35_Barrel',
    turret_gun_proxy_paint: 'S35_ProxySA35Barrel'
  };
  return named[assembly.key] ?? `S35_Source_${assembly.key}`;
}

function addAssembly(parent, assembly, materials) {
  const mesh = new THREE.Mesh(
    geometryFromReferenceAssembly(assembly),
    materials[assembly.materialSlot] ?? materials.metal
  );
  mesh.name = assemblyName(assembly);
  mesh.userData = {
    ...mesh.userData,
    lodBand: assembly.lodBand,
    sourceAssemblyKey: assembly.key,
    sourceNodeNames: [...mesh.geometry.userData.sourceNodeNames],
    referenceSourceNodeNames: [...assembly.sourceNodeNames],
    sourceMaterialNames: [...assembly.sourceMaterialNames],
    sourceMaterialSlot: assembly.materialSlot,
    articulation: assembly.articulation
  };
  if (assembly.lodBand === 'proxy') mesh.visible = false;
  if (
    assembly.key === 'static_body_high_canvas'
    || assembly.key === 'static_body_high_paint'
    || assembly.key === 'static_body_high_track'
  ) mesh.userData.envelopeRole = 'flexibleAttachment';
  if (assembly.articulation === 'gun') {
    mesh.userData.envelopeRole = 'weaponProjection';
    mesh.userData.weaponMountId = 'main';
    mesh.userData.weaponIdentity = '47 mm SA 35';
    mesh.userData.forwardAxis = '+Z';
    mesh.userData.restZ = 0;
  }
  if (assembly.articulation === 'mantlet') {
    mesh.userData.articulatedPart = 'gun-mantlet';
    mesh.userData.weaponMountId = 'main';
  }
  if (assembly.articulation === 'engineDeck') {
    mesh.userData.contactSurface = 'S35_SourceExteriorHull';
    mesh.userData.registeredOutlinePart = 'source-engine-deck';
  }
  if (assembly.articulation === 'cupola' || assembly.articulation === 'cupolaRoof') {
    mesh.userData.historicalState = 'original closed French cupola';
  }
  if (/sideDoor|Port/.test(assembly.articulation)) {
    mesh.userData.historicalState = 'closed';
    mesh.userData.articulatedPart = 'turret-aperture-closed';
  }
  mesh.castShadow = assembly.lodBand === 'core' || assembly.lodBand === 'proxy';
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function createSomuaS35Mesh() {
  const root = new THREE.Group();
  root.name = MODEL_ID;
  const materials = createMaterials();
  const turretGroup = new THREE.Group();
  turretGroup.name = 'Turret';
  turretGroup.position.set(...S35.turretPivot);
  root.add(turretGroup);

  const parts = new Map();
  for (const key of SOMUA_S35_REFERENCE_ASSEMBLY_SUMMARY.keys) {
    const assembly = createSomuaS35ReferenceAssemblyArrays(key);
    const parent = assembly.region === 'turret' ? turretGroup : root;
    parts.set(key, addAssembly(parent, assembly, materials));
  }
  const runtimeLodTriangles = { high: 0, proxy: 0 };
  for (const mesh of parts.values()) {
    const triangles = mesh.geometry.index.count / 3;
    if (mesh.userData.lodBand === 'proxy') runtimeLodTriangles.proxy += triangles;
    else runtimeLodTriangles.high += triangles;
  }

  const barrel = parts.get('turret_gun_core_paint');
  const proxyBarrel = parts.get('turret_gun_proxy_paint');
  const muzzle = new THREE.Object3D();
  muzzle.name = 'S35_SA35_Muzzle';
  muzzle.position.set(...SOMUA_S35_REFERENCE_GUN_MUZZLE);
  muzzle.userData.forwardAxis = '+Z';
  muzzle.userData.envelopeRole = 'weaponProjection';
  turretGroup.add(muzzle);

  const coaxMuzzle = new THREE.Object3D();
  coaxMuzzle.name = 'coax_muzzle';
  coaxMuzzle.position.set(
    WEAPON_INSTALLATION.coax.axisLocalX,
    WEAPON_INSTALLATION.coax.axisLocalY,
    WEAPON_INSTALLATION.coax.muzzleLocalZ
  );
  coaxMuzzle.userData = {
    weaponMountId: 'coax',
    forwardAxis: '+Z',
    envelopeRole: 'weaponProjection',
    mountSide: WEAPON_INSTALLATION.coax.mountSide,
    placementQuality: WEAPON_INSTALLATION.dataQuality
  };
  turretGroup.add(coaxMuzzle);

  root.userData.turret = turretGroup;
  root.userData.barrel = barrel;
  root.userData.proxyBarrel = proxyBarrel;
  root.userData.muzzle = muzzle;
  root.userData.weaponMuzzles = { coax: coaxMuzzle };
  root.userData.authoredHull = parts.get('static_body_core_paint');
  root.userData.runningGear = parts.get('static_body_core_wheel');
  root.userData.proxyTurret = parts.get('turret_body_proxy_paint');
  root.userData.proxyMantlet = parts.get('turret_mantlet_proxy_paint');
  root.userData.proxyCupola = parts.get('turret_cupola_proxy_paint');
  root.userData.proxyCupolaRoof = parts.get('turret_cupolaRoof_proxy_paint');
  root.userData.commanderStation = SOMUA_S35_COMMANDER_STATION;
  root.userData.commanderHatches = [];
  root.userData.referenceAssemblySummary = SOMUA_S35_REFERENCE_ASSEMBLY_SUMMARY;
  root.userData.modelMetadata = {
    designation: 'SOMUA S35',
    dimensionsMeters: {
      length: S35.length,
      width: S35.width,
      height: S35.height
    },
    dimensionPolicy:
      'published rigid vehicle envelope; source aerial, chain, bags, tools, and gun projection are excluded',
    blueprintCalibration: SOMUA_S35_BLUEPRINT_CALIBRATION,
    blueprintFit: {
      views: ['side', 'front', 'rear', 'top'],
      primaryFitView: 'normalized source GLB exterior with four-view envelope review',
      rigidEnvelope: 'exact independent XYZ registration',
      landmarkFit:
        'the source GLB owns primary hull and turret render topology; published dimensions own registration and the four-view source remains independent silhouette evidence'
    },
    lodTriangles: {
      high: runtimeLodTriangles.high,
      proxy: runtimeLodTriangles.proxy,
      sourceExterior: SOMUA_S35_REFERENCE_ASSEMBLY_SUMMARY.sourceTriangleCount
    },
    features: [
      'sealed GLB-derived cast hull without center-fan repair geometry',
      'source-derived nine-wheel suspension and individual track run',
      'sealed GLB-derived APX 1 CE shell, cupola, mantlet, and 47 mm SA 35 installation',
      'source-derived doors, stowage, lights, and aerial with floating micro-detail omitted',
      'source-derived twin exhaust retained across every distance tier',
      'three-man crew'
    ]
  };

  return root;
}

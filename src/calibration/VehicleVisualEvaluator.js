import * as THREE from 'three';
import {
  createVehicleOwnedRegistrations
} from './VehicleOwnedRegistration.js';
import {
  isVehicleVisualBundle
} from './VehicleVisualBundle.js';

const DIMENSION_KEYS = Object.freeze(['length', 'width', 'height']);
const DEFAULT_LODS = Object.freeze(['high', 'medium', 'core', 'proxy']);
const RIGID_EXCLUDED_ROLES = new Set([
  'flexibleAttachment',
  'surfaceDetail',
  'weaponProjection'
]);

const failure = (checkId, message) => Object.freeze({ checkId, message });

function sameDimensions(left, right) {
  return DIMENSION_KEYS.every(key => left?.[key] === right?.[key]);
}

function signedVolume(geometry) {
  const positions = geometry?.attributes?.position;
  if (!positions) return NaN;
  const index = geometry.index;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let result = 0;
  const count = index?.count ?? positions.count;
  for (let offset = 0; offset < count; offset += 3) {
    a.fromBufferAttribute(positions, index ? index.getX(offset) : offset);
    b.fromBufferAttribute(positions, index ? index.getX(offset + 1) : offset + 1);
    c.fromBufferAttribute(positions, index ? index.getX(offset + 2) : offset + 2);
    result += a.dot(b.clone().cross(c)) / 6;
  }
  return result;
}

function collectRigidBounds(root, proxy) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  let meshCount = 0;
  root.traverse(object => {
    if (!object.isMesh) return;
    const isProxy = object.userData.lodBand === 'proxy';
    if (isProxy !== proxy) return;
    if (!proxy && RIGID_EXCLUDED_ROLES.has(object.userData.envelopeRole)) return;
    if (object.userData.lodBand === 'ui') return;
    bounds.union(new THREE.Box3().setFromObject(object));
    meshCount += 1;
  });
  return { bounds, meshCount };
}

function checkIdentity(context) {
  const { bundle } = context;
  const issues = [];
  if (!isVehicleVisualBundle(bundle)) {
    issues.push(failure('identity', 'input is not a vehicle visual bundle'));
    return issues;
  }
  if (bundle.vehicle.modelId !== bundle.modelId) {
    issues.push(failure('identity', 'vehicle statistics modelId diverges'));
  }
  if (bundle.calibration.modelId !== bundle.modelId) {
    issues.push(failure('identity', 'calibration modelId diverges'));
  }
  for (const [label, dimensions] of [
    ['profile', bundle.profile.dimensionsMeters],
    ['calibration', bundle.calibration.dimensionsMeters],
    ['renderer data', bundle.visualData?.dimensionsMeters]
  ]) {
    if (dimensions && !sameDimensions(bundle.vehicle.dimensionsMeters, dimensions)) {
      issues.push(failure('identity', `${label} dimensions diverge from canonical statistics`));
    }
  }
  return issues;
}

function checkAssets(context) {
  const { bundle } = context;
  const issues = [];
  const surface = bundle.assets?.surface;
  if (
    !surface
    || typeof surface.logicalId !== 'string'
    || typeof surface.sourcePackId !== 'string'
    || surface.record?.kind !== 'vehicle-surface-pack'
  ) {
    issues.push(failure('assets', 'vehicle surface asset binding is incomplete'));
  }
  const blueprint = bundle.assets?.blueprint;
  if (!blueprint) {
    issues.push(failure('assets', 'blueprint/reference asset is missing'));
  }
  return issues;
}

function checkMeshContract(context) {
  const { bundle, model } = context;
  const issues = [];
  if (!model?.isGroup) {
    return [failure('mesh-contract', 'factory did not return a Three.js Group')];
  }
  if (model.name !== bundle.modelId) {
    issues.push(failure(
      'mesh-contract',
      `root name ${model.name || '(empty)'} does not match ${bundle.modelId}`
    ));
  }
  if (!sameDimensions(
    model.userData.modelMetadata?.dimensionsMeters,
    bundle.vehicle.dimensionsMeters
  )) {
    issues.push(failure('mesh-contract', 'mesh metadata dimensions diverge'));
  }

  const expectedLods = bundle.validation.requiredLodBands ?? DEFAULT_LODS;
  const lodBands = new Set();
  model.traverse(object => {
    if (object.isMesh && object.userData.lodBand) {
      lodBands.add(object.userData.lodBand);
    }
  });
  for (const lod of expectedLods) {
    if (!lodBands.has(lod)) {
      issues.push(failure('mesh-contract', `missing ${lod} LOD geometry`));
    }
  }

  const binding = model.userData.assetBindings?.vehicleSurface;
  if (
    binding?.logicalId !== bundle.assets.surface.logicalId
    || binding?.sourcePackId !== bundle.assets.surface.sourcePackId
  ) {
    issues.push(failure('mesh-contract', 'live surface binding diverges from bundle asset'));
  }
  return issues;
}

function checkRigidEnvelope(context) {
  const { bundle, model, metrics } = context;
  const issues = [];
  const expected = bundle.vehicle.dimensionsMeters;
  for (const [label, proxy] of [['detail', false], ['proxy', true]]) {
    const { bounds, meshCount } = collectRigidBounds(model, proxy);
    if (meshCount === 0 || bounds.isEmpty()) {
      issues.push(failure('rigid-envelope', `${label} has no rigid meshes`));
      continue;
    }
    const size = bounds.getSize(new THREE.Vector3());
    const measured = {
      length: size.z,
      width: size.x,
      height: bounds.max.y,
      ground: bounds.min.y
    };
    metrics.envelopes[label] = measured;
    for (const key of DIMENSION_KEYS) {
      if (Math.abs(measured[key] - expected[key]) > 0.01) {
        issues.push(failure(
          'rigid-envelope',
          `${label} ${key} expected ${expected[key]}m, measured ${measured[key]}m`
        ));
      }
    }
    if (Math.abs(measured.ground) > 0.01) {
      issues.push(failure(
        'rigid-envelope',
        `${label} ground expected 0m, measured ${measured.ground}m`
      ));
    }
  }
  return issues;
}

function checkBlueprintRegistration(context) {
  const { bundle, model, metrics } = context;
  const issues = [];
  const requiredViews = bundle.validation.requiredBlueprintViews ?? [];
  if (requiredViews.length === 0) return issues;
  const registrations = createVehicleOwnedRegistrations(model, bundle.calibration);
  for (const view of requiredViews) {
    const registration = registrations[view];
    if (!registration?.imageUrl) {
      issues.push(failure('blueprint-registration', `${view} raster is unavailable`));
      continue;
    }
    if (!registration.autoFit || Object.keys(registration.landmarks).length < 2) {
      issues.push(failure(
        'blueprint-registration',
        `${view} lacks two source-space landmarks for deterministic fitting`
      ));
    }
    metrics.blueprintViews[view] = {
      imageUrl: registration.imageUrl,
      crop: registration.crop,
      landmarkCount: Object.keys(registration.landmarks).length
    };
  }
  return issues;
}

function checkSemanticParts(context) {
  const { bundle, model } = context;
  const issues = [];
  for (const name of bundle.validation.requiredParts ?? []) {
    if (!model.getObjectByName(name)) {
      issues.push(failure('semantic-parts', `required part ${name} is missing`));
    }
  }
  for (const name of bundle.validation.forbiddenParts ?? []) {
    if (model.getObjectByName(name)) {
      issues.push(failure('semantic-parts', `rejected legacy part ${name} is present`));
    }
  }
  for (const name of bundle.validation.closedParts ?? []) {
    const object = model.getObjectByName(name);
    if (!object?.isMesh) continue;
    const volume = signedVolume(object.geometry);
    if (!(volume > 0)) {
      issues.push(failure(
        'semantic-parts',
        `${name} must be a closed outward-wound volume; signed volume ${volume}`
      ));
    }
  }
  return issues;
}

function checkWeaponMounts(context) {
  const { bundle, model } = context;
  const expected = bundle.validation.mountSides;
  if (!expected) return [];
  const issues = [];
  const main = model.userData.muzzle;
  const coax = model.userData.weaponMuzzles?.coax;
  if (expected.main && main?.userData.mountSide !== expected.main) {
    issues.push(failure('weapon-mounts', `main mount must be ${expected.main}`));
  }
  if (expected.coax && coax?.userData.mountSide !== expected.coax) {
    issues.push(failure('weapon-mounts', `coax mount must be ${expected.coax}`));
  }
  return issues;
}

function checkSourceMechanics(context) {
  const { bundle, model, metrics } = context;
  const contract = bundle.validation.sourceMechanics;
  if (!contract) return [];
  const issues = [];
  const geometry = bundle.visualData?.geometry;
  const sourceMetrics = {};
  const sourceTolerance = contract.sourceToleranceMeters ?? 1e-9;

  if (contract.hullStations) {
    const stations = geometry?.hullStations;
    if (!Array.isArray(stations)) {
      issues.push(failure('source-mechanics', 'visual data has no hull station table'));
    } else {
      if (stations.length < contract.hullStations.minimumCount) {
        issues.push(failure(
          'source-mechanics',
          `hull requires at least ${contract.hullStations.minimumCount} stations`
        ));
      }
      if (
        contract.hullStations.requireStrictAscendingZ
        && stations.some((station, index) => (
          index > 0 && station.z <= stations[index - 1].z
        ))
      ) {
        issues.push(failure(
          'source-mechanics',
          'hull station z values must be strictly ascending'
        ));
      }
      const rise = contract.hullStations.deckRise;
      if (rise) {
        const forward = stations.find(station => (
          station.z === rise.forwardStationZ
        ));
        const rearward = stations.find(station => (
          station.z === rise.rearwardStationZ
        ));
        if (!forward || !rearward) {
          issues.push(failure(
            'source-mechanics',
            'hull deck-rise source stations are missing'
          ));
        } else {
          const riseMeters = rearward.deckY - forward.deckY;
          sourceMetrics.hullDeckRiseMeters = riseMeters;
          if (riseMeters < rise.minimumRiseMeters) {
            issues.push(failure(
              'source-mechanics',
              `hull deck rise ${riseMeters}m is below ${rise.minimumRiseMeters}m`
            ));
          }
        }
      }
      sourceMetrics.hullStationCount = stations.length;
    }
  }

  if (contract.turret) {
    const turret = model.getObjectByName(contract.turret.objectName);
    const source = geometry?.turret;
    if (!turret || !source) {
      issues.push(failure('source-mechanics', 'turret source datum is unavailable'));
    } else {
      const expected = [source.centerX ?? 0, source.deckY, source.centerZ];
      const actual = turret.position.toArray();
      sourceMetrics.turretPosition = actual;
      const tolerance = contract.turret.positionToleranceMeters;
      expected.forEach((value, index) => {
        if (Math.abs(actual[index] - value) > tolerance) {
          issues.push(failure(
            'source-mechanics',
            `turret position axis ${index} expected ${value}m, measured ${actual[index]}m`
          ));
        }
      });
    }
  }

  if (contract.sideProfile) {
    const registration = geometry?.sideSourceRegistration;
    const trackRegistration = geometry?.runningGear?.trackPath?.sourceRegistration;
    const spanPixels = (
      trackRegistration?.rigidRearPixelX
      - trackRegistration?.rigidFrontPixelX
    );
    const verticalSpanPixels = (
      trackRegistration?.groundLinePixelY
      - trackRegistration?.rigidTopPixelY
    );
    if (
      !registration
      || !Number.isFinite(spanPixels)
      || spanPixels <= 0
      || !Number.isFinite(verticalSpanPixels)
      || verticalSpanPixels <= 0
    ) {
      issues.push(failure(
        'source-mechanics',
        'side-profile registration requires rigid horizontal and vertical source spans'
      ));
    } else {
      const horizontalScale = bundle.profile.dimensionsMeters.length / spanPixels;
      const verticalScale = bundle.profile.dimensionsMeters.height / verticalSpanPixels;
      const originPixelX = (
        trackRegistration.rigidFrontPixelX
        + trackRegistration.rigidRearPixelX
      ) * 0.5;
      const sourceZ = pixelX => (originPixelX - pixelX) * horizontalScale;
      const sourceY = pixelY => (
        trackRegistration.groundLinePixelY - pixelY
      ) * verticalScale;
      const stationSources = registration.hullDeckStations ?? [];
      const stations = geometry.hullStations ?? [];
      if (
        stationSources.length < contract.sideProfile.minimumHullStations
        || stationSources.length !== stations.length
      ) {
        issues.push(failure(
          'source-mechanics',
          `side profile requires ${contract.sideProfile.minimumHullStations} registered hull stations`
        ));
      } else {
        stationSources.forEach(([pixelX, pixelY], index) => {
          const station = stations[index];
          if (
            Math.abs(station.z - sourceZ(pixelX)) > sourceTolerance
            || Math.abs(station.deckY - sourceY(pixelY)) > sourceTolerance
          ) {
            issues.push(failure(
              'source-mechanics',
              `hull station ${index} diverges from side source registration`
            ));
          }
        });
        if (
          Number.isFinite(contract.sideProfile.terminalHullPixelX)
          && stationSources.at(-1)?.[0]
            !== contract.sideProfile.terminalHullPixelX
        ) {
          issues.push(failure(
            'source-mechanics',
            `hull terminal source pixel must be ${contract.sideProfile.terminalHullPixelX}`
          ));
        }
      }
      const mudguardSources = registration.mudguardOutlinePixels ?? [];
      const mudguardOutline = geometry.mudguard?.outline ?? [];
      if (
        mudguardSources.length < contract.sideProfile.minimumMudguardPoints
        || mudguardSources.length !== mudguardOutline.length
      ) {
        issues.push(failure(
          'source-mechanics',
          `side profile requires ${contract.sideProfile.minimumMudguardPoints} registered mudguard points`
        ));
      } else {
        mudguardSources.forEach(([pixelX, pixelY], index) => {
          const [z, y] = mudguardOutline[index];
          if (
            Math.abs(z - sourceZ(pixelX)) > sourceTolerance
            || Math.abs(y - sourceY(pixelY)) > sourceTolerance
          ) {
            issues.push(failure(
              'source-mechanics',
              `mudguard point ${index} diverges from side source registration`
            ));
          }
        });
      }
      const suspensionSources = registration.suspensionAssemblies ?? [];
      const suspensionAssemblies = geometry.suspension?.assemblies ?? [];
      if (
        suspensionSources.length
          < contract.sideProfile.minimumSuspensionAssemblies
        || suspensionSources.length !== suspensionAssemblies.length
      ) {
        issues.push(failure(
          'source-mechanics',
          `side profile requires ${
            contract.sideProfile.minimumSuspensionAssemblies
          } registered suspension assemblies`
        ));
      } else {
        suspensionSources.forEach((sourceAssembly, assemblyIndex) => {
          const assembly = suspensionAssemblies[assemblyIndex];
          const outlinePixels = sourceAssembly.outlinePixels ?? [];
          const outline = assembly?.outline ?? [];
          if (
            assembly?.id !== sourceAssembly.id
            || outlinePixels.length < 3
            || outlinePixels.length !== outline.length
          ) {
            issues.push(failure(
              'source-mechanics',
              `suspension assembly ${sourceAssembly.id} has disconnected identity or outline data`
            ));
            return;
          }
          outlinePixels.forEach(([pixelX, pixelY], pointIndex) => {
            const [z, y] = outline[pointIndex];
            if (
              Math.abs(z - sourceZ(pixelX)) > sourceTolerance
              || Math.abs(y - sourceY(pixelY)) > sourceTolerance
            ) {
              issues.push(failure(
                'source-mechanics',
                `suspension assembly ${sourceAssembly.id} point ${pointIndex} diverges from side source registration`
              ));
            }
          });
          const sourceBounds = sourceAssembly.springPackBoundsPixels;
          const springPack = assembly.springPack;
          if (
            !sourceBounds
            || !springPack
            || springPack.elementCount !== sourceAssembly.springElementCount
          ) {
            issues.push(failure(
              'source-mechanics',
              `suspension assembly ${sourceAssembly.id} has disconnected spring-pack data`
            ));
            return;
          }
          const expectedCenterY = (
            sourceY(sourceBounds.top) + sourceY(sourceBounds.bottom)
          ) * 0.5;
          const expectedCenterZ = (
            sourceZ(sourceBounds.left) + sourceZ(sourceBounds.right)
          ) * 0.5;
          const expectedHeight = (
            sourceY(sourceBounds.top) - sourceY(sourceBounds.bottom)
          );
          const expectedSpanZ = (
            sourceZ(sourceBounds.left) - sourceZ(sourceBounds.right)
          );
          if (
            Math.abs(springPack.centerY - expectedCenterY) > sourceTolerance
            || Math.abs(springPack.centerZ - expectedCenterZ) > sourceTolerance
            || Math.abs(springPack.height - expectedHeight) > sourceTolerance
            || Math.abs(springPack.spanZ - expectedSpanZ) > sourceTolerance
          ) {
            issues.push(failure(
              'source-mechanics',
              `suspension assembly ${sourceAssembly.id} spring pack diverges from side source registration`
            ));
          }
        });
      }
      const turretSources = registration.turretSectionsPixels ?? [];
      const turretSections = geometry.turret?.sections ?? [];
      if (
        turretSources.length < contract.sideProfile.minimumTurretSections
        || turretSources.length !== turretSections.length
      ) {
        issues.push(failure(
          'source-mechanics',
          `side profile requires ${contract.sideProfile.minimumTurretSections} registered turret sections`
        ));
      } else {
        turretSources.forEach(([frontPixelX, pixelY, rearPixelX], index) => {
          const section = turretSections[index];
          const globalCenterZ = geometry.turret.centerZ + section.centerZ;
          const frontZ = globalCenterZ + section.frontLength;
          const rearZ = globalCenterZ - section.rearLength;
          const worldY = geometry.turret.deckY + section.y;
          if (
            Math.abs(frontZ - sourceZ(frontPixelX)) > sourceTolerance
            || Math.abs(rearZ - sourceZ(rearPixelX)) > sourceTolerance
            || Math.abs(worldY - sourceY(pixelY)) > sourceTolerance
          ) {
            issues.push(failure(
              'source-mechanics',
              `turret section ${index} diverges from side source registration`
            ));
          }
        });
      }
      const visorPixels = geometry.driverVisor?.sourcePixels;
      if (visorPixels) {
        if (
          Math.abs(geometry.driverVisor.center[1] - sourceY(visorPixels[1]))
            > sourceTolerance
          || Math.abs(geometry.driverVisor.center[2] - sourceZ(visorPixels[0]))
            > sourceTolerance
        ) {
          issues.push(failure(
            'source-mechanics',
            'driver visor diverges from side source registration'
          ));
        }
      }
      sourceMetrics.sideProfile = {
        hullStationCount: stations.length,
        hullTerminalPixelX: stationSources.at(-1)?.[0] ?? null,
        mudguardPointCount: mudguardOutline.length,
        suspensionAssemblyCount: suspensionAssemblies.length,
        turretSectionCount: turretSections.length,
        horizontalMetersPerPixel: horizontalScale,
        verticalMetersPerPixel: verticalScale
      };
    }
  }

  if (contract.frontProfile) {
    const registration = geometry?.frontSourceRegistration;
    const cupola = geometry?.turret?.cupola;
    const spanPixels = (
      registration?.rigidLeftPixelX - registration?.rigidRightPixelX
    );
    if (
      !registration
      || !Number.isFinite(spanPixels)
      || spanPixels <= 0
      || !Number.isFinite(registration.turretCenterPixelX)
    ) {
      issues.push(failure(
        'source-mechanics',
        'front-profile registration requires a rigid horizontal source span and turret center'
      ));
    } else {
      const horizontalScale = bundle.profile.dimensionsMeters.width / spanPixels;
      if (contract.frontProfile.requireRegisteredCupola) {
        if (
          !cupola
          || !Number.isFinite(registration.cupolaCenterPixelX)
          || !Number.isFinite(registration.cupolaRadiusPixels)
          || registration.cupolaRadiusPixels <= 0
        ) {
          issues.push(failure(
            'source-mechanics',
            'front profile requires a registered cupola center and radius'
          ));
        } else {
          const expectedCenterX = (
            registration.cupolaCenterPixelX
            - registration.turretCenterPixelX
          ) * horizontalScale;
          const expectedRadius = (
            registration.cupolaRadiusPixels * horizontalScale
          );
          if (
            Math.abs(cupola.centerX - expectedCenterX) > sourceTolerance
            || Math.abs(cupola.radius - expectedRadius) > sourceTolerance
          ) {
            issues.push(failure(
              'source-mechanics',
              'cupola diverges from front source registration'
            ));
          }
          sourceMetrics.frontProfile = {
            horizontalMetersPerPixel: horizontalScale,
            cupolaCenterX: cupola.centerX,
            cupolaRadius: cupola.radius
          };
        }
      }
    }
  }

  if (contract.track) {
    const expectedConfig = geometry?.runningGear?.trackPath;
    const expectedSupports = [
      expectedConfig?.driveSprocket,
      expectedConfig?.idlerWheel,
      ...(expectedConfig?.roadWheels ?? []),
      ...(expectedConfig?.returnRollers ?? [])
    ].filter(Boolean);
    const expectedSupportIds = expectedSupports.map(support => support.id).sort();
    const registration = expectedConfig?.sourceRegistration;
    if (registration) {
      const spanPixels = (
        registration.rigidRearPixelX - registration.rigidFrontPixelX
      );
      const groundPixelY = registration.groundLinePixelY;
      const originPixelX = (
        registration.rigidFrontPixelX + registration.rigidRearPixelX
      ) * 0.5;
      const lengthMeters = bundle.profile?.dimensionsMeters?.length;
      const tolerance = contract.track.sourceRegistrationToleranceMeters ?? 1e-9;
      if (
        !Number.isFinite(spanPixels)
        || spanPixels <= 0
        || !Number.isFinite(groundPixelY)
        || !Number.isFinite(lengthMeters)
        || lengthMeters <= 0
      ) {
        issues.push(failure(
          'source-mechanics',
          'track source registration requires a finite positive pixel span, ground line, and vehicle length'
        ));
      } else {
        const metersPerPixel = lengthMeters / spanPixels;
        const verticalMetersPerPixel = (
          Number.isFinite(registration.rigidTopPixelY)
          && registration.groundLinePixelY > registration.rigidTopPixelY
        )
          ? (
              bundle.profile.dimensionsMeters.height
              / (
                registration.groundLinePixelY
                - registration.rigidTopPixelY
              )
            )
          : metersPerPixel;
        const sourceView = bundle.visualData?.blueprint?.views?.[
          registration.view
        ];
        const crop = sourceView?.cropPixels;
        let registeredSupportCount = 0;
        for (const support of expectedSupports) {
          const [pixelX, pixelY] = support.sourcePixels ?? [];
          const radiusPixels = support.sourceRadiusPixels;
          if (
            !Number.isFinite(pixelX)
            || !Number.isFinite(pixelY)
            || !Number.isFinite(radiusPixels)
            || radiusPixels <= 0
          ) {
            issues.push(failure(
              'source-mechanics',
              `track support ${support.id} has no finite source-pixel center and radius`
            ));
            continue;
          }
          registeredSupportCount += 1;
          if (crop && (
            pixelX < crop.x
            || pixelX > crop.x + crop.width
            || pixelY < crop.y
            || pixelY > crop.y + crop.height
          )) {
            issues.push(failure(
              'source-mechanics',
              `track support ${support.id} lies outside the registered ${registration.view} crop`
            ));
          }
          const sourceValues = {
            centerY: (groundPixelY - pixelY) * verticalMetersPerPixel,
            centerZ: (originPixelX - pixelX) * metersPerPixel,
            radius: radiusPixels * metersPerPixel
          };
          for (const key of ['centerY', 'centerZ', 'radius']) {
            if (Math.abs(support[key] - sourceValues[key]) > tolerance) {
              issues.push(failure(
                'source-mechanics',
                `track support ${support.id} ${key} diverges from source registration`
              ));
            }
          }
        }
        const expectedLinkThickness = (
          registration.linkThicknessPixels * metersPerPixel
        );
        if (
          !Number.isFinite(registration.linkThicknessPixels)
          || registration.linkThicknessPixels <= 0
          || Math.abs(
            expectedConfig.linkThickness - expectedLinkThickness
          ) > tolerance
        ) {
          issues.push(failure(
            'source-mechanics',
            'track link thickness diverges from source registration'
          ));
        }
        const expectedCleatHeight = (
          registration.cleatHeightPixels * metersPerPixel
        );
        if (
          !Number.isFinite(registration.cleatHeightPixels)
          || registration.cleatHeightPixels < 0
          || Math.abs(
            expectedConfig.cleatHeight - expectedCleatHeight
          ) > tolerance
        ) {
          issues.push(failure(
            'source-mechanics',
            'track cleat height diverges from source registration'
          ));
        }
        sourceMetrics.trackRegistration = {
          view: registration.view,
          metersPerPixel,
          verticalMetersPerPixel,
          registeredSupportCount
        };
      }
    }
    const trackReports = {};
    for (const [label, objectName] of [
      ['detail', contract.track.detailObjectName],
      ['proxy', contract.track.proxyObjectName]
    ]) {
      const object = model.getObjectByName(objectName);
      const path = object?.userData?.trackPath;
      if (!path) {
        issues.push(failure(
          'source-mechanics',
          `${label} track ${objectName} has no solved support path`
        ));
        continue;
      }
      const supportIds = path.supports.map(support => support.id).sort();
      trackReports[label] = {
        model: path.model,
        supportCount: path.supports.length,
        supportIds,
        maximumSagMeters: path.maximumSagMeters,
        bounds: path.bounds
      };
      if (path.model !== contract.track.expectedModel) {
        issues.push(failure(
          'source-mechanics',
          `${label} track uses ${path.model}, expected ${contract.track.expectedModel}`
        ));
      }
      if (path.supports.length < contract.track.minimumSupportCount) {
        issues.push(failure(
          'source-mechanics',
          `${label} track requires ${contract.track.minimumSupportCount} supports`
        ));
      }
      if (
        supportIds.length !== expectedSupportIds.length
        || supportIds.some((id, index) => id !== expectedSupportIds[index])
      ) {
        issues.push(failure(
          'source-mechanics',
          `${label} track supports diverge from renderer data`
        ));
      }
      if (path.maximumSagMeters > contract.track.maximumSagMeters) {
        issues.push(failure(
          'source-mechanics',
          `${label} track sag ${path.maximumSagMeters}m exceeds `
          + `${contract.track.maximumSagMeters}m`
        ));
      }
    }
    sourceMetrics.track = trackReports;
  }

  metrics.sourceMechanics = sourceMetrics;
  return issues;
}

export const DEFAULT_VEHICLE_VISUAL_CHECKS = Object.freeze([
  Object.freeze({ id: 'identity', evaluate: checkIdentity }),
  Object.freeze({ id: 'assets', evaluate: checkAssets }),
  Object.freeze({ id: 'mesh-contract', evaluate: checkMeshContract }),
  Object.freeze({ id: 'rigid-envelope', evaluate: checkRigidEnvelope }),
  Object.freeze({ id: 'blueprint-registration', evaluate: checkBlueprintRegistration }),
  Object.freeze({ id: 'semantic-parts', evaluate: checkSemanticParts }),
  Object.freeze({ id: 'weapon-mounts', evaluate: checkWeaponMounts }),
  Object.freeze({ id: 'source-mechanics', evaluate: checkSourceMechanics })
]);

export function evaluateVehicleVisualBundle(
  bundle,
  { checks = DEFAULT_VEHICLE_VISUAL_CHECKS } = {}
) {
  if (!Array.isArray(checks) || checks.some(check => typeof check?.evaluate !== 'function')) {
    throw new TypeError('vehicle visual evaluator requires check plugins');
  }
  const metrics = {
    envelopes: {},
    blueprintViews: {},
    sourceMechanics: {}
  };
  let model = null;
  const context = {
    bundle,
    metrics,
    get model() {
      if (!model) model = bundle.createMesh();
      return model;
    }
  };
  const failures = [];
  const executedChecks = [];
  for (const check of checks) {
    executedChecks.push(check.id);
    const result = check.evaluate(context);
    if (!Array.isArray(result)) {
      throw new TypeError(`vehicle visual check ${check.id} must return an array`);
    }
    failures.push(...result);
  }
  return Object.freeze({
    modelId: bundle?.modelId ?? null,
    pass: failures.length === 0,
    executedChecks: Object.freeze(executedChecks),
    failures: Object.freeze(failures),
    metrics: Object.freeze({
      envelopes: Object.freeze({ ...metrics.envelopes }),
      blueprintViews: Object.freeze({ ...metrics.blueprintViews }),
      sourceMechanics: Object.freeze({ ...metrics.sourceMechanics })
    })
  });
}

export function evaluateVehicleVisualBundleRegistry(
  bundles,
  options
) {
  if (!bundles || typeof bundles !== 'object' || Array.isArray(bundles)) {
    throw new TypeError('vehicle visual bundle registry must be an object dictionary');
  }
  return Object.freeze(Object.fromEntries(
    Object.keys(bundles).sort().map(modelId => [
      modelId,
      evaluateVehicleVisualBundle(bundles[modelId], options)
    ])
  ));
}

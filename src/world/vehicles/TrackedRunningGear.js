import * as THREE from 'three';
import {
  sampleClosedTrackPath,
  solveSupportedTrackPath
} from './TrackPathSolver.js';

const X_AXIS = new THREE.Vector3(1, 0, 0);

// Rendering-only metre-space track assembly. Repeated links and cleats are
// instanced, while named wheel groups and saved path transforms give later
// suspension/track animation code stable semantic ownership.
function createTrackLinkGeometry(width, length, height) {
  const x = width / 2;
  const y = height / 2;
  const z = length / 2;
  const positions = [
    -x, -y, -z, x, -y, -z, x, y, -z, -x, y, -z,
    -x, -y, z, x, -y, z, x, y, z, -x, y, z
  ];
  const indices = [
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.name = 'TrackLinkGeometry';
  return geometry;
}

function createProxyTrackBeltGeometry(length, height, width) {
  const radius = height / 2;
  const halfStraight = Math.max(0.01, (length - height) / 2);
  const bandDepth = Math.min(height * 0.22, width * 0.34);
  const innerRadius = Math.max(height * 0.12, radius - bandDepth);
  const arcSegments = 6;
  const capsulePoints = (capsuleRadius) => {
    const points = [];
    for (let index = 0; index <= arcSegments; index++) {
      const angle = -Math.PI / 2 + (index / arcSegments) * Math.PI;
      points.push(new THREE.Vector2(
        halfStraight + Math.cos(angle) * capsuleRadius,
        Math.sin(angle) * capsuleRadius
      ));
    }
    for (let index = 0; index <= arcSegments; index++) {
      const angle = Math.PI / 2 + (index / arcSegments) * Math.PI;
      points.push(new THREE.Vector2(
        -halfStraight + Math.cos(angle) * capsuleRadius,
        Math.sin(angle) * capsuleRadius
      ));
    }
    return points;
  };

  const shape = new THREE.Shape(capsulePoints(radius));
  shape.holes.push(new THREE.Path(capsulePoints(innerRadius).reverse()));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    steps: 1,
    bevelEnabled: false,
    curveSegments: arcSegments
  });
  geometry.translate(0, 0, -width / 2);
  geometry.rotateY(Math.PI / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'ProxyTrackBeltGeometry';
  geometry.userData.closedTrackBelt = true;
  return geometry;
}

function addBeltLinks(group, config, side) {
  const {
    centerY, trackCenterX, trackWidth, beltLength, beltHeight,
    linkPitch, trackMaterial
  } = config;
  const radius = beltHeight / 2;
  const straight = Math.max(0.05, beltLength - beltHeight);
  const perimeter = straight * 2 + Math.PI * beltHeight;
  const count = Math.max(18, Math.ceil(perimeter / linkPitch));
  const pitch = perimeter / count;
  const linkGeometry = createTrackLinkGeometry(trackWidth, pitch * 0.9, Math.min(0.07, trackWidth * 0.22));
  const cleatGeometry = createTrackLinkGeometry(trackWidth * 1.04, pitch * 0.68, Math.min(0.04, trackWidth * 0.12));
  const links = new THREE.InstancedMesh(linkGeometry, trackMaterial, count);
  const semanticSide = side < 0 ? 'Right' : 'Left';
  links.name = `${semanticSide}TrackLinks`;
  links.castShadow = true;
  links.receiveShadow = true;
  // Belt owns the tracked silhouette and therefore survives the core tier.
  links.userData = {
    lodBand: 'core',
    trackPart: 'links',
    side,
    semanticSide: semanticSide.toLowerCase(),
    count,
    pitchMeters: pitch
  };
  const cleats = new THREE.InstancedMesh(cleatGeometry, trackMaterial, count);
  cleats.name = `${semanticSide}TrackCleats`;
  cleats.castShadow = true;
  cleats.receiveShadow = true;
  cleats.userData = {
    lodBand: 'high',
    trackPart: 'cleats',
    side,
    semanticSide: semanticSide.toLowerCase(),
    count,
    pitchMeters: pitch
  };
  const rearZ = -straight / 2;
  const frontZ = straight / 2;
  const bottomY = centerY - radius;
  const topY = centerY + radius;
  const position = new THREE.Vector3();
  const cleatPosition = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const matrix = new THREE.Matrix4();
  const outwardOffset = new THREE.Vector3(0, -Math.min(0.055, trackWidth * 0.16), 0);
  const instancePath = [];

  for (let index = 0; index < count; index++) {
    const distance = index * pitch;
    let y;
    let z;
    let rotationX;
    if (distance < straight) {
      y = bottomY;
      z = rearZ + distance;
      rotationX = 0;
    } else if (distance < straight + Math.PI * radius) {
      const angle = -Math.PI / 2 + (distance - straight) / radius;
      y = centerY + Math.sin(angle) * radius;
      z = frontZ + Math.cos(angle) * radius;
      rotationX = -angle - Math.PI / 2;
    } else if (distance < straight * 2 + Math.PI * radius) {
      y = topY;
      z = frontZ - (distance - straight - Math.PI * radius);
      rotationX = Math.PI;
    } else {
      const angle = Math.PI / 2 + (distance - straight * 2 - Math.PI * radius) / radius;
      y = centerY + Math.sin(angle) * radius;
      z = rearZ + Math.cos(angle) * radius;
      rotationX = -angle - Math.PI / 2;
    }
    position.set(side * trackCenterX, y, z);
    quaternion.setFromAxisAngle(X_AXIS, rotationX);
    matrix.compose(position, quaternion, scale);
    links.setMatrixAt(index, matrix);

    // Local +Y faces into the belt. Rotate local -Y into track space so each
    // cleat remains on the outside of straights and curved end runs.
    cleatPosition.copy(outwardOffset).applyQuaternion(quaternion).add(position);
    matrix.compose(cleatPosition, quaternion, scale);
    cleats.setMatrixAt(index, matrix);
    instancePath.push({
      distance,
      position: position.toArray(),
      quaternion: quaternion.toArray()
    });
  }
  links.instanceMatrix.needsUpdate = true;
  cleats.instanceMatrix.needsUpdate = true;
  links.userData.instancePath = instancePath;
  cleats.userData.instancePath = instancePath;
  group.add(links, cleats);
  return { links, cleats, count };
}

function addSupportedBeltLinks(
  group,
  {
    trackCenterX,
    trackWidth,
    linkPitch,
    trackMaterial,
    solvedPath
  },
  side,
  { proxy = false } = {}
) {
  const sampled = sampleClosedTrackPath(
    solvedPath,
    // Preserve source-registered end tangency at proxy range. Geometry and
    // cleats are simplified; path sampling remains identical to detail.
    linkPitch
  );
  const linkHeight = solvedPath.inputs.linkThickness;
  const cleatHeight = solvedPath.inputs.cleatHeight;
  const renderedLinkHeight = proxy
    // Approximate the detailed link-plus-cleat outside envelope within the
    // rigid-envelope epsilon. Proxy LOD must not change the solved track path.
    ? linkHeight + cleatHeight * 1.5
    : linkHeight;
  const linkGeometry = createTrackLinkGeometry(
    proxy ? trackWidth * 1.04 : trackWidth,
    sampled.pitchMeters * (proxy ? 0.94 : 0.90),
    renderedLinkHeight
  );
  linkGeometry.name = proxy
    ? 'SupportedProxyTrackLinkGeometry'
    : 'SupportedTrackLinkGeometry';
  const semanticSide = side < 0 ? 'Right' : 'Left';
  const links = new THREE.InstancedMesh(
    linkGeometry,
    trackMaterial,
    sampled.count
  );
  links.name = proxy
    ? `Proxy${semanticSide}TrackLinks`
    : `${semanticSide}TrackLinks`;
  links.visible = !proxy;
  links.castShadow = true;
  links.receiveShadow = true;
  links.userData = {
    lodBand: proxy ? 'proxy' : 'core',
    trackPart: proxy ? 'proxyLinks' : 'links',
    trackPathMode: solvedPath.model,
    side,
    semanticSide: semanticSide.toLowerCase(),
    count: sampled.count,
    pitchMeters: sampled.pitchMeters
  };

  const cleatGeometry = proxy || cleatHeight === 0
    ? null
    : createTrackLinkGeometry(
        trackWidth * 1.04,
        sampled.pitchMeters * 0.68,
        cleatHeight
      );
  const cleats = proxy || cleatHeight === 0
    ? null
    : new THREE.InstancedMesh(
        cleatGeometry,
        trackMaterial,
        sampled.count
      );
  if (cleats) {
    cleats.name = `${semanticSide}TrackCleats`;
    cleats.castShadow = true;
    cleats.receiveShadow = true;
    cleats.userData = {
      lodBand: 'high',
      trackPart: 'cleats',
      trackPathMode: solvedPath.model,
      side,
      semanticSide: semanticSide.toLowerCase(),
      count: sampled.count,
      pitchMeters: sampled.pitchMeters
    };
  }

  const position = new THREE.Vector3();
  const cleatPosition = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const matrix = new THREE.Matrix4();
  const instancePath = [];
  const cleatOffset = (linkHeight + cleatHeight) * 0.5;

  sampled.samples.forEach((sample, index) => {
    position.set(side * trackCenterX, sample.y, sample.z);
    quaternion.setFromAxisAngle(
      X_AXIS,
      Math.atan2(-sample.tangentY, sample.tangentZ)
    );
    matrix.compose(position, quaternion, scale);
    links.setMatrixAt(index, matrix);

    if (cleats) {
      cleatPosition.set(
        side * trackCenterX,
        sample.y + sample.outwardY * cleatOffset,
        sample.z + sample.outwardZ * cleatOffset
      );
      matrix.compose(cleatPosition, quaternion, scale);
      cleats.setMatrixAt(index, matrix);
    }
    instancePath.push({
      distance: sample.distanceMeters,
      position: position.toArray(),
      quaternion: quaternion.toArray(),
      outward: [0, sample.outwardY, sample.outwardZ]
    });
  });
  links.instanceMatrix.needsUpdate = true;
  links.userData.instancePath = instancePath;
  if (cleats) {
    cleats.instanceMatrix.needsUpdate = true;
    cleats.userData.instancePath = instancePath;
    group.add(links, cleats);
  } else {
    group.add(links);
  }
  return {
    links,
    cleats,
    count: sampled.count,
    path: solvedPath
  };
}

function addWheel(group, name, material, radius, width, side, x, y, z, band, kind) {
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 12), material);
  wheel.name = name;
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(side * x, y, z);
  wheel.castShadow = true;
  wheel.receiveShadow = true;
  wheel.userData = {
    lodBand: band,
    trackPart: kind,
    side,
    semanticSide: side < 0 ? 'right' : 'left'
  };
  group.add(wheel);
  return wheel;
}

export function createTrackedRunningGear({
  id = 'TrackedRunningGear',
  trackMaterial,
  wheelMaterial,
  trackCenterX,
  trackWidth,
  beltLength,
  beltHeight,
  centerY,
  roadWheelRadius,
  roadWheelCount,
  roadWheelY = centerY - beltHeight / 2 + roadWheelRadius,
  roadWheelZStart,
  roadWheelSpacing,
  sprocketRadius = beltHeight * 0.42,
  idlerRadius = beltHeight * 0.38,
  linkPitch = 0.18,
  trackPath = null
}) {
  const runningGear = new THREE.Group();
  runningGear.name = id;
  const roadWheels = new THREE.Group();
  roadWheels.name = 'RoadWheels';
  const sprockets = new THREE.Group();
  sprockets.name = 'DriveSprockets';
  const idlers = new THREE.Group();
  idlers.name = 'IdlerWheels';
  const returnRollers = new THREE.Group();
  returnRollers.name = 'ReturnRollers';
  const parts = {
    roadWheels: [],
    sprockets: [],
    idlers: [],
    returnRollers: [],
    tracks: []
  };
  runningGear.add(roadWheels, sprockets, idlers, returnRollers);
  const solvedPath = trackPath ? solveSupportedTrackPath(trackPath) : null;
  const configuredRoadWheels = trackPath?.roadWheels ?? null;
  const configuredReturnRollers = trackPath?.returnRollers ?? [];
  const drive = trackPath?.driveSprocket;
  const idler = trackPath?.idlerWheel;

  for (const side of [-1, 1]) {
    const belt = solvedPath
      ? addSupportedBeltLinks(runningGear, {
          trackCenterX,
          trackWidth,
          linkPitch,
          trackMaterial,
          solvedPath
        }, side)
      : addBeltLinks(runningGear, {
          centerY,
          trackCenterX,
          trackWidth,
          beltLength,
          beltHeight,
          linkPitch,
          trackMaterial
        }, side);
    parts.tracks.push(belt);
    const sprocket = addWheel(
      sprockets, side < 0 ? 'RightDriveSprocket' : 'LeftDriveSprocket', wheelMaterial,
      drive?.radius ?? sprocketRadius,
      trackWidth * 0.82,
      side,
      trackCenterX,
      drive?.centerY ?? centerY,
      drive?.centerZ ?? beltLength / 2 - beltHeight / 2,
      'medium', 'sprocket'
    );
    const idler = addWheel(
      idlers, side < 0 ? 'RightIdlerWheel' : 'LeftIdlerWheel', wheelMaterial,
      trackPath?.idlerWheel?.radius ?? idlerRadius,
      trackWidth * 0.76,
      side,
      trackCenterX,
      trackPath?.idlerWheel?.centerY ?? centerY,
      trackPath?.idlerWheel?.centerZ ?? -beltLength / 2 + beltHeight / 2,
      'medium', 'idler'
    );
    parts.sprockets.push(sprocket);
    parts.idlers.push(idler);
    const wheels = configuredRoadWheels ?? Array.from(
      { length: roadWheelCount },
      (_, index) => ({
        radius: roadWheelRadius,
        centerY: roadWheelY,
        centerZ: roadWheelZStart + index * roadWheelSpacing
      })
    );
    for (let index = 0; index < wheels.length; index++) {
      const wheel = wheels[index];
      parts.roadWheels.push(addWheel(
        roadWheels, `${side < 0 ? 'Right' : 'Left'}RoadWheel_${index + 1}`, wheelMaterial,
        wheel.radius,
        trackWidth * 0.46,
        side,
        trackCenterX + trackWidth * 0.08,
        wheel.centerY,
        wheel.centerZ,
        'medium',
        'roadWheel'
      ));
    }
    configuredReturnRollers.forEach((roller, index) => {
      parts.returnRollers.push(addWheel(
        returnRollers,
        `${side < 0 ? 'Right' : 'Left'}ReturnRoller_${index + 1}`,
        wheelMaterial,
        roller.radius,
        trackWidth * 0.38,
        side,
        trackCenterX + trackWidth * 0.06,
        roller.centerY,
        roller.centerZ,
        'medium',
        'returnRoller'
      ));
    });
  }
  runningGear.userData = {
    articulated: true,
    runningGearType: solvedPath
      ? 'wheel-supported-quasi-static-track'
      : 'closed-track-belt',
    trackParts: parts,
    dimensionsMeters: { trackWidth, beltLength, beltHeight },
    trackPathConfig: trackPath,
    trackPath: solvedPath,
    lodBands: ['core', 'medium', 'high']
  };
  return runningGear;
}

// Far-tier silhouette. Closed belts retain their opening and wheels remain
// visible, avoiding the old opaque black track slabs without paying for every
// detailed link.
export function createTrackedRunningGearProxy({
  id = 'TrackedRunningGearProxy',
  trackMaterial,
  wheelMaterial,
  trackCenterX,
  trackWidth,
  beltLength,
  beltHeight,
  centerY,
  roadWheelRadius = beltHeight * 0.32,
  roadWheelCount,
  linkPitch = 0.18,
  trackPath = null
}) {
  const proxy = new THREE.Group();
  proxy.name = id;
  const solvedPath = trackPath ? solveSupportedTrackPath(trackPath) : null;

  for (const side of [-1, 1]) {
    if (solvedPath) {
      addSupportedBeltLinks(proxy, {
        trackCenterX,
        trackWidth,
        linkPitch,
        trackMaterial,
        solvedPath
      }, side, { proxy: true });
      continue;
    }
    const belt = new THREE.Mesh(
      createProxyTrackBeltGeometry(beltLength, beltHeight, trackWidth),
      trackMaterial
    );
    belt.name = side < 0 ? 'ProxyRightTrackBelt' : 'ProxyLeftTrackBelt';
    belt.position.set(side * trackCenterX, centerY, 0);
    belt.visible = false;
    belt.castShadow = true;
    belt.receiveShadow = true;
    belt.userData = {
      lodBand: 'proxy',
      trackPart: 'proxyBelt',
      side,
      semanticSide: side < 0 ? 'right' : 'left'
    };
    proxy.add(belt);
  }

  const wheels = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(
      roadWheelRadius,
      roadWheelRadius,
      trackWidth * 0.6,
      8
    ),
    wheelMaterial,
    (trackPath?.roadWheels?.length ?? roadWheelCount) * 2
  );
  wheels.name = 'ProxyRoadWheels';
  wheels.visible = false;
  wheels.castShadow = true;
  wheels.receiveShadow = true;
  wheels.userData = {
    lodBand: 'proxy',
    trackPart: 'proxyRoadWheels',
    wheelsPerSide: trackPath?.roadWheels?.length ?? roadWheelCount
  };
  const quaternion = new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  const matrix = new THREE.Matrix4();
  const configuredRoadWheels = trackPath?.roadWheels;
  const proxyRoadWheelCount = configuredRoadWheels?.length ?? roadWheelCount;
  const wheelY = centerY - beltHeight / 2 + roadWheelRadius;
  const usableLength = Math.max(0, beltLength - beltHeight * 1.15);
  const startZ = -usableLength / 2;
  const spacing = proxyRoadWheelCount > 1
    ? usableLength / (proxyRoadWheelCount - 1)
    : 0;
  let instance = 0;
  for (const side of [-1, 1]) {
    for (let index = 0; index < proxyRoadWheelCount; index++) {
      const wheel = configuredRoadWheels?.[index];
      position.set(
        side * trackCenterX,
        wheel?.centerY ?? wheelY,
        wheel?.centerZ ?? startZ + index * spacing
      );
      const wheelScale = wheel
        ? wheel.radius / roadWheelRadius
        : 1;
      scale.set(wheelScale, 1, wheelScale);
      matrix.compose(position, quaternion, scale);
      wheels.setMatrixAt(instance++, matrix);
    }
  }
  wheels.instanceMatrix.needsUpdate = true;
  proxy.add(wheels);
  proxy.userData = {
    runningGearType: solvedPath
      ? 'wheel-supported-quasi-static-proxy'
      : 'closed-track-proxy',
    meshLodBand: 'proxy',
    trackPathConfig: trackPath,
    trackPath: solvedPath,
    dimensionsMeters: {
      trackCenterX,
      trackWidth,
      beltLength,
      beltHeight
    }
  };
  return proxy;
}

import * as THREE from 'three';

const LOCAL_WHEEL_AXIS = new THREE.Vector3(0, 1, 0);
const EPSILON = 1e-7;

function modulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function sideTravel(state, semanticSide) {
  return semanticSide === 'left'
    ? state.leftTrackMeters
    : state.rightTrackMeters;
}

function trackPathDirection(basePositions) {
  const minimumY = Math.min(...basePositions.map(position => position.y));
  const maximumY = Math.max(...basePositions.map(position => position.y));
  const groundBand = minimumY + (maximumY - minimumY) * 0.18;
  let deltaZ = 0;
  for (let index = 0; index < basePositions.length; index++) {
    const next = (index + 1) % basePositions.length;
    if (basePositions[index].y <= groundBand && basePositions[next].y <= groundBand) {
      deltaZ += basePositions[next].z - basePositions[index].z;
    }
  }
  return deltaZ >= 0 ? -1 : 1;
}

function createInstancedPathBinding(object) {
  const count = object.count;
  const matrix = new THREE.Matrix4();
  const positions = [];
  const quaternions = [];
  const scales = [];
  for (let index = 0; index < count; index++) {
    object.getMatrixAt(index, matrix);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    positions.push(position);
    quaternions.push(quaternion);
    scales.push(scale);
  }
  const pitchMeters = Math.max(
    EPSILON,
    Number(object.userData.pitchMeters)
      || Number(object.userData.instancePath?.[1]?.distance
        - object.userData.instancePath?.[0]?.distance)
      || 0.18
  );
  const phaseDirection = trackPathDirection(positions);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let lastTravel = Number.NaN;

  return {
    semanticSide: object.userData.semanticSide,
    apply(travelMeters) {
      if (Math.abs(travelMeters - lastTravel) <= EPSILON) return;
      lastTravel = travelMeters;
      const phase = travelMeters / pitchMeters * phaseDirection;
      for (let index = 0; index < count; index++) {
        const sample = modulo(index + phase, count);
        const lower = Math.floor(sample);
        const upper = (lower + 1) % count;
        const fraction = sample - lower;
        position.copy(positions[lower]).lerp(positions[upper], fraction);
        quaternion.slerpQuaternions(
          quaternions[lower],
          quaternions[upper],
          fraction
        );
        scale.copy(scales[lower]).lerp(scales[upper], fraction);
        matrix.compose(position, quaternion, scale);
        object.setMatrixAt(index, matrix);
      }
      object.instanceMatrix.needsUpdate = true;
    }
  };
}

function wheelRadius(object) {
  return Math.max(
    EPSILON,
    Number(object.geometry?.parameters?.radiusTop)
      || Number(object.geometry?.parameters?.radius)
      || 0.25
  );
}

function createWheelBinding(object) {
  const base = object.quaternion.clone();
  const spin = new THREE.Quaternion();
  const radius = wheelRadius(object);
  let lastTravel = Number.NaN;
  return {
    semanticSide: object.userData.semanticSide,
    apply(travelMeters) {
      if (Math.abs(travelMeters - lastTravel) <= EPSILON) return;
      lastTravel = travelMeters;
      spin.setFromAxisAngle(LOCAL_WHEEL_AXIS, -travelMeters / radius);
      object.quaternion.copy(base).multiply(spin);
    }
  };
}

function createProxyWheelBinding(object) {
  const count = object.count;
  const wheelsPerSide = object.userData.wheelsPerSide;
  const matrix = new THREE.Matrix4();
  const positions = [];
  const quaternions = [];
  const scales = [];
  for (let index = 0; index < count; index++) {
    object.getMatrixAt(index, matrix);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    positions.push(position);
    quaternions.push(quaternion);
    scales.push(scale);
  }
  const radius = wheelRadius(object);
  const spin = new THREE.Quaternion();
  const quaternion = new THREE.Quaternion();
  let lastLeft = Number.NaN;
  let lastRight = Number.NaN;
  return {
    applyState(state) {
      if (Math.abs(state.leftTrackMeters - lastLeft) <= EPSILON
          && Math.abs(state.rightTrackMeters - lastRight) <= EPSILON) return;
      lastLeft = state.leftTrackMeters;
      lastRight = state.rightTrackMeters;
      for (let index = 0; index < count; index++) {
        const travel = index < wheelsPerSide
          ? state.rightTrackMeters
          : state.leftTrackMeters;
        const instanceRadius = Math.max(EPSILON, radius * Math.abs(scales[index].x));
        spin.setFromAxisAngle(LOCAL_WHEEL_AXIS, -travel / instanceRadius);
        matrix.compose(
          positions[index],
          quaternion.copy(quaternions[index]).multiply(spin),
          scales[index]
        );
        object.setMatrixAt(index, matrix);
      }
      object.instanceMatrix.needsUpdate = true;
    }
  };
}

export function bindTrackedRunningGearAnimation(root) {
  const paths = [];
  const wheels = [];
  const proxyWheels = [];
  root.traverse(object => {
    if (object.isInstancedMesh && object.userData.instancePath?.length === object.count) {
      paths.push(createInstancedPathBinding(object));
      return;
    }
    if (object.isInstancedMesh && object.userData.trackPart === 'proxyRoadWheels') {
      proxyWheels.push(createProxyWheelBinding(object));
      return;
    }
    if (object.isMesh && ['roadWheel', 'sprocket', 'idler', 'returnRoller']
      .includes(object.userData.trackPart)) {
      wheels.push(createWheelBinding(object));
    }
  });
  if (paths.length === 0 && wheels.length === 0 && proxyWheels.length === 0) {
    return null;
  }
  const binding = {
    modelVersion: 'track-distance-projection-v1',
    dataQuality: 'renderer projection of deterministic resolved vehicle travel; no visual state feeds simulation',
    pathBindingCount: paths.length,
    wheelBindingCount: wheels.length,
    proxyWheelBindingCount: proxyWheels.length,
    apply(state) {
      for (const path of paths) path.apply(sideTravel(state, path.semanticSide));
      for (const wheel of wheels) wheel.apply(sideTravel(state, wheel.semanticSide));
      for (const proxy of proxyWheels) proxy.applyState(state);
    }
  };
  root.userData.trackMotionBinding = binding;
  root.userData.setTrackMotion = state => binding.apply(state);
  return binding;
}

const STATE_VERSION = 1;
const EPSILON = 1e-9;

export const VEHICLE_MASS_ESTIMATE_DATA_QUALITY =
  'gameplay approximation derived from rigid envelope volume and armored/unarmored class; replace with sourced combat masses';
export const EXPLOSIVE_FENCE_DAMAGE_DATA_QUALITY =
  'gameplay approximation derived from wound damage, blast radius, and caliber; replace with sourced obstacle blast effects';

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function pointSegmentDistance2D(point, start, end) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= EPSILON) {
    return Math.hypot(point.x - start[0], point.z - start[1]);
  }
  const progress = Math.max(0, Math.min(
    1,
    ((point.x - start[0]) * dx + (point.z - start[1]) * dz)
      / lengthSquared
  ));
  return Math.hypot(
    point.x - (start[0] + dx * progress),
    point.z - (start[1] + dz * progress)
  );
}

export function estimateVehicleCrushMassTonnes(vehicleSpec) {
  const dimensions = vehicleSpec?.dimensionsMeters;
  if (!dimensions) return 0;
  const volume = Math.max(
    0,
    finite(dimensions.length) * finite(dimensions.width) * finite(dimensions.height)
  );
  const armored = Object.values(vehicleSpec.armorMm ?? {})
    .some(value => finite(value) > 0);
  const envelopeFactor = armored ? 0.55 : 0.08;
  return Math.round(Math.max(0.5, volume * envelopeFactor) * 10) / 10;
}

export function calculateLinearObstacleBlastDamage(weapon) {
  const woundDamage = Math.max(0, finite(Number(weapon?.woundDamage)));
  const explosiveRadius = Math.max(0, finite(Number(weapon?.explosiveRadius)));
  const caliber = Math.max(0, finite(Number(weapon?.caliberMm)));
  if (!(explosiveRadius > 0)) return 0;
  return Math.max(
    1,
    Math.min(400, woundDamage * 0.9 + explosiveRadius * 18 + caliber * 0.8)
  );
}

function normalizeSegment(source) {
  if (!source?.id || !source?.colliderId || !source?.runId) {
    throw new Error('Destructible obstacle segment requires stable ids');
  }
  if (!Array.isArray(source.start) || source.start.length !== 2
      || !Array.isArray(source.end) || source.end.length !== 2) {
    throw new Error(`Destructible obstacle ${source.id} requires 2D endpoints`);
  }
  const policy = source.policy;
  if (!policy || typeof policy !== 'object') {
    throw new Error(`Destructible obstacle ${source.id} requires policy`);
  }
  const maxHealth = finite(policy.maxHealth);
  if (!(maxHealth > 0)) {
    throw new Error(`Destructible obstacle ${source.id} requires positive health`);
  }
  return {
    id: String(source.id),
    colliderId: String(source.colliderId),
    runId: String(source.runId),
    segmentIndex: Number(source.segmentIndex) || 0,
    start: [finite(source.start[0]), finite(source.start[1])],
    end: [finite(source.end[0]), finite(source.end[1])],
    colliderRecord: {
      ...source.colliderRecord,
      blocks: [...(source.colliderRecord?.blocks ?? [])]
    },
    obstacleRecord: { ...source.obstacleRecord },
    policy: {
      maxHealth,
      minimumMovingSpeedMps: Math.max(0, finite(policy.minimumMovingSpeedMps)),
      heavyVehicleMassTonnes: Math.max(0, finite(policy.heavyVehicleMassTonnes)),
      highImpactSpeedMps: Math.max(0, finite(policy.highImpactSpeedMps)),
      momentumThresholdTonneMps: Math.max(
        0,
        finite(policy.momentumThresholdTonneMps)
      ),
      blastDamageScale: Math.max(0, finite(policy.blastDamageScale, 1)),
      dataQuality: String(policy.dataQuality ?? 'gameplay approximation')
    },
    health: maxHealth,
    destroyed: false,
    eventVersion: 0,
    lastCause: null
  };
}

function snapshot(segment) {
  return {
    id: segment.id,
    colliderId: segment.colliderId,
    runId: segment.runId,
    segmentIndex: segment.segmentIndex,
    health: segment.health,
    maxHealth: segment.policy.maxHealth,
    destroyed: segment.destroyed,
    eventVersion: segment.eventVersion,
    lastCause: segment.lastCause
  };
}

export class DestructibleLinearObstacleSystem {
  constructor({ onSegmentChanged = null } = {}) {
    this.segments = new Map();
    this.colliderToSegment = new Map();
    this.onSegmentChanged = typeof onSegmentChanged === 'function'
      ? onSegmentChanged
      : null;
  }

  clear() {
    this.segments.clear();
    this.colliderToSegment.clear();
  }

  registerSegment(source) {
    const segment = normalizeSegment(source);
    if (this.segments.has(segment.id)
        || this.colliderToSegment.has(segment.colliderId)) {
      throw new Error(`Duplicate destructible obstacle segment ${segment.id}`);
    }
    this.segments.set(segment.id, segment);
    this.colliderToSegment.set(segment.colliderId, segment.id);
    return snapshot(segment);
  }

  getSegment(id) {
    const segment = this.segments.get(String(id));
    return segment ? snapshot(segment) : null;
  }

  getSegmentByColliderId(colliderId) {
    const id = this.colliderToSegment.get(String(colliderId));
    return id ? this.getSegment(id) : null;
  }

  applyDamage(id, amount, cause) {
    const segment = this.segments.get(String(id));
    if (!segment || segment.destroyed || !(amount > 0)) {
      return segment ? snapshot(segment) : null;
    }
    segment.health = Math.max(0, segment.health - amount);
    segment.destroyed = segment.health <= 0;
    segment.eventVersion++;
    segment.lastCause = String(cause ?? 'damage');
    const result = snapshot(segment);
    this.onSegmentChanged?.(result, segment);
    return result;
  }

  applyVehicleImpact({
    colliderId,
    massTonnes,
    speedMetersPerSecond,
    vehicleId = null
  }) {
    const segmentId = this.colliderToSegment.get(String(colliderId));
    const segment = segmentId ? this.segments.get(segmentId) : null;
    if (!segment || segment.destroyed) return null;
    const mass = Math.max(0, finite(massTonnes));
    const speed = Math.max(0, finite(speedMetersPerSecond));
    const policy = segment.policy;
    const moving = speed + EPSILON >= policy.minimumMovingSpeedMps;
    const qualifies = moving && (
      mass + EPSILON >= policy.heavyVehicleMassTonnes
      || speed + EPSILON >= policy.highImpactSpeedMps
      || mass * speed + EPSILON >= policy.momentumThresholdTonneMps
    );
    if (!qualifies) return snapshot(segment);
    return this.applyDamage(
      segment.id,
      policy.maxHealth,
      `vehicle:${vehicleId ?? 'unknown'}`
    );
  }

  applyBlast({ position, radiusMeters, damageAtCenter }) {
    const radius = Math.max(0, finite(radiusMeters));
    const centerDamage = Math.max(0, finite(damageAtCenter));
    if (!(radius > 0) || !(centerDamage > 0)) return [];
    const results = [];
    for (const segment of [...this.segments.values()]
      .sort((left, right) => left.id.localeCompare(right.id))) {
      if (segment.destroyed) continue;
      const distance = pointSegmentDistance2D(position, segment.start, segment.end);
      if (distance > radius) continue;
      const falloff = Math.max(0, 1 - distance / radius);
      const result = this.applyDamage(
        segment.id,
        centerDamage * falloff * segment.policy.blastDamageScale,
        'explosion'
      );
      if (result) results.push(result);
    }
    return results;
  }

  captureState() {
    return {
      version: STATE_VERSION,
      segments: [...this.segments.values()]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(snapshot)
    };
  }

  restoreState(saved) {
    const records = saved?.version === STATE_VERSION
      && Array.isArray(saved.segments)
      ? new Map(saved.segments.map(record => [String(record.id), record]))
      : new Map();
    for (const segment of [...this.segments.values()]
      .sort((left, right) => left.id.localeCompare(right.id))) {
      const record = records.get(segment.id);
      segment.health = Math.max(
        0,
        Math.min(segment.policy.maxHealth, finite(record?.health, segment.policy.maxHealth))
      );
      segment.destroyed = record?.destroyed === true || segment.health <= 0;
      if (segment.destroyed) segment.health = 0;
      segment.eventVersion = Math.max(0, Math.floor(finite(record?.eventVersion)));
      segment.lastCause = record?.lastCause == null
        ? null
        : String(record.lastCause);
      this.onSegmentChanged?.(snapshot(segment), segment);
    }
    return this.captureState();
  }
}

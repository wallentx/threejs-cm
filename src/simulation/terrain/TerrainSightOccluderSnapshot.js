function requireRevision(revision) {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new TypeError('terrain sight revision must be a non-negative safe integer');
  }
  return revision;
}

/**
 * Publish immutable renderer-neutral sight records in their current traversal
 * order. Building LOS has separate authority, and explicitly transparent
 * obstacles never enter the terrain sight path.
 */
export function createTerrainSightOccluderSnapshot(revision, sourceRecords) {
  requireRevision(revision);
  if (!Array.isArray(sourceRecords)) {
    throw new TypeError('terrain sight source records must be an array');
  }
  const records = sourceRecords
    .filter(record => !record?.buildingId && record?.occludesSight !== false)
    .map(record => Object.freeze({ ...record }));
  return Object.freeze({
    revision,
    records: Object.freeze(records)
  });
}

/**
 * Validate the narrow producer/consumer contract without normalizing or
 * copying it. Invalid providers fail explicitly instead of leaving a stale
 * acceleration cache active.
 */
export function validateTerrainSightOccluderSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new TypeError('terrain sight snapshot must be a record');
  }
  requireRevision(snapshot.revision);
  if (!Array.isArray(snapshot.records)) {
    throw new TypeError('terrain sight snapshot records must be an array');
  }
  if (!Object.isFrozen(snapshot) || !Object.isFrozen(snapshot.records)
      || !snapshot.records.every(record => (
        record && typeof record === 'object' && Object.isFrozen(record)
      ))) {
    throw new TypeError('terrain sight snapshot and records must be frozen');
  }
  return snapshot;
}

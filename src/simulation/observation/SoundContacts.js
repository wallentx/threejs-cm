import {
  CONTACT_CHANNEL,
  createContact
} from './ContactState.js';
import { isLivingObserver } from './ObservationEquipment.js';

export const SOUND_REPORT_KIND = Object.freeze({
  WEAPON: 'WEAPON_REPORT'
});

export const SOUND_CONTACT_APPROXIMATION =
  'first-order free-field weapon-report gameplay approximation v1';

const UINT32_RANGE = 0x100000000;
const TWO_PI = Math.PI * 2;

function stableId(value, field) {
  if ((typeof value !== 'string' && typeof value !== 'number')
      || (typeof value === 'number' && !Number.isFinite(value))
      || String(value).length === 0) {
    throw new TypeError(`${field} must be a stable string or number`);
  }
  return value;
}

function positionArray(position, field = 'position') {
  const values = Array.isArray(position)
    ? [position[0], position[1], position[2]]
    : [position?.x, position?.y, position?.z];
  if (values.some(value => !Number.isFinite(value))) {
    throw new TypeError(`${field} must contain finite x, y, and z values`);
  }
  return values;
}

function optionalPositionArray(position) {
  try {
    return positionArray(position);
  } catch {
    return null;
  }
}

function stableHash(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function hashFraction(text) {
  return stableHash(text) / UINT32_RANGE;
}

function eventIdForShot(shotSequence) {
  return `weapon-report:${String(shotSequence).padStart(12, '0')}`;
}

export function weaponReportSignature(weapon) {
  const kind = String(weapon?.kind ?? '').trim();
  const caliberMm = Number(weapon?.caliberMm);
  if (!kind) throw new TypeError('weapon kind is required for a weapon report');
  if (!Number.isFinite(caliberMm) || caliberMm <= 0) {
    throw new TypeError('weapon caliberMm must be positive and finite');
  }

  let rangeM;
  if (kind.startsWith('cannon')) {
    rangeM = 700 + caliberMm * 8;
  } else if (kind === 'machine_gun') {
    rangeM = 500 + caliberMm * 18;
  } else if (kind === 'rifle') {
    rangeM = 360 + caliberMm * 12;
  } else if (kind === 'submachine_gun') {
    rangeM = 220 + caliberMm * 10;
  } else {
    rangeM = 280 + caliberMm * 8;
  }

  return Object.freeze({
    rangeM: Math.round(rangeM),
    approximationLabel: SOUND_CONTACT_APPROXIMATION
  });
}

export function createWeaponReportEvent({
  shotSequence,
  sourceUnitId,
  sourceFaction,
  weapon,
  origin
}) {
  if (!Number.isSafeInteger(shotSequence) || shotSequence <= 0) {
    throw new TypeError('shotSequence must be a positive safe integer');
  }
  stableId(sourceUnitId, 'sourceUnitId');
  if (typeof sourceFaction !== 'string' || sourceFaction.length === 0) {
    throw new TypeError('sourceFaction must be a non-empty string');
  }
  const signature = weaponReportSignature(weapon);
  const frozenOrigin = Object.freeze(positionArray(origin, 'origin'));
  return Object.freeze({
    version: 1,
    id: eventIdForShot(shotSequence),
    shotSequence,
    reportKind: SOUND_REPORT_KIND.WEAPON,
    sourceUnitId,
    sourceFaction,
    weaponId: weapon?.id ?? null,
    weaponKind: String(weapon.kind).trim(),
    caliberMm: Number(weapon.caliberMm),
    signatureRangeM: signature.rangeM,
    approximationLabel: signature.approximationLabel,
    origin: frozenOrigin
  });
}

export function validateWeaponReportEvent(event) {
  if (!event || typeof event !== 'object') {
    throw new TypeError('weapon report event must be an object');
  }
  if (!Number.isSafeInteger(event.shotSequence) || event.shotSequence <= 0) {
    throw new TypeError('weapon report event shotSequence must be a positive safe integer');
  }
  if (event.id !== eventIdForShot(event.shotSequence)) {
    throw new TypeError('weapon report event id must derive from shotSequence');
  }
  if (event.reportKind !== SOUND_REPORT_KIND.WEAPON) {
    throw new TypeError(`weapon report event kind must be ${SOUND_REPORT_KIND.WEAPON}`);
  }
  stableId(event.sourceUnitId, 'weapon report event sourceUnitId');
  if (typeof event.sourceFaction !== 'string' || event.sourceFaction.length === 0) {
    throw new TypeError('weapon report event sourceFaction must be a non-empty string');
  }
  positionArray(event.origin, 'weapon report event origin');
  const signature = weaponReportSignature({
    kind: event.weaponKind,
    caliberMm: event.caliberMm
  });
  if (event.signatureRangeM !== signature.rangeM
      || event.approximationLabel !== signature.approximationLabel) {
    throw new TypeError('weapon report event signature must match the sound-contact model');
  }
  return event;
}

function livingListeners(unit) {
  return [...(unit?.roster ?? [])]
    .filter(person => person?.id !== null && person?.id !== undefined)
    .filter(isLivingObserver)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function listenerPosition(unit, person) {
  const resolved = unit?.getSoldierWorldPosition?.(person?.id);
  return optionalPositionArray(
    person?.worldPosition
      ?? person?.position
      ?? resolved
      ?? unit?.position
  );
}

function displacedReportPosition(event, listenerUnitId, listenerSoldierId, distanceBand) {
  // The transient origin participates in the deterministic hash but is not
  // retained by the contact. Public event/listener IDs therefore cannot be
  // inverted into the exact displacement vector.
  const key = [
    event.id,
    listenerUnitId,
    listenerSoldierId,
    event.weaponId ?? '',
    ...event.origin
  ].join('\u0000');
  const uncertaintyM = 12 + distanceBand * 5;
  const displacementM = uncertaintyM
    * (0.35 + hashFraction(`${key}\u0000distance`) * 0.25);
  const angle = hashFraction(`${key}\u0000bearing`) * TWO_PI;
  return {
    position: [
      event.origin[0] + Math.cos(angle) * displacementM,
      0,
      event.origin[2] + Math.sin(angle) * displacementM
    ],
    uncertaintyM
  };
}

export function projectWeaponReportContacts(eventInput, units, observedAt) {
  const event = validateWeaponReportEvent(eventInput);
  if (!Number.isFinite(observedAt) || observedAt < 0) {
    throw new TypeError('observedAt must be finite and non-negative');
  }
  const orderedUnits = [...(units ?? [])]
    .filter(unit => unit?.id !== null && unit?.id !== undefined)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const projections = [];

  for (const unit of orderedUnits) {
    if (unit.id === event.sourceUnitId || unit.faction === event.sourceFaction) continue;
    if (typeof unit.faction !== 'string' || unit.faction.length === 0) continue;

    let selected = null;
    for (const person of livingListeners(unit)) {
      const position = listenerPosition(unit, person);
      if (!position) continue;
      const distanceM = Math.hypot(
        position[0] - event.origin[0],
        position[2] - event.origin[2]
      );
      if (distanceM > event.signatureRangeM) continue;
      if (!selected
          || distanceM < selected.distanceM - 1e-12
          || (Math.abs(distanceM - selected.distanceM) <= 1e-12
            && String(person.id).localeCompare(String(selected.person.id)) < 0)) {
        selected = { person, distanceM };
      }
    }
    if (!selected) continue;

    const distanceRatio = Math.max(
      0,
      Math.min(1, selected.distanceM / event.signatureRangeM)
    );
    const distanceBand = Math.min(4, Math.floor(distanceRatio * 5));
    const report = displacedReportPosition(
      event,
      unit.id,
      selected.person.id,
      distanceBand
    );
    const contact = createContact({
      targetUnitId: event.sourceUnitId,
      targetSoldierId: null,
      position: report.position,
      observedAt,
      updatedAt: observedAt,
      sourceUnitId: unit.id,
      sourceSoldierId: selected.person.id,
      channel: CONTACT_CHANNEL.SOUND,
      confidence: 0.7 - distanceBand * 0.08,
      uncertaintyM: report.uncertaintyM,
      sourceEventId: event.id,
      reportKind: event.reportKind,
      approximationLabel: event.approximationLabel
    });
    projections.push({
      listenerUnitId: unit.id,
      targetUnitId: event.sourceUnitId,
      contact
    });
  }

  return projections;
}

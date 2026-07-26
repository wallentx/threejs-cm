export const CONTACT_CHANNEL = Object.freeze({
  DIRECT: 'DIRECT',
  VOICE: 'VOICE',
  RADIO: 'RADIO'
});

const CHANNEL_PRIORITY = Object.freeze({
  [CONTACT_CHANNEL.DIRECT]: 3,
  [CONTACT_CHANNEL.VOICE]: 2,
  [CONTACT_CHANNEL.RADIO]: 1
});

export function clonePosition(position) {
  if (!position) return null;
  if (Array.isArray(position)) return [
    Number(position[0]) || 0,
    Number(position[1]) || 0,
    Number(position[2]) || 0
  ];
  return [
    Number(position.x) || 0,
    Number(position.y) || 0,
    Number(position.z) || 0
  ];
}

export function createContact({
  targetUnitId,
  position,
  observedAt,
  updatedAt,
  sourceUnitId,
  sourceSoldierId,
  channel,
  confidence,
  uncertaintyM = 0
}) {
  const boundedConfidence = Math.max(0, Math.min(1, confidence));
  const boundedUncertainty = Math.max(0, uncertaintyM);
  return {
    targetUnitId,
    position: clonePosition(position),
    observedAt,
    updatedAt,
    sourceUnitId,
    sourceSoldierId,
    channel,
    confidence: boundedConfidence,
    uncertaintyM: boundedUncertainty,
    baseConfidence: boundedConfidence,
    baseUncertaintyM: boundedUncertainty
  };
}

export function cloneContact(contact) {
  if (!contact) return null;
  return {
    ...contact,
    position: clonePosition(contact.position)
  };
}

export function decayContact(contact, now, {
  lifetimeSeconds = 60,
  uncertaintyGrowthMps = 0.75
} = {}) {
  const age = Math.max(0, now - contact.updatedAt);
  const baseConfidence = contact.baseConfidence ?? contact.confidence;
  const baseUncertaintyM = contact.baseUncertaintyM ?? contact.uncertaintyM;
  return {
    ...cloneContact(contact),
    confidence: Math.max(0, baseConfidence * (1 - age / lifetimeSeconds)),
    uncertaintyM: baseUncertaintyM + age * uncertaintyGrowthMps
  };
}

function lexicalSource(contact) {
  return `${contact.sourceUnitId ?? ''}:${contact.sourceSoldierId ?? ''}`;
}

export function preferContact(left, right) {
  if (!left) return cloneContact(right);
  if (!right) return cloneContact(left);
  if (right.observedAt !== left.observedAt) {
    return cloneContact(right.observedAt > left.observedAt ? right : left);
  }
  if (Math.abs(right.confidence - left.confidence) > 1e-12) {
    return cloneContact(right.confidence > left.confidence ? right : left);
  }
  const rightPriority = CHANNEL_PRIORITY[right.channel] ?? 0;
  const leftPriority = CHANNEL_PRIORITY[left.channel] ?? 0;
  if (rightPriority !== leftPriority) {
    return cloneContact(rightPriority > leftPriority ? right : left);
  }
  return cloneContact(lexicalSource(right) < lexicalSource(left) ? right : left);
}

export function publicContact(contact) {
  if (!contact) return null;
  const {
    baseConfidence: _baseConfidence,
    baseUncertaintyM: _baseUncertaintyM,
    ...publicFields
  } = cloneContact(contact);
  return publicFields;
}

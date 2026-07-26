import {
  OBSERVATION_EQUIPMENT,
  equipmentForObserver,
  isLivingObserver
} from './ObservationEquipment.js';

export const DEFAULT_VOICE_RANGE_M = 18;

export function unitProfile(unit, profiles) {
  return profiles?.get?.(unit.id) ?? unit.observationProfile ?? null;
}

export function livingPeople(unit) {
  return (unit?.roster ?? []).filter(isLivingObserver);
}

export function resolveCommunication(unit, profile = null) {
  const scenario = profile?.communications ?? profile?.communication ?? {};
  const catalog = unit?.vehicleSpec?.communications ?? {};
  return {
    commandNetId: scenario.commandNetId
      ?? profile?.commandNetId
      ?? unit?.commandNetId
      ?? null,
    voiceRangeM: scenario.voiceRangeM
      ?? profile?.voiceRangeM
      ?? DEFAULT_VOICE_RANGE_M,
    radioInstalled: scenario.radioInstalled
      ?? catalog.radioInstalled
      ?? false,
    radioOperatorRoles: scenario.radioOperatorRoles
      ?? catalog.operatorRoles
      ?? [],
    radioOperatorSoldierIds: scenario.radioOperatorSoldierIds ?? []
  };
}

export function hasLivingVoiceEndpoint(unit) {
  return livingPeople(unit).length > 0 && unit?.morale !== 'Broken';
}

export function hasOperationalRadioEndpoint(unit, profile = null) {
  const communication = resolveCommunication(unit, profile);
  if (!communication.radioInstalled || !communication.commandNetId) return false;
  if (unit?.vehicleSpec) {
    const radio = unit.vehicleComponents?.radio;
    if (!radio?.installed || !radio.operational) return false;
  }

  const operators = livingPeople(unit);
  return operators.some(person =>
    communication.radioOperatorSoldierIds.includes(person.id)
    || communication.radioOperatorRoles.includes(person.role)
    || equipmentForObserver(unit, person, profile).has(OBSERVATION_EQUIPMENT.RADIO)
  );
}

export function positionDistance2d(left, right) {
  const dx = (left?.position?.x ?? left?.position?.[0] ?? 0)
    - (right?.position?.x ?? right?.position?.[0] ?? 0);
  const dz = (left?.position?.z ?? left?.position?.[2] ?? 0)
    - (right?.position?.z ?? right?.position?.[2] ?? 0);
  return Math.hypot(dx, dz);
}

function personPosition(unit, person) {
  const explicit = person?.worldPosition;
  if (Array.isArray(explicit)) return { x: explicit[0], z: explicit[2] };
  if (explicit) return explicit;
  return unit?.getSoldierWorldPosition?.(person?.id) ?? unit?.position;
}

function closestLivingDistance2d(sender, receiver) {
  let closest = Infinity;
  for (const senderPerson of livingPeople(sender)) {
    const senderPosition = { position: personPosition(sender, senderPerson) };
    for (const receiverPerson of livingPeople(receiver)) {
      const receiverPosition = { position: personPosition(receiver, receiverPerson) };
      closest = Math.min(closest, positionDistance2d(senderPosition, receiverPosition));
    }
  }
  return closest;
}

export function canRelayByVoice(sender, receiver, senderProfile = null, receiverProfile = null) {
  if (sender === receiver || sender?.faction !== receiver?.faction) return false;
  if (!hasLivingVoiceEndpoint(sender) || !hasLivingVoiceEndpoint(receiver)) return false;
  const senderRange = resolveCommunication(sender, senderProfile).voiceRangeM;
  const receiverRange = resolveCommunication(receiver, receiverProfile).voiceRangeM;
  return closestLivingDistance2d(sender, receiver) <= Math.min(senderRange, receiverRange);
}

export function canRelayByRadio(sender, receiver, senderProfile = null, receiverProfile = null) {
  if (sender === receiver || sender?.faction !== receiver?.faction) return false;
  const senderCommunication = resolveCommunication(sender, senderProfile);
  const receiverCommunication = resolveCommunication(receiver, receiverProfile);
  if (!senderCommunication.commandNetId
    || senderCommunication.commandNetId !== receiverCommunication.commandNetId) {
    return false;
  }
  return hasOperationalRadioEndpoint(sender, senderProfile)
    && hasOperationalRadioEndpoint(receiver, receiverProfile);
}

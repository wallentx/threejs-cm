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

export function canRelayByVoice(sender, receiver, senderProfile = null, receiverProfile = null) {
  if (sender === receiver || sender?.faction !== receiver?.faction) return false;
  if (!hasLivingVoiceEndpoint(sender) || !hasLivingVoiceEndpoint(receiver)) return false;
  const senderRange = resolveCommunication(sender, senderProfile).voiceRangeM;
  const receiverRange = resolveCommunication(receiver, receiverProfile).voiceRangeM;
  return positionDistance2d(sender, receiver) <= Math.min(senderRange, receiverRange);
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

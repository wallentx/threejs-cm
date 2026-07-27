import {
  CONTACT_CHANNEL,
  cloneContact,
  clonePosition,
  createContact,
  decayContact,
  preferContact,
  publicContact
} from '../simulation/observation/ContactState.js';
import {
  OBSERVATION_EQUIPMENT,
  observerHasEquipment,
  isLivingObserver
} from '../simulation/observation/ObservationEquipment.js';
import {
  canRelayByRadio,
  canRelayByVoice,
  unitProfile
} from '../simulation/observation/CommunicationNetwork.js';
import {
  COMMUNICATION_RELAY_DELAY_APPROXIMATION,
  CommunicationRelayQueue,
  DEFAULT_COMMUNICATION_RELAY_DELAYS
} from '../simulation/observation/CommunicationRelayQueue.js';
import {
  projectWeaponReportContacts
} from '../simulation/observation/SoundContacts.js';
import { intersectSegmentOrientedBox3D } from '../simulation/geometry/OrientedBox.js';

const EXPERIENCE_RANGE_M = Object.freeze({
  Green: 140,
  Regular: 160,
  Veteran: 185,
  Crack: 210,
  Elite: 220
});

const DEFAULT_SETTINGS = Object.freeze({
  baseAcquisitionSeconds: 1.8,
  lostAcquisitionDecayRate: 0.5,
  observationMemorySeconds: 60,
  contactLifetimeSeconds: 60,
  uncertaintyGrowthMps: 0.75,
  soundContactLifetimeSeconds: 12,
  soundUncertaintyGrowthMps: 1.5,
  voiceConfidence: 0.92,
  radioConfidence: 0.86,
  voiceRelayDelaySeconds:
    DEFAULT_COMMUNICATION_RELAY_DELAYS[CONTACT_CHANNEL.VOICE],
  radioRelayDelaySeconds:
    DEFAULT_COMMUNICATION_RELAY_DELAYS[CONTACT_CHANNEL.RADIO],
  relayDelayApproximation: COMMUNICATION_RELAY_DELAY_APPROXIMATION,
  terrainSampleMeters: 2.5
});

const TIME_PRECISION = 1e9;
const PROGRESS_PRECISION = 1e12;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function canonicalTime(value) {
  return Math.round(finite(value) * TIME_PRECISION) / TIME_PRECISION;
}

function normalizeTimeAccumulator(value) {
  const accumulated = Math.max(0, finite(value));
  const canonical = canonicalTime(accumulated);
  const roundingNoise = Number.EPSILON
    * Math.max(1, Math.abs(accumulated))
    * 16;
  return Math.abs(accumulated - canonical) <= roundingNoise
    ? canonical
    : accumulated;
}

function canonicalProgress(value) {
  return Math.round(finite(value) * PROGRESS_PRECISION) / PROGRESS_PRECISION;
}

function positionObject(position) {
  if (!position) return { x: 0, y: 0, z: 0 };
  if (Array.isArray(position)) {
    return {
      x: finite(position[0]),
      y: finite(position[1]),
      z: finite(position[2])
    };
  }
  return {
    x: finite(position.x),
    y: finite(position.y),
    z: finite(position.z)
  };
}

function addHeight(position, height) {
  const result = positionObject(position);
  result.y += height;
  return result;
}

function distance3d(left, right) {
  return Math.hypot(
    right.x - left.x,
    right.y - left.y,
    right.z - left.z
  );
}

function stanceName(person, unit) {
  return String(person?.stance ?? unit?.stance ?? 'STANDING').toUpperCase();
}

function eyeHeight(stance) {
  if (stance === 'PRONE') return 0.48;
  if (stance === 'KNEELING' || stance === 'CROUCHED') return 1.05;
  return 1.55;
}

function targetAimHeight(unit, person) {
  if (unit?.vehicleSpec) return 1.6;
  if (unit?.structureSpec) return 1.35;
  return eyeHeight(stanceName(person, unit)) * 0.82;
}

function velocityMagnitude(person, unit) {
  const velocity = person?.velocity;
  if (Array.isArray(velocity)) {
    return Math.hypot(
      finite(velocity[0]),
      finite(velocity[1]),
      finite(velocity[2])
    );
  }
  if (velocity) {
    return Math.hypot(finite(velocity.x), finite(velocity.y), finite(velocity.z));
  }
  return Math.abs(finite(unit?.moveSpeed));
}

function observerKey(unitId, soldierId) {
  return `${unitId}\u0000${String(soldierId)}`;
}

function directEpisodeKey(senderUnitId, targetUnitId) {
  return `${typeof senderUnitId}:${JSON.stringify(senderUnitId)}\u0000`
    + `${typeof targetUnitId}:${JSON.stringify(targetUnitId)}`;
}

function cloneAcquisitionSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    position: clonePosition(snapshot.position),
    targetSoldierId: snapshot.targetSoldierId ?? null
  };
}

function cloneObservation(observation) {
  return {
    ...observation,
    lastSeenPosition: clonePosition(observation.lastSeenPosition),
    directEpisodeSnapshot: cloneAcquisitionSnapshot(
      observation.directEpisodeSnapshot
    )
  };
}

function cloneDirectObservationEpisode(episode) {
  return {
    senderUnitId: episode.senderUnitId,
    targetUnitId: episode.targetUnitId,
    episodeSequence: episode.episodeSequence,
    active: episode.active === true,
    acquiredAt: episode.acquiredAt ?? null,
    sourceSoldierId: episode.sourceSoldierId ?? null,
    targetSoldierId: episode.targetSoldierId ?? null,
    position: clonePosition(episode.position),
    confidence: finite(episode.confidence)
  };
}

function personPosition(unit, person) {
  if (person?.worldPosition) return positionObject(person.worldPosition);
  const resolved = unit?.getSoldierWorldPosition?.(person?.id);
  return positionObject(resolved ?? unit?.position);
}

function livingPeople(unit) {
  return (unit?.roster ?? []).filter(isLivingObserver);
}

function targetPoints(unit) {
  const people = sortedPeople(unit);
  if (unit?.type === 'infantry_squad' && people.length > 0) {
    return people.map(person => ({
      person,
      position: personPosition(unit, person),
      targetSoldierId: person.id
    }));
  }
  return [{
    person: people[0] ?? null,
    position: positionObject(unit?.position)
  }];
}

function unitCanBeObserved(unit) {
  if (!unit) return false;
  if (unit.type === 'infantry_squad' || unit.vehicleSpec || unit.structureSpec) {
    return livingPeople(unit).length > 0
      && unit.vehicleDamageState?.destroyed !== true
      && unit.structureState?.destroyed !== true;
  }
  return unit.isCombatEffective?.() ?? true;
}

function sortedUnits(units) {
  return [...units].sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function sortedPeople(unit) {
  return livingPeople(unit).sort((left, right) =>
    String(left.id).localeCompare(String(right.id))
  );
}

export class SpottingSystem {
  constructor(scene, terrainBuilder, options = {}) {
    // `scene` is retained only to preserve the original construction signature.
    // Authoritative observation state never reads or mutates it.
    this.scene = scene ?? null;
    this.terrain = terrainBuilder ?? null;
    this.buildingSystem = options.buildingSystem ?? null;
    this.buildingColliders = [];
    this.buildingCollidersDirty = true;
    this.settings = { ...DEFAULT_SETTINGS, ...(options.settings ?? {}) };
    if (!Number.isFinite(this.settings.voiceRelayDelaySeconds)
        || this.settings.voiceRelayDelaySeconds <= 0) {
      throw new TypeError('voiceRelayDelaySeconds must be positive and finite');
    }
    if (!Number.isFinite(this.settings.radioRelayDelaySeconds)
        || this.settings.radioRelayDelaySeconds <= 0) {
      throw new TypeError('radioRelayDelaySeconds must be positive and finite');
    }
    this.settings.voiceRelayDelaySeconds = canonicalTime(
      this.settings.voiceRelayDelaySeconds
    );
    this.settings.radioRelayDelaySeconds = canonicalTime(
      this.settings.radioRelayDelaySeconds
    );
    if (this.settings.voiceRelayDelaySeconds <= 0
        || this.settings.radioRelayDelaySeconds <= 0) {
      throw new TypeError('relay delays must remain positive at simulation precision');
    }
    this.settings.relayDelayApproximation =
      COMMUNICATION_RELAY_DELAY_APPROXIMATION;
    this.time = 0;
    // Preserve fractional input while exposing only canonical simulation
    // seconds, avoiding partition-dependent drift from rounding every delta.
    this.timeAccumulator = 0;
    this.observations = new Map();
    this.directObservationEpisodes = new Map();
    this.relayQueue = new CommunicationRelayQueue();
    this.unitContacts = new Map();
    this.spottingMap = this.unitContacts;
    this.unitProfiles = new Map();
    this.configureUnitProfiles(options.unitProfiles ?? []);
  }

  configureUnitProfiles(profiles) {
    this.unitProfiles.clear();
    for (const profile of profiles ?? []) {
      if (profile?.id) this.unitProfiles.set(profile.id, profile);
    }
  }

  recordAuditoryEvent(event, allUnits) {
    const projections = projectWeaponReportContacts(event, allUnits, this.time);
    for (const projection of projections) {
      let contacts = this.unitContacts.get(projection.listenerUnitId);
      if (!contacts) {
        contacts = new Map();
        this.unitContacts.set(projection.listenerUnitId, contacts);
      }
      contacts.set(
        projection.targetUnitId,
        preferContact(
          contacts.get(projection.targetUnitId),
          projection.contact
        )
      );
    }
    this.spottingMap = this.unitContacts;
    return projections.map(projection => publicContact(projection.contact));
  }

  segmentIntersectsBox(p1Input, p2Input, box) {
    const p1 = positionObject(p1Input);
    const p2 = positionObject(p2Input);
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    let tMin = 0;
    let tMax = 1;

    const clipAxis = (origin, direction, min, max) => {
      if (!Number.isFinite(min) || !Number.isFinite(max)) return true;
      if (Math.abs(direction) < 1e-8) return origin >= min && origin <= max;
      const inv = 1 / direction;
      let near = (min - origin) * inv;
      let far = (max - origin) * inv;
      if (near > far) [near, far] = [far, near];
      tMin = Math.max(tMin, near);
      tMax = Math.min(tMax, far);
      return tMin <= tMax;
    };

    if (!clipAxis(p1.x, dx, box.minX, box.maxX)) return false;
    if (!clipAxis(p1.z, dz, box.minZ, box.maxZ)) return false;

    const terrainHeight = this.terrain?.getHeightAt?.(
      (finite(box.minX) + finite(box.maxX)) * 0.5,
      (finite(box.minZ) + finite(box.maxZ)) * 0.5
    ) ?? 0;
    const bottom = finite(box.minY, terrainHeight);
    const top = Number.isFinite(box.maxY)
      ? box.maxY
      : Number.isFinite(box.height) ? bottom + box.height : Infinity;
    const dy = p2.y - p1.y;
    const yAtNear = p1.y + dy * tMin;
    const yAtFar = p1.y + dy * tMax;
    return Math.min(yAtNear, yAtFar) <= top
      && Math.max(yAtNear, yAtFar) >= bottom;
  }

  checkLOS(fromPosition, toPosition, options = {}) {
    const origin = addHeight(
      fromPosition,
      options.fromEyeHeight ?? eyeHeight(options.observerStance ?? 'STANDING')
    );
    const target = addHeight(
      toPosition,
      options.toAimHeight ?? eyeHeight(options.targetStance ?? 'STANDING') * 0.82
    );
    const dist = distance3d(origin, target);

    if (this.buildingCollidersDirty) this.refreshBuildingColliders();
    for (const collider of this.buildingColliders) {
      if (!intersectSegmentOrientedBox3D(origin, target, collider)) continue;
      return {
        clear: false,
        coverType: collider.sectionId === 'rubble' ? 'Building rubble' : 'Building',
        buildingId: collider.buildingId,
        sectionId: collider.sectionId,
        dist
      };
    }

    for (const obstacle of this.terrain?.bocageObstacles ?? []) {
      if (obstacle.buildingId) continue;
      if (this.segmentIntersectsBox(origin, target, obstacle)) {
        return { clear: false, coverType: obstacle.type ?? 'Obstacle', dist };
      }
    }

    const getHeightAt = this.terrain?.getHeightAt;
    if (typeof getHeightAt === 'function' && dist > this.settings.terrainSampleMeters * 2) {
      const samples = Math.floor(dist / this.settings.terrainSampleMeters);
      for (let sample = 1; sample < samples; sample++) {
        const t = sample / samples;
        const x = origin.x + (target.x - origin.x) * t;
        const z = origin.z + (target.z - origin.z) * t;
        const rayHeight = origin.y + (target.y - origin.y) * t;
        if (getHeightAt.call(this.terrain, x, z) >= rayHeight - 0.08) {
          return { clear: false, coverType: 'Terrain', dist };
        }
      }
    }

    return { clear: true, coverType: 'Open Ground', dist };
  }

  maximumObservationRange(observerUnit, targetUnit, targetPerson = null) {
    let range = EXPERIENCE_RANGE_M[observerUnit?.experience] ?? EXPERIENCE_RANGE_M.Regular;
    if (targetUnit?.isHiding) range *= 0.55;
    const targetStance = stanceName(targetPerson, targetUnit);
    if (targetStance === 'PRONE') range *= 0.72;
    else if (targetStance === 'KNEELING' || targetStance === 'CROUCHED') range *= 0.88;
    if (velocityMagnitude(targetPerson, targetUnit) > 0.2) range *= 1.08;
    return range;
  }

  acquisitionSeconds(
    observerUnit,
    observer,
    targetUnit,
    targetPerson,
    distance,
    hasBinoculars
  ) {
    const maximumRange = this.maximumObservationRange(observerUnit, targetUnit, targetPerson);
    const normalizedRange = Math.max(0, Math.min(1, distance / Math.max(1, maximumRange)));
    let seconds = this.settings.baseAcquisitionSeconds * (0.75 + normalizedRange * 2.25);

    const observerStance = stanceName(observer, observerUnit);
    if (observerStance === 'PRONE') seconds *= 0.9;
    else if (observerStance === 'KNEELING' || observerStance === 'CROUCHED') seconds *= 0.95;
    if (velocityMagnitude(observer, observerUnit) > 0.2) seconds *= 1.65;
    if ((observer?.suppression ?? observerUnit?.suppression ?? 0) > 20) seconds *= 1.35;

    const targetStance = stanceName(targetPerson, targetUnit);
    if (targetStance === 'PRONE') seconds *= 1.35;
    else if (targetStance === 'KNEELING' || targetStance === 'CROUCHED') seconds *= 1.12;
    if (targetUnit?.isHiding) seconds *= 1.8;
    if (velocityMagnitude(targetPerson, targetUnit) > 0.2) seconds *= 0.72;
    if (hasBinoculars) seconds *= 0.58;
    return Math.max(0.2, seconds);
  }

  evaluateObservation(observerUnit, observer, targetUnit, hasBinoculars) {
    const observerPosition = personPosition(observerUnit, observer);
    const observerStance = stanceName(observer, observerUnit);
    let best = null;

    for (const target of targetPoints(targetUnit)) {
      const targetStance = stanceName(target.person, targetUnit);
      const maximumRange = this.maximumObservationRange(
        observerUnit,
        targetUnit,
        target.person
      );
      const los = this.checkLOS(observerPosition, target.position, {
        observerStance,
        targetStance,
        fromEyeHeight: eyeHeight(observerStance),
        toAimHeight: targetAimHeight(targetUnit, target.person)
      });
      if (!los.clear || los.dist > maximumRange) continue;
      const acquisitionSeconds = this.acquisitionSeconds(
        observerUnit,
        observer,
        targetUnit,
        target.person,
        los.dist,
        hasBinoculars
      );
      if (!best || acquisitionSeconds < best.acquisitionSeconds) {
        best = {
          distance: los.dist,
          acquisitionSeconds,
          targetPosition: target.position,
          targetSoldierId: target.targetSoldierId ?? null
        };
      }
    }
    return best;
  }

  updateObservation(observerUnit, observer, targetUnit, deltaSeconds) {
    const key = observerKey(observerUnit.id, observer.id);
    let targetMap = this.observations.get(key);
    if (!targetMap) {
      targetMap = new Map();
      this.observations.set(key, targetMap);
    }
    const existing = targetMap.get(targetUnit.id) ?? {
      observerUnitId: observerUnit.id,
      observerSoldierId: observer.id,
      targetUnitId: targetUnit.id,
      acquisition: 0,
      visibleNow: false,
      lastSeenPosition: null,
      lastSeenTargetSoldierId: null,
      lastSeenAt: null,
      confidence: 0,
      directEpisodeSequence: 0,
      directEpisodeActive: false,
      directEpisodeAcquiredAt: null,
      directEpisodeSnapshot: null
    };
    const intervalStart = canonicalTime(this.time - deltaSeconds);
    const previousAcquisition = Math.max(
      0,
      Math.min(1, finite(existing.acquisition))
    );
    const wasEpisodeActive = existing.directEpisodeActive === true;
    let acquisitionEvent = null;
    const profile = unitProfile(observerUnit, this.unitProfiles);
    const hasBinoculars = observerHasEquipment(
      observerUnit,
      observer,
      OBSERVATION_EQUIPMENT.BINOCULARS,
      profile
    );
    const evaluation = this.evaluateObservation(
      observerUnit,
      observer,
      targetUnit,
      hasBinoculars
    );

    if (evaluation) {
      const requiredSeconds = canonicalTime(evaluation.acquisitionSeconds);
      existing.acquisition = Math.min(
        1,
        canonicalProgress(
          previousAcquisition + deltaSeconds / requiredSeconds
        )
      );
      existing.visibleNow = existing.acquisition >= 1 - 1e-12;
      if (existing.visibleNow) {
        existing.lastSeenPosition = clonePosition(evaluation.targetPosition);
        existing.lastSeenTargetSoldierId = evaluation.targetSoldierId;
        existing.lastSeenAt = this.time;
        existing.confidence = 1;
        if (!wasEpisodeActive) {
          const secondsToAcquire = Math.max(
            0,
            (1 - previousAcquisition) * requiredSeconds
          );
          existing.directEpisodeSequence = Math.max(
            0,
            Number.isSafeInteger(existing.directEpisodeSequence)
              ? existing.directEpisodeSequence
              : 0
          ) + 1;
          existing.directEpisodeAcquiredAt = canonicalTime(
            Math.min(this.time, intervalStart + secondsToAcquire)
          );
          existing.directEpisodeSnapshot = {
            position: clonePosition(evaluation.targetPosition),
            targetSoldierId: evaluation.targetSoldierId ?? null
          };
          acquisitionEvent = {
            senderUnitId: observerUnit.id,
            sourceSoldierId: observer.id,
            targetUnitId: targetUnit.id,
            targetSoldierId: evaluation.targetSoldierId ?? null,
            observerEpisodeSequence: existing.directEpisodeSequence,
            acquiredAt: existing.directEpisodeAcquiredAt,
            position: clonePosition(evaluation.targetPosition),
            confidence: 1
          };
        }
        existing.directEpisodeActive = true;
      } else {
        existing.directEpisodeActive = false;
      }
    } else {
      existing.acquisition = Math.max(
        0,
        canonicalProgress(
          previousAcquisition
            - deltaSeconds * this.settings.lostAcquisitionDecayRate
        )
      );
      existing.visibleNow = false;
      existing.directEpisodeActive = false;
    }

    if (!existing.visibleNow && existing.lastSeenAt !== null) {
      const age = Math.max(0, this.time - existing.lastSeenAt);
      existing.confidence = Math.max(0, 1 - age / this.settings.observationMemorySeconds);
    }
    targetMap.set(targetUnit.id, existing);
    return { observation: existing, acquisitionEvent };
  }

  buildDirectContacts(units) {
    const directBySource = new Map();
    for (const unit of units) {
      const contacts = new Map();
      for (const observer of sortedPeople(unit)) {
        const observation = this.observations
          .get(observerKey(unit.id, observer.id));
        for (const state of observation?.values() ?? []) {
          if (!state.visibleNow) continue;
          const candidate = createContact({
            targetUnitId: state.targetUnitId,
            targetSoldierId: state.lastSeenTargetSoldierId ?? null,
            position: state.lastSeenPosition,
            observedAt: state.lastSeenAt,
            updatedAt: this.time,
            sourceUnitId: unit.id,
            sourceSoldierId: observer.id,
            channel: CONTACT_CHANNEL.DIRECT,
            confidence: state.confidence,
            uncertaintyM: 0
          });
          contacts.set(
            state.targetUnitId,
            preferContact(contacts.get(state.targetUnitId), candidate)
          );
        }
      }
      directBySource.set(unit.id, contacts);
    }
    return directBySource;
  }

  updateDirectObservationEpisodes(
    directBySource,
    acquisitionEvents,
    unitIds
  ) {
    const eventsByPair = new Map();
    for (const event of acquisitionEvents) {
      const key = directEpisodeKey(event.senderUnitId, event.targetUnitId);
      if (!eventsByPair.has(key)) eventsByPair.set(key, []);
      eventsByPair.get(key).push(event);
    }
    for (const events of eventsByPair.values()) {
      events.sort((left, right) =>
        left.acquiredAt - right.acquiredAt
        || String(left.sourceSoldierId).localeCompare(String(right.sourceSoldierId))
        || String(left.targetSoldierId ?? '').localeCompare(
          String(right.targetSoldierId ?? '')
        )
      );
    }

    const visiblePairs = new Set();
    const acquiredEpisodes = [];
    for (const [senderUnitId, contacts] of directBySource) {
      const orderedContacts = [...contacts.values()].sort((left, right) =>
        String(left.targetUnitId).localeCompare(String(right.targetUnitId))
      );
      for (const direct of orderedContacts) {
        const key = directEpisodeKey(senderUnitId, direct.targetUnitId);
        visiblePairs.add(key);
        const previous = this.directObservationEpisodes.get(key);
        if (previous?.active) continue;
        const acquisition = eventsByPair.get(key)?.[0] ?? {
          senderUnitId,
          sourceSoldierId: direct.sourceSoldierId,
          targetUnitId: direct.targetUnitId,
          targetSoldierId: direct.targetSoldierId ?? null,
          acquiredAt: direct.observedAt,
          position: direct.position,
          confidence: direct.confidence
        };
        const episode = {
          senderUnitId,
          targetUnitId: direct.targetUnitId,
          episodeSequence: (previous?.episodeSequence ?? 0) + 1,
          active: true,
          acquiredAt: canonicalTime(acquisition.acquiredAt),
          sourceSoldierId: acquisition.sourceSoldierId,
          targetSoldierId: acquisition.targetSoldierId ?? null,
          position: clonePosition(acquisition.position),
          confidence: Math.max(0, Math.min(1, finite(acquisition.confidence)))
        };
        this.directObservationEpisodes.set(key, episode);
        acquiredEpisodes.push(cloneDirectObservationEpisode(episode));
      }
    }

    for (const [key, episode] of this.directObservationEpisodes) {
      if (!unitIds.has(episode.senderUnitId)
          || !unitIds.has(episode.targetUnitId)) {
        this.directObservationEpisodes.delete(key);
      } else if (!visiblePairs.has(key) && episode.active) {
        episode.active = false;
      }
    }
    return acquiredEpisodes;
  }

  relayChannel(sender, receiver) {
    const senderProfile = unitProfile(sender, this.unitProfiles);
    const receiverProfile = unitProfile(receiver, this.unitProfiles);
    if (canRelayByVoice(sender, receiver, senderProfile, receiverProfile)) {
      return CONTACT_CHANNEL.VOICE;
    }
    if (canRelayByRadio(sender, receiver, senderProfile, receiverProfile)) {
      return CONTACT_CHANNEL.RADIO;
    }
    return null;
  }

  relayRouteIsValid(report, sender, receiver) {
    const senderProfile = unitProfile(sender, this.unitProfiles);
    const receiverProfile = unitProfile(receiver, this.unitProfiles);
    if (report.channel === CONTACT_CHANNEL.VOICE) {
      return canRelayByVoice(
        sender,
        receiver,
        senderProfile,
        receiverProfile
      );
    }
    if (report.channel === CONTACT_CHANNEL.RADIO) {
      return canRelayByRadio(
        sender,
        receiver,
        senderProfile,
        receiverProfile
      );
    }
    return false;
  }

  relayDelaySeconds(channel) {
    return channel === CONTACT_CHANNEL.VOICE
      ? this.settings.voiceRelayDelaySeconds
      : this.settings.radioRelayDelaySeconds;
  }

  enqueueRelayEpisodes(episodes, units) {
    for (const episode of episodes) {
      const sender = units.find(unit => unit.id === episode.senderUnitId);
      if (!sender) continue;
      for (const receiver of units) {
        if (receiver === sender || receiver.faction !== sender.faction) continue;
        const channel = this.relayChannel(sender, receiver);
        if (!channel) continue;
        const delaySeconds = this.relayDelaySeconds(channel);
        this.relayQueue.enqueue({
          senderUnitId: sender.id,
          receiverUnitId: receiver.id,
          targetUnitId: episode.targetUnitId,
          sourceSoldierId: episode.sourceSoldierId,
          targetSoldierId: episode.targetSoldierId,
          episodeSequence: episode.episodeSequence,
          channel,
          confidence: episode.confidence,
          acquiredAt: episode.acquiredAt,
          delaySeconds,
          dueAt: canonicalTime(episode.acquiredAt + delaySeconds),
          position: episode.position,
          approximationLabel: this.settings.relayDelayApproximation
        });
      }
    }
  }

  deliverRelayReports(units, nextContacts) {
    const unitsById = new Map(units.map(unit => [unit.id, unit]));
    const unitIds = new Set(unitsById.keys());
    this.relayQueue.pruneMissingUnits(unitIds);
    for (const report of this.relayQueue.pendingReports()) {
      const sender = unitsById.get(report.senderUnitId);
      const receiver = unitsById.get(report.receiverUnitId);
      const target = unitsById.get(report.targetUnitId);
      if (!sender
          || !receiver
          || !target
          || !this.relayRouteIsValid(report, sender, receiver)) {
        this.relayQueue.cancel(report);
        continue;
      }
      if (report.dueAt > this.time + 1e-12) continue;

      const confidenceScale = report.channel === CONTACT_CHANNEL.VOICE
        ? this.settings.voiceConfidence
        : this.settings.radioConfidence;
      const baseContact = createContact({
        targetUnitId: report.targetUnitId,
        targetSoldierId: report.targetSoldierId,
        position: report.position,
        observedAt: report.acquiredAt,
        updatedAt: report.dueAt,
        sourceUnitId: report.senderUnitId,
        sourceSoldierId: report.sourceSoldierId,
        channel: report.channel,
        confidence: report.confidence * confidenceScale,
        uncertaintyM: report.channel === CONTACT_CHANNEL.VOICE ? 1 : 2,
        approximationLabel: report.approximationLabel
      });
      const relayed = decayContact(baseContact, this.time, {
        lifetimeSeconds: this.settings.contactLifetimeSeconds,
        uncertaintyGrowthMps: this.settings.uncertaintyGrowthMps
      });
      const receiverContacts = nextContacts.get(receiver.id);
      if (relayed.confidence > 1e-6) {
        receiverContacts.set(
          relayed.targetUnitId,
          preferContact(receiverContacts.get(relayed.targetUnitId), relayed)
        );
      }
      this.relayQueue.markDelivered(report);
    }
  }

  advance(allUnits, deltaSeconds) {
    const requestedDelta = Math.max(0, finite(deltaSeconds));
    const intervalStart = this.time;
    this.timeAccumulator = normalizeTimeAccumulator(
      this.timeAccumulator + requestedDelta
    );
    this.time = canonicalTime(this.timeAccumulator);
    const delta = Math.max(0, this.time - intervalStart);
    this.refreshBuildingColliders();
    const units = sortedUnits(allUnits ?? []);
    const unitIds = new Set(units.map(unit => unit.id));
    const liveObserverKeys = new Set();
    const acquisitionEvents = [];
    for (const targetMap of this.observations.values()) {
      for (const observation of targetMap.values()) {
        observation.visibleNow = false;
        if (observation.lastSeenAt !== null) {
          const age = Math.max(0, this.time - observation.lastSeenAt);
          observation.confidence = Math.max(
            0,
            1 - age / this.settings.observationMemorySeconds
          );
        }
      }
    }

    for (const observerUnit of units) {
      if (observerUnit.morale === 'Broken') continue;
      for (const observer of sortedPeople(observerUnit)) {
        const key = observerKey(observerUnit.id, observer.id);
        liveObserverKeys.add(key);
        for (const targetUnit of units) {
          if (targetUnit.faction === observerUnit.faction || !unitCanBeObserved(targetUnit)) continue;
          const update = this.updateObservation(
            observerUnit,
            observer,
            targetUnit,
            delta
          );
          if (update.acquisitionEvent) {
            acquisitionEvents.push(update.acquisitionEvent);
          }
        }
      }
    }
    for (const key of this.observations.keys()) {
      if (!liveObserverKeys.has(key)) this.observations.delete(key);
    }
    for (const targetMap of this.observations.values()) {
      for (const observation of targetMap.values()) {
        if (!observation.visibleNow) observation.directEpisodeActive = false;
      }
    }

    const nextContacts = new Map();
    for (const unit of units) {
      const contacts = new Map();
      if (livingPeople(unit).length > 0) {
        for (const [targetId, previous] of this.unitContacts.get(unit.id) ?? []) {
          const soundContact = previous.channel === CONTACT_CHANNEL.SOUND;
          const decayed = decayContact(previous, this.time, {
            lifetimeSeconds: soundContact
              ? this.settings.soundContactLifetimeSeconds
              : this.settings.contactLifetimeSeconds,
            uncertaintyGrowthMps: soundContact
              ? this.settings.soundUncertaintyGrowthMps
              : this.settings.uncertaintyGrowthMps
          });
          if (decayed.confidence > 1e-6) contacts.set(targetId, decayed);
        }
      }
      nextContacts.set(unit.id, contacts);
    }

    // Direct sources and their acquisition snapshots are complete before any
    // queued recipient delivery, so a relayed contact cannot chain onward.
    const directBySource = this.buildDirectContacts(units);
    const acquiredEpisodes = this.updateDirectObservationEpisodes(
      directBySource,
      acquisitionEvents,
      unitIds
    );
    for (const sender of units) {
      const directContacts = directBySource.get(sender.id);
      if (!directContacts?.size) continue;
      for (const direct of directContacts.values()) {
        const senderContacts = nextContacts.get(sender.id);
        senderContacts.set(
          direct.targetUnitId,
          preferContact(senderContacts.get(direct.targetUnitId), direct)
        );
      }
    }
    this.enqueueRelayEpisodes(acquiredEpisodes, units);
    this.deliverRelayReports(units, nextContacts);
    this.unitContacts = nextContacts;
    this.spottingMap = this.unitContacts;
    return this;
  }

  invalidateBuildingColliders() {
    this.buildingCollidersDirty = true;
  }

  refreshBuildingColliders() {
    if (!this.buildingSystem) {
      this.buildingColliders = [];
      this.buildingCollidersDirty = false;
      return this.buildingColliders;
    }
    const buildingIds = this.buildingSystem.getBuildingIds?.()
      ?? (this.buildingSystem.captureState?.().buildings ?? [])
        .map(building => String(building.id))
        .sort();
    this.buildingColliders = buildingIds
      .flatMap(buildingId => this.buildingSystem.getCollisionSnapshot(buildingId).records)
      .filter(record => record.blocks?.includes('projectile'))
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    this.buildingCollidersDirty = false;
    return this.buildingColliders;
  }

  // Compatibility facade for existing callers. Unlike the legacy method this
  // returns a read-only projection and does not make render meshes authoritative.
  updateSpotting(allUnits, viewerFaction = 'french', deltaSeconds = 0) {
    let faction = viewerFaction;
    let delta = deltaSeconds;
    if (typeof viewerFaction === 'number') {
      delta = viewerFaction;
      faction = 'french';
    }
    this.advance(allUnits, delta);
    return this.getVisibilityProjection(faction, allUnits);
  }

  getObservation(observerUnitId, observerSoldierId, targetUnitId) {
    const observation = this.observations
      .get(observerKey(observerUnitId, observerSoldierId))
      ?.get(targetUnitId);
    return observation ? cloneObservation(observation) : null;
  }

  hasDirectObservation(observerUnitOrId, targetUnitOrId) {
    const observerUnitId = observerUnitOrId?.id ?? observerUnitOrId;
    const targetUnitId = targetUnitOrId?.id ?? targetUnitOrId;
    for (const targetMap of this.observations.values()) {
      const observation = targetMap.get(targetUnitId);
      if (observation?.observerUnitId === observerUnitId && observation.visibleNow) return true;
    }
    return false;
  }

  canPrecisionTarget(observerUnitOrId, targetUnitOrId) {
    return this.hasDirectObservation(observerUnitOrId, targetUnitOrId);
  }

  getContactForUnit(unitOrId, targetUnitOrId) {
    const unitId = unitOrId?.id ?? unitOrId;
    const targetUnitId = targetUnitOrId?.id ?? targetUnitOrId;
    return publicContact(this.unitContacts.get(unitId)?.get(targetUnitId));
  }

  hasContact(unitOrId, targetUnitOrId, minimumConfidence = 0.05) {
    return (this.getContactForUnit(unitOrId, targetUnitOrId)?.confidence ?? 0)
      >= minimumConfidence;
  }

  getFactionContacts(faction, allUnits) {
    const contacts = new Map();
    for (const unit of sortedUnits(allUnits ?? [])) {
      if (unit.faction !== faction) continue;
      for (const contact of this.unitContacts.get(unit.id)?.values() ?? []) {
        contacts.set(
          contact.targetUnitId,
          preferContact(contacts.get(contact.targetUnitId), contact)
        );
      }
    }
    return [...contacts.values()]
      .sort((left, right) => String(left.targetUnitId).localeCompare(String(right.targetUnitId)))
      .map(publicContact);
  }

  getVisibilityProjection(viewerFaction, allUnits) {
    const visibleUnitIds = new Set();
    for (const unit of allUnits ?? []) {
      if (unit.faction === viewerFaction) visibleUnitIds.add(unit.id);
    }
    for (const targetUnit of allUnits ?? []) {
      if (targetUnit.faction === viewerFaction) continue;
      for (const targetMap of this.observations.values()) {
        const observation = targetMap.get(targetUnit.id);
        if (!observation?.visibleNow) continue;
        const observerUnit = (allUnits ?? []).find(unit => unit.id === observation.observerUnitId);
        if (observerUnit?.faction === viewerFaction) {
          visibleUnitIds.add(targetUnit.id);
          break;
        }
      }
    }
    return {
      viewerFaction,
      visibleUnitIds: [...visibleUnitIds].sort(),
      contacts: this.getFactionContacts(viewerFaction, allUnits)
    };
  }

  captureState() {
    const observations = [];
    for (const targetMap of this.observations.values()) {
      for (const observation of targetMap.values()) {
        observations.push(cloneObservation(observation));
      }
    }
    observations.sort((left, right) =>
      `${left.observerUnitId}:${left.observerSoldierId}:${left.targetUnitId}`
        .localeCompare(`${right.observerUnitId}:${right.observerSoldierId}:${right.targetUnitId}`)
    );

    const contacts = [];
    for (const [unitId, targetMap] of this.unitContacts) {
      for (const contact of targetMap.values()) {
        contacts.push({ unitId, contact: cloneContact(contact) });
      }
    }
    contacts.sort((left, right) =>
      `${left.unitId}:${left.contact.targetUnitId}`
        .localeCompare(`${right.unitId}:${right.contact.targetUnitId}`)
    );

    const directObservationEpisodes = [
      ...this.directObservationEpisodes.values()
    ]
      .sort((left, right) =>
        directEpisodeKey(left.senderUnitId, left.targetUnitId).localeCompare(
          directEpisodeKey(right.senderUnitId, right.targetUnitId)
        )
      )
      .map(cloneDirectObservationEpisode);
    return {
      version: 3,
      time: this.time,
      timeAccumulator: this.timeAccumulator,
      relayPolicy: {
        approximationLabel: this.settings.relayDelayApproximation,
        voiceDelaySeconds: this.settings.voiceRelayDelaySeconds,
        radioDelaySeconds: this.settings.radioRelayDelaySeconds
      },
      observations,
      directObservationEpisodes,
      relayQueue: this.relayQueue.captureState(),
      contacts
    };
  }

  restoreState(state) {
    const version = state?.version ?? 1;
    if (version !== 1 && version !== 2 && version !== 3) {
      throw new TypeError(`unsupported spotting state version ${version}`);
    }
    this.time = canonicalTime(Math.max(0, finite(state?.time)));
    if (version === 3 && state?.timeAccumulator !== undefined) {
      if (!Number.isFinite(state.timeAccumulator)
          || state.timeAccumulator < 0
          || canonicalTime(state.timeAccumulator) !== this.time) {
        throw new TypeError(
          'spotting timeAccumulator must be finite, non-negative, and match time'
        );
      }
      this.timeAccumulator = state.timeAccumulator;
    } else {
      this.timeAccumulator = this.time;
    }
    if (version === 3) {
      const relayPolicy = state?.relayPolicy ?? {};
      if (relayPolicy.approximationLabel
          !== COMMUNICATION_RELAY_DELAY_APPROXIMATION) {
        throw new TypeError(
          'spotting relay policy must retain the gameplay-approximation label'
        );
      }
      if (!Number.isFinite(relayPolicy.voiceDelaySeconds)
          || relayPolicy.voiceDelaySeconds <= 0
          || !Number.isFinite(relayPolicy.radioDelaySeconds)
          || relayPolicy.radioDelaySeconds <= 0) {
        throw new TypeError('spotting relay policy delays must be positive and finite');
      }
      this.settings.voiceRelayDelaySeconds = canonicalTime(
        relayPolicy.voiceDelaySeconds
      );
      this.settings.radioRelayDelaySeconds = canonicalTime(
        relayPolicy.radioDelaySeconds
      );
      if (this.settings.voiceRelayDelaySeconds <= 0
          || this.settings.radioRelayDelaySeconds <= 0) {
        throw new TypeError(
          'spotting relay policy delays must remain positive at simulation precision'
        );
      }
      this.settings.relayDelayApproximation =
        COMMUNICATION_RELAY_DELAY_APPROXIMATION;
    }
    this.observations = new Map();
    for (const saved of state?.observations ?? []) {
      const key = observerKey(saved.observerUnitId, saved.observerSoldierId);
      if (!this.observations.has(key)) this.observations.set(key, new Map());
      const observation = cloneObservation({
        ...saved,
        directEpisodeSequence: Number.isSafeInteger(saved.directEpisodeSequence)
          && saved.directEpisodeSequence >= 0
          ? saved.directEpisodeSequence
          : 0,
        directEpisodeActive: version === 3
          ? saved.directEpisodeActive === true
          : saved.visibleNow === true,
        directEpisodeAcquiredAt: version === 3
          ? saved.directEpisodeAcquiredAt ?? null
          : saved.visibleNow ? saved.lastSeenAt ?? this.time : null,
        directEpisodeSnapshot: version === 3
          ? saved.directEpisodeSnapshot ?? null
          : saved.visibleNow
            ? {
                position: saved.lastSeenPosition,
                targetSoldierId: saved.lastSeenTargetSoldierId ?? null
              }
            : null
      });
      this.observations.get(key).set(saved.targetUnitId, observation);
    }
    this.directObservationEpisodes = new Map();
    if (version === 3) {
      for (const saved of state?.directObservationEpisodes ?? []) {
        const episode = cloneDirectObservationEpisode(saved);
        this.directObservationEpisodes.set(
          directEpisodeKey(episode.senderUnitId, episode.targetUnitId),
          episode
        );
      }
    } else {
      for (const targetMap of this.observations.values()) {
        for (const observation of targetMap.values()) {
          if (!observation.visibleNow) continue;
          const key = directEpisodeKey(
            observation.observerUnitId,
            observation.targetUnitId
          );
          const candidate = {
            senderUnitId: observation.observerUnitId,
            targetUnitId: observation.targetUnitId,
            episodeSequence: 0,
            active: true,
            acquiredAt: observation.lastSeenAt ?? this.time,
            sourceSoldierId: observation.observerSoldierId,
            targetSoldierId: observation.lastSeenTargetSoldierId ?? null,
            position: clonePosition(observation.lastSeenPosition),
            confidence: observation.confidence
          };
          const previous = this.directObservationEpisodes.get(key);
          if (!previous
              || String(candidate.sourceSoldierId).localeCompare(
                String(previous.sourceSoldierId)
              ) < 0) {
            this.directObservationEpisodes.set(key, candidate);
          }
        }
      }
    }
    this.relayQueue = new CommunicationRelayQueue();
    if (version === 3) {
      this.relayQueue.restoreState(state?.relayQueue);
    }
    this.unitContacts = new Map();
    for (const saved of state?.contacts ?? []) {
      if (!this.unitContacts.has(saved.unitId)) this.unitContacts.set(saved.unitId, new Map());
      this.unitContacts.get(saved.unitId).set(
        saved.contact.targetUnitId,
        cloneContact(saved.contact)
      );
    }
    this.spottingMap = this.unitContacts;
  }
}

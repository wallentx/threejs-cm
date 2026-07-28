const STATE_VERSION = 1;
const MODE_INACTIVE = 'inactive';
const MODE_BOUNDING = 'bounding';
const MODE_REFORM = 'reform';
const VALID_MODES = new Set([
  MODE_INACTIVE,
  MODE_BOUNDING,
  MODE_REFORM
]);
const MAX_MEMBERS = 128;
const DISTANCE_EPSILON = 1e-9;
const GOAL_TOLERANCE_METERS = 0.18;
const ACTUAL_MOVEMENT_EPSILON_METERS = 1e-6;

export const INFANTRY_BUDDY_BOUND_MODEL = Object.freeze({
  version: STATE_VERSION,
  boundDistanceMeters: 6,
  goalToleranceMeters: GOAL_TOLERANCE_METERS,
  approximationLabel:
    'first-order gameplay approximation for known-target QUICK buddy bounds'
});

function stableIdKey(value, label = 'soldier ID') {
  if (typeof value === 'string' && value.length > 0) {
    return `string:${value}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `number:${Object.is(value, -0) ? '-0' : value}`;
  }
  throw new TypeError(`${label} must be a non-empty string or finite number`);
}

function sameStableId(left, right) {
  return stableIdKey(left) === stableIdKey(right);
}

function compareMembers(left, right) {
  const leftKey = stableIdKey(left.id);
  const rightKey = stableIdKey(right.id);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function finiteCoordinate(value, label) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`);
  }
  return value;
}

function normalizeMember(member) {
  const key = stableIdKey(member?.id);
  return {
    id: member.id,
    key,
    x: finiteCoordinate(member.x, `buddy-bound ${key} x`),
    z: finiteCoordinate(member.z, `buddy-bound ${key} z`),
    goalX: finiteCoordinate(member.goalX, `buddy-bound ${key} goalX`),
    goalZ: finiteCoordinate(member.goalZ, `buddy-bound ${key} goalZ`)
  };
}

function pairIdFor(memberIds) {
  return memberIds.map(id => stableIdKey(id)).join('|');
}

function clonePair(pair) {
  return {
    pairId: pair.pairId,
    memberIds: [...pair.memberIds],
    moverId: pair.moverId,
    covererId: pair.covererId,
    moverStart: [...pair.moverStart]
  };
}

function inactiveState() {
  return {
    version: STATE_VERSION,
    approximationLabel: INFANTRY_BUDDY_BOUND_MODEL.approximationLabel,
    activeWaypointKey: null,
    mode: MODE_INACTIVE,
    sequence: 0,
    pairs: []
  };
}

function createPairs(members) {
  const pairs = [];
  for (let index = 0; index + 1 < members.length; index += 2) {
    const mover = members[index];
    const coverer = members[index + 1];
    const memberIds = [mover.id, coverer.id];
    pairs.push({
      pairId: pairIdFor(memberIds),
      memberIds,
      moverId: mover.id,
      covererId: coverer.id,
      moverStart: [mover.x, mover.z]
    });
  }
  return pairs;
}

function pairsMatchMembers(pairs, members) {
  const expected = createPairs(members);
  if (pairs.length !== expected.length) return false;
  return pairs.every((pair, index) =>
    pair.pairId === expected[index].pairId
    && pair.memberIds.every((id, memberIndex) =>
      sameStableId(id, expected[index].memberIds[memberIndex])));
}

function validateState(savedState) {
  if (!savedState || typeof savedState !== 'object') {
    throw new TypeError('buddy-bound restore requires a state object');
  }
  if (savedState.version !== STATE_VERSION) {
    throw new TypeError(`unsupported buddy-bound version ${savedState.version}`);
  }
  if (
    savedState.approximationLabel
    !== INFANTRY_BUDDY_BOUND_MODEL.approximationLabel
  ) {
    throw new TypeError('buddy-bound state must retain its approximation label');
  }
  if (!VALID_MODES.has(savedState.mode)) {
    throw new TypeError('buddy-bound state has an invalid mode');
  }
  if (
    savedState.activeWaypointKey !== null
    && (
      typeof savedState.activeWaypointKey !== 'string'
      || savedState.activeWaypointKey.length === 0
    )
  ) {
    throw new TypeError('buddy-bound active waypoint key is invalid');
  }
  if (
    !Number.isSafeInteger(savedState.sequence)
    || savedState.sequence < 0
  ) {
    throw new TypeError('buddy-bound sequence must be a non-negative safe integer');
  }
  if (
    !Array.isArray(savedState.pairs)
    || savedState.pairs.length > MAX_MEMBERS / 2
  ) {
    throw new TypeError('buddy-bound pairs must be a bounded array');
  }
  if (
    savedState.mode === MODE_INACTIVE
    && (
      savedState.activeWaypointKey !== null
      || savedState.pairs.length !== 0
    )
  ) {
    throw new TypeError('inactive buddy-bound state must not retain an order');
  }
  if (
    savedState.mode !== MODE_INACTIVE
    && savedState.activeWaypointKey === null
  ) {
    throw new TypeError('active buddy-bound state requires a waypoint key');
  }

  const usedMemberKeys = new Set();
  const pairIds = new Set();
  const pairs = savedState.pairs.map((savedPair, index) => {
    if (!savedPair || typeof savedPair !== 'object') {
      throw new TypeError(`buddy-bound pair ${index} must be an object`);
    }
    if (
      !Array.isArray(savedPair.memberIds)
      || savedPair.memberIds.length !== 2
    ) {
      throw new TypeError(`buddy-bound pair ${index} requires two members`);
    }
    const memberIds = [...savedPair.memberIds];
    const memberKeys = memberIds.map((id, memberIndex) =>
      stableIdKey(id, `buddy-bound pair ${index} member ${memberIndex}`));
    if (memberKeys[0] === memberKeys[1]) {
      throw new TypeError(`buddy-bound pair ${index} repeats one member`);
    }
    for (const key of memberKeys) {
      if (usedMemberKeys.has(key)) {
        throw new TypeError('buddy-bound state repeats a member across pairs');
      }
      usedMemberKeys.add(key);
    }
    const expectedPairId = pairIdFor(memberIds);
    if (savedPair.pairId !== expectedPairId || pairIds.has(expectedPairId)) {
      throw new TypeError(`buddy-bound pair ${index} has an invalid pair ID`);
    }
    pairIds.add(expectedPairId);
    if (
      !memberIds.some(id => sameStableId(id, savedPair.moverId))
      || !memberIds.some(id => sameStableId(id, savedPair.covererId))
      || sameStableId(savedPair.moverId, savedPair.covererId)
    ) {
      throw new TypeError(`buddy-bound pair ${index} has invalid roles`);
    }
    if (
      !Array.isArray(savedPair.moverStart)
      || savedPair.moverStart.length !== 2
    ) {
      throw new TypeError(`buddy-bound pair ${index} has invalid mover start`);
    }
    return {
      pairId: expectedPairId,
      memberIds,
      moverId: savedPair.moverId,
      covererId: savedPair.covererId,
      moverStart: [
        finiteCoordinate(
          savedPair.moverStart[0],
          `buddy-bound pair ${index} mover-start X`
        ),
        finiteCoordinate(
          savedPair.moverStart[1],
          `buddy-bound pair ${index} mover-start Z`
        )
      ]
    };
  });

  return {
    version: STATE_VERSION,
    approximationLabel: INFANTRY_BUDDY_BOUND_MODEL.approximationLabel,
    activeWaypointKey: savedState.activeWaypointKey,
    mode: savedState.mode,
    sequence: savedState.sequence,
    pairs
  };
}

function validateRestoredRosterMembership(state, restoredRosterMemberIds) {
  if (!Array.isArray(restoredRosterMemberIds)) {
    throw new TypeError(
      'buddy-bound restore requires restored roster member IDs'
    );
  }
  const restoredRosterKeys = new Set(
    restoredRosterMemberIds.map((id, index) =>
      stableIdKey(id, `restored roster member ${index}`))
  );
  for (const pair of state.pairs) {
    for (const memberId of pair.memberIds) {
      if (!restoredRosterKeys.has(stableIdKey(memberId))) {
        throw new TypeError(
          `buddy-bound pair member ${String(memberId)} is absent from restored roster`
        );
      }
    }
  }
}

function createDirective(role, pair, buddyId, sequence) {
  return Object.freeze({
    role,
    pairId: pair?.pairId ?? null,
    buddyId: buddyId ?? null,
    sequence,
    holdMovement: role === 'coverer',
    blockFire: role === 'mover'
  });
}

export class InfantryBuddyBounds {
  constructor(savedState = null) {
    this.state = inactiveState();
    if (savedState !== null && savedState !== undefined) {
      this.restoreState(savedState);
    }
  }

  reset() {
    this.state = inactiveState();
    return this.captureState();
  }

  update({
    active = false,
    reform = false,
    waypointKey = null,
    members = []
  } = {}) {
    if (!Array.isArray(members) || members.length > MAX_MEMBERS) {
      throw new TypeError('buddy-bound members must be a bounded array');
    }
    if (!active) {
      this.reset();
      return new Map();
    }
    if (typeof waypointKey !== 'string' || waypointKey.length === 0) {
      throw new TypeError('active buddy bounds require a waypoint key');
    }

    const normalizedMembers = members.map(normalizeMember).sort(compareMembers);
    const memberKeys = new Set();
    for (const member of normalizedMembers) {
      if (memberKeys.has(member.key)) {
        throw new TypeError('buddy-bound members contain a duplicate stable ID');
      }
      memberKeys.add(member.key);
    }

    const orderChanged = this.state.activeWaypointKey !== waypointKey;
    const compositionChanged = !pairsMatchMembers(
      this.state.pairs,
      normalizedMembers
    );
    if (
      orderChanged
      || this.state.mode === MODE_INACTIVE
      || compositionChanged
    ) {
      this.state = {
        version: STATE_VERSION,
        approximationLabel: INFANTRY_BUDDY_BOUND_MODEL.approximationLabel,
        activeWaypointKey: waypointKey,
        mode: reform ? MODE_REFORM : MODE_BOUNDING,
        sequence: orderChanged ? 0 : this.state.sequence + 1,
        pairs: createPairs(normalizedMembers)
      };
    } else {
      this.state.mode = reform ? MODE_REFORM : MODE_BOUNDING;
    }

    const directives = new Map();
    if (this.state.mode === MODE_REFORM) {
      for (const member of normalizedMembers) {
        directives.set(
          member.key,
          createDirective('reform', null, null, this.state.sequence)
        );
      }
      return directives;
    }

    const membersByKey = new Map(
      normalizedMembers.map(member => [member.key, member])
    );
    for (const pair of this.state.pairs) {
      const mover = membersByKey.get(stableIdKey(pair.moverId));
      const coverer = membersByKey.get(stableIdKey(pair.covererId));
      if (!mover || !coverer) {
        throw new Error('buddy-bound pair lost a normalized member');
      }
      const movedDistance = Math.hypot(
        mover.x - pair.moverStart[0],
        mover.z - pair.moverStart[1]
      );
      const goalDistance = Math.hypot(
        mover.goalX - mover.x,
        mover.goalZ - mover.z
      );
      if (
        movedDistance + DISTANCE_EPSILON
          >= INFANTRY_BUDDY_BOUND_MODEL.boundDistanceMeters
        || (
          movedDistance > ACTUAL_MOVEMENT_EPSILON_METERS
          && goalDistance <= GOAL_TOLERANCE_METERS + DISTANCE_EPSILON
        )
      ) {
        const priorMoverId = pair.moverId;
        pair.moverId = pair.covererId;
        pair.covererId = priorMoverId;
        pair.moverStart = [coverer.x, coverer.z];
        this.state.sequence++;
      }
    }
    for (const pair of this.state.pairs) {
      directives.set(
        stableIdKey(pair.moverId),
        createDirective(
          'mover',
          pair,
          pair.covererId,
          this.state.sequence
        )
      );
      directives.set(
        stableIdKey(pair.covererId),
        createDirective(
          'coverer',
          pair,
          pair.moverId,
          this.state.sequence
        )
      );
    }
    for (const member of normalizedMembers) {
      if (!directives.has(member.key)) {
        directives.set(
          member.key,
          createDirective('unpaired', null, null, this.state.sequence)
        );
      }
    }
    return directives;
  }

  getDirective(directives, soldierId) {
    return directives.get(stableIdKey(soldierId)) ?? null;
  }

  captureState() {
    return {
      version: STATE_VERSION,
      approximationLabel: INFANTRY_BUDDY_BOUND_MODEL.approximationLabel,
      activeWaypointKey: this.state.activeWaypointKey,
      mode: this.state.mode,
      sequence: this.state.sequence,
      pairs: this.state.pairs.map(clonePair)
    };
  }

  restoreState(savedState, restoredRosterMemberIds = null) {
    if (savedState === null || savedState === undefined) {
      this.state = inactiveState();
      return this;
    }
    const restoredState = validateState(savedState);
    if (restoredRosterMemberIds !== null) {
      validateRestoredRosterMembership(
        restoredState,
        restoredRosterMemberIds
      );
    }
    this.state = restoredState;
    return this;
  }
}

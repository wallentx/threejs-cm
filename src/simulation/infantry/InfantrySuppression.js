export const INFANTRY_SUPPRESSION_MODEL =
  'first-order-recent-fire-recovery-v1';

export const DEFAULT_INFANTRY_SUPPRESSION_POLICY = Object.freeze({
  approximation: 'gameplay',
  individualPinnedThreshold: 82,
  individualRoutedThreshold: 96,
  squadShakenEnterThreshold: 30,
  squadShakenExitThreshold: 18,
  squadPinnedEnterThreshold: 65,
  squadPinnedExitThreshold: 48,
  squadBrokenEnterThreshold: 92,
  squadBrokenExitThreshold: 75,
  recentFireRecoveryPerSecond: 4,
  quietRecoveryPerSecond: 14
});

function clampSuppression(value) {
  if (!Number.isFinite(value)) {
    throw new TypeError('suppression must be finite');
  }
  return Math.max(0, Math.min(100, value));
}

export function classifyIndividualMorale(
  suppression,
  policy = DEFAULT_INFANTRY_SUPPRESSION_POLICY
) {
  const value = clampSuppression(suppression);
  if (value > policy.individualRoutedThreshold) return 'ROUTED';
  if (value >= policy.individualPinnedThreshold) return 'PINNED';
  if (value >= 55) return 'TAKING_COVER';
  if (value >= 35) return 'DUCKING';
  if (value >= 15) return 'CAUTIOUS';
  return 'READY';
}

export function classifyInfantryUnitMorale(
  suppression,
  currentMorale = 'OK',
  policy = DEFAULT_INFANTRY_SUPPRESSION_POLICY
) {
  const value = clampSuppression(suppression);
  if (value >= policy.squadBrokenEnterThreshold) return 'Broken';
  if (
    currentMorale === 'Broken'
    && value >= policy.squadBrokenExitThreshold
  ) {
    return 'Broken';
  }
  if (value >= policy.squadPinnedEnterThreshold) return 'Pinned';
  if (
    (currentMorale === 'Pinned' || currentMorale === 'Broken')
    && value >= policy.squadPinnedExitThreshold
  ) {
    return 'Pinned';
  }
  if (value >= policy.squadShakenEnterThreshold) return 'Shaken';
  if (
    currentMorale === 'Shaken'
    && value >= policy.squadShakenExitThreshold
  ) {
    return 'Shaken';
  }
  return 'OK';
}

export function advanceInfantryUnitSuppression(
  state,
  deltaSeconds,
  recentIncomingFireSeconds = 0,
  policy = DEFAULT_INFANTRY_SUPPRESSION_POLICY
) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new RangeError('deltaSeconds must be finite and non-negative');
  }
  if (
    !Number.isFinite(recentIncomingFireSeconds)
    || recentIncomingFireSeconds < 0
  ) {
    throw new RangeError(
      'recentIncomingFireSeconds must be finite and non-negative'
    );
  }
  const suppression = clampSuppression(state?.suppression ?? 0);
  const recentSeconds = Math.min(
    deltaSeconds,
    recentIncomingFireSeconds
  );
  const quietSeconds = deltaSeconds - recentSeconds;
  const nextSuppression = Math.max(
    0,
    suppression
      - recentSeconds * policy.recentFireRecoveryPerSecond
      - quietSeconds * policy.quietRecoveryPerSecond
  );
  return {
    suppression: nextSuppression,
    morale: classifyInfantryUnitMorale(
      nextSuppression,
      state?.morale ?? 'OK',
      policy
    )
  };
}

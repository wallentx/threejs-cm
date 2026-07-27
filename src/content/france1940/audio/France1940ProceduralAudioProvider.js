function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const FRANCE_1940_PROCEDURAL_AUDIO_IMPLEMENTATION_ID =
  'france-1940-procedural-battlefield-audio-v1';

export const FRANCE_1940_AUDIO_EVENT_IDS = Object.freeze({
  rifle: 'weapon.small-arms.rifle',
  machineGun: 'weapon.small-arms.machine-gun',
  submachineGun: 'weapon.small-arms.submachine-gun',
  lightCannon: 'weapon.cannon.light',
  mediumCannon: 'weapon.cannon.medium',
  explosion: 'battlefield.explosion.general',
  uiClick: 'ui.command.click'
});

const VOICE_LIMITS = Object.freeze({
  smallArms: 12,
  cannon: 4,
  explosion: 3,
  ui: 2
});

const EVENTS = deepFreeze({
  [FRANCE_1940_AUDIO_EVENT_IDS.rifle]: {
    category: 'smallArms',
    layers: [{
      type: 'noise',
      durationSeconds: 0.18,
      cutoffStartHz: 1650,
      cutoffEndHz: 150,
      gain: 0.66,
      seed: 750
    }]
  },
  [FRANCE_1940_AUDIO_EVENT_IDS.machineGun]: {
    category: 'smallArms',
    layers: [{
      type: 'noise',
      durationSeconds: 0.075,
      cutoffStartHz: 2150,
      cutoffEndHz: 240,
      gain: 0.36,
      seed: 792
    }]
  },
  [FRANCE_1940_AUDIO_EVENT_IDS.submachineGun]: {
    category: 'smallArms',
    layers: [{
      type: 'noise',
      durationSeconds: 0.06,
      cutoffStartHz: 2450,
      cutoffEndHz: 320,
      gain: 0.29,
      seed: 765
    }]
  },
  [FRANCE_1940_AUDIO_EVENT_IDS.lightCannon]: {
    category: 'cannon',
    layers: [
      {
        type: 'noise',
        durationSeconds: 0.44,
        cutoffStartHz: 720,
        cutoffEndHz: 58,
        gain: 0.72,
        seed: 370
      },
      {
        type: 'oscillator',
        waveform: 'sine',
        durationSeconds: 0.56,
        startHz: 105,
        endHz: 32,
        gain: 0.48
      }
    ]
  },
  [FRANCE_1940_AUDIO_EVENT_IDS.mediumCannon]: {
    category: 'cannon',
    layers: [
      {
        type: 'noise',
        durationSeconds: 0.62,
        cutoffStartHz: 560,
        cutoffEndHz: 42,
        gain: 0.86,
        seed: 7500
      },
      {
        type: 'oscillator',
        waveform: 'sine',
        durationSeconds: 0.78,
        startHz: 88,
        endHz: 26,
        gain: 0.62
      }
    ]
  },
  [FRANCE_1940_AUDIO_EVENT_IDS.explosion]: {
    category: 'explosion',
    layers: [
      {
        type: 'noise',
        durationSeconds: 1.2,
        cutoffStartHz: 520,
        cutoffEndHz: 36,
        gain: 0.92,
        seed: 1940
      },
      {
        type: 'oscillator',
        waveform: 'sine',
        durationSeconds: 0.82,
        startHz: 72,
        endHz: 24,
        gain: 0.46
      }
    ]
  },
  [FRANCE_1940_AUDIO_EVENT_IDS.uiClick]: {
    category: 'ui',
    layers: [{
      type: 'oscillator',
      waveform: 'triangle',
      durationSeconds: 0.05,
      startHz: 800,
      endHz: 400,
      gain: 0.2
    }]
  }
});

function resolveWeaponEvent(weapon) {
  const kind = weapon?.kind ?? '';
  if (kind.startsWith('cannon')) {
    return (weapon?.caliberMm ?? 0) >= 60
      ? FRANCE_1940_AUDIO_EVENT_IDS.mediumCannon
      : FRANCE_1940_AUDIO_EVENT_IDS.lightCannon;
  }
  if (kind === 'machine_gun') return FRANCE_1940_AUDIO_EVENT_IDS.machineGun;
  if (kind === 'submachine_gun') return FRANCE_1940_AUDIO_EVENT_IDS.submachineGun;
  return FRANCE_1940_AUDIO_EVENT_IDS.rifle;
}

export const FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER = Object.freeze({
  id: FRANCE_1940_PROCEDURAL_AUDIO_IMPLEMENTATION_ID,
  kind: 'battlefield-audio-provider',
  createResources() {
    let disposed = false;
    return Object.freeze({
      kind: 'battlefield-audio-resources',
      masterGain: 0.74,
      voiceLimits: VOICE_LIMITS,
      events: EVENTS,
      resolveWeaponEvent,
      resolveExplosionEvent() {
        return FRANCE_1940_AUDIO_EVENT_IDS.explosion;
      },
      resolveUiEvent() {
        return FRANCE_1940_AUDIO_EVENT_IDS.uiClick;
      },
      dispose() {
        if (disposed) return false;
        disposed = true;
        return true;
      }
    });
  }
});

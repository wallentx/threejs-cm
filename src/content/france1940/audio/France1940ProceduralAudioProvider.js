function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const FRANCE_1940_PROCEDURAL_AUDIO_IMPLEMENTATION_ID =
  'france-1940-procedural-battlefield-audio-v2';

export const FRANCE_1940_AUDIO_EVENT_IDS = Object.freeze({
  rifle: 'weapon.small-arms.rifle',
  machineGun: 'weapon.small-arms.machine-gun',
  submachineGun: 'weapon.small-arms.submachine-gun',
  lightCannon: 'weapon.cannon.light',
  mediumCannon: 'weapon.cannon.medium',
  explosion: 'battlefield.explosion.general',
  impact: 'battlefield.impact.general',
  ricochet: 'battlefield.impact.ricochet',
  buildingDamaged: 'building.damage.damaged',
  buildingBreached: 'building.damage.breached',
  buildingCollapsed: 'building.damage.collapsed',
  uiClick: 'ui.command.click'
});

const VOICE_LIMITS = Object.freeze({
  smallArms: 12,
  cannon: 4,
  explosion: 3,
  impact: 10,
  buildingDamage: 2,
  ui: 2
});

const EVENTS = deepFreeze({
  [FRANCE_1940_AUDIO_EVENT_IDS.rifle]: {
    category: 'smallArms',
    spatial: true,
    priority: 58,
    reverbSend: 0.18,
    variation: {
      gain: [0.94, 1.04],
      playbackRate: [0.975, 1.025],
      filterScale: [0.94, 1.06]
    },
    aggregation: { minDistance: 850, cellSize: 180, windowSeconds: 0.25 },
    layers: [
      {
        role: 'ballistic-crack',
        type: 'noise',
        noiseColor: 'white',
        filterType: 'highpass',
        durationSeconds: 0.024,
        attackSeconds: 0.0015,
        cutoffStartHz: 7600,
        cutoffEndHz: 3300,
        filterQ: 0.82,
        drive: 2.5,
        gain: 0.58,
        seedPool: [740, 741, 742, 743],
        maxDistance: 420
      },
      {
        role: 'muzzle-report',
        type: 'noise',
        noiseColor: 'pink',
        filterType: 'lowpass',
        durationSeconds: 0.22,
        attackSeconds: 0.002,
        cutoffStartHz: 5200,
        cutoffEndHz: 430,
        filterQ: 0.72,
        drive: 1.35,
        gain: 0.52,
        seedPool: [750, 751, 752, 753]
      },
      {
        role: 'low-body',
        type: 'oscillator',
        waveform: 'triangle',
        durationSeconds: 0.13,
        attackSeconds: 0.003,
        startHz: 185,
        endHz: 68,
        gain: 0.12,
        maxDistance: 900
      },
      {
        role: 'mechanism',
        type: 'noise',
        noiseColor: 'white',
        filterType: 'bandpass',
        durationSeconds: 0.052,
        delaySeconds: 0.04,
        attackSeconds: 0.001,
        cutoffStartHz: 2800,
        cutoffEndHz: 1250,
        filterQ: 2.4,
        drive: 0.65,
        gain: 0.1,
        seedPool: [760, 761, 762],
        maxDistance: 130
      }
    ]
  },
  [FRANCE_1940_AUDIO_EVENT_IDS.machineGun]: {
    category: 'smallArms',
    spatial: true,
    priority: 66,
    reverbSend: 0.2,
    variation: {
      gain: [0.94, 1.04],
      playbackRate: [0.98, 1.025],
      filterScale: [0.95, 1.05]
    },
    aggregation: { minDistance: 900, cellSize: 190, windowSeconds: 0.2 },
    layers: [
      {
        role: 'ballistic-crack',
        type: 'noise', noiseColor: 'white', filterType: 'highpass',
        durationSeconds: 0.019, attackSeconds: 0.001,
        cutoffStartHz: 8200, cutoffEndHz: 3900, filterQ: 0.9,
        drive: 2.2, gain: 0.42, seedPool: [786, 787, 788, 789],
        maxDistance: 380
      },
      {
        role: 'muzzle-report',
        type: 'noise', noiseColor: 'pink', filterType: 'lowpass',
        durationSeconds: 0.11, attackSeconds: 0.0015,
        cutoffStartHz: 6100, cutoffEndHz: 620, filterQ: 0.72,
        drive: 1.5, gain: 0.34, seedPool: [792, 793, 794, 795]
      },
      {
        role: 'low-body',
        type: 'oscillator', waveform: 'triangle',
        durationSeconds: 0.075, attackSeconds: 0.002,
        startHz: 205, endHz: 86, gain: 0.07, maxDistance: 680
      },
      {
        role: 'mechanism',
        type: 'noise', noiseColor: 'white', filterType: 'bandpass',
        durationSeconds: 0.038, delaySeconds: 0.018, attackSeconds: 0.001,
        cutoffStartHz: 3300, cutoffEndHz: 1550, filterQ: 2.7,
        drive: 0.7, gain: 0.08, seedPool: [796, 797, 798], maxDistance: 110
      }
    ]
  },
  [FRANCE_1940_AUDIO_EVENT_IDS.submachineGun]: {
    category: 'smallArms',
    spatial: true,
    priority: 62,
    reverbSend: 0.16,
    variation: {
      gain: [0.94, 1.04],
      playbackRate: [0.98, 1.03],
      filterScale: [0.95, 1.05]
    },
    layers: [
      {
        role: 'muzzle-snap',
        type: 'noise', noiseColor: 'white', filterType: 'highpass',
        durationSeconds: 0.015, attackSeconds: 0.001,
        cutoffStartHz: 6900, cutoffEndHz: 3000, filterQ: 0.9,
        drive: 1.8, gain: 0.26, seedPool: [763, 764, 765], maxDistance: 180
      },
      {
        role: 'muzzle-report',
        type: 'noise', noiseColor: 'pink', filterType: 'lowpass',
        durationSeconds: 0.085, attackSeconds: 0.0015,
        cutoffStartHz: 5300, cutoffEndHz: 680, filterQ: 0.75,
        drive: 1.2, gain: 0.25, seedPool: [766, 767, 768]
      },
      {
        role: 'low-body',
        type: 'oscillator', waveform: 'triangle',
        durationSeconds: 0.055, attackSeconds: 0.002,
        startHz: 235, endHz: 105, gain: 0.045, maxDistance: 360
      },
      {
        role: 'mechanism',
        type: 'noise', noiseColor: 'white', filterType: 'bandpass',
        durationSeconds: 0.032, delaySeconds: 0.014, attackSeconds: 0.001,
        cutoffStartHz: 3700, cutoffEndHz: 1750, filterQ: 2.8,
        drive: 0.65, gain: 0.07, seedPool: [769, 770, 771], maxDistance: 80
      }
    ]
  },
  [FRANCE_1940_AUDIO_EVENT_IDS.lightCannon]: {
    category: 'cannon',
    spatial: true,
    priority: 92,
    reverbSend: 0.32,
    variation: { gain: [0.96, 1.04], playbackRate: [0.985, 1.015] },
    layers: [
      {
        role: 'muzzle-blast',
        type: 'noise',
        noiseColor: 'pink',
        filterType: 'lowpass',
        durationSeconds: 0.36,
        attackSeconds: 0.003,
        cutoffStartHz: 5200,
        cutoffEndHz: 155,
        filterQ: 0.72,
        drive: 2.8,
        gain: 0.64,
        seedPool: [370, 371, 372],
        maxDistance: 1700
      },
      {
        role: 'shock-crack',
        type: 'noise',
        noiseColor: 'white',
        filterType: 'highpass',
        durationSeconds: 0.038,
        attackSeconds: 0.0015,
        cutoffStartHz: 8600,
        cutoffEndHz: 2700,
        filterQ: 0.9,
        drive: 2.2,
        gain: 0.5,
        seedPool: [367, 368, 369],
        maxDistance: 760
      },
      {
        role: 'pressure-body',
        type: 'oscillator',
        waveform: 'sine',
        durationSeconds: 0.64,
        attackSeconds: 0.008,
        startHz: 112,
        endHz: 29,
        gain: 0.4,
        maxDistance: 5200
      },
      {
        role: 'distant-tail',
        type: 'noise',
        noiseColor: 'brown',
        filterType: 'lowpass',
        durationSeconds: 0.92,
        delaySeconds: 0.025,
        attackSeconds: 0.012,
        cutoffStartHz: 780,
        cutoffEndHz: 62,
        filterQ: 0.72,
        gain: 0.28,
        seedPool: [376, 377],
        maxDistance: 5200
      },
      {
        role: 'breech-mechanism',
        type: 'noise',
        noiseColor: 'white',
        filterType: 'bandpass',
        durationSeconds: 0.14,
        delaySeconds: 0.055,
        attackSeconds: 0.002,
        cutoffStartHz: 3400,
        cutoffEndHz: 720,
        filterQ: 2.5,
        drive: 0.8,
        gain: 0.13,
        seedPool: [374, 375],
        maxDistance: 260
      }
    ]
  },
  [FRANCE_1940_AUDIO_EVENT_IDS.mediumCannon]: {
    category: 'cannon',
    spatial: true,
    priority: 100,
    reverbSend: 0.38,
    variation: { gain: [0.97, 1.04], playbackRate: [0.985, 1.012] },
    layers: [
      {
        role: 'muzzle-blast',
        type: 'noise',
        noiseColor: 'pink',
        filterType: 'lowpass',
        durationSeconds: 0.5,
        attackSeconds: 0.004,
        cutoffStartHz: 4800,
        cutoffEndHz: 120,
        filterQ: 0.72,
        drive: 3.4,
        gain: 0.75,
        seedPool: [7500, 7501, 7502],
        maxDistance: 2100
      },
      {
        role: 'shock-crack',
        type: 'noise',
        noiseColor: 'white',
        filterType: 'highpass',
        durationSeconds: 0.046,
        attackSeconds: 0.0015,
        cutoffStartHz: 7900,
        cutoffEndHz: 2300,
        filterQ: 0.88,
        drive: 2.7,
        gain: 0.58,
        seedPool: [7496, 7497, 7498],
        maxDistance: 900
      },
      {
        role: 'pressure-body',
        type: 'oscillator',
        waveform: 'sine',
        durationSeconds: 0.9,
        attackSeconds: 0.01,
        startHz: 94,
        endHz: 23,
        gain: 0.54,
        maxDistance: 6000
      },
      {
        role: 'distant-tail',
        type: 'noise',
        noiseColor: 'brown',
        filterType: 'lowpass',
        durationSeconds: 1.25,
        delaySeconds: 0.035,
        attackSeconds: 0.018,
        cutoffStartHz: 720,
        cutoffEndHz: 48,
        filterQ: 0.72,
        gain: 0.38,
        seedPool: [7506, 7507, 7508],
        maxDistance: 6000
      },
      {
        role: 'breech-mechanism',
        type: 'noise',
        noiseColor: 'white',
        filterType: 'bandpass',
        durationSeconds: 0.18,
        delaySeconds: 0.068,
        attackSeconds: 0.002,
        cutoffStartHz: 3100,
        cutoffEndHz: 590,
        filterQ: 2.3,
        drive: 0.9,
        gain: 0.15,
        seedPool: [7510, 7511],
        maxDistance: 320
      }
    ]
  },
  [FRANCE_1940_AUDIO_EVENT_IDS.explosion]: {
    category: 'explosion',
    spatial: true,
    priority: 96,
    reverbSend: 0.42,
    variation: { gain: [0.94, 1.05], playbackRate: [0.97, 1.025] },
    layers: [
      {
        role: 'blast-front',
        type: 'noise',
        noiseColor: 'pink',
        filterType: 'lowpass',
        durationSeconds: 0.7,
        attackSeconds: 0.004,
        cutoffStartHz: 4200,
        cutoffEndHz: 105,
        filterQ: 0.7,
        drive: 3.1,
        gain: 0.74,
        seedPool: [1940, 1941, 1942]
      },
      {
        role: 'pressure-body',
        type: 'oscillator',
        waveform: 'sine',
        durationSeconds: 0.95,
        attackSeconds: 0.012,
        startHz: 76,
        endHz: 21,
        gain: 0.5
      },
      {
        role: 'debris-roar',
        type: 'noise',
        noiseColor: 'brown',
        filterType: 'lowpass',
        durationSeconds: 1.45,
        delaySeconds: 0.045,
        attackSeconds: 0.025,
        cutoffStartHz: 1250,
        cutoffEndHz: 58,
        filterQ: 0.75,
        gain: 0.34,
        seedPool: [1946, 1947, 1948]
      },
      {
        role: 'fragment-snap',
        type: 'noise',
        noiseColor: 'white',
        filterType: 'highpass',
        durationSeconds: 0.055,
        attackSeconds: 0.001,
        cutoffStartHz: 7200,
        cutoffEndHz: 2100,
        filterQ: 0.88,
        drive: 2,
        gain: 0.28,
        seedPool: [1943, 1944, 1945],
        maxDistance: 650
      }
    ]
  },
  [FRANCE_1940_AUDIO_EVENT_IDS.impact]: {
    category: 'impact',
    spatial: true,
    priority: 66,
    reverbSend: 0.12,
    variation: { gain: [0.9, 1.08], playbackRate: [0.94, 1.07] },
    layers: [
      {
        role: 'metal-strike',
        type: 'noise', noiseColor: 'white', filterType: 'bandpass',
        durationSeconds: 0.075, attackSeconds: 0.001,
        cutoffStartHz: 5200, cutoffEndHz: 1300, filterQ: 2.1,
        drive: 1.4, gain: 0.25, seedPool: [2100, 2101, 2102]
      },
      {
        role: 'impact-body',
        type: 'noise', noiseColor: 'pink', filterType: 'lowpass',
        durationSeconds: 0.18, attackSeconds: 0.003,
        cutoffStartHz: 1900, cutoffEndHz: 220, filterQ: 0.8,
        gain: 0.17, seedPool: [2103, 2104, 2105]
      },
      {
        role: 'armor-ring',
        type: 'oscillator', waveform: 'triangle',
        durationSeconds: 0.12, attackSeconds: 0.002,
        startHz: 680, endHz: 190, gain: 0.045, maxDistance: 360
      }
    ]
  },
  [FRANCE_1940_AUDIO_EVENT_IDS.ricochet]: {
    category: 'impact',
    spatial: true,
    priority: 72,
    reverbSend: 0.14,
    variation: { gain: [0.92, 1.06], playbackRate: [0.95, 1.08] },
    layers: [
      {
        role: 'metal-scrape',
        type: 'noise',
        noiseColor: 'white',
        filterType: 'bandpass',
        durationSeconds: 0.14,
        attackSeconds: 0.001,
        cutoffStartHz: 6900,
        cutoffEndHz: 1050,
        filterQ: 3.2,
        drive: 1.15,
        gain: 0.24,
        seedPool: [2200, 2201, 2202]
      },
      {
        role: 'ricochet-ring',
        type: 'oscillator',
        waveform: 'triangle',
        durationSeconds: 0.28,
        attackSeconds: 0.002,
        startHz: 1850,
        endHz: 270,
        gain: 0.075
      },
      {
        role: 'impact-body',
        type: 'noise', noiseColor: 'pink', filterType: 'lowpass',
        durationSeconds: 0.13, attackSeconds: 0.002,
        cutoffStartHz: 2100, cutoffEndHz: 280, filterQ: 0.75,
        gain: 0.12, seedPool: [2203, 2204]
      }
    ]
  },
  // First-order gameplay presentation approximations, not recorded historical evidence.
  [FRANCE_1940_AUDIO_EVENT_IDS.buildingDamaged]: {
    category: 'buildingDamage',
    layers: [
      {
        role: 'masonry-crack',
        type: 'noise', noiseColor: 'pink', filterType: 'bandpass',
        durationSeconds: 0.18, attackSeconds: 0.002,
        cutoffStartHz: 2200, cutoffEndHz: 430, filterQ: 1.3,
        drive: 0.8, gain: 0.24, seedPool: [1204, 1214, 1224]
      },
      {
        role: 'dust-fall',
        type: 'noise', noiseColor: 'brown', filterType: 'lowpass',
        durationSeconds: 0.42, delaySeconds: 0.025, attackSeconds: 0.015,
        cutoffStartHz: 780, cutoffEndHz: 95, filterQ: 0.72,
        gain: 0.16, seedPool: [1234, 1244]
      }
    ]
  },
  [FRANCE_1940_AUDIO_EVENT_IDS.buildingBreached]: {
    category: 'buildingDamage',
    layers: [
      {
        role: 'masonry-break',
        type: 'noise',
        noiseColor: 'pink', filterType: 'bandpass',
        durationSeconds: 0.34, attackSeconds: 0.003,
        cutoffStartHz: 2500, cutoffEndHz: 310, filterQ: 1.15,
        drive: 1.1, gain: 0.38, seedPool: [1205, 1215, 1225]
      },
      {
        role: 'structural-thump',
        type: 'oscillator',
        waveform: 'triangle',
        durationSeconds: 0.38, attackSeconds: 0.006,
        startHz: 128, endHz: 42, gain: 0.14
      },
      {
        role: 'debris-fall',
        type: 'noise', noiseColor: 'brown', filterType: 'lowpass',
        durationSeconds: 0.72, delaySeconds: 0.04, attackSeconds: 0.02,
        cutoffStartHz: 980, cutoffEndHz: 70, filterQ: 0.72,
        gain: 0.22, seedPool: [1235, 1245]
      }
    ]
  },
  [FRANCE_1940_AUDIO_EVENT_IDS.buildingCollapsed]: {
    category: 'buildingDamage',
    layers: [
      {
        role: 'structural-roar',
        type: 'noise',
        noiseColor: 'pink', filterType: 'lowpass',
        durationSeconds: 0.9, attackSeconds: 0.008,
        cutoffStartHz: 1900, cutoffEndHz: 85, filterQ: 0.78,
        drive: 1.35, gain: 0.52, seedPool: [1206, 1216, 1226]
      },
      {
        role: 'collapse-body',
        type: 'oscillator',
        waveform: 'sine',
        durationSeconds: 0.82, attackSeconds: 0.012,
        startHz: 78, endHz: 22, gain: 0.25
      },
      {
        role: 'debris-cascade',
        type: 'noise', noiseColor: 'brown', filterType: 'lowpass',
        durationSeconds: 1.6, delaySeconds: 0.05, attackSeconds: 0.035,
        cutoffStartHz: 1150, cutoffEndHz: 55, filterQ: 0.72,
        gain: 0.32, seedPool: [1236, 1246, 1256]
      }
    ]
  },
  [FRANCE_1940_AUDIO_EVENT_IDS.uiClick]: {
    category: 'ui',
    spatial: false,
    layers: [{
      role: 'ui-click',
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

function resolveBuildingDamageEvent(context) {
  switch (context?.severity) {
    case 'collapsed': return FRANCE_1940_AUDIO_EVENT_IDS.buildingCollapsed;
    case 'breached': return FRANCE_1940_AUDIO_EVENT_IDS.buildingBreached;
    case 'damaged': return FRANCE_1940_AUDIO_EVENT_IDS.buildingDamaged;
    default:
      throw new Error(`unknown building damage severity ${context?.severity ?? 'missing'}`);
  }
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
      resolveImpactEvent(context) {
        return context?.ricocheted
          ? FRANCE_1940_AUDIO_EVENT_IDS.ricochet
          : FRANCE_1940_AUDIO_EVENT_IDS.impact;
      },
      resolveUiEvent() {
        return FRANCE_1940_AUDIO_EVENT_IDS.uiClick;
      },
      resolveBuildingDamageEvent,
      dispose() {
        if (disposed) return false;
        disposed = true;
        return true;
      }
    });
  }
});

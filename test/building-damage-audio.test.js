import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CombatSystem } from '../src/game/CombatSystem.js';
import { SoundEngine } from '../src/engine/SoundEngine.js';
import {
  FRANCE_1940_AUDIO_EVENT_IDS,
  FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER
} from '../src/content/france1940/audio/France1940ProceduralAudioProvider.js';
import { BuildingSystem } from '../src/simulation/buildings/index.js';
import { FR_HOUSE_12X9_2F } from '../src/maps/france/FranceHouse12x9_2F.js';
import { PROCEDURAL_BATTLEFIELD_VFX_PROVIDER } from '../src/world/vfx/ProceduralBattlefieldVfxProvider.js';

function createBuildings() {
  const buildings = new BuildingSystem();
  buildings.registerDescriptor(FR_HOUSE_12X9_2F);
  buildings.addBuilding({ id: 'audio-house', descriptorId: FR_HOUSE_12X9_2F.id });
  return buildings;
}

function createCombat(buildings, options = {}) {
  return new CombatSystem(new THREE.Scene(), options.sound ?? {}, () => {
    options.randomCalls?.push('rng');
    return 0.5;
  }, {
    buildingSystem: buildings,
    vfxProvider: PROCEDURAL_BATTLEFIELD_VFX_PROVIDER,
    onOccupantConsequences: options.onOccupantConsequences,
    onBuildingChanged: options.onBuildingChanged,
    onAuditoryEvent: options.onAuditoryEvent
  });
}

class RejectingResumeNode {
  connect() {}
  disconnect() { this.disconnected = true; }
}

class RejectingResumeSource extends RejectingResumeNode {
  constructor() {
    super();
    this.onended = null;
  }

  start() {}
  stop() {}
}

class RejectingResumeAudioContext {
  constructor() {
    this.currentTime = 1;
    this.sampleRate = 1000;
    this.destination = new RejectingResumeNode();
    this.state = 'suspended';
  }

  createGain() {
    const node = new RejectingResumeNode();
    node.gain = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
    return node;
  }

  createBiquadFilter() {
    const node = new RejectingResumeNode();
    node.frequency = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
    return node;
  }

  createBufferSource() { return new RejectingResumeSource(); }
  createOscillator() {
    const source = new RejectingResumeSource();
    source.frequency = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
    return source;
  }
  createBuffer(_channels, length) {
    return { getChannelData() { return new Float32Array(length); } };
  }
  resume() { return Promise.reject(new Error('gesture denied')); }
  close() { this.closed = true; }
}

test('building audio chooses one stable highest-severity event after callbacks', () => {
  const order = [];
  const attempted = [];
  const sound = {
    playBuildingDamage(event) {
      order.push('sound');
      attempted.push([event.severity, event.sectionId]);
      return true;
    }
  };
  const damageResult = {
    results: [
      { sectionId: 'upper-shell', applied: 4, breached: true },
      { sectionId: 'roof', applied: 5, collapsed: true },
      { sectionId: 'ground-shell', applied: 6, collapsed: true }
    ],
    occupantConsequences: [{ soldierKey: 'u:s', unitId: 'u', soldierId: 's' }]
  };
  const run = results => {
    const combat = createCombat(createBuildings(), {
      sound,
      onOccupantConsequences: () => order.push('occupants'),
      onBuildingChanged: () => order.push('building')
    });
    const events = combat.processBuildingDamageResult('audio-house', { ...damageResult, results }, 'test');
    combat.dispose();
    return events;
  };

  const forward = run(damageResult.results);
  const reverse = run([...damageResult.results].reverse());
  assert.deepEqual(forward, reverse);
  assert.deepEqual(attempted, [
    ['collapsed', 'ground-shell'],
    ['collapsed', 'ground-shell']
  ]);
  assert.deepEqual(order, [
    'occupants', 'building', 'sound',
    'occupants', 'building', 'sound'
  ]);
});

test('persistent no-op and empty building events do not attempt audio', () => {
  let attempts = 0;
  const combat = createCombat(createBuildings(), {
    sound: { playBuildingDamage() { attempts++; } }
  });
  assert.deepEqual(combat.processBuildingDamageResult('audio-house', {
    result: { sectionId: 'roof', applied: 0, collapsed: true }
  }, 'repeat'), []);
  assert.deepEqual(combat.processBuildingDamageResult('audio-house', {}, 'empty'), []);
  assert.equal(attempts, 0);
  combat.dispose();
});

test('public building damage, breach, and collapse transactions route their severities', () => {
  const run = apply => {
    const buildings = createBuildings();
    const routed = [];
    const combat = createCombat(buildings, {
      sound: { playBuildingDamage(event) { routed.push(event.severity); return true; } }
    });
    const result = apply(buildings);
    const events = combat.processBuildingDamageResult('audio-house', result, 'public-transaction');
    combat.dispose();
    return { events, routed };
  };
  const damaged = run(buildings => buildings.applyProjectileDamage('audio-house', {
    sectionId: 'ground-shell', colliderPartId: 'ground-back', amount: 4, penetrationMm: 400
  }));
  const breached = run(buildings => buildings.applyProjectileDamage('audio-house', {
    sectionId: 'ground-shell', colliderPartId: 'ground-back', amount: 500, penetrationMm: 400
  }));
  const collapsed = run(buildings => buildings.applyBlastDamage('audio-house', {
    sectionDamages: [{ sectionId: 'roof', amount: 1000 }]
  }));
  assert.deepEqual(damaged.routed, ['damaged']);
  assert.deepEqual(breached.routed, ['breached']);
  assert.deepEqual(collapsed.routed, ['collapsed']);
  assert.equal(damaged.events[0].severity, 'damaged');
  assert.equal(breached.events[0].severity, 'breached');
  assert.equal(collapsed.events[0].severity, 'collapsed');
});

test('building-audio failure is isolated from debris, callbacks, state, telemetry, RNG, and auditory contacts', () => {
  const randomCalls = [];
  const order = [];
  let auditoryCalls = 0;
  const buildings = createBuildings();
  const beforeBuilding = buildings.captureState();
  const combat = createCombat(buildings, {
    randomCalls,
    sound: { playBuildingDamage() { order.push('sound'); throw new Error('audio failure'); } },
    onBuildingChanged: () => order.push('building'),
    onAuditoryEvent: () => auditoryCalls++
  });
  const beforeCombat = combat.captureState();
  const events = combat.processBuildingDamageResult('audio-house', {
    result: { sectionId: 'ground-shell', applied: 4, breached: false, collapsed: false }
  }, 'projectile');

  assert.equal(events.length, 1);
  assert.equal(combat.effects.filter(effect => effect.kind === 'buildingDebris').length, 1);
  assert.deepEqual(order, ['building', 'sound']);
  assert.equal(auditoryCalls, 0);
  assert.deepEqual(buildings.captureState(), beforeBuilding);
  assert.deepEqual(combat.captureState(), beforeCombat);
  assert.deepEqual(randomCalls, []);
  combat.dispose();
});

test('rejecting audio resume stays contained at the public CombatSystem boundary', async () => {
  const previousWindow = globalThis.window;
  const unhandled = [];
  const onUnhandled = reason => unhandled.push(reason);
  globalThis.window = { AudioContext: RejectingResumeAudioContext };
  process.on('unhandledRejection', onUnhandled);
  try {
    const randomCalls = [];
    let auditoryCalls = 0;
    const buildings = createBuildings();
    const beforeBuilding = buildings.captureState();
    const sound = new SoundEngine({
      audioProvider: FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER
    });
    const combat = createCombat(buildings, {
      randomCalls,
      sound,
      onAuditoryEvent: () => auditoryCalls++
    });
    const beforeCombat = combat.captureState();
    const events = combat.processBuildingDamageResult('audio-house', {
      result: { sectionId: 'ground-shell', applied: 4, breached: false, collapsed: false }
    }, 'resume-rejection');
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(events.length, 1);
    assert.equal(sound.lastEventId, FRANCE_1940_AUDIO_EVENT_IDS.buildingDamaged);
    assert.deepEqual(unhandled, []);
    assert.deepEqual(buildings.captureState(), beforeBuilding);
    assert.deepEqual(combat.captureState(), beforeCombat);
    assert.deepEqual(randomCalls, []);
    assert.equal(auditoryCalls, 0);
    combat.dispose();
    sound.dispose();
  } finally {
    process.off('unhandledRejection', onUnhandled);
    globalThis.window = previousWindow;
  }
});

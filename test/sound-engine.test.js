import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundEngine } from '../src/engine/SoundEngine.js';
import {
  FRANCE_1940_AUDIO_EVENT_IDS,
  FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER
} from '../src/content/france1940/audio/France1940ProceduralAudioProvider.js';

class FakeParam {
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
}

class FakeNode {
  constructor() {
    this.connections = [];
    this.disconnected = false;
  }

  connect(node) {
    this.connections.push(node);
  }

  disconnect() {
    this.disconnected = true;
    this.connections.length = 0;
  }
}

class FakeSource extends FakeNode {
  constructor() {
    super();
    this.onended = null;
    this.started = 0;
    this.stops = [];
  }

  start() {
    this.started++;
  }

  stop(at) {
    this.stops.push(at);
  }

  end() {
    this.onended?.();
  }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 10;
    this.sampleRate = 1000;
    this.destination = new FakeNode();
    this.state = 'running';
    this.sources = [];
    this.bufferCreations = 0;
  }

  createGain() {
    const node = new FakeNode();
    node.gain = new FakeParam();
    return node;
  }

  createBiquadFilter() {
    const node = new FakeNode();
    node.frequency = new FakeParam();
    return node;
  }

  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }

  createOscillator() {
    const source = new FakeSource();
    source.frequency = new FakeParam();
    this.sources.push(source);
    return source;
  }

  createBuffer(_channels, length) {
    this.bufferCreations++;
    return {
      getChannelData() { return new Float32Array(length); }
    };
  }

  resume() {}
  close() { this.closed = true; }
}

class ThrowingOscillatorAudioContext extends FakeAudioContext {
  constructor() {
    super();
    this.throwOscillator = true;
  }

  createOscillator() {
    if (this.throwOscillator) throw new Error('test oscillator creation failure');
    return super.createOscillator();
  }
}

function withFakeAudio(testFn) {
  return async () => {
    const previousWindow = globalThis.window;
    globalThis.window = { AudioContext: FakeAudioContext };
    try {
      await testFn();
    } finally {
      globalThis.window = previousWindow;
    }
  };
}

test('sound engine caches noise and explicitly releases completed voices', withFakeAudio(() => {
  const sound = new SoundEngine({
    audioProvider: FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER,
    voiceLimits: { smallArms: 1 }
  });
  const machineGun = { kind: 'machine_gun', caliberMm: 7.92 };
  assert.equal(sound.playWeapon(machineGun), true);
  assert.equal(sound.lastEventId, FRANCE_1940_AUDIO_EVENT_IDS.machineGun);
  const context = sound.ctx;
  const first = context.sources.at(-1);
  assert.equal(context.bufferCreations, 1);
  assert.equal(
    sound.playWeapon(machineGun),
    false,
    'voice cap coalesces bursts instead of growing graphs'
  );

  first.end();
  assert.equal(sound.activeVoices.size, 0);
  assert.equal(first.disconnected, true);

  assert.equal(sound.playWeapon(machineGun), true);
  assert.equal(context.bufferCreations, 1, 'repeated bursts reuse one cached noise buffer');
  context.sources.at(-1).end();
  sound.dispose();
  assert.equal(context.closed, true);
}));

test('cannon and UI oscillator sources receive scheduled stops and cleanup', withFakeAudio(() => {
  const sound = new SoundEngine({
    audioProvider: FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER
  });
  sound.playWeapon({ kind: 'cannon_ap', caliberMm: 47 });
  assert.equal(sound.lastEventId, FRANCE_1940_AUDIO_EVENT_IDS.lightCannon);
  const cannonSources = sound.ctx.sources.slice();
  assert.equal(cannonSources.length, 2);
  assert.ok(cannonSources.every(source => source.stops.length === 1));
  cannonSources.forEach(source => source.end());
  assert.equal(sound.activeVoices.size, 0);

  sound.playUIClick();
  const click = sound.ctx.sources.at(-1);
  assert.equal(click.stops.length, 1);
  click.end();
  assert.equal(click.disconnected, true);
  sound.dispose();
}));

test('building damage playback is capped, reuses seeded buffers, and disposes once', withFakeAudio(() => {
  const sound = new SoundEngine({
    audioProvider: FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER,
    voiceLimits: { buildingDamage: 1 }
  });
  assert.equal(sound.playBuildingDamage({ severity: 'damaged' }), true);
  assert.equal(sound.lastEventId, FRANCE_1940_AUDIO_EVENT_IDS.buildingDamaged);
  const context = sound.ctx;
  const first = context.sources.at(-1);
  assert.equal(context.bufferCreations, 1);
  assert.equal(sound.playBuildingDamage({ severity: 'collapsed' }), false);
  first.end();
  assert.equal(sound.activeVoices.size, 0);

  assert.equal(sound.playBuildingDamage({ severity: 'damaged' }), true);
  assert.equal(context.bufferCreations, 1);
  context.sources.at(-1).end();
  assert.equal(sound.dispose(), true);
  assert.equal(sound.dispose(), false);
  assert.equal(context.closed, true);
}));

test('partial multi-layer building playback releases its reservation and recovers', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { AudioContext: ThrowingOscillatorAudioContext };
  try {
    const sound = new SoundEngine({
      audioProvider: FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER,
      voiceLimits: { buildingDamage: 1 }
    });
    assert.throws(
      () => sound.playBuildingDamage({ severity: 'collapsed' }),
      /oscillator creation failure/
    );
    const context = sound.ctx;
    const partialNoise = context.sources[0];
    assert.equal(sound.activeVoices.size, 0);
    assert.equal(partialNoise.onended, null);
    assert.equal(partialNoise.disconnected, true);
    assert.equal(partialNoise.stops.length, 2, 'scheduled and cleanup stops both run');

    context.throwOscillator = false;
    assert.equal(sound.playBuildingDamage({ severity: 'collapsed' }), true);
    assert.equal(sound.activeVoices.get('buildingDamage').size, 1);
    context.sources.slice(1).forEach(source => source.end());
    assert.equal(sound.activeVoices.size, 0);
    assert.equal(sound.dispose(), true);
    assert.equal(sound.dispose(), false);
    assert.equal(context.closed, true);
  } finally {
    globalThis.window = previousWindow;
  }
});

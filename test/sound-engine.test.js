import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundEngine } from '../src/engine/SoundEngine.js';
import {
  FRANCE_1940_AUDIO_EVENT_IDS,
  FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER
} from '../src/content/france1940/audio/France1940ProceduralAudioProvider.js';

class FakeParam {
  constructor() {
    this.value = 0;
    this.events = [];
  }

  setValueAtTime(value, time) {
    this.value = value;
    this.events.push(['set', value, time]);
  }

  exponentialRampToValueAtTime(value, time) {
    this.value = value;
    this.events.push(['exponential', value, time]);
  }

  setTargetAtTime(value, time, timeConstant) {
    this.value = value;
    this.events.push(['target', value, time, timeConstant]);
  }

  cancelScheduledValues(time) {
    this.events.push(['cancel', time]);
  }
}

class FakeNode {
  constructor() {
    this.connections = [];
    this.disconnected = false;
  }

  connect(node) {
    this.connections.push(node);
    return node;
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
    this.starts = [];
    this.stops = [];
  }

  start(at) {
    this.started++;
    this.starts.push(at);
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
    this.panners = [];
    this.convolvers = [];
    this.filters = [];
    this.waveShapers = [];
    this.gains = [];
    this.bufferCreations = 0;
    this.listener = Object.fromEntries([
      'positionX', 'positionY', 'positionZ',
      'forwardX', 'forwardY', 'forwardZ',
      'upX', 'upY', 'upZ'
    ].map(key => [key, new FakeParam()]));
  }

  createGain() {
    const node = new FakeNode();
    node.gain = new FakeParam();
    this.gains.push(node);
    return node;
  }

  createBiquadFilter() {
    const node = new FakeNode();
    node.frequency = new FakeParam();
    node.Q = new FakeParam();
    this.filters.push(node);
    return node;
  }

  createWaveShaper() {
    const node = new FakeNode();
    this.waveShapers.push(node);
    return node;
  }

  createPanner() {
    const node = new FakeNode();
    node.positionX = new FakeParam();
    node.positionY = new FakeParam();
    node.positionZ = new FakeParam();
    this.panners.push(node);
    return node;
  }

  createConvolver() {
    const node = new FakeNode();
    this.convolvers.push(node);
    return node;
  }

  createDynamicsCompressor() {
    const node = new FakeNode();
    node.threshold = new FakeParam();
    node.knee = new FakeParam();
    node.ratio = new FakeParam();
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
    voiceLimits: { smallArms: 1 },
    random: () => 0
  });
  const machineGun = { kind: 'machine_gun', caliberMm: 7.92 };
  assert.equal(sound.playWeapon(machineGun), true);
  assert.equal(sound.lastEventId, FRANCE_1940_AUDIO_EVENT_IDS.machineGun);
  const context = sound.ctx;
  const firstBurst = context.sources.slice();
  assert.equal(sound.noiseBuffers.size, 3);
  assert.equal(
    sound.playWeapon(machineGun),
    false,
    'voice cap coalesces bursts instead of growing graphs'
  );

  firstBurst.forEach(source => source.end());
  assert.equal(sound.activeVoices.size, 0);
  assert.ok(firstBurst.every(source => source.disconnected));

  assert.equal(sound.playWeapon(machineGun), true);
  assert.equal(sound.noiseBuffers.size, 3, 'repeated bursts reuse cached colored-noise buffers');
  context.sources.slice(firstBurst.length).forEach(source => source.end());
  sound.dispose();
  assert.equal(context.closed, true);
}));

test('richer weapon profiles render colored transient, body, and mechanism layers through one voice', withFakeAudio(() => {
  const sound = new SoundEngine({
    audioProvider: FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER,
    random: () => 0
  });
  assert.equal(sound.playWeapon({ kind: 'rifle', caliberMm: 7.5 }), true);
  const voice = [...sound.activeVoices.get('smallArms')][0];
  assert.equal(sound.ctx.sources.length, 4);
  assert.deepEqual(voice.layerRoles, [
    'ballistic-crack',
    'muzzle-report',
    'low-body',
    'mechanism'
  ]);
  assert.ok(sound.ctx.filters.some(filter => filter.type === 'highpass'));
  assert.ok(sound.ctx.filters.some(filter => filter.type === 'bandpass'));
  assert.ok(sound.ctx.waveShapers.length >= 2);
  assert.ok(sound.ctx.waveShapers.every(node => node.curve instanceof Float32Array));
  assert.ok(
    sound.ctx.gains.some(node => node.gain.events.some(event => (
      event[0] === 'set' && event[1] === 0.001
    ))),
    'transient envelopes begin silently instead of clicking at full gain'
  );
  assert.equal(sound.noiseBuffers.size, 3);
  sound.ctx.sources.forEach(source => source.end());
  sound.dispose();
}));

test('cannon and UI oscillator sources receive scheduled stops and cleanup', withFakeAudio(() => {
  const sound = new SoundEngine({
    audioProvider: FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER
  });
  sound.playWeapon({ kind: 'cannon_ap', caliberMm: 47 });
  assert.equal(sound.lastEventId, FRANCE_1940_AUDIO_EVENT_IDS.lightCannon);
  const cannonSources = sound.ctx.sources.slice();
  assert.equal(cannonSources.length, 5);
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

test('positional voices use HRTF, propagation delay, occlusion filters, and environment reverb', withFakeAudio(() => {
  let occluded = true;
  const sound = new SoundEngine({
    audioProvider: FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER,
    random: () => 0.5
  });
  sound.configureSpatialModel({
    occlusionQuery: () => occluded
      ? ({ clear: false, coverType: 'Building' })
      : ({ clear: true }),
    environmentQuery: () => ({
      id: 'testStreet',
      wet: 0.25,
      durationSeconds: 0.4,
      decay: 2,
      highFrequencyDamping: 0.4
    })
  });
  sound.setListenerPose([0, 2, 0], [0, 0, -1], [0, 1, 0]);
  assert.equal(sound.playWeapon(
    { kind: 'rifle', caliberMm: 7.5 },
    { position: [343, 2, 0], sourceId: 'rifleman-1' }
  ), true);

  const voice = [...sound.activeVoices.get('smallArms')][0];
  assert.equal(sound.ctx.sources[0].starts[0], 11);
  assert.equal(voice.panner.panningModel, 'HRTF');
  assert.equal(voice.panner.positionX.value, 343);
  assert.equal(voice.occlusion.occluded, true);
  assert.equal(voice.occlusionFilter.frequency.value, 880);
  assert.equal(sound.ctx.convolvers.length, 1);
  assert.equal(sound.getDiagnostics().activeVoices[0].environment, 'testStreet');
  assert.equal(sound.ctx.listener.positionY.value, 2);
  occluded = false;
  sound.ctx.currentTime += 0.3;
  sound.update();
  assert.deepEqual(voice.occlusionGain.gain.events.at(-1), ['target', 1, 10.3, 0.08]);
  assert.deepEqual(
    voice.occlusionFilter.frequency.events.at(-1),
    ['target', 20000, 10.3, 0.08]
  );
  sound.ctx.sources.forEach(source => source.end());
  sound.dispose();
}));

test('global voice budget retains critical nearby cannon and virtualizes weaker events', withFakeAudio(() => {
  const sound = new SoundEngine({
    audioProvider: FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER,
    maxActiveVoices: 1,
    random: () => 0.5
  });
  sound.setListenerPose([0, 0, 0]);
  assert.equal(sound.playWeapon(
    { kind: 'rifle', caliberMm: 7.5 },
    { position: [500, 0, 0] }
  ), true);
  const rifleSource = sound.ctx.sources[0];
  assert.equal(sound.playWeapon(
    { kind: 'cannon_ap', caliberMm: 75 },
    { position: [25, 0, 0] }
  ), true);
  assert.ok(rifleSource.stops.length >= 2, 'evicted voice receives a short fade-stop');
  assert.equal(sound.getDiagnostics().activeVoices[0].category, 'cannon');
  assert.equal(sound.playWeapon(
    { kind: 'rifle', caliberMm: 7.5 },
    { position: [700, 0, 0] }
  ), false);
  assert.equal(sound.getDiagnostics().virtualizedCount, 1);
  sound.dispose();
}));

test('distant small-arms in one spatial cell aggregate without allocating another HRTF voice', withFakeAudio(() => {
  const sound = new SoundEngine({
    audioProvider: FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER,
    random: () => 0
  });
  sound.setListenerPose([0, 0, 0]);
  assert.equal(sound.playWeapon(
    { kind: 'rifle', caliberMm: 7.5 },
    { position: [1000, 0, 0] }
  ), true);
  const sourceCount = sound.ctx.sources.length;
  assert.equal(sound.playWeapon(
    { kind: 'rifle', caliberMm: 7.5 },
    { position: [1010, 0, 8] }
  ), true);
  assert.equal(sound.ctx.sources.length, sourceCount);
  assert.equal(sound.getDiagnostics().aggregatedCount, 1);
  sound.dispose();
}));

test('building damage playback is capped, reuses seeded buffers, and disposes once', withFakeAudio(() => {
  const sound = new SoundEngine({
    audioProvider: FRANCE_1940_PROCEDURAL_AUDIO_PROVIDER,
    voiceLimits: { buildingDamage: 1 },
    random: () => 0
  });
  assert.equal(sound.playBuildingDamage({ severity: 'damaged' }), true);
  assert.equal(sound.lastEventId, FRANCE_1940_AUDIO_EVENT_IDS.buildingDamaged);
  const context = sound.ctx;
  const firstBurst = context.sources.slice();
  assert.equal(sound.noiseBuffers.size, 2);
  assert.equal(sound.playBuildingDamage({ severity: 'collapsed' }), false);
  firstBurst.forEach(source => source.end());
  assert.equal(sound.activeVoices.size, 0);

  assert.equal(sound.playBuildingDamage({ severity: 'damaged' }), true);
  assert.equal(sound.noiseBuffers.size, 2);
  context.sources.slice(firstBurst.length).forEach(source => source.end());
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

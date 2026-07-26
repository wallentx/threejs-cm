import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundEngine } from '../src/engine/SoundEngine.js';

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
  const sound = new SoundEngine({ voiceLimits: { gunshot: 1 } });
  assert.equal(sound.playGunshot('mg42'), true);
  const context = sound.ctx;
  const first = context.sources.at(-1);
  assert.equal(context.bufferCreations, 1);
  assert.equal(sound.playGunshot('mg42'), false, 'voice cap coalesces bursts instead of growing graphs');

  first.end();
  assert.equal(sound.activeVoices.size, 0);
  assert.equal(first.disconnected, true);

  assert.equal(sound.playGunshot('mg42'), true);
  assert.equal(context.bufferCreations, 1, 'repeated bursts reuse one cached noise buffer');
  context.sources.at(-1).end();
  sound.dispose();
  assert.equal(context.closed, true);
}));

test('cannon and UI oscillator sources receive scheduled stops and cleanup', withFakeAudio(() => {
  const sound = new SoundEngine();
  sound.playCannon();
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

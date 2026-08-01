import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameProfiler } from '../src/engine/FrameProfiler.js';

test('frame profiler reports rolling frame time without accepting idle gaps', () => {
  const profiler = new FrameProfiler(4);
  assert.equal(profiler.record(1000), false);
  assert.equal(profiler.record(1010), true);
  assert.equal(profiler.record(1030), true);
  assert.equal(profiler.record(1090), true);
  assert.equal(profiler.record(3400), false, 'idle gap is not a rendered frame');
  assert.equal(profiler.record(3416), true);

  const snapshot = profiler.snapshot();
  assert.equal(snapshot.sampleCount, 4);
  assert.equal(snapshot.averageFrameMs, 26.5);
  assert.equal(snapshot.fps, 1000 / 26.5);
  assert.equal(snapshot.p95FrameMs, 60);
  assert.equal(snapshot.worstFrameMs, 60);
  assert.equal(snapshot.longFrameCount, 1);
  assert.equal(snapshot.totalAcceptedFrames, 4);

  profiler.reset();
  assert.equal(profiler.snapshot().sampleCount, 0);
});

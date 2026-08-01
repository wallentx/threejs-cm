const DEFAULT_CAPACITY = 240;
const MAX_ACCEPTED_FRAME_MS = 1000;

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1)
  );
  return sorted[index];
}

/**
 * Presentation-only rolling frame profiler. RAF timestamps never feed back
 * into simulation, replay, telemetry, or authoritative outcomes.
 */
export class FrameProfiler {
  constructor(capacity = DEFAULT_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity < 2) {
      throw new TypeError('FrameProfiler capacity must be an integer of at least 2');
    }
    this.samples = new Float64Array(capacity);
    this.count = 0;
    this.cursor = 0;
    this.previousTimestamp = null;
    this.totalAcceptedFrames = 0;
    this.longFrameCount = 0;
  }

  record(timestampMilliseconds) {
    const timestamp = finite(timestampMilliseconds, NaN);
    if (!Number.isFinite(timestamp)) return false;
    if (this.previousTimestamp === null) {
      this.previousTimestamp = timestamp;
      return false;
    }
    const frameMilliseconds = timestamp - this.previousTimestamp;
    this.previousTimestamp = timestamp;
    if (
      frameMilliseconds <= 0
      || frameMilliseconds > MAX_ACCEPTED_FRAME_MS
    ) {
      return false;
    }
    this.samples[this.cursor] = frameMilliseconds;
    this.cursor = (this.cursor + 1) % this.samples.length;
    this.count = Math.min(this.samples.length, this.count + 1);
    this.totalAcceptedFrames++;
    if (frameMilliseconds > 50) this.longFrameCount++;
    return true;
  }

  snapshot() {
    if (this.count === 0) {
      return Object.freeze({
        sampleCount: 0,
        fps: 0,
        averageFrameMs: 0,
        p95FrameMs: 0,
        worstFrameMs: 0,
        longFrameCount: this.longFrameCount,
        totalAcceptedFrames: this.totalAcceptedFrames
      });
    }
    const values = Array.from(this.samples.slice(0, this.count));
    const total = values.reduce((sum, value) => sum + value, 0);
    const averageFrameMs = total / values.length;
    values.sort((left, right) => left - right);
    return Object.freeze({
      sampleCount: values.length,
      fps: averageFrameMs > 0 ? 1000 / averageFrameMs : 0,
      averageFrameMs,
      p95FrameMs: percentile(values, 0.95),
      worstFrameMs: values.at(-1),
      longFrameCount: this.longFrameCount,
      totalAcceptedFrames: this.totalAcceptedFrames
    });
  }

  reset() {
    this.samples.fill(0);
    this.count = 0;
    this.cursor = 0;
    this.previousTimestamp = null;
    this.totalAcceptedFrames = 0;
    this.longFrameCount = 0;
  }
}

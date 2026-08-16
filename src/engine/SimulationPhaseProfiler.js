const DEFAULT_CAPACITY = 120;

export const SIMULATION_PROFILE_PHASES = Object.freeze([
  'units',
  'separation',
  'buildings',
  'spotting',
  'targeting',
  'systems'
]);

function clockMilliseconds() {
  return globalThis.performance?.now?.() ?? 0;
}

/**
 * Presentation-only fixed-step timing. Wall-clock samples never feed back into
 * simulation, replay, combat telemetry, or capture/restore state.
 */
export class SimulationPhaseProfiler {
  constructor(capacity = DEFAULT_CAPACITY) {
    this.capacity = capacity;
    this.enabled = false;
    this.active = false;
    this.count = 0;
    this.cursor = 0;
    this.lastFrameSteps = 0;
    this.phaseIndex = new Map(
      SIMULATION_PROFILE_PHASES.map((phase, index) => [phase, index])
    );
    this.current = new Float64Array(SIMULATION_PROFILE_PHASES.length);
    this.samples = SIMULATION_PROFILE_PHASES.map(
      () => new Float64Array(capacity)
    );
    this.totalSamples = new Float64Array(capacity);
    this.stepStart = 0;
    this.phaseStart = 0;
  }

  setEnabled(enabled) {
    const next = Boolean(enabled);
    if (next && !this.enabled) this.reset();
    this.enabled = next;
    if (!next) this.active = false;
  }

  begin() {
    if (!this.enabled) return;
    this.current.fill(0);
    this.stepStart = clockMilliseconds();
    this.phaseStart = this.stepStart;
    this.active = true;
  }

  mark(phase) {
    if (!this.active) return;
    const index = this.phaseIndex.get(phase);
    if (index === undefined) throw new Error(`Unknown simulation profile phase ${phase}`);
    const now = clockMilliseconds();
    this.current[index] += Math.max(0, now - this.phaseStart);
    this.phaseStart = now;
  }

  finish(phase) {
    if (!this.active) return;
    this.mark(phase);
    const total = Math.max(0, this.phaseStart - this.stepStart);
    for (let index = 0; index < this.samples.length; index++) {
      this.samples[index][this.cursor] = this.current[index];
    }
    this.totalSamples[this.cursor] = total;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
    this.active = false;
  }

  recordFrameSteps(steps) {
    if (this.enabled) this.lastFrameSteps = Math.max(0, Number(steps) || 0);
  }

  snapshot() {
    const phaseMilliseconds = {};
    for (let phaseIndex = 0; phaseIndex < SIMULATION_PROFILE_PHASES.length; phaseIndex++) {
      let total = 0;
      for (let sample = 0; sample < this.count; sample++) {
        total += this.samples[phaseIndex][sample];
      }
      phaseMilliseconds[SIMULATION_PROFILE_PHASES[phaseIndex]] =
        this.count > 0 ? total / this.count : 0;
    }
    let stepTotal = 0;
    for (let sample = 0; sample < this.count; sample++) {
      stepTotal += this.totalSamples[sample];
    }
    return Object.freeze({
      sampleCount: this.count,
      averageStepMs: this.count > 0 ? stepTotal / this.count : 0,
      lastFrameSteps: this.lastFrameSteps,
      phaseMilliseconds: Object.freeze(phaseMilliseconds)
    });
  }

  reset() {
    this.current.fill(0);
    for (const samples of this.samples) samples.fill(0);
    this.totalSamples.fill(0);
    this.active = false;
    this.count = 0;
    this.cursor = 0;
    this.lastFrameSteps = 0;
  }
}

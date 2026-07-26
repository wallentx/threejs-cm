const EPSILON = 1e-9;

/**
 * Converts variable render-clock budgets into fixed authoritative simulation
 * ticks. Remainders stay outside simulation state until a complete tick exists.
 */
export class FixedStepAccumulator {
  constructor(stepSeconds = 1 / 30) {
    if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
      throw new Error('Fixed simulation step must be a positive finite number');
    }
    this.stepSeconds = stepSeconds;
    this.remainderSeconds = 0;
  }

  reset() {
    this.remainderSeconds = 0;
  }

  advance(elapsedSeconds, simulateStep) {
    const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
    this.remainderSeconds += elapsed;
    let steps = 0;
    while (this.remainderSeconds + EPSILON >= this.stepSeconds) {
      simulateStep(this.stepSeconds);
      this.remainderSeconds = Math.max(0, this.remainderSeconds - this.stepSeconds);
      steps++;
    }
    return {
      steps,
      simulatedSeconds: steps * this.stepSeconds,
      remainderSeconds: this.remainderSeconds
    };
  }
}

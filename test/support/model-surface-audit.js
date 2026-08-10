import assert from 'node:assert/strict';
import {
  auditModelSurfaceCoverage,
  MODEL_SURFACE_AUDIT_VIEWS
} from '../../src/calibration/ModelSurfaceAudit.js';

export function assertModelHasNoBackfaceOnlyHoles({
  name,
  createModel,
  dimensions,
  tiers,
  setTier,
  views = MODEL_SURFACE_AUDIT_VIEWS,
  width = 128,
  height = 128,
  maximumDoubleOnlyRatio = 0
}) {
  for (const tier of tiers) {
    const model = createModel();
    setTier(model, tier);
    for (const view of views) {
      const audit = auditModelSurfaceCoverage(
        model,
        dimensions,
        view,
        { width, height }
      );
      const maximumRatio = typeof maximumDoubleOnlyRatio === 'number'
        ? maximumDoubleOnlyRatio
        : maximumDoubleOnlyRatio[tier];
      assert.ok(Number.isFinite(maximumRatio), `${name}/${tier} requires a coverage limit`);
      assert.ok(
        audit.doubleOnlyRatio <= maximumRatio,
        `${name}/${tier}/${view.id} exposes ${(audit.doubleOnlyRatio * 100).toFixed(2)}% backface-only coverage; limit ${(maximumRatio * 100).toFixed(2)}%`
      );
    }
  }
}

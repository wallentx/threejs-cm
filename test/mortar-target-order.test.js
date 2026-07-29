import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceMortarTargetOrder,
  captureMortarTargetOrder,
  createMortarTargetOrder,
  recordMortarTargetOrderShot,
  restoreMortarTargetOrder,
  sampleMortarTargetPoint
} from '../src/simulation/indirect/MortarTargetOrder.js';

function createOrder(overrides = {}) {
  return createMortarTargetOrder({
    ammunitionType: 'HE',
    center: [100, 0, 60],
    defaultDispersionRadiusMeters: 2,
    radiusMeters: 8,
    firstRoundDelaySeconds: 1,
    ...overrides
  });
}

test('mortar area order enforces default dispersion and a timed first round', () => {
  assert.throws(
    () => createOrder({ radiusMeters: 1 }),
    /cannot be smaller than default dispersion/
  );
  const order = createOrder();
  advanceMortarTargetOrder(order, 0.4);
  advanceMortarTargetOrder(order, 0.6);
  assert.equal(order.firstRoundDelayRemainingSeconds, 0);
  assert.equal(recordMortarTargetOrderShot(order), 1);
});

test('mortar area samples are deterministic, bounded, and rollback-owned', () => {
  const order = createOrder();
  const values = [0.25, 0.25];
  const impact = sampleMortarTargetPoint(order, () => values.shift());
  assert.ok(Math.abs(impact[0] - 100) < 1e-9);
  assert.ok(Math.abs(impact[2] - 64) < 1e-9);
  assert.ok(Math.hypot(impact[0] - 100, impact[2] - 60) <= 8);

  advanceMortarTargetOrder(order, 0.75);
  recordMortarTargetOrderShot(order);
  const snapshot = captureMortarTargetOrder(order);
  const restored = restoreMortarTargetOrder(snapshot);
  assert.deepEqual(restored, snapshot);
  restored.center[0] = 999;
  assert.equal(snapshot.center[0], 100);
});

test('unsupported smoke ammunition cannot masquerade as a production round', () => {
  assert.throws(
    () => createOrder({ ammunitionType: 'SMOKE' }),
    /unsupported mortar ammunition type SMOKE/
  );
});

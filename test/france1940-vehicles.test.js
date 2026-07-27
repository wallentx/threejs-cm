import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  FRANCE_1940_VEHICLES,
  FRANCE_1940_VEHICLE_MACHINE_GUN_MOUNTS,
  getVehicle as getCanonicalVehicle,
  vehicleIdForFaction as canonicalVehicleIdForFaction
} from '../src/content/france1940/vehicles.js';
import { createFrance1940Family } from '../src/content/france1940/index.js';
import {
  VEHICLES,
  VEHICLE_MACHINE_GUN_MOUNTS,
  effectiveArmorMm as legacyEffectiveArmorMm,
  getVehicle,
  penetrationAtVelocity as legacyPenetrationAtVelocity,
  vehicleIdForFaction
} from '../src/game/VehicleCatalog.js';
import {
  effectiveArmorMm,
  penetrationAtVelocity
} from '../src/simulation/ballistics/ArmorMath.js';
import {
  SOMUA_S35_HULL_STATIONS as canonicalHullStations,
  SOMUA_S35_TURRET_STATIONS as canonicalTurretStations,
  createSomuaS35ArmorCollision as canonicalArmorFactory
} from '../src/content/france1940/vehicleData/SomuaS35Shape.js';
import {
  SOMUA_S35_HULL_STATIONS as legacyHullStations,
  SOMUA_S35_TURRET_STATIONS as legacyTurretStations,
  createSomuaS35ArmorCollision as legacyArmorFactory
} from '../src/game/vehicleData/SomuaS35Shape.js';

const EXPECTED_IDS = Object.freeze([
  'AMC_35',
  'CHAR_B1_BIS',
  'HOTCHKISS_H39',
  'LAFFLY_S20TL',
  'OPEL_BLITZ',
  'PANHARD_178',
  'PANZER_35T',
  'PANZER_38T',
  'PANZER_III_D',
  'PANZER_II_C',
  'PANZER_IV_D',
  'RENAULT_R35',
  'SDKFZ_231',
  'SOMUA_S35'
]);

function assertDeepFrozen(value, path = 'value', seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, `${path} must be frozen`);
  for (const [key, child] of Object.entries(value)) {
    assertDeepFrozen(child, `${path}.${key}`, seen);
  }
}

test('France 1940 owns exactly fourteen deeply frozen identity-stable vehicle records', () => {
  assert.deepEqual(Object.keys(FRANCE_1940_VEHICLES).sort(), EXPECTED_IDS);
  for (const [id, vehicle] of Object.entries(FRANCE_1940_VEHICLES)) {
    assert.equal(vehicle.id, id);
    assert.ok(vehicle.dimensionsMeters.length > 0);
    assert.ok(vehicle.dimensionsMeters.width > 0);
    assert.ok(vehicle.dimensionsMeters.height > 0);
    assert.ok(Array.isArray(vehicle.crew) && vehicle.crew.length > 0);
    assert.ok(vehicle.dataQuality?.referenceUrl);
  }
  assertDeepFrozen(FRANCE_1940_VEHICLES, 'FRANCE_1940_VEHICLES');
});

test('family and legacy vehicle surfaces preserve canonical catalog and record identity', () => {
  const family = createFrance1940Family({
    vehicles: { TEST: { id: 'TEST' } }
  });

  assert.equal(family.catalogs.vehicles, FRANCE_1940_VEHICLES);
  assert.equal(VEHICLES, FRANCE_1940_VEHICLES);
  assert.equal(VEHICLE_MACHINE_GUN_MOUNTS, FRANCE_1940_VEHICLE_MACHINE_GUN_MOUNTS);
  for (const id of EXPECTED_IDS) {
    assert.equal(getVehicle(id), FRANCE_1940_VEHICLES[id]);
    assert.equal(getCanonicalVehicle(id), FRANCE_1940_VEHICLES[id]);
  }
  assert.equal(getVehicle('UNKNOWN'), null);
  assert.equal(getCanonicalVehicle('UNKNOWN'), null);
  assert.equal(vehicleIdForFaction('french'), 'SOMUA_S35');
  assert.equal(canonicalVehicleIdForFaction('french'), 'SOMUA_S35');
  assert.equal(vehicleIdForFaction('german'), 'PANZER_III_D');
});

test('every vehicle weapon reference resolves through the canonical family catalog', () => {
  const weapons = createFrance1940Family().catalogs.weapons;
  for (const vehicle of Object.values(FRANCE_1940_VEHICLES)) {
    for (const weaponId of Object.values(vehicle.mainGun ?? {})) {
      assert.ok(weapons[weaponId], `${vehicle.id} main gun references ${weaponId}`);
    }
    for (const mount of vehicle.weaponMounts ?? []) {
      assert.ok(weapons[mount.weaponId], `${vehicle.id} ${mount.id} references ${mount.weaponId}`);
    }
  }
});

test('generic armor math owns the legacy-compatible numeric behavior', () => {
  const weapon = {
    muzzleVelocity: 800,
    penetrationMmAt100m: 60,
    penetrationVelocityExponent: 1.5
  };

  assert.equal(effectiveArmorMm(40, 1), 40);
  assert.equal(effectiveArmorMm(40, 0.5), 80);
  assert.equal(effectiveArmorMm(40, 0), 160);
  assert.equal(penetrationAtVelocity(weapon, 400), 60 * Math.pow(0.5, 1.5));
  assert.equal(penetrationAtVelocity(null, 400), 0);
  assert.equal(legacyEffectiveArmorMm, effectiveArmorMm);
  assert.equal(legacyPenetrationAtVelocity, penetrationAtVelocity);
});

test('SOMUA shape compatibility shim preserves canonical identities', () => {
  assert.equal(legacyHullStations, canonicalHullStations);
  assert.equal(legacyTurretStations, canonicalTurretStations);
  assert.equal(legacyArmorFactory, canonicalArmorFactory);
});

test('France vehicle data remains renderer/runtime independent and legacy catalog stays narrow', async () => {
  const contentSources = await Promise.all([
    '../src/content/france1940/vehicles.js',
    '../src/content/france1940/vehicleData/SomuaS35Shape.js',
    '../src/content/france1940/vehicleData/internalLayouts/SomuaS35InternalLayout.js',
    '../src/content/france1940/vehicleData/internalLayouts/PanzerIIIDInternalLayout.js'
  ].map(path => readFile(new URL(path, import.meta.url), 'utf8')));
  for (const source of contentSources) {
    assert.doesNotMatch(
      source,
      /^import\s.+?from\s+['"](?:three|.*\/(?:game|world|ui|main))(?:\/|['"])/m
    );
    assert.doesNotMatch(source, /\b(?:document|window|HTMLElement)\b/);
  }

  const legacySource = await readFile(
    new URL('../src/game/VehicleCatalog.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(legacySource, /Object\.freeze|freezeVehicle|SOMUA_REFERENCE/);
  assert.match(legacySource, /FRANCE_1940_VEHICLES as VEHICLES/);
});

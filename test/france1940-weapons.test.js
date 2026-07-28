import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  FRANCE_1940_WEAPONS,
  getWeapon as getFrance1940Weapon,
  weaponIdFromName as france1940WeaponIdFromName
} from '../src/content/france1940/weapons.js';
import {
  WEAPONS,
  getWeapon,
  weaponIdFromName
} from '../src/game/WeaponCatalog.js';
import { VEHICLES } from '../src/game/VehicleCatalog.js';
import { createFrance1940Family } from '../src/content/france1940/index.js';

const CANONICAL_IDS = Object.freeze([
  'MAS36', 'LEBEL_M1886_M93', 'BERTHIER_M1907_15_M16',
  'BERTHIER_M1892_M16', 'LEBEL_M1886_M93_APX1916',
  'BRANDT_MLE1935_60MM_HE',
  'FM2429', 'MAS38', 'KAR98K', 'MG34',
  'MAC31_VEHICLE', 'MG34_VEHICLE', 'MG37T_VEHICLE', 'MP40',
  'SA35_AP', 'SA35_HE', 'KWK36_AP', 'KWK36_HE', 'SA18_AP', 'SA18_HE',
  'SA38_AP', 'SA38_HE', 'SA35_25_AP', 'KWK30_AP', 'KWK30_HE',
  'KWK34T_AP', 'KWK34T_HE', 'KWK38T_AP', 'KWK38T_HE', 'KWK37_AP', 'KWK37_HE'
]);

test('France 1940 owns the complete frozen canonical weapon catalog', () => {
  assert.deepEqual(Object.keys(FRANCE_1940_WEAPONS), CANONICAL_IDS);
  assert.equal(Object.isFrozen(FRANCE_1940_WEAPONS), true);

  for (const id of CANONICAL_IDS) {
    const weapon = FRANCE_1940_WEAPONS[id];
    assert.equal(Object.isFrozen(weapon), true, `${id} must remain immutable`);
    assert.equal(weapon.id, id, `${id} must retain its stable key/id mapping`);
    assert.ok(weapon.muzzleVelocity > 0, `${id} must retain ballistic data`);
    assert.ok(weapon.magazineSize > 0, `${id} must retain feed data`);
    assert.ok(weapon.reloadSeconds > 0, `${id} must retain reload data`);
  }

  assert.equal(FRANCE_1940_WEAPONS.MAC31_VEHICLE.referenceUrl.includes('chars-francais.net'), true);
  assert.match(FRANCE_1940_WEAPONS.MG34_VEHICLE.dataQuality, /gameplay approximations/);
  assert.match(FRANCE_1940_WEAPONS.SA18_AP.dataQuality, /gameplay approximations/);
  assert.equal(FRANCE_1940_WEAPONS.MAS36.cyclicRPM, 15, 'default cyclic cadence must remain derived');
  assert.equal(FRANCE_1940_WEAPONS.SA35_HE.explosiveRadius, 5.5);
  const mortar = FRANCE_1940_WEAPONS.BRANDT_MLE1935_60MM_HE;
  assert.equal(mortar.kind, 'mortar_he');
  assert.equal(mortar.carriedAmmo, 24);
  assert.match(mortar.referenceUrl, /defense\.gouv\.fr\/mediatheque-en\/document\//);
  assert.match(mortar.ballisticsDataQuality, /gameplay approximations/);
  assert.match(mortar.ammunitionDataQuality, /gameplay approximations/);
});

test('legacy WeaponCatalog is a strict identity-preserving compatibility re-export', () => {
  assert.equal(WEAPONS, FRANCE_1940_WEAPONS);
  for (const id of CANONICAL_IDS) {
    assert.equal(WEAPONS[id], FRANCE_1940_WEAPONS[id]);
    assert.equal(getWeapon(id), FRANCE_1940_WEAPONS[id]);
    assert.equal(getFrance1940Weapon(id), FRANCE_1940_WEAPONS[id]);
  }
});

test('legacy aliases and unknown lookup behavior remain unchanged', () => {
  const aliases = [
    ['MAS-36 Rifle', 'MAS36'],
    ['FM 24/29 LMG', 'FM2429'],
    ['MAS-38 SMG', 'MAS38'],
    ['Kar98k', 'KAR98K'],
    ['MG34 LMG', 'MG34'],
    ['Brandt Mle 1935 60 mm mortar HE', 'BRANDT_MLE1935_60MM_HE'],
    ['MP40', 'MP40']
  ];
  for (const [name, id] of aliases) {
    assert.equal(weaponIdFromName(name), id);
    assert.equal(france1940WeaponIdFromName(name), id);
    assert.equal(getWeapon(name), FRANCE_1940_WEAPONS[id]);
  }
  assert.equal(weaponIdFromName('UNKNOWN'), 'UNKNOWN');
  assert.equal(weaponIdFromName(null), null);
  assert.equal(getWeapon('UNKNOWN'), null);
  assert.equal(getWeapon(null), null);
});

test('France 1940 family always owns canonical catalogs and ignores obsolete adapters', () => {
  const vehicles = { TEST: { id: 'TEST' } };
  const obsoleteWeaponsAdapter = { TEST: { id: 'TEST' } };
  const family = createFrance1940Family({ vehicles, weapons: obsoleteWeaponsAdapter });

  assert.equal(family.catalogs.weapons, FRANCE_1940_WEAPONS);
  assert.equal(family.catalogs.vehicles, VEHICLES);
  assert.notEqual(family.catalogs.weapons, obsoleteWeaponsAdapter);
  assert.notEqual(family.catalogs.vehicles, vehicles);
});

test('France 1940 weapon content stays renderer, runtime, and legacy-game independent', async () => {
  const source = await readFile(
    new URL('../src/content/france1940/weapons.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(
    source,
    /^import\s.+?from\s+['"](?:three|.*\/(?:game|world|ui|main|runtime))(?:\/|['"])/m
  );
  assert.doesNotMatch(source, /\b(?:document|window|HTMLElement)\b/);
});

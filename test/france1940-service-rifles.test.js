import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FRANCE_1940_WEAPONS,
  getWeapon,
  weaponIdFromName
} from '../src/content/france1940/weapons.js';

const SERVICE_RIFLE_IDS = Object.freeze([
  'LEBEL_M1886_M93',
  'BERTHIER_M1907_15_M16',
  'BERTHIER_M1892_M16',
  'LEBEL_M1886_M93_APX1916'
]);

const EXPECTED_REFERENCE_URLS = Object.freeze({
  LEBEL_M1886_M93:
    'https://www.musee-armee.fr/fileadmin/user_upload/Documents/Support-Visite-Fiches-Objets/Fiches-1914-1918/MA_fiche-objet-Lebel.pdf',
  BERTHIER_M1907_15_M16:
    'https://www.musee-armee.fr/fileadmin/user_upload/Documents/Rapports-Activites/MA_Rapport-Activite-2010.pdf#page=49',
  BERTHIER_M1892_M16:
    'https://www.musee-armee.fr/magazine/systeme-berthier-armes-iconiques-de-larmee-francaise-1.html',
  LEBEL_M1886_M93_APX1916:
    'https://collections.musee-armee.fr/harceler-lennemi-pendant-la-premiere-guerre-mondiale/'
});

test('French 8 mm service rifles retain stable canonical IDs and exact-name aliases', () => {
  for (const id of SERVICE_RIFLE_IDS) {
    const weapon = FRANCE_1940_WEAPONS[id];

    assert.ok(weapon, `${id} must be publicly exported`);
    assert.equal(weapon.id, id);
    assert.equal(weapon.kind, 'rifle');
    assert.equal(getWeapon(id), weapon);
    assert.equal(weaponIdFromName(weapon.name), id);
    assert.equal(getWeapon(weapon.name), weapon);
  }
});

test('French 8 mm service-rifle records and nested optic metadata are immutable', () => {
  for (const id of SERVICE_RIFLE_IDS) {
    assert.equal(Object.isFrozen(FRANCE_1940_WEAPONS[id]), true, `${id} must be frozen`);
  }

  assert.equal(
    Object.isFrozen(FRANCE_1940_WEAPONS.BERTHIER_M1907_15_M16.compatibleOpticIds),
    true
  );
});

test('Lebel tube capacity stays distinct from the explicitly inferred Berthier M16 feed', () => {
  const lebel = FRANCE_1940_WEAPONS.LEBEL_M1886_M93;
  const berthierLong = FRANCE_1940_WEAPONS.BERTHIER_M1907_15_M16;
  const berthierMousqueton = FRANCE_1940_WEAPONS.BERTHIER_M1892_M16;

  assert.equal(lebel.magazineSize, 8);
  assert.equal(lebel.feedType, 'tubular_magazine');
  assert.equal(lebel.lengthMeters, 1.3);
  assert.equal(lebel.carriedAmmo, 120);
  assert.equal(berthierLong.magazineSize, 5);
  assert.equal(berthierMousqueton.magazineSize, 5);
  assert.notEqual(lebel.magazineSize, berthierLong.magazineSize);
  assert.match(berthierLong.feedDataQuality, /inferred gameplay value/);
  assert.match(berthierMousqueton.feedDataQuality, /inferred gameplay value/);
});

test('APX metadata records compatibility without claiming a 1940 allocation', () => {
  const plainLebel = FRANCE_1940_WEAPONS.LEBEL_M1886_M93;
  const scopedLebel = FRANCE_1940_WEAPONS.LEBEL_M1886_M93_APX1916;
  const berthierLong = FRANCE_1940_WEAPONS.BERTHIER_M1907_15_M16;

  assert.equal(plainLebel.opticId, undefined);
  assert.equal(scopedLebel.opticId, 'APX_1916');
  assert.deepEqual(berthierLong.compatibleOpticIds, ['APX_1916']);
  assert.equal(berthierLong.opticId, undefined);
  assert.match(scopedLebel.opticDataQuality, /First World War/);
  assert.match(scopedLebel.opticDataQuality, /not evidence of a 1940 allocation/);
  assert.match(berthierLong.opticDataQuality, /not evidence of a 1940 allocation/);
});

test('museum provenance maps to the supported record and gameplay approximations remain public', () => {
  const [
    plainLebel,
    berthierLong,
    berthierMousqueton,
    scopedLebel
  ] = SERVICE_RIFLE_IDS.map(id => FRANCE_1940_WEAPONS[id]);

  for (const id of SERVICE_RIFLE_IDS) {
    const weapon = FRANCE_1940_WEAPONS[id];

    assert.match(weapon.referenceUrl, /^https:\/\/(?:www|collections)\.musee-armee\.fr\//);
    assert.match(weapon.dataQuality, /gameplay approximation/);
    assert.match(weapon.ballisticsDataQuality, /gameplay approximation/);
    assert.match(weapon.ballisticsDataQuality, /not historical 8 mm firing data/);
  }

  for (const [id, referenceUrl] of Object.entries(EXPECTED_REFERENCE_URLS)) {
    assert.equal(FRANCE_1940_WEAPONS[id].referenceUrl, referenceUrl, `${id} source mapping`);
  }
  assert.equal(new URL(berthierLong.referenceUrl).hash, '#page=49');
  assert.equal(
    berthierLong.opticReferenceUrl,
    'https://collections.musee-armee.fr/harceler-lennemi-pendant-la-premiere-guerre-mondiale/'
  );
  assert.equal(
    scopedLebel.weaponReferenceUrl,
    EXPECTED_REFERENCE_URLS.LEBEL_M1886_M93
  );
  assert.match(plainLebel.reloadDataQuality, /3\.8-second reload/);
  assert.match(plainLebel.reloadDataQuality, /gameplay approximation/);
  assert.match(plainLebel.dataQuality, /3\.8-second reload/);
  assert.match(plainLebel.dataQuality, /gameplay approximations/);
  assert.match(
    plainLebel.issueDataQuality,
    /not evidence of a universal 1940 allocation/
  );
  assert.match(
    berthierMousqueton.identityDataQuality,
    /exact Mle 1892 M16 designation remains pending/
  );
  assert.match(
    berthierMousqueton.identityDataQuality,
    /supports only the broader Berthier/
  );
  assert.match(
    berthierMousqueton.serviceDataQuality,
    /mounted-troop design context/
  );
  assert.match(
    berthierMousqueton.serviceDataQuality,
    /Second World War/
  );
  assert.match(
    berthierLong.serviceDataQuality,
    /theoretical metropolitan-infantry equipment issue of 3 September 1939/
  );
});

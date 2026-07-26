import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVehicleStatusView } from '../src/ui/VehicleStatusPresenter.js';

test('vehicle status presenter exposes component health and independent weapon mounts', () => {
  const unit = {
    vehicleSpec: { id: 'PANZER_III_D' },
    getVehicleDamageReport() {
      return {
        burning: false,
        components: {
          hull: { label: 'Hull', health: 72, status: 'DAMAGED' },
          engine: { label: 'Engine', health: 0, status: 'DISABLED' },
          mainGun: { label: 'Main gun', health: 100, status: 'OK' }
        },
        mounts: [
          {
            id: 'coax',
            label: 'Coax MG',
            weaponId: 'MG34_VEHICLE',
            fireState: 'FIRING',
            operational: true,
            feedAmmo: 34,
            reserveAmmo: 1200
          },
          {
            id: 'hull_mg',
            label: 'Hull MG',
            weaponId: 'MG34_VEHICLE',
            operational: false,
            feedAmmo: 0,
            reserveAmmo: 900
          }
        ]
      };
    }
  };

  const view = buildVehicleStatusView(unit);
  assert.equal(view.burning, false);
  assert.equal(view.destroyed, false);
  assert.equal(view.components.find(component => component.id === 'engine').health, 0);
  assert.deepEqual(
    view.damagedComponents.map(component => component.id),
    ['hull', 'engine']
  );
  assert.equal(view.mounts.length, 2);
  assert.equal(view.mounts[0].feed, 34);
  assert.equal(view.mounts[0].status, 'FIRING');
  assert.equal(view.mounts[1].operational, false);
  assert.equal(view.mounts[1].status, 'DISABLED');
});

test('vehicle status presenter remains compatible with legacy five-string damage state', () => {
  const view = buildVehicleStatusView({
    vehicleSpec: { id: 'SOMUA_S35' },
    vehicleDamage: {
      hull: 'OK',
      engine: 'DESTROYED',
      tracks: 'DAMAGED',
      gun: 'OK',
      turret: 'OK'
    },
    vehicleWeapon: {
      loadedType: 'ap',
      feedAmmo: 1,
      reloadTimer: 0,
      ammunition: { ap: 20, he: 15 }
    }
  });

  assert.equal(view.components.find(component => component.id === 'engine').health, 0);
  assert.equal(view.components.find(component => component.id === 'tracks').health, 45);
  assert.equal(view.mounts[0].label, 'MAIN GUN');
  assert.equal(view.mounts[0].reserve, 35);
});

test('vehicle status presenter prioritizes availability and does not duplicate canonical components', () => {
  const view = buildVehicleStatusView({
    vehicleSpec: { id: 'PANZER_III_D' },
    getVehicleDamageReport() {
      return {
        burning: true,
        destroyed: false,
        components: [
          { id: 'hull', label: 'Hull', health: 100, status: 'OK', installed: true },
          { id: 'coax', label: 'Coaxial machine gun', health: 0, status: 'DESTROYED', installed: true }
        ],
        mounts: [
          {
            id: 'main',
            label: 'Main gun',
            weaponId: 'KWK36_AP',
            fireState: 'READY',
            operational: true,
            feedAmmo: 1,
            reserveAmmo: 20
          },
          {
            id: 'coax',
            label: 'Coaxial MG 34',
            weaponId: 'MG34_VEHICLE',
            fireState: 'READY',
            operational: false,
            feedAmmo: 50,
            reserveAmmo: 500
          }
        ]
      };
    }
  });

  assert.equal(view.components.filter(component => component.id === 'coax').length, 1);
  assert.equal(view.mounts.find(mount => mount.id === 'main').status, 'FIRE BLOCKED');
  assert.equal(view.mounts.find(mount => mount.id === 'main').operational, false);
  assert.equal(view.mounts.find(mount => mount.id === 'coax').status, 'DISABLED');
  assert.equal(view.mounts.find(mount => mount.id === 'coax').operational, false);
});

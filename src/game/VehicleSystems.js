import { getWeapon } from './WeaponCatalog.js';

const COMPONENT_SPECS = Object.freeze([
  { id: 'hull', label: 'Hull structure' },
  { id: 'main_gun', label: 'Main gun' },
  { id: 'breech', label: 'Gun breech' },
  { id: 'turret_traverse', label: 'Turret traverse' },
  { id: 'coax', label: 'Coaxial machine gun' },
  { id: 'hull_mg', label: 'Hull machine gun' },
  { id: 'engine', label: 'Engine' },
  { id: 'transmission', label: 'Transmission' },
  { id: 'tracks', label: 'Tracks / running gear' },
  { id: 'fuel', label: 'Fuel system' },
  { id: 'ammunition', label: 'Ammunition stowage' },
  { id: 'optics', label: 'Optics' },
  { id: 'radio', label: 'Radio' }
]);

const DAMAGE_CANDIDATES = Object.freeze({
  hull_front: ['transmission', 'tracks', 'hull_mg', 'optics', 'radio', 'ammunition'],
  hull_side: ['fuel', 'ammunition', 'engine', 'transmission', 'tracks', 'radio'],
  hull_rear: ['engine', 'transmission', 'fuel', 'tracks', 'ammunition'],
  turret_front: ['main_gun', 'breech', 'turret_traverse', 'coax', 'optics', 'ammunition'],
  turret_side: ['turret_traverse', 'coax', 'breech', 'optics', 'ammunition', 'radio'],
  turret_rear: ['ammunition', 'radio', 'turret_traverse', 'breech', 'coax'],
  track_left: ['tracks'],
  track_right: ['tracks']
});

function statusForHealth(health, installed = true) {
  if (!installed) return 'NOT_INSTALLED';
  if (health <= 0) return 'DESTROYED';
  if (health <= 25) return 'DISABLED';
  if (health < 70) return 'DAMAGED';
  return 'OK';
}

function normalizeComponent(spec, installed, saved = null) {
  const health = installed
    ? Math.max(0, Math.min(100, saved?.health ?? 100))
    : 0;
  const status = statusForHealth(health, installed);
  return {
    id: spec.id,
    label: spec.label,
    installed,
    health,
    status,
    operational: installed && health > 25
  };
}

export function createVehicleComponents(vehicleSpec, saved = null) {
  if (!vehicleSpec) return {};
  const mountIds = new Set((vehicleSpec.weaponMounts ?? []).map(mount => mount.id));
  const carriesMainGunAmmo = Object.values(vehicleSpec.ammunition ?? {})
    .some(rounds => Number.isFinite(rounds) && rounds > 0);
  const carriesMountedAmmo = (vehicleSpec.weaponMounts ?? [])
    .some(mount => Number.isFinite(mount.carriedAmmo) && mount.carriedAmmo > 0);
  const installed = new Set([
    'hull',
    'engine',
    'transmission',
    'tracks',
    'fuel',
    'optics'
  ]);
  if (vehicleSpec.communications?.radioInstalled) installed.add('radio');
  if (carriesMainGunAmmo || carriesMountedAmmo) installed.add('ammunition');
  if (vehicleSpec.mainGun) {
    installed.add('main_gun');
    installed.add('breech');
  }
  if (vehicleSpec.turretTraverseRadPerSecond > 0) installed.add('turret_traverse');
  if (mountIds.has('coax')) installed.add('coax');
  if (mountIds.has('hull_mg')) installed.add('hull_mg');

  return Object.fromEntries(COMPONENT_SPECS.map(spec => [
    spec.id,
    normalizeComponent(spec, installed.has(spec.id), saved?.[spec.id])
  ]));
}

export function setVehicleComponentHealth(components, id, health) {
  const component = components?.[id];
  if (!component?.installed) return null;
  component.health = Math.max(0, Math.min(100, health));
  component.status = statusForHealth(component.health, true);
  component.operational = component.health > 25;
  return component;
}

export function createVehicleDamageState(saved = null) {
  return {
    burning: Boolean(saved?.burning),
    destroyed: Boolean(saved?.destroyed),
    secondaryExplosion: Boolean(saved?.secondaryExplosion),
    eventVersion: Math.max(0, saved?.eventVersion ?? saved?.version ?? 0),
    events: (saved?.events ?? []).slice(-24).map(event => ({ ...event }))
  };
}

export function recordVehicleEvent(damageState, type, detail = {}) {
  damageState.eventVersion++;
  const event = {
    version: damageState.eventVersion,
    type,
    ...detail
  };
  damageState.events.push(event);
  if (damageState.events.length > 24) damageState.events.shift();
  return event;
}

function damageOneComponent(components, componentId, amount) {
  const component = components[componentId];
  if (!component?.installed) return null;
  const previousStatus = component.status;
  setVehicleComponentHealth(components, componentId, component.health - amount);
  return {
    id: component.id,
    previousStatus,
    status: component.status,
    health: component.health
  };
}

function resolvePenetrationSecondaryEffects({ components, damageState, random }) {
  const fuel = components.fuel;
  if (!damageState.burning && fuel?.installed && !fuel.operational && random() < 0.55) {
    damageState.burning = true;
    recordVehicleEvent(damageState, 'fire_started', { source: 'fuel' });
  }

  const ammunition = components.ammunition;
  if (!damageState.secondaryExplosion
      && ammunition?.installed
      && !ammunition.operational
      && random() < 0.65) {
    damageState.secondaryExplosion = true;
    damageState.burning = true;
    damageState.destroyed = true;
    setVehicleComponentHealth(components, 'hull', 0);
    recordVehicleEvent(damageState, 'secondary_explosion', { source: 'ammunition' });
  }
}

export function applyDirectComponentDamage({
  components,
  damageState,
  componentId,
  residualRatio = 1,
  random,
  detail = {},
  resolveSecondaryEffects = true
}) {
  const amount = (32 + random() * 48)
    * Math.min(1.6, Math.max(0.5, residualRatio));
  const result = damageOneComponent(components, componentId, amount);
  if (!result) return null;
  const detailedResult = { ...result, ...detail };
  recordVehicleEvent(damageState, 'component_damage', detailedResult);
  if (resolveSecondaryEffects) {
    resolvePenetrationSecondaryEffects({ components, damageState, random });
  }
  return detailedResult;
}

export function applyPathComponentDamage({
  components,
  damageState,
  pathHits,
  residualRatio = 1,
  random
}) {
  const damageResults = [];
  const damagedIds = new Set();
  for (const hit of pathHits ?? []) {
    const componentId = hit.componentId;
    if (hit.kind !== 'component' || !componentId || damagedIds.has(componentId)) continue;
    damagedIds.add(componentId);
    const result = applyDirectComponentDamage({
      components,
      damageState,
      componentId,
      residualRatio,
      random,
      detail: {
        cause: 'model_local_penetration_path',
        internalVolumeId: hit.id,
        pathDistanceMeters: hit.entryDistanceMeters,
        pathLengthMeters: hit.pathLengthMeters,
        layoutVersion: hit.layoutVersion,
        dataQuality: hit.dataQuality
      },
      resolveSecondaryEffects: false
    });
    if (result) damageResults.push(result);
  }
  if (damageResults.length > 0) {
    resolvePenetrationSecondaryEffects({ components, damageState, random });
  }
  return damageResults;
}

export function applyPenetrationComponentDamage({
  components,
  damageState,
  zone,
  residualRatio = 1,
  random
}) {
  const candidates = (DAMAGE_CANDIDATES[zone] ?? ['hull'])
    .filter(id => components[id]?.installed);
  if (candidates.length === 0) return [];

  const damageResults = [];
  const hitCount = residualRatio >= 1.35 ? 2 : 1;
  for (let hit = 0; hit < hitCount; hit++) {
    const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
    const amount = (32 + random() * 48) * Math.min(1.6, Math.max(0.5, residualRatio));
    const result = damageOneComponent(components, candidates[index], amount);
    if (!result) continue;
    damageResults.push(result);
    recordVehicleEvent(damageState, 'component_damage', result);
  }

  resolvePenetrationSecondaryEffects({ components, damageState, random });

  return damageResults;
}

export function createVehicleMountState(mountSpec, saved = null) {
  const weapon = getWeapon(mountSpec.weaponId);
  const feedCapacity = mountSpec.feedCapacity ?? weapon?.magazineSize ?? 1;
  if (saved) {
    return {
      id: mountSpec.id,
      weaponId: mountSpec.weaponId,
      feedAmmo: Math.max(0, saved.feedAmmo ?? 0),
      reserveAmmo: Math.max(0, saved.reserveAmmo ?? 0),
      reloadTimer: Math.max(0, saved.reloadTimer ?? 0),
      cooldown: Number.isFinite(saved.cooldown) ? saved.cooldown : 0,
      roundsFired: Math.max(0, saved.roundsFired ?? 0),
      targetUnitId: saved.targetUnitId ?? null,
      targetPos: saved.targetPos ? [...saved.targetPos] : null,
      targetMode: saved.targetMode ?? null,
      isFiring: Boolean(saved.isFiring),
      fireState: saved.fireState ?? 'IDLE'
    };
  }

  const carriedAmmo = Math.max(0, mountSpec.carriedAmmo ?? weapon?.carriedAmmo ?? 0);
  const feedAmmo = Math.min(feedCapacity, carriedAmmo);
  return {
    id: mountSpec.id,
    weaponId: mountSpec.weaponId,
    feedAmmo,
    reserveAmmo: Math.max(0, carriedAmmo - feedAmmo),
    reloadTimer: 0,
    cooldown: 0,
    roundsFired: 0,
    targetUnitId: null,
    targetPos: null,
    targetMode: null,
    isFiring: false,
    fireState: feedAmmo > 0 ? 'READY' : 'EMPTY'
  };
}

export function captureVehicleMountState(state) {
  return {
    ...state,
    targetPos: state.targetPos ? [...state.targetPos] : null
  };
}

export function vehicleDamageReport(unit) {
  const damageState = unit.vehicleDamageState ?? createVehicleDamageState();
  const components = Object.values(unit.vehicleComponents ?? {})
    .filter(component => component.installed)
    .map(component => ({ ...component }));
  const mounts = Object.entries(unit.vehicleMounts ?? {}).map(([id, state]) => {
    const spec = id === 'main'
      ? null
      : unit.vehicleSpec?.weaponMounts?.find(candidate => candidate.id === id);
    return {
      id,
      label: spec?.label ?? (id === 'main' ? 'Main gun' : id),
      weaponId: state?.weaponId
        ?? unit.vehicleSpec?.mainGun?.[state?.loadedType ?? state?.pendingType]
        ?? null,
      feedAmmo: state?.feedAmmo ?? 0,
      reserveAmmo: state?.reserveAmmo
        ?? Object.values(state?.ammunition ?? {}).reduce((sum, rounds) => sum + rounds, 0),
      reloadTimer: state?.reloadTimer ?? 0,
      cooldown: state?.cooldown ?? 0,
      roundsFired: state?.roundsFired ?? 0,
      targetUnitId: state?.targetUnitId ?? null,
      targetPos: state?.targetPos ? [...state.targetPos] : null,
      isFiring: Boolean(state?.isFiring),
      fireState: state?.fireState ?? 'IDLE',
      operational: id === 'main'
        ? unit.hasOperationalGunner()
        : unit.isVehicleMountOperational(id)
    };
  });

  return {
    components,
    mounts,
    burning: damageState.burning,
    destroyed: damageState.destroyed,
    secondaryExplosion: damageState.secondaryExplosion,
    version: damageState.eventVersion,
    eventVersion: damageState.eventVersion,
    events: damageState.events.map(event => ({ ...event }))
  };
}

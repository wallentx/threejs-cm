const COMPONENT_LABELS = Object.freeze({
  hull: 'HULL',
  engine: 'ENGINE',
  transmission: 'TRANS',
  fuel: 'FUEL',
  ammunition: 'AMMO RACK',
  main_gun: 'MAIN GUN',
  mainGun: 'MAIN GUN',
  gun: 'MAIN GUN',
  breech: 'BREECH',
  gunBreech: 'BREECH',
  turret: 'TURRET',
  turret_traverse: 'TRAVERSE',
  turretTraverse: 'TRAVERSE',
  coax: 'COAX MG',
  hull_mg: 'HULL MG',
  hullMachineGun: 'HULL MG',
  hullMG: 'HULL MG',
  tracks: 'TRACKS',
  leftTrack: 'LEFT TRACK',
  rightTrack: 'RIGHT TRACK',
  optics: 'OPTICS',
  radio: 'RADIO'
});

const COMPONENT_ORDER = Object.freeze([
  'hull',
  'engine',
  'transmission',
  'leftTrack',
  'rightTrack',
  'tracks',
  'main_gun',
  'breech',
  'turret_traverse',
  'coax',
  'hull_mg',
  'mainGun',
  'gunBreech',
  'turretTraverse',
  'hullMachineGun',
  'optics',
  'radio',
  'fuel',
  'ammunition'
]);

function normalizeStatus(value) {
  if (typeof value === 'string') return value.toUpperCase();
  if (!value || typeof value !== 'object') return 'OK';
  return String(value.status ?? value.state ?? (value.operational === false ? 'DISABLED' : 'OK'))
    .toUpperCase();
}

function normalizeHealth(value, status) {
  if (value && typeof value === 'object' && Number.isFinite(value.health)) {
    return Math.max(0, Math.min(100, value.health));
  }
  if (['DESTROYED', 'DISABLED', 'KNOCKED_OUT'].includes(status)) return 0;
  if (status === 'BURNING') return 10;
  if (status === 'DAMAGED') return 45;
  return 100;
}

function componentMapFrom(unit, report) {
  const source = report?.components
    ?? unit.vehicleComponents
    ?? unit.vehicleDamage?.components
    ?? unit.componentDamage;
  if (Array.isArray(source)) {
    return Object.fromEntries(source.map(component => [
      component.id ?? component.key ?? component.name,
      component
    ]));
  }
  if (source && typeof source === 'object') return source;

  const legacy = unit.vehicleDamage ?? {};
  return {
    hull: legacy.hull,
    engine: legacy.engine,
    tracks: legacy.tracks,
    mainGun: legacy.gun,
    turretTraverse: legacy.turret
  };
}

function normalizeComponent(key, value) {
  const status = normalizeStatus(value);
  return {
    id: key,
    label: value?.label ?? COMPONENT_LABELS[key] ?? key.replaceAll('_', ' ').toUpperCase(),
    status,
    health: normalizeHealth(value, status),
    installed: value?.installed ?? status !== 'NOT_INSTALLED',
    operational: value?.operational ?? !['DESTROYED', 'DISABLED', 'KNOCKED_OUT'].includes(status)
  };
}

function mountEntries(unit, report) {
  const source = report?.mounts
    ?? unit.vehicleWeaponMounts
    ?? unit.vehicleWeapons
    ?? unit.weaponMounts;
  const entries = Array.isArray(source)
    ? source.map((mount, index) => [mount.id ?? `mount_${index}`, mount])
    : Object.entries(source ?? {});

  const mounts = entries.map(([id, mount]) => {
    const mechanicallyOperational = mount.operational
      ?? !['DESTROYED', 'DISABLED', 'JAMMED'].includes(normalizeStatus(mount));
    const operational = Boolean(mechanicallyOperational)
      && !report?.burning
      && !report?.destroyed;
    const status = !mechanicallyOperational
      ? 'DISABLED'
      : report?.destroyed
        ? 'DISABLED'
        : report?.burning
          ? 'FIRE BLOCKED'
          : String(mount.status ?? mount.fireState ?? 'READY').toUpperCase();
    const ammunition = mount.ammunition ?? mount.ammo ?? {};
    const reserve = Number.isFinite(mount.reserveAmmo)
      ? mount.reserveAmmo
      : Object.values(ammunition).reduce(
          (sum, count) => sum + (Number.isFinite(count) ? count : 0),
          0
        );
    const feed = mount.feedAmmo ?? mount.magazineAmmo ?? mount.loadedRounds ?? 0;
    const fireControl = mount.fireControl ?? null;
    const aimRequiredSeconds = Number.isFinite(fireControl?.aimRequiredSeconds)
      ? Math.max(0, fireControl.aimRequiredSeconds)
      : 0;
    const aimProgressSeconds = Number.isFinite(fireControl?.aimProgressSeconds)
      ? Math.max(0, fireControl.aimProgressSeconds)
      : 0;
    return {
      id,
      label: mount.label ?? mount.name ?? id.replaceAll('_', ' ').toUpperCase(),
      weaponId: mount.weaponId ?? mount.weapon?.id ?? mount.loadedWeaponId ?? null,
      status,
      operational,
      feed,
      reserve,
      reloadTimer: mount.reloadTimer ?? 0,
      aimProgressRatio: aimRequiredSeconds > 0
        ? Math.min(1, aimProgressSeconds / aimRequiredSeconds)
        : null,
      estimatedRangeMeters: Number.isFinite(fireControl?.estimatedRangeMeters)
        ? fireControl.estimatedRangeMeters
        : null
    };
  });

  if (mounts.length === 0 && unit.vehicleWeapon) {
    const weapon = unit.vehicleWeapon;
    mounts.push({
      id: 'main_gun',
      label: 'MAIN GUN',
      weaponId: weapon.loadedType?.toUpperCase() ?? 'EMPTY',
      status: unit.vehicleDamage?.gun ?? 'OK',
      operational: unit.vehicleDamage?.gun !== 'DESTROYED',
      feed: weapon.feedAmmo ?? 0,
      reserve: Object.values(weapon.ammunition ?? {}).reduce(
        (sum, count) => sum + (Number.isFinite(count) ? count : 0),
        0
      ),
      reloadTimer: weapon.reloadTimer ?? 0,
      aimProgressRatio: weapon.fireControl?.aimRequiredSeconds > 0
        ? Math.min(
            1,
            (weapon.fireControl.aimProgressSeconds ?? 0)
              / weapon.fireControl.aimRequiredSeconds
          )
        : null,
      estimatedRangeMeters: Number.isFinite(weapon.fireControl?.estimatedRangeMeters)
        ? weapon.fireControl.estimatedRangeMeters
        : null
    });
  }
  return mounts;
}

export function buildVehicleStatusView(unit) {
  if (!unit?.vehicleSpec) return null;
  const report = unit.getVehicleDamageReport?.() ?? null;
  const source = componentMapFrom(unit, report);
  const keys = [
    ...COMPONENT_ORDER.filter(key => source[key] != null),
    ...Object.keys(source).filter(key => !COMPONENT_ORDER.includes(key))
  ];
  const components = keys
    .map(key => normalizeComponent(key, source[key]))
    .filter(component => component.installed);
  const mounts = mountEntries(unit, report);
  const hull = components.find(component => component.id === 'hull');
  const averageHealth = components.length > 0
    ? components.reduce((sum, component) => sum + component.health, 0) / components.length
    : 100;
  const health = Math.round(hull ? (hull.health * 0.55 + averageHealth * 0.45) : averageHealth);
  const burning = report?.burning
    ?? unit.vehicleFire?.active
    ?? components.some(component => component.status === 'BURNING');
  const destroyed = report?.destroyed
    ?? unit.isKnockedOut
    ?? hull?.status === 'DESTROYED';

  return {
    health,
    burning: Boolean(burning),
    destroyed: Boolean(destroyed),
    components,
    mounts,
    damagedComponents: components.filter(component => component.status !== 'OK')
  };
}

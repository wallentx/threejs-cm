export function evaluateVehicleDamageBehavior(unit) {
  if (!unit || (!unit.vehicleSpec && unit.type !== 'tank' && unit.type !== 'vehicle')) {
    return null;
  }

  const damageState = unit.vehicleDamageState ?? {};
  const components = unit.vehicleComponents ?? {};

  const isDestroyed = Boolean(damageState.destroyed);
  const isBurning = Boolean(damageState.burning || damageState.secondaryExplosion);

  const driverAvailable = typeof unit.isCrewRoleAlive === 'function'
    ? unit.isCrewRoleAlive(unit.vehicleSpec?.driverRoles ?? [])
    : (typeof unit.hasOperationalDriver === 'function'
        ? unit.hasOperationalDriver()
        : Boolean(components.driver?.operational !== false && (components.driver?.health ?? 100) > 0));

  const gunnerAvailable = typeof unit.isCrewRoleAlive === 'function'
    ? unit.isCrewRoleAlive(unit.vehicleSpec?.gunnerRoles ?? [])
    : (typeof unit.hasOperationalGunner === 'function'
        ? unit.hasOperationalGunner()
        : Boolean(components.gunner?.operational !== false && (components.gunner?.health ?? 100) > 0));

  const loaderAvailable = typeof unit.isCrewRoleAlive === 'function'
    ? unit.isCrewRoleAlive(unit.vehicleSpec?.loaderRoles ?? [])
    : (typeof unit.hasOperationalLoader === 'function'
        ? unit.hasOperationalLoader()
        : Boolean(components.loader?.operational !== false && (components.loader?.health ?? 100) > 0));

  const engineOk = components.engine?.operational !== false && (components.engine?.health ?? 100) > 25;
  const transmissionOk = components.transmission?.operational !== false && (components.transmission?.health ?? 100) > 25;
  const tracksOk = components.tracks?.operational !== false && (components.tracks?.health ?? 100) > 25;

  const mobilityDisabled = isDestroyed || !driverAvailable || !engineOk || !transmissionOk || !tracksOk;
  const isPillbox = mobilityDisabled && !isDestroyed;

  const mainGunComponent = components.main_gun ?? null;
  const breechComponent = components.breech ?? null;
  const mainGunDisabled = Boolean(
    (mainGunComponent && (mainGunComponent.health <= 25 || mainGunComponent.operational === false)) ||
    (breechComponent && (breechComponent.health <= 25 || breechComponent.operational === false))
  );

  const opticsComponent = components.optics ?? null;
  const opticsHealth = opticsComponent?.health ?? 100;
  const opticsDamaged = Boolean(opticsComponent && opticsHealth < 70);
  const opticsDestroyed = Boolean(opticsComponent && opticsHealth <= 0);
  const spottingModifier = opticsDestroyed ? 0.3 : (opticsDamaged ? 0.6 : 1.0);

  let activeMountsCount = 0;
  if (unit.vehicleMounts) {
    for (const [mountId, mount] of Object.entries(unit.vehicleMounts)) {
      if (!mount) continue;
      if (mountId === 'main') {
        const mainOperational = typeof unit.hasOperationalGunner === 'function'
          ? unit.hasOperationalGunner()
          : gunnerAvailable && !mainGunDisabled;
        if (mainOperational && !isDestroyed && !isBurning) {
          activeMountsCount++;
        }
      } else {
        const mountOperational = typeof unit.isVehicleMountOperational === 'function'
          ? unit.isVehicleMountOperational(mountId)
          : (() => {
              const mountComponent = components[mountId] ?? components[`mount_${mountId}`];
              return mountComponent
                ? mountComponent.operational !== false && (mountComponent.health ?? 100) > 25
                : true;
            })();
        if (mountOperational && !isDestroyed && !isBurning) {
          activeMountsCount++;
        }
      }
    }
  }

  let reason = 'operational';
  if (isDestroyed) {
    reason = 'vehicle-destroyed';
  } else if (isBurning) {
    reason = 'vehicle-burning-abandoned';
  } else if (isPillbox) {
    reason = 'pillbox-mode';
  } else if (mainGunDisabled) {
    reason = 'main-gun-disabled';
  }

  return {
    reason,
    isDestroyed,
    isBurning,
    mobilityDisabled,
    isPillbox,
    mainGunDisabled,
    driverAvailable,
    gunnerAvailable,
    loaderAvailable,
    opticsDamaged,
    opticsDestroyed,
    spottingModifier,
    activeMountsCount
  };
}

// Renderer-neutral game-family records. This module owns validation only;
// callers inject content catalogs and decide where registrations live.
import { validateAssetManifest } from '../assets/AssetManifest.js';

function assertRecordMap(label, records) {
  if (!records || typeof records !== 'object' || Array.isArray(records)) {
    throw new TypeError(`${label} must be a record keyed by stable IDs`);
  }

  for (const [key, record] of Object.entries(records)) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new TypeError(`${label}.${key} must be a record`);
    }
    if (record.id !== key) {
      throw new Error(`${label} key/id mismatch: ${key} !== ${record.id ?? 'missing'}`);
    }
  }
}

function assertWeaponReference(weapons, reference, context) {
  if (typeof reference !== 'string' || !Object.hasOwn(weapons, reference)) {
    throw new Error(`${context} references unknown weapon: ${reference ?? 'missing'}`);
  }
}

function validateVehicleWeapons(vehicles, weapons) {
  for (const [vehicleId, vehicle] of Object.entries(vehicles)) {
    for (const [ammunitionType, weaponId] of Object.entries(vehicle.mainGun ?? {})) {
      assertWeaponReference(weapons, weaponId, `vehicle ${vehicleId} mainGun.${ammunitionType}`);
    }
    for (const mount of vehicle.weaponMounts ?? []) {
      assertWeaponReference(weapons, mount?.weaponId, `vehicle ${vehicleId} mount ${mount?.id ?? 'missing'}`);
    }
  }
}

function validateFactionVehicles(factions, vehicles) {
  const owners = new Map();
  for (const [factionId, faction] of Object.entries(factions)) {
    if (!Array.isArray(faction.vehicleIds) || faction.vehicleIds.length === 0) {
      throw new Error(`faction ${factionId} requires at least one vehicleId`);
    }
    const localIds = new Set();
    for (const vehicleId of faction.vehicleIds) {
      if (typeof vehicleId !== 'string' || !Object.hasOwn(vehicles, vehicleId)) {
        throw new Error(`faction ${factionId} references unknown vehicle: ${vehicleId ?? 'missing'}`);
      }
      if (localIds.has(vehicleId)) {
        throw new Error(`faction ${factionId} contains duplicate vehicleId: ${vehicleId}`);
      }
      localIds.add(vehicleId);
      const previousOwner = owners.get(vehicleId);
      if (previousOwner) {
        throw new Error(`vehicle ${vehicleId} belongs to multiple factions: ${previousOwner}, ${factionId}`);
      }
      owners.set(vehicleId, factionId);
    }
    if (faction.defaultVehicleId && !Object.hasOwn(vehicles, faction.defaultVehicleId)) {
      throw new Error(
        `faction ${factionId} references unknown default vehicle: ${faction.defaultVehicleId}`
      );
    }
    if (faction.defaultVehicleId && !localIds.has(faction.defaultVehicleId)) {
      throw new Error(
        `faction ${factionId} default vehicle ${faction.defaultVehicleId} is not in its vehicleIds`
      );
    }
  }

  for (const vehicleId of Object.keys(vehicles)) {
    if (!owners.has(vehicleId)) {
      throw new Error(`vehicle ${vehicleId} has no faction owner`);
    }
  }
}

function validateFormationSupportAmmunition(
  formationId,
  formation,
  weapons
) {
  const transfers = formation.supportAmmunitionTransfers ?? [];
  if (!Array.isArray(transfers)) {
    throw new TypeError(
      `formation ${formationId} supportAmmunitionTransfers must be an array`
    );
  }
  const membersById = new Map(
    formation.members.map(member => [member.id, member])
  );
  const transferIds = new Set();
  const donorIds = new Set();
  const recipientIds = new Set();
  const endpointIds = new Set();
  for (const [index, transfer] of transfers.entries()) {
    const context =
      `formation ${formationId} support ammunition transfer ${index}`;
    if (!transfer || typeof transfer !== 'object' || Array.isArray(transfer)) {
      throw new TypeError(`${context} must be a record`);
    }
    if (typeof transfer.id !== 'string' || transfer.id.length === 0) {
      throw new Error(`${context} requires a stable id`);
    }
    if (transferIds.has(transfer.id)) {
      throw new Error(
        `formation ${formationId} contains duplicate support ammunition transfer id: `
        + transfer.id
      );
    }
    transferIds.add(transfer.id);
    const donor = membersById.get(transfer.donorSoldierId);
    const recipient = membersById.get(transfer.recipientSoldierId);
    if (!donor) {
      throw new Error(
        `${context} references unknown donor ${transfer.donorSoldierId ?? 'missing'}`
      );
    }
    if (!recipient) {
      throw new Error(
        `${context} references unknown recipient ${transfer.recipientSoldierId ?? 'missing'}`
      );
    }
    if (donor.id === recipient.id) {
      throw new Error(`${context} donor and recipient must differ`);
    }
    if (donorIds.has(donor.id)) {
      throw new Error(
        `formation ${formationId} assigns multiple support ammunition transfers `
        + `to donor ${donor.id}`
      );
    }
    if (recipientIds.has(recipient.id)) {
      throw new Error(
        `formation ${formationId} assigns multiple support ammunition transfers `
        + `to recipient ${recipient.id}`
      );
    }
    for (const endpoint of [donor, recipient]) {
      if (endpointIds.has(endpoint.id)) {
        throw new Error(
          `formation ${formationId} reuses support ammunition endpoint `
          + endpoint.id
        );
      }
    }
    donorIds.add(donor.id);
    recipientIds.add(recipient.id);
    endpointIds.add(donor.id);
    endpointIds.add(recipient.id);
    assertWeaponReference(weapons, transfer.weaponId, context);
    if (recipient.weaponId !== transfer.weaponId) {
      throw new Error(
        `${context} recipient ${recipient.id} carries ${recipient.weaponId}, `
        + `not ${transfer.weaponId}`
      );
    }
    for (const field of ['carriedRounds', 'handoffRounds']) {
      if (!Number.isSafeInteger(transfer[field]) || transfer[field] <= 0) {
        throw new Error(`${context} ${field} must be a positive integer`);
      }
    }
    if (transfer.handoffRounds > transfer.carriedRounds) {
      throw new Error(`${context} handoffRounds cannot exceed carriedRounds`);
    }
    for (const field of ['rangeMeters', 'delaySeconds']) {
      if (!Number.isFinite(transfer[field]) || transfer[field] <= 0) {
        throw new Error(`${context} ${field} must be positive and finite`);
      }
    }
    if (
      typeof transfer.dataQuality !== 'string'
      || !/(historical|source|inferred|approximation)/i.test(
        transfer.dataQuality
      )
    ) {
      throw new Error(
        `${context} requires a historical, sourced, inferred, or approximation label`
      );
    }
    const weapon = weapons[transfer.weaponId];
    const availableReserve =
      Number(weapon.carriedAmmo) - Number(weapon.magazineSize);
    if (
      !Number.isSafeInteger(availableReserve)
      || transfer.carriedRounds > availableReserve
    ) {
      throw new Error(
        `${context} carriedRounds exceeds ${transfer.weaponId} initial reserve`
      );
    }
  }
}

/**
 * Validate a plain, injected game-family definition without changing it.
 *
 * @param {object} family family content and catalog records
 * @returns {object} the original validated record
 */
export function validateFamilyDefinition(family) {
  if (!family || typeof family !== 'object' || Array.isArray(family)) {
    throw new TypeError('family must be a plain record');
  }
  if (typeof family.id !== 'string' || family.id.length === 0) {
    throw new Error('family id must be a non-empty string');
  }
  if (!family.catalogs || typeof family.catalogs !== 'object') {
    throw new TypeError(`family ${family.id} requires catalogs`);
  }

  assertRecordMap(`family ${family.id} factions`, family.factions);
  assertRecordMap(`family ${family.id} formations`, family.formations);
  assertRecordMap(`family ${family.id} presentation`, family.presentation);
  assertRecordMap(`family ${family.id} weapons`, family.catalogs.weapons);
  assertRecordMap(`family ${family.id} vehicles`, family.catalogs.vehicles);

  const { factions, formations, presentation } = family;
  const { weapons, vehicles } = family.catalogs;
  if (family.assetManifest) {
    validateAssetManifest(family.assetManifest);
    if (family.assetManifest.familyId !== family.id) {
      throw new Error(
        `family ${family.id} cannot own asset manifest for ${family.assetManifest.familyId}`
      );
    }
  }

  for (const [factionId, faction] of Object.entries(factions)) {
    if (!Object.hasOwn(presentation, faction.presentationId)) {
      throw new Error(`faction ${factionId} references unknown presentation: ${faction.presentationId ?? 'missing'}`);
    }
  }
  validateFactionVehicles(factions, vehicles);

  for (const [formationId, formation] of Object.entries(formations)) {
    if (!Object.hasOwn(factions, formation.factionId)) {
      throw new Error(`formation ${formationId} references unknown faction: ${formation.factionId ?? 'missing'}`);
    }
    if (!Array.isArray(formation.members) || formation.members.length === 0) {
      throw new Error(`formation ${formationId} requires at least one member`);
    }
    const memberIds = new Set();
    formation.members.forEach((member, index) => {
      if (typeof member?.id !== 'string' || member.id.length === 0) {
        throw new Error(`formation ${formationId} member ${index} requires a stable id`);
      }
      if (memberIds.has(member.id)) {
        throw new Error(`formation ${formationId} contains duplicate member id: ${member.id}`);
      }
      memberIds.add(member.id);
      if (typeof member?.role !== 'string' || member.role.length === 0) {
        throw new Error(`formation ${formationId} member ${index} requires a role`);
      }
      const hasName = typeof member.name === 'string' && member.name.length > 0;
      const hasNamePrefix = typeof member.namePrefix === 'string' && member.namePrefix.length > 0;
      const hasFormationPrefix = typeof formation.namePrefix === 'string'
        && formation.namePrefix.length > 0;
      if (!hasName && !hasNamePrefix && !hasFormationPrefix) {
        throw new Error(`formation ${formationId} member ${index} requires a name or namePrefix`);
      }
      assertWeaponReference(weapons, member?.weaponId, `formation ${formationId} member ${index}`);
    });
    validateFormationSupportAmmunition(formationId, formation, weapons);
  }

  validateVehicleWeapons(vehicles, weapons);
  return family;
}

/**
 * Create an isolated, injected registry. There is intentionally no global
 * singleton: application composition decides which historical families exist.
 */
export function createFamilyRegistry(families = []) {
  if (!Array.isArray(families)) {
    throw new TypeError('families must be an array');
  }
  const definitions = new Map();

  const registry = {
    register(family) {
      validateFamilyDefinition(family);
      if (definitions.has(family.id)) {
        throw new Error(`duplicate family id: ${family.id}`);
      }
      definitions.set(family.id, family);
      return family;
    },
    has(id) {
      return definitions.has(id);
    },
    get(id) {
      return definitions.get(id) ?? null;
    },
    require(id) {
      const family = definitions.get(id);
      if (!family) throw new Error(`unknown family id: ${id}`);
      return family;
    },
    list() {
      return Object.freeze([...definitions.values()]);
    }
  };

  families.forEach(family => registry.register(family));
  return Object.freeze(registry);
}

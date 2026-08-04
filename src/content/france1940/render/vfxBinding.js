import {
  validateBattlefieldVfxProvider,
  validateBattlefieldVfxRuntime,
  validateCombatVfxResourceSet,
  validateVehicleDamageVfxResourceSet
} from '../../../world/vfx/BattlefieldVfxContract.js';
import { FRANCE_1940_ASSET_IDS } from '../assets/index.js';
import { FRANCE_1940_ASSET_RESOLVER } from './assetPack.js';

function stampResource(resource, assetBinding) {
  resource.userData.assetBinding = assetBinding;
  return resource;
}

function bindCombatResources(provider, assetBinding) {
  const resources = validateCombatVfxResourceSet(provider.createCombatResources());
  for (const geometry of Object.values(resources.effectGeometries)) {
    stampResource(geometry, assetBinding);
  }
  return Object.freeze({
    ...resources,
    assetBinding,
    createEffectMaterial(kind) {
      const material = resources.createEffectMaterial(kind);
      if (!material?.isMaterial) {
        throw new TypeError(`battlefield VFX ${kind} material must be a Three.js material`);
      }
      return stampResource(material, assetBinding);
    },
    createProjectileMesh(weapon) {
      const mesh = resources.createProjectileMesh(weapon);
      if (!mesh?.isMesh || !mesh.geometry?.isBufferGeometry || !mesh.material?.isMaterial) {
        throw new TypeError('battlefield VFX projectile factory must create a Three.js mesh');
      }
      stampResource(mesh.geometry, assetBinding);
      stampResource(mesh.material, assetBinding);
      return stampResource(mesh, assetBinding);
    }
  });
}

function bindVehicleDamageResources(provider, assetBinding) {
  const resources = validateVehicleDamageVfxResourceSet(
    provider.createVehicleDamageResources()
  );
  for (const geometry of Object.values(resources.geometries)) {
    stampResource(geometry, assetBinding);
  }
  for (const material of Object.values(resources.materials)) {
    stampResource(material, assetBinding);
  }
  return Object.freeze({
    ...resources,
    assetBinding,
    createBlastMaterial() {
      const material = resources.createBlastMaterial();
      if (!material?.isMaterial) {
        throw new TypeError('battlefield VFX blast material must be a Three.js material');
      }
      return stampResource(material, assetBinding);
    }
  });
}

export function createFrance1940VfxProvider(
  assetResolver = FRANCE_1940_ASSET_RESOLVER
) {
  if (assetResolver?.familyId !== 'france-1940') {
    throw new Error(
      `France 1940 VFX require france-1940 assets, received `
      + `${assetResolver?.familyId ?? 'missing'}`
    );
  }
  const binding = assetResolver.require(
    FRANCE_1940_ASSET_IDS.battlefieldVfxProvider,
    'battlefield-vfx-provider'
  );
  const provider = validateBattlefieldVfxProvider(binding.provider);
  if (
    binding.record.source.type === 'procedural'
    && provider.id !== binding.record.source.generatorId
  ) {
    throw new Error(
      `Logical asset ${binding.logicalId} expected generator `
      + `${binding.record.source.generatorId}, received ${provider.id ?? 'missing'}`
    );
  }
  const assetBinding = Object.freeze({
    logicalId: binding.logicalId,
    sourcePackId: binding.packId,
    implementationId: provider.id
  });
  return Object.freeze({
    id: provider.id,
    kind: provider.kind,
    assetBinding,
    createCombatResources() {
      return bindCombatResources(provider, assetBinding);
    },
    createVehicleDamageResources() {
      return bindVehicleDamageResources(provider, assetBinding);
    },
    async createRuntime(options) {
      if (typeof provider.createRuntime !== 'function') return null;
      const runtime = validateBattlefieldVfxRuntime(
        await provider.createRuntime(options)
      );
      runtime.assetBinding = assetBinding;
      return runtime;
    }
  });
}

export const FRANCE_1940_VFX_PROVIDER = createFrance1940VfxProvider();

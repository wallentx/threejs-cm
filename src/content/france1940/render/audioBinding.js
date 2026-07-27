import {
  validateBattlefieldAudioProvider,
  validateBattlefieldAudioResourceSet
} from '../../../engine/audio/BattlefieldAudioContract.js';
import { FRANCE_1940_ASSET_IDS } from '../assets/index.js';
import { FRANCE_1940_ASSET_RESOLVER } from './assetPack.js';

export function createFrance1940AudioProvider(
  assetResolver = FRANCE_1940_ASSET_RESOLVER
) {
  if (assetResolver?.familyId !== 'france-1940') {
    throw new Error(
      `France 1940 audio requires france-1940 assets, received `
      + `${assetResolver?.familyId ?? 'missing'}`
    );
  }
  const binding = assetResolver.require(
    FRANCE_1940_ASSET_IDS.battlefieldAudioProvider,
    'battlefield-audio-provider'
  );
  const provider = validateBattlefieldAudioProvider(binding.provider);
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
    createResources() {
      const resources = validateBattlefieldAudioResourceSet(
        provider.createResources()
      );
      return Object.freeze({
        ...resources,
        assetBinding
      });
    }
  });
}

export const FRANCE_1940_AUDIO_PROVIDER = createFrance1940AudioProvider();

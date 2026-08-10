import {
  FRANCE_1940_ASSET_MANIFEST
} from '../assets/index.js';
import {
  FRANCE_1940_ASSET_RESOLVER
} from './assetPack.js';

const FAMILY_ID = 'france-1940';
const REFERENCE_KIND = 'calibration-reference-image';
const VALID_VIEWS = new Set(['side', 'front', 'rear', 'top']);

function requireReferenceRoute(record) {
  const modelId = record.metadata?.modelId;
  const views = record.metadata?.views;
  if (typeof modelId !== 'string' || modelId.length === 0) {
    throw new Error(`calibration reference ${record.id} requires metadata.modelId`);
  }
  if (!Array.isArray(views) || views.length === 0) {
    throw new Error(`calibration reference ${record.id} requires metadata.views`);
  }
  const uniqueViews = new Set();
  for (const view of views) {
    if (!VALID_VIEWS.has(view)) {
      throw new Error(`calibration reference ${record.id} has invalid view ${view}`);
    }
    if (uniqueViews.has(view)) {
      throw new Error(`calibration reference ${record.id} repeats view ${view}`);
    }
    uniqueViews.add(view);
  }
  return Object.freeze({
    modelId,
    views: Object.freeze([...uniqueViews])
  });
}

function bindReference(assetResolver, coreRecord) {
  const binding = assetResolver.require(coreRecord.id, REFERENCE_KIND);
  if (binding.record.source.type !== 'url') {
    throw new Error(`calibration reference ${coreRecord.id} must resolve to a URL asset`);
  }
  const route = requireReferenceRoute(coreRecord);
  return Object.freeze({
    logicalId: coreRecord.id,
    sourcePackId: binding.packId,
    modelId: route.modelId,
    views: route.views,
    imageUrl: binding.record.source.url,
    provenance: binding.record.provenance ?? coreRecord.provenance ?? null
  });
}

export function createFrance1940CalibrationReferenceRegistry(
  assetResolver = FRANCE_1940_ASSET_RESOLVER
) {
  if (
    !assetResolver
    || typeof assetResolver.require !== 'function'
    || assetResolver.familyId !== FAMILY_ID
  ) {
    throw new Error('France 1940 calibration references require a France 1940 asset resolver');
  }

  const references = new Map();
  for (const coreRecord of Object.values(FRANCE_1940_ASSET_MANIFEST.assets)) {
    if (coreRecord.kind !== REFERENCE_KIND) continue;
    const reference = bindReference(assetResolver, coreRecord);
    for (const view of reference.views) {
      const key = `${reference.modelId}:${view}`;
      if (references.has(key)) {
        throw new Error(`duplicate calibration reference route ${key}`);
      }
      references.set(key, reference);
    }
  }

  return Object.freeze({
    familyId: FAMILY_ID,
    assetPackIds: assetResolver.packIds,
    get(modelId, view) {
      return references.get(`${modelId}:${view}`) ?? null;
    }
  });
}

export const FRANCE_1940_CALIBRATION_REFERENCES =
  createFrance1940CalibrationReferenceRegistry();

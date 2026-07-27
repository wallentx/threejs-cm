import { WORLD_SCALE } from './WorldScale.js';

/**
 * Scene dimensions use metres. These values are visual/gameplay contracts,
 * not hidden mesh multipliers.
 */
export const TERRAIN_SCALE = Object.freeze({
  infantryReferenceHeight: WORLD_SCALE.standingInfantryHeight,
  stoneWall: Object.freeze({
    height: 1.2,
    thickness: 0.65,
    maximumSegmentLength: 4
  }),
  house: Object.freeze({
    width: 12,
    depth: 9,
    eavesHeight: 6,
    roofHeight: 3.2
  }),
  bridge: Object.freeze({
    roadwayWidth: 6.5,
    deckThickness: 0.55,
    parapetHeight: 0.75,
    parapetThickness: 0.35,
    masonryRepeatMeters: 0.6
  }),
  matureTree: Object.freeze({
    trunkHeight: 6,
    trunkRadius: 0.42,
    canopyRadius: 3.2,
    totalHeight: 11
  })
});

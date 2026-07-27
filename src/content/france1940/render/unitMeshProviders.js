import { FRANCE_1940_FACTIONS } from '../factions.js';
import { FRANCE_1940_PRESENTATION } from '../presentation.js';
import {
  createFrance1940BunkerMesh,
  createFrance1940InfantrySquadMesh
} from './France1940UnitMeshFactory.js';

function selectionColor(factionId) {
  const presentationId = FRANCE_1940_FACTIONS[factionId]?.presentationId;
  const presentation = FRANCE_1940_PRESENTATION[presentationId];
  if (!presentation) {
    throw new Error(`Missing France 1940 presentation for ${factionId}`);
  }
  return presentation.selectionColor;
}

export const FRENCH_CHASSEUR_INFANTRY_MESH_PROVIDER = Object.freeze({
  id: 'france-1940-procedural-french-chasseur-v1',
  kind: 'infantry-mesh-factory',
  create(roster) {
    return createFrance1940InfantrySquadMesh(
      'french',
      roster,
      selectionColor('french')
    );
  }
});

export const GERMAN_GRENADIER_INFANTRY_MESH_PROVIDER = Object.freeze({
  id: 'france-1940-procedural-german-grenadier-v1',
  kind: 'infantry-mesh-factory',
  create(roster) {
    return createFrance1940InfantrySquadMesh(
      'german',
      roster,
      selectionColor('german')
    );
  }
});

export const GERMAN_MG34_BUNKER_MESH_PROVIDER = Object.freeze({
  id: 'france-1940-procedural-mg34-bunker-v1',
  kind: 'structure-mesh-factory',
  create() {
    return createFrance1940BunkerMesh();
  }
});

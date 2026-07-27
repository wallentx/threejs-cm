import { Unit as CoreUnit } from '../../src/game/Unit.js';
import {
  FRANCE_1940_CATALOG_PORTS
} from '../../src/content/france1940/catalogPorts.js';
import {
  FRANCE_1940_FORMATIONS
} from '../../src/content/france1940/formations.js';
import {
  FRANCE_1940_VISUAL_FACTORIES
} from '../../src/content/france1940/render/index.js';

const DEFAULT_FORMATION_BY_FACTION = Object.freeze({
  french: 'FRENCH_CHASSEURS_PORTES_SQUAD',
  german: 'GERMAN_GRENADIER_SQUAD_1940'
});
let nextTestUnitId = 1;

function createTestRoster(faction, squadSize) {
  const formationId = DEFAULT_FORMATION_BY_FACTION[faction];
  const formation = FRANCE_1940_FORMATIONS[formationId];
  if (!formation) throw new Error(`No France 1940 test formation for faction ${faction}`);
  return Array.from({ length: squadSize }, (_, index) => {
    const member = formation.members[index % formation.members.length];
    const weapon = FRANCE_1940_CATALOG_PORTS.weapons.get(member.weaponId);
    return {
      id: index,
      name: `${member.namePrefix ?? formation.namePrefix} ${index + 1}`,
      role: member.role,
      weaponId: member.weaponId,
      weapon: weapon.name,
      status: 'OK',
      health: 100
    };
  });
}

/**
 * Test-only family fixture. Production construction must inject ports through
 * ScenarioRuntime; generic Unit intentionally owns no France 1940 defaults.
 */
export class Unit extends CoreUnit {
  constructor(config = {}) {
    const faction = config.faction ?? 'french';
    const type = config.type ?? 'infantry_squad';
    const squadSize = config.squadSize ?? config.roster?.length ?? 6;
    const roster = config.roster
      ?? (type === 'infantry_squad' ? createTestRoster(faction, squadSize) : undefined);
    super({
      ...config,
      id: config.id ?? `france-1940-test-unit-${nextTestUnitId++}`,
      faction,
      type,
      ...(roster ? { roster } : {}),
      ...(type === 'bunker' && !config.structureId
        ? { structureId: 'GERMAN_MG34_BUNKER' }
        : {}),
      catalogPorts: config.catalogPorts ?? FRANCE_1940_CATALOG_PORTS,
      visualFactories: config.visualFactories ?? FRANCE_1940_VISUAL_FACTORIES
    });
  }
}

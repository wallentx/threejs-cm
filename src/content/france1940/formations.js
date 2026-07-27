const PROVENANCE = Object.freeze({
  source: 'src/game/Unit.js legacy infantry roster, extracted without changing member order.',
  dataQuality: 'exact current-prototype formation mapping; historical TO&E refinement remains separate'
});

function freezeMembers(members) {
  return Object.freeze(members.map(member => Object.freeze({ ...member })));
}

function freezeFormation({ id, factionId, name, namePrefix, members }) {
  return Object.freeze({
    id,
    factionId,
    name,
    namePrefix,
    members: freezeMembers(members),
    provenance: PROVENANCE,
    dataQuality: PROVENANCE.dataQuality
  });
}

export const FRANCE_1940_FORMATIONS = Object.freeze({
  FRENCH_CHASSEURS_PORTES_SQUAD: freezeFormation({
    id: 'FRENCH_CHASSEURS_PORTES_SQUAD',
    factionId: 'french',
    name: 'Chasseurs Portes Squad',
    namePrefix: 'Chasseur',
    members: [
      { id: 'squad-leader', name: 'Chasseur 1', role: 'Squad Leader', weaponId: 'MAS36' },
      { id: 'rifleman-1', name: 'Chasseur 2', role: 'Rifleman', weaponId: 'MAS36' },
      { id: 'automatic-rifleman', name: 'Chasseur 3', role: 'Automatic Rifleman', weaponId: 'FM2429' },
      { id: 'rifleman-2', name: 'Chasseur 4', role: 'Rifleman', weaponId: 'MAS36' },
      { id: 'assistant-gunner', name: 'Chasseur 5', role: 'Assistant Gunner', weaponId: 'MAS36' },
      { id: 'assistant-leader', name: 'Chasseur 6', role: 'Assistant Leader', weaponId: 'MAS38' }
    ]
  }),
  GERMAN_GRENADIER_SQUAD_1940: freezeFormation({
    id: 'GERMAN_GRENADIER_SQUAD_1940',
    factionId: 'german',
    name: '1940 Grenadier Squad',
    namePrefix: 'Grenadier',
    members: [
      { id: 'squad-leader', name: 'Grenadier 1', role: 'Squad Leader', weaponId: 'KAR98K' },
      { id: 'rifleman-1', name: 'Grenadier 2', role: 'Rifleman', weaponId: 'KAR98K' },
      { id: 'automatic-rifleman', name: 'Grenadier 3', role: 'Automatic Rifleman', weaponId: 'MG34' },
      { id: 'rifleman-2', name: 'Grenadier 4', role: 'Rifleman', weaponId: 'KAR98K' },
      { id: 'assistant-gunner', name: 'Grenadier 5', role: 'Assistant Gunner', weaponId: 'KAR98K' },
      { id: 'assistant-leader', name: 'Grenadier 6', role: 'Assistant Leader', weaponId: 'MP40' }
    ]
  })
});

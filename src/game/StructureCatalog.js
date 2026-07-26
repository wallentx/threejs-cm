// Static fortifications are content records, not vehicle substitutes. Values
// marked approximation are intentionally coarse until a scenario-specific
// fortification data pass replaces them with sourced construction records.
const freezeStructure = (structure) => Object.freeze({
  hitRadius: 3.4,
  height: 2.6,
  health: 420,
  armorMm: 38,
  ...structure
});

export const STRUCTURES = Object.freeze({
  GERMAN_MG34_BUNKER: freezeStructure({
    id: 'GERMAN_MG34_BUNKER',
    name: 'German MG34 bunker',
    weaponId: 'MG34',
    health: 440,
    armorMm: 42,
    hitRadius: 3.5,
    height: 2.6,
    dataQuality: 'gameplay approximation: hit volume, reinforced-concrete resistance, and collapse threshold require scenario-specific source data'
  })
});

export function getStructure(id) {
  return id ? STRUCTURES[id] ?? null : null;
}

// Static fortifications are content records, not vehicle substitutes. Values
// marked approximation are intentionally coarse until a scenario-specific
// fortification data pass replaces them with sourced construction records.
const freezeStructure = (structure) => Object.freeze({
  hitRadius: 3.4,
  height: 2.6,
  health: 420,
  armorMm: 38,
  ...structure,
  dimensionsMeters: Object.freeze({
    width: 6.5,
    depth: 5.5,
    ...(structure.dimensionsMeters ?? {})
  }),
  destroyedFootprintMeters: Object.freeze({
    width: 5.6,
    depth: 4.8,
    ...(structure.destroyedFootprintMeters ?? {})
  })
});

export const FRANCE_1940_STRUCTURES = Object.freeze({
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
  return (
    typeof id === 'string'
    && Object.hasOwn(FRANCE_1940_STRUCTURES, id)
  )
    ? FRANCE_1940_STRUCTURES[id]
    : null;
}

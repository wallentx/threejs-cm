const PROVENANCE = Object.freeze({
  source: 'Current prototype faction colors and procedural infantry identity.',
  dataQuality: 'presentation-only migration record; not yet consumed by runtime systems'
});

export const FRANCE_1940_PRESENTATION = Object.freeze({
  france_1940_french: Object.freeze({
    id: 'france_1940_french',
    flagGlyph: '🇫🇷',
    setupColor: '#3b82f6',
    selectionColor: '#3b82f6',
    infantryPalette: 'french_1940_horizon_blue',
    infantryModelId: 'french_1940_chasseur',
    provenance: PROVENANCE,
    dataQuality: PROVENANCE.dataQuality
  }),
  france_1940_german: Object.freeze({
    id: 'france_1940_german',
    flagGlyph: '🇩🇪',
    setupColor: '#ef4444',
    selectionColor: '#ef4444',
    infantryPalette: 'german_1940_field_grey',
    infantryModelId: 'german_1940_grenadier',
    provenance: PROVENANCE,
    dataQuality: PROVENANCE.dataQuality
  })
});

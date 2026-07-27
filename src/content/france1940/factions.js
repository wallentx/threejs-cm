const provenance = Object.freeze({
  source: 'Current prototype Unit roster and vehicle defaults; formal family extraction.',
  dataQuality: 'migration record; historical identity is established by the injected catalogs'
});

export const FRANCE_1940_FACTIONS = Object.freeze({
  french: Object.freeze({
    id: 'french',
    name: 'French Army',
    presentationId: 'france_1940_french',
    defaultVehicleId: 'SOMUA_S35',
    vehicleIds: Object.freeze([
      'SOMUA_S35',
      'RENAULT_R35',
      'HOTCHKISS_H39',
      'AMC_35',
      'PANHARD_178',
      'LAFFLY_S20TL',
      'CHAR_B1_BIS'
    ]),
    provenance,
    dataQuality: provenance.dataQuality
  }),
  german: Object.freeze({
    id: 'german',
    name: 'German Army',
    presentationId: 'france_1940_german',
    defaultVehicleId: 'PANZER_III_D',
    vehicleIds: Object.freeze([
      'PANZER_III_D',
      'PANZER_II_C',
      'PANZER_35T',
      'PANZER_38T',
      'SDKFZ_231',
      'OPEL_BLITZ',
      'PANZER_IV_D'
    ]),
    provenance,
    dataQuality: provenance.dataQuality
  })
});

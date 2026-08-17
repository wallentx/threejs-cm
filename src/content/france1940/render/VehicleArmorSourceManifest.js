const source = (name, part, options = {}) => Object.freeze({
  id: options.id ?? name,
  name,
  part,
  owner: options.owner ?? 'root',
  exitArmorPolicy: options.exitArmorPolicy
    ?? (part === 'mantlet' || part === 'track' ? 'none' : 'opposite_face'),
  zone: options.zone ?? null,
  fallbackZone: options.fallbackZone ?? null,
  thicknessMm: options.thicknessMm ?? null,
  thicknessSourceZone: options.thicknessSourceZone ?? null,
  thicknessDataQuality: options.thicknessDataQuality ?? null,
  thicknessReferenceUrl: options.thicknessReferenceUrl ?? null,
  partition: options.partition
    ? Object.freeze({ ...options.partition })
    : null
});

const vehicle = (vehicleId, sources) => Object.freeze({
  vehicleId,
  sources: Object.freeze(sources)
});

/**
 * Family-owned selection data for the deterministic armor-shell generator.
 *
 * This is data, not collision logic. It identifies the closed or visibly
 * targetable core meshes that own each vehicle's combat silhouette. Flexible
 * details, weapons, tools, hatch leaves, lamps, and far proxies are excluded.
 */
export const FRANCE_1940_VEHICLE_ARMOR_SOURCES = Object.freeze({
  fr_somua: vehicle('SOMUA_S35', [
    source('S35_ProxyExteriorHull', 'hull'),
    source('S35_ProxySlopingEngineDeck', 'hull'),
    source('S35_ProxyAPXTurret', 'turret', { owner: 'turret' }),
    source('S35_ProxyClosedObservationCupola', 'cupola', { owner: 'turret' }),
    source('S35_ProxyClosedCupolaRoof', 'cupola', { owner: 'turret' }),
    source('S35_ProxySA35Mantlet', 'mantlet', { owner: 'turret' }),
    source('S35_ProxyTracks', 'track', {
      id: 'S35_RightTrack',
      zone: 'track_right',
      thicknessMm: 20,
      thicknessSourceZone: 'track_right',
      thicknessDataQuality:
        'gameplay approximation for variable track-link path thickness',
      thicknessReferenceUrl: 'https://museedesblindes.fr/les_chars/somua-s35/',
      partition: { axis: 'x', sign: 'negative' }
    }),
    source('S35_ProxyTracks', 'track', {
      id: 'S35_LeftTrack',
      zone: 'track_left',
      thicknessMm: 20,
      thicknessSourceZone: 'track_left',
      thicknessDataQuality:
        'gameplay approximation for variable track-link path thickness',
      thicknessReferenceUrl: 'https://museedesblindes.fr/les_chars/somua-s35/',
      partition: { axis: 'x', sign: 'positive' }
    })
  ]),
  fr_renault_r35: vehicle('RENAULT_R35', [
    source('R35_CastHull', 'hull'),
    source('R35_APXR_Turret', 'turret', { owner: 'turret' }),
    source('R35_SA18_MantletShield', 'mantlet', { owner: 'turret' }),
    source('R35_APXR_Cupola', 'cupola', { owner: 'turret' }),
    source('RightTrackLinks', 'track', { zone: 'track_right' }),
    source('LeftTrackLinks', 'track', { zone: 'track_left' })
  ]),
  fr_renault_d2: vehicle('RENAULT_D2', [
    source('D2_PrimaryHull', 'hull'),
    source('D2_SuspensionSkirt_Right', 'hull'),
    source('D2_SuspensionSkirt_Left', 'hull'),
    source('D2_Turret', 'turret', { owner: 'turret' }),
    source('D2_Mantlet', 'mantlet', { owner: 'turret' }),
    source('D2_Cupola', 'cupola', { owner: 'turret' }),
    source('RightTrackLinks', 'track', { zone: 'track_right' }),
    source('LeftTrackLinks', 'track', { zone: 'track_left' })
  ]),
  fr_hotchkiss_h39: vehicle('HOTCHKISS_H39', [
    source('H39_CastHull', 'hull'),
    source('H39_RightOffsetDriverHood', 'hull'),
    source('H39_APXR_Turret', 'turret', { owner: 'turret' }),
    source('H39_SA38_Mantlet', 'mantlet', { owner: 'turret' }),
    source('H39_CommanderCupola', 'cupola', { owner: 'turret' }),
    source('RightTrackLinks', 'track', { zone: 'track_right' }),
    source('LeftTrackLinks', 'track', { zone: 'track_left' })
  ]),
  fr_amc35: vehicle('AMC_35', [
    source('AMC35_PrimaryHull', 'hull'),
    source('AMC35_RivetedSuperstructure', 'hull'),
    source('AMC35_APX2Turret', 'turret', { owner: 'turret' }),
    source('APX2Mantlet', 'mantlet', { owner: 'turret' }),
    source('RightTrackLinks', 'track', { zone: 'track_right' }),
    source('LeftTrackLinks', 'track', { zone: 'track_left' })
  ]),
  fr_panhard178: vehicle('PANHARD_178', [
    source('Panhard178_PrimaryHull', 'hull'),
    source('Panhard178_FightingDeck', 'hull'),
    source('Panhard178_ForwardDriverHood', 'hull'),
    source('Panhard178_APX3_Turret', 'turret', { owner: 'turret' }),
    source('Panhard178_APX3_Mantlet', 'mantlet', { owner: 'turret' }),
    source('Panhard178_Wheel_-1_-1.56', 'track', { zone: 'track_right' }),
    source('Panhard178_Wheel_-1_1.56', 'track', { zone: 'track_right' }),
    source('Panhard178_Wheel_1_-1.56', 'track', { zone: 'track_left' }),
    source('Panhard178_Wheel_1_1.56', 'track', { zone: 'track_left' })
  ]),
  fr_laffly_s20tl: vehicle('LAFFLY_S20TL', [
    source('S20TL_Chassis', 'hull'),
    source('S20TL_LongTaperedBonnet', 'hull'),
    source('S20TL_CabFloor', 'hull'),
    source('S20TL_TroopFloor', 'hull'),
    source('S20TL_Tailgate', 'hull'),
    source('S20TL_TroopBulkhead', 'hull'),
    source('S20TL_RadiatorGrille', 'hull'),
    source('S20TL_CabFrontPanel_-1', 'hull'),
    source('S20TL_CabRearPanel_-1', 'hull'),
    source('S20TL_TroopSide_-1', 'hull'),
    source('S20TL_CabFrontPanel_1', 'hull'),
    source('S20TL_CabRearPanel_1', 'hull'),
    source('S20TL_TroopSide_1', 'hull'),
    source('S20TL_Wheel_0_Right', 'track', { zone: 'track_right' }),
    source('S20TL_Wheel_1_Right', 'track', { zone: 'track_right' }),
    source('S20TL_Wheel_2_Right', 'track', { zone: 'track_right' }),
    source('S20TL_Wheel_0_Left', 'track', { zone: 'track_left' }),
    source('S20TL_Wheel_1_Left', 'track', { zone: 'track_left' }),
    source('S20TL_Wheel_2_Left', 'track', { zone: 'track_left' })
  ]),
  fr_char_b1bis: vehicle('CHAR_B1_BIS', [
    source('CharB1Bis_PrimaryHull', 'hull'),
    source('CharB1Bis_UpperHull', 'hull'),
    source('CharB1Bis_RaisedEngineCover', 'hull'),
    source('CharB1Bis_LeftDriverHood', 'hull'),
    source('CharB1Bis_75mmMantlet', 'mantlet'),
    source('CharB1Bis_APX4Turret', 'turret', { owner: 'turret' }),
    source('CharB1Bis_APX4Cupola', 'cupola', { owner: 'turret' }),
    source('RightTrackLinks', 'track', { zone: 'track_right' }),
    source('LeftTrackLinks', 'track', { zone: 'track_left' })
  ]),
  ger_panzer2: vehicle('PANZER_II_C', [
    source('PanzerIIC_PrimaryHull', 'hull'),
    source('PanzerIIC_SteppedSuperstructure', 'hull'),
    source('PanzerIIC_TurretShell', 'turret', { owner: 'turret' }),
    source('RightTrackLinks', 'track', { zone: 'track_right' }),
    source('LeftTrackLinks', 'track', { zone: 'track_left' })
  ]),
  ger_panzer3: vehicle('PANZER_III_D', [
    source('PanzerIIID_PrimaryHull', 'hull'),
    source('PanzerIIID_SteppedFightingHull', 'hull'),
    source('PzIII_EngineDeck', 'hull'),
    source('PanzerIIID_ThreeManTurret', 'turret', { owner: 'turret' }),
    source('PanzerIIID_TurretBustle', 'turret', { owner: 'turret' }),
    source('PanzerIIID_CommanderCupola', 'cupola', { owner: 'turret' }),
    source('RightTrackLinks', 'track', { zone: 'track_right' }),
    source('LeftTrackLinks', 'track', { zone: 'track_left' })
  ]),
  ger_panzer35t: vehicle('PANZER_35T', [
    source('Panzer35t_PrimaryHull', 'hull'),
    source('Panzer35t_FightingCompartment', 'hull'),
    source('Panzer35t_EngineDeck', 'hull'),
    source('Panzer35t_RivetedTurret', 'turret', { owner: 'turret' }),
    source('RightTrackLinks', 'track', { zone: 'track_right' }),
    source('LeftTrackLinks', 'track', { zone: 'track_left' })
  ]),
  ger_panzer38t: vehicle('PANZER_38T', [
    source('Panzer38t_PrimaryHull', 'hull'),
    source('Panzer38t_RivetedUpperHull', 'hull'),
    source('Panzer38t_ForwardFacetedTurret', 'turret', { owner: 'turret' }),
    source('Panzer38t_LeftOffsetCommanderCupola', 'cupola', { owner: 'turret' }),
    source('RightTrackLinks', 'track', { zone: 'track_right' }),
    source('LeftTrackLinks', 'track', { zone: 'track_left' })
  ]),
  ger_sdkfz231: vehicle('SDKFZ_231', [
    source('SdKfz231_6Rad_PrimaryHull', 'hull'),
    source('SdKfz231_6Rad_HorseshoeTurret', 'turret', { owner: 'turret' }),
    source('SdKfz231_6Rad_BroadMantlet', 'mantlet', { owner: 'turret' }),
    source('SdKfz231_6Rad_Wheel_Front_-1', 'track', { zone: 'track_right' }),
    source('SdKfz231_6Rad_Wheel_Rear1_Outer_-1', 'track', { zone: 'track_right' }),
    source('SdKfz231_6Rad_Wheel_Rear2_Outer_-1', 'track', { zone: 'track_right' }),
    source('SdKfz231_6Rad_Wheel_Front_1', 'track', { zone: 'track_left' }),
    source('SdKfz231_6Rad_Wheel_Rear1_Outer_1', 'track', { zone: 'track_left' }),
    source('SdKfz231_6Rad_Wheel_Rear2_Outer_1', 'track', { zone: 'track_left' })
  ]),
  ger_opel_blitz: vehicle('OPEL_BLITZ', [
    source('OpelBlitz_Cab', 'hull'),
    source('OpelBlitz_Bonnet', 'hull'),
    source('OpelBlitz_RadiatorShell', 'hull'),
    source('OpelBlitz_CargoFloor', 'hull'),
    source('OpelBlitz_BedSide_Right', 'hull'),
    source('OpelBlitz_BedSide_Left', 'hull'),
    source('OpelBlitz_Tailgate', 'hull'),
    source('OpelBlitz_CanvasTilt', 'hull'),
    source('OpelBlitz_FrontWheel_Right', 'track', { zone: 'track_right' }),
    source('OpelBlitz_RearWheel_Right_Outer', 'track', { zone: 'track_right' }),
    source('OpelBlitz_FrontWheel_Left', 'track', { zone: 'track_left' }),
    source('OpelBlitz_RearWheel_Left_Outer', 'track', { zone: 'track_left' })
  ]),
  ger_panzer4: vehicle('PANZER_IV_D', [
    source('PanzerIVD_PrimaryHull', 'hull'),
    source('PanzerIVD_SteppedSuperstructure', 'hull'),
    source('PanzerIVD_FacetedTurret', 'turret', { owner: 'turret' }),
    source('PanzerIVD_RearTurretBustle', 'turret', { owner: 'turret' }),
    source('PanzerIVD_KwK37SphericalMount', 'mantlet', { owner: 'turret' }),
    source('PanzerIVD_CommanderCupola', 'cupola', { owner: 'turret' }),
    source('RightTrackLinks', 'track', { zone: 'track_right' }),
    source('LeftTrackLinks', 'track', { zone: 'track_left' })
  ])
});

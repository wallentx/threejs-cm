const PROVENANCE = Object.freeze({
  source: 'src/game/Unit.js legacy infantry roster, extracted without changing member order.',
  dataQuality: 'exact current-prototype formation mapping; historical TO&E refinement remains separate'
});

function freezeMembers(members) {
  return Object.freeze(members.map(member => Object.freeze({
    ...member,
    equipment: member.equipment
      ? Object.freeze([...member.equipment])
      : undefined
  })));
}

function freezeSupportAmmunitionTransfers(transfers = []) {
  return Object.freeze(
    transfers.map(transfer => Object.freeze({ ...transfer }))
  );
}

function freezeCrewServedWeapon(crewServedWeapon = null) {
  if (!crewServedWeapon) return null;
  return Object.freeze({
    ...crewServedWeapon,
    ammunitionBySoldierId: Object.freeze({
      ...crewServedWeapon.ammunitionBySoldierId
    })
  });
}

function freezeFormation({
  id,
  factionId,
  name,
  namePrefix,
  members,
  supportAmmunitionTransfers,
  crewServedWeapon,
  provenance = PROVENANCE,
  dataQuality = provenance.dataQuality
}) {
  return Object.freeze({
    id,
    factionId,
    name,
    namePrefix,
    members: freezeMembers(members),
    supportAmmunitionTransfers:
      freezeSupportAmmunitionTransfers(supportAmmunitionTransfers),
    crewServedWeapon: freezeCrewServedWeapon(crewServedWeapon),
    provenance,
    dataQuality
  });
}

const SUPPORT_AMMUNITION_DATA_QUALITY =
  'gameplay approximation for same-squad feed allocation, range, and handoff time';
const BRANDT_MLE1935_MANUAL_REFERENCE =
  'https://bibliotheques-numeriques.defense.gouv.fr/mediatheque-en/docu'
  + 'ment/f917220f-7588-4e68-ab19-491e4dd36839?cote=Doc.+Regl.+342&portal=365729';
const FRENCH_60MM_MORTAR_PROVENANCE = Object.freeze({
  source: BRANDT_MLE1935_MANUAL_REFERENCE,
  dataQuality:
    'historical weapon identity; provisional four-person battle roster, carbine distribution, ammunition allocation, setup, pack, cadence, range, charge envelope, and fixed elevation are gameplay approximations pending formation-specific primary TO&E evidence'
});

export const FRANCE_1940_FORMATIONS = Object.freeze({
  FRENCH_CHASSEURS_PORTES_PLATOON_HQ: freezeFormation({
    id: 'FRENCH_CHASSEURS_PORTES_PLATOON_HQ',
    factionId: 'french',
    name: 'Chasseurs Portes Platoon HQ',
    namePrefix: 'HQ',
    members: [
      {
        id: 'platoon-leader',
        name: 'Platoon Leader',
        role: 'Platoon Leader',
        weaponId: 'MAS36',
        equipment: ['BINOCULARS'],
        equipmentDataQuality:
          'gameplay approximation requested for command observation; exact formation issue remains unverified'
      },
      {
        id: 'assistant-leader',
        name: 'Assistant Platoon Leader',
        role: 'Assistant Platoon Leader',
        weaponId: 'MAS38'
      },
      {
        id: 'radio-operator',
        name: 'Radio Operator',
        role: 'Radio Operator',
        weaponId: 'MAS36',
        equipment: ['RADIO'],
        equipmentDataQuality:
          'gameplay-scale command-net endpoint restored from the legacy scenario HQ; exact 1940 platoon allocation remains unverified'
      }
    ],
    dataQuality:
      'gameplay-scale platoon headquarters restored from the legacy scenario command role; exact 1940 strength and equipment require formation-specific primary TO&E evidence'
  }),
  FRENCH_CHASSEURS_PORTES_SQUAD: freezeFormation({
    id: 'FRENCH_CHASSEURS_PORTES_SQUAD',
    factionId: 'french',
    name: 'Chasseurs Portes Squad',
    namePrefix: 'Chasseur',
    members: [
      {
        id: 'squad-leader',
        name: 'Chasseur 1',
        role: 'Squad Leader',
        weaponId: 'MAS36',
        equipment: ['BINOCULARS'],
        equipmentDataQuality:
          'gameplay approximation requested for squad-leader observation; exact formation issue remains unverified'
      },
      { id: 'rifleman-1', name: 'Chasseur 2', role: 'Rifleman', weaponId: 'MAS36' },
      { id: 'automatic-rifleman', name: 'Chasseur 3', role: 'Automatic Rifleman', weaponId: 'FM2429' },
      { id: 'rifleman-2', name: 'Chasseur 4', role: 'Rifleman', weaponId: 'MAS36' },
      { id: 'assistant-gunner', name: 'Chasseur 5', role: 'Assistant Gunner', weaponId: 'MAS36' },
      { id: 'assistant-leader', name: 'Chasseur 6', role: 'Assistant Leader', weaponId: 'MAS38' }
    ],
    supportAmmunitionTransfers: [
      {
        id: 'french-fm2429-assistant-feed',
        donorSoldierId: 'assistant-gunner',
        recipientSoldierId: 'automatic-rifleman',
        weaponId: 'FM2429',
        carriedRounds: 25,
        handoffRounds: 25,
        rangeMeters: 2,
        delaySeconds: 3,
        dataQuality: SUPPORT_AMMUNITION_DATA_QUALITY
      }
    ]
  }),
  FRENCH_BRANDT_MLE1935_60MM_TEAM: freezeFormation({
    id: 'FRENCH_BRANDT_MLE1935_60MM_TEAM',
    factionId: 'french',
    name: 'Brandt Mle 1935 60 mm Mortar Team',
    namePrefix: 'Mortarman',
    members: [
      {
        id: 'mortar-gunner',
        name: 'Mortar Gunner',
        role: 'Mortar Gunner',
        weaponId: 'BERTHIER_M1892_M16',
        crewServedRole: 'gunner'
      },
      {
        id: 'mortar-assistant',
        name: 'Mortar Assistant',
        role: 'Mortar Assistant',
        weaponId: 'BERTHIER_M1892_M16',
        crewServedRole: 'assistant'
      },
      {
        id: 'ammunition-bearer-1',
        name: 'Ammunition Bearer 1',
        role: 'Ammunition Bearer',
        weaponId: 'BERTHIER_M1892_M16',
        crewServedRole: 'ammunition_bearer'
      },
      {
        id: 'ammunition-bearer-2',
        name: 'Ammunition Bearer 2',
        role: 'Ammunition Bearer',
        weaponId: 'BERTHIER_M1892_M16',
        crewServedRole: 'ammunition_bearer'
      }
    ],
    crewServedWeapon: {
      type: 'mortar',
      id: 'brandtmle1935-60mm-team',
      weaponId: 'BRANDT_MLE1935_60MM_HE',
      gunnerSoldierId: 'mortar-gunner',
      assistantSoldierId: 'mortar-assistant',
      ammunitionBySoldierId: {
        'mortar-gunner': 6,
        'mortar-assistant': 6,
        'ammunition-bearer-1': 6,
        'ammunition-bearer-2': 6
      },
      setupSeconds: 5,
      packSeconds: 3,
      reloadSeconds: 4.5,
      minimumRangeMeters: 25,
      maximumRangeMeters: 600,
      elevationDegrees: 65,
      minimumMuzzleVelocity: 15,
      maximumMuzzleVelocity: 90,
      dataQuality: FRENCH_60MM_MORTAR_PROVENANCE.dataQuality,
      referenceUrl: BRANDT_MLE1935_MANUAL_REFERENCE
    },
    provenance: FRENCH_60MM_MORTAR_PROVENANCE
  }),
  GERMAN_GRENADIER_PLATOON_HQ_1940: freezeFormation({
    id: 'GERMAN_GRENADIER_PLATOON_HQ_1940',
    factionId: 'german',
    name: '1940 Grenadier Platoon HQ',
    namePrefix: 'HQ',
    members: [
      {
        id: 'platoon-leader',
        name: 'Zugfuhrer',
        role: 'Platoon Leader',
        weaponId: 'MP40',
        equipment: ['BINOCULARS'],
        equipmentDataQuality:
          'gameplay approximation requested for command observation; exact formation issue remains unverified'
      },
      {
        id: 'platoon-sergeant',
        name: 'Zugtruppfuhrer',
        role: 'Platoon Sergeant',
        weaponId: 'KAR98K'
      },
      {
        id: 'radio-operator',
        name: 'Funker',
        role: 'Radio Operator',
        weaponId: 'KAR98K',
        equipment: ['RADIO'],
        equipmentDataQuality:
          'gameplay-scale command-net endpoint; exact 1940 platoon radio allocation remains unverified'
      }
    ],
    dataQuality:
      'gameplay-scale platoon headquarters; exact 1940 strength and equipment require formation-specific primary TO&E evidence'
  }),
  GERMAN_GRENADIER_SQUAD_1940: freezeFormation({
    id: 'GERMAN_GRENADIER_SQUAD_1940',
    factionId: 'german',
    name: '1940 Grenadier Squad',
    namePrefix: 'Grenadier',
    members: [
      {
        id: 'squad-leader',
        name: 'Grenadier 1',
        role: 'Squad Leader',
        weaponId: 'KAR98K',
        equipment: ['BINOCULARS'],
        equipmentDataQuality:
          'gameplay approximation requested for squad-leader observation; exact formation issue remains unverified'
      },
      { id: 'rifleman-1', name: 'Grenadier 2', role: 'Rifleman', weaponId: 'KAR98K' },
      { id: 'automatic-rifleman', name: 'Grenadier 3', role: 'Automatic Rifleman', weaponId: 'MG34' },
      { id: 'rifleman-2', name: 'Grenadier 4', role: 'Rifleman', weaponId: 'KAR98K' },
      { id: 'assistant-gunner', name: 'Grenadier 5', role: 'Assistant Gunner', weaponId: 'KAR98K' },
      { id: 'assistant-leader', name: 'Grenadier 6', role: 'Assistant Leader', weaponId: 'MP40' }
    ],
    supportAmmunitionTransfers: [
      {
        id: 'german-mg34-assistant-feed',
        donorSoldierId: 'assistant-gunner',
        recipientSoldierId: 'automatic-rifleman',
        weaponId: 'MG34',
        carriedRounds: 50,
        handoffRounds: 50,
        rangeMeters: 2,
        delaySeconds: 3,
        dataQuality: SUPPORT_AMMUNITION_DATA_QUALITY
      }
    ]
  })
});

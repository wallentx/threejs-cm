const DATA_QUALITY =
  'scenario-authored deterministic Stonne maneuver plan; battlefield-aware gameplay approximation, not a historical operations reconstruction';

const setup = (...points) => points;
const point = (position, orders = {}, pauseSeconds = 0) => ({
  position,
  orders,
  pauseSeconds
});

const WEST_SETUP = setup(
  [-70, 116], [-54, 128], [-42, 108], [-28, 124], [-74, 136], [-20, 112]
);
const CENTER_SETUP = setup(
  [-16, 122], [0, 110], [16, 126], [-8, 138], [8, 116], [24, 136]
);
const EAST_SETUP = setup(
  [34, 116], [50, 130], [66, 108], [76, 124], [42, 140], [70, 138]
);
const SOUTHWEST_SETUP = setup(
  [-70, -116], [-54, -128], [-42, -108], [-28, -124], [-74, -136], [-20, -112]
);
const SOUTHCENTER_SETUP = setup(
  [-16, -122], [0, -110], [16, -126], [-8, -138], [8, -116], [24, -136]
);
const SOUTHEAST_SETUP = setup(
  [34, -116], [50, -130], [66, -108], [76, -124], [42, -140], [70, -138]
);

const westRoute = () => [
  point([-66, 82], { armor: 'HUNT', infantry: 'QUICK', transport: 'MOVE' }),
  point([-72, 50], { armor: 'HUNT', infantry: 'HUNT', support: 'HUNT' }),
  point([-60, 22], { armor: 'HUNT', infantry: 'SNEAK', transport: 'MOVE' }),
  point([-38, 4], { armor: 'HUNT', infantry: 'ASSAULT', transport: 'MOVE' }),
  point([-30, -28], { armor: 'HUNT', infantry: 'HUNT', support: 'HUNT' }),
  point([-48, -62], { armor: 'FAST', infantry: 'QUICK', transport: 'FAST' }),
  point([-34, -108], { armor: 'HUNT', infantry: 'ASSAULT', transport: 'MOVE' })
];

const centerRoute = () => [
  point([0, 82], { armor: 'HUNT', infantry: 'QUICK', transport: 'MOVE' }),
  point([0, 48], { armor: 'HUNT', infantry: 'HUNT', support: 'HUNT' }),
  point([0, 24], { armor: 'HUNT', infantry: 'SNEAK', transport: 'MOVE' }),
  point([0, 3], { armor: 'HUNT', infantry: 'ASSAULT', transport: 'MOVE' }),
  point([0, -24], { armor: 'HUNT', infantry: 'ASSAULT', transport: 'MOVE' }),
  point([0, -62], { armor: 'FAST', infantry: 'QUICK', transport: 'FAST' }),
  point([0, -110], { armor: 'HUNT', infantry: 'ASSAULT', transport: 'MOVE' })
];

const eastRoute = () => [
  point([64, 82], { armor: 'FAST', infantry: 'QUICK', transport: 'FAST' }),
  point([76, 50], { armor: 'HUNT', infantry: 'HUNT', support: 'HUNT' }),
  point([66, 20], { armor: 'HUNT', infantry: 'SNEAK', transport: 'MOVE' }),
  point([42, 4], { armor: 'HUNT', infantry: 'ASSAULT', transport: 'MOVE' }),
  point([34, -30], { armor: 'HUNT', infantry: 'HUNT', support: 'HUNT' }),
  point([52, -68], { armor: 'FAST', infantry: 'QUICK', transport: 'FAST' }),
  point([36, -108], { armor: 'HUNT', infantry: 'ASSAULT', transport: 'MOVE' })
];

const counterattackRoute = (route, destination) => [
  ...route().slice().reverse(),
  point(destination, { armor: 'HUNT', infantry: 'ASSAULT', transport: 'MOVE' })
];

const lane = ({ id, preferredRoles, setupSlots, route, startDelaySeconds = 0 }) => ({
  id,
  preferredRoles,
  setupSlots,
  route,
  startDelaySeconds
});

const GERMAN_STRATEGY = {
  id: 'stonne-german-maneuver-strategy-v1',
  appliesTo: {
    playerFactionId: 'french',
    enemyFactionId: 'german'
  },
  enemyPlanSet: {
    id: 'stonne-german-maneuver-plans-v1',
    factionId: 'german',
    dataQuality: DATA_QUALITY,
    plans: [
      {
        id: 'crossroads-center-pressure',
        lanes: [
          lane({ id: 'center-main-effort', preferredRoles: ['armor', 'transport'], setupSlots: CENTER_SETUP, route: centerRoute(), startDelaySeconds: 2 }),
          lane({ id: 'west-infantry-screen', preferredRoles: ['infantry', 'support'], setupSlots: WEST_SETUP, route: westRoute() }),
          lane({ id: 'east-security', preferredRoles: ['infantry'], setupSlots: EAST_SETUP, route: eastRoute(), startDelaySeconds: 5 })
        ]
      },
      {
        id: 'east-road-hook',
        lanes: [
          lane({ id: 'east-mobile-hook', preferredRoles: ['armor', 'transport'], setupSlots: EAST_SETUP, route: eastRoute(), startDelaySeconds: 2 }),
          lane({ id: 'center-fixing-force', preferredRoles: ['infantry', 'support'], setupSlots: CENTER_SETUP, route: centerRoute() }),
          lane({ id: 'west-delayed-screen', preferredRoles: ['infantry'], setupSlots: WEST_SETUP, route: westRoute(), startDelaySeconds: 7 })
        ]
      },
      {
        id: 'west-orchard-envelopment',
        lanes: [
          lane({ id: 'west-main-effort', preferredRoles: ['infantry', 'armor'], setupSlots: WEST_SETUP, route: westRoute() }),
          lane({ id: 'center-armored-base', preferredRoles: ['armor', 'support'], setupSlots: CENTER_SETUP, route: centerRoute(), startDelaySeconds: 6 }),
          lane({ id: 'east-infantry-screen', preferredRoles: ['infantry', 'transport'], setupSlots: EAST_SETUP, route: eastRoute(), startDelaySeconds: 3 })
        ]
      }
    ]
  }
};

const FRENCH_STRATEGY = {
  id: 'stonne-french-counterattack-strategy-v1',
  appliesTo: {
    playerFactionId: 'german',
    enemyFactionId: 'french'
  },
  enemyPlanSet: {
    id: 'stonne-french-counterattack-plans-v1',
    factionId: 'french',
    dataQuality: DATA_QUALITY,
    plans: [
      {
        id: 'center-counterattack',
        lanes: [
          lane({ id: 'center-main-effort', preferredRoles: ['armor', 'transport'], setupSlots: SOUTHCENTER_SETUP, route: counterattackRoute(centerRoute, [0, 110]), startDelaySeconds: 2 }),
          lane({ id: 'west-infantry-support', preferredRoles: ['infantry', 'support'], setupSlots: SOUTHWEST_SETUP, route: counterattackRoute(westRoute, [-34, 108]) }),
          lane({ id: 'east-security', preferredRoles: ['infantry'], setupSlots: SOUTHEAST_SETUP, route: counterattackRoute(eastRoute, [36, 108]), startDelaySeconds: 5 })
        ]
      },
      {
        id: 'west-orchard-counterattack',
        lanes: [
          lane({ id: 'west-main-effort', preferredRoles: ['infantry', 'armor'], setupSlots: SOUTHWEST_SETUP, route: counterattackRoute(westRoute, [-34, 108]) }),
          lane({ id: 'center-fixing-force', preferredRoles: ['support', 'infantry'], setupSlots: SOUTHCENTER_SETUP, route: counterattackRoute(centerRoute, [0, 110]), startDelaySeconds: 4 }),
          lane({ id: 'east-screen', preferredRoles: ['transport', 'infantry'], setupSlots: SOUTHEAST_SETUP, route: counterattackRoute(eastRoute, [36, 108]), startDelaySeconds: 7 })
        ]
      },
      {
        id: 'east-road-counterattack',
        lanes: [
          lane({ id: 'east-mobile-effort', preferredRoles: ['armor', 'transport'], setupSlots: SOUTHEAST_SETUP, route: counterattackRoute(eastRoute, [36, 108]) }),
          lane({ id: 'center-armored-base', preferredRoles: ['armor', 'support'], setupSlots: SOUTHCENTER_SETUP, route: counterattackRoute(centerRoute, [0, 110]), startDelaySeconds: 5 }),
          lane({ id: 'west-infantry-screen', preferredRoles: ['infantry'], setupSlots: SOUTHWEST_SETUP, route: counterattackRoute(westRoute, [-34, 108]), startDelaySeconds: 3 })
        ]
      }
    ]
  }
};

export const STONNE_APPROACH_ENEMY_STRATEGIES = [
  GERMAN_STRATEGY,
  FRENCH_STRATEGY
];

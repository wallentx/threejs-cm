const DATA_QUALITY =
  'scenario-authored gameplay objective and coordinated route plan; not a historical operations reconstruction';

const setup = (...points) => points;
const point = (position, orders = {}, pauseSeconds = 0) => ({
  position,
  orders,
  pauseSeconds
});

const WEST_SETUP = setup(
  [-58, -92], [-46, -82], [-36, -96], [-28, -74], [-66, -70], [-18, -88]
);
const CENTER_SETUP = setup(
  [-9, -92], [9, -84], [0, -98], [-12, -72], [12, -68], [0, -80]
);
const EAST_SETUP = setup(
  [58, -92], [46, -82], [36, -96], [28, -74], [66, -70], [18, -88]
);

const westRoute = () => [
  point([-38, -56], { armor: 'FAST', infantry: 'QUICK', transport: 'FAST' }),
  point([-22, -32], { armor: 'HUNT', infantry: 'HUNT', support: 'HUNT' }),
  point([-7, -10], { armor: 'HUNT', infantry: 'SNEAK', transport: 'MOVE' }),
  point([-4, 6], { armor: 'HUNT', infantry: 'ASSAULT', transport: 'MOVE' }),
  point([-9, 27], { armor: 'HUNT', infantry: 'ASSAULT', transport: 'MOVE' }),
  point([-21, 49], { armor: 'HUNT', infantry: 'HUNT', transport: 'MOVE' }),
  point([-10, 79], { armor: 'FAST', infantry: 'QUICK', transport: 'FAST' }),
  point([0, 112], { armor: 'FAST', infantry: 'QUICK', transport: 'FAST' })
];

const centerRoute = () => [
  point([0, -56], { armor: 'HUNT', infantry: 'QUICK', transport: 'MOVE' }),
  point([0, -24], { armor: 'HUNT', infantry: 'HUNT', transport: 'MOVE' }),
  point([0, -7], { armor: 'HUNT', infantry: 'SNEAK', transport: 'MOVE' }),
  point([0, 8], { armor: 'HUNT', infantry: 'ASSAULT', transport: 'MOVE' }),
  point([0, 31], { armor: 'HUNT', infantry: 'ASSAULT', transport: 'MOVE' }),
  point([0, 61], { armor: 'FAST', infantry: 'QUICK', transport: 'FAST' }),
  point([0, 86], { armor: 'FAST', infantry: 'QUICK', transport: 'FAST' }),
  point([0, 112], { armor: 'FAST', infantry: 'QUICK', transport: 'FAST' })
];

const eastRoute = () => [
  point([38, -56], { armor: 'FAST', infantry: 'QUICK', transport: 'FAST' }),
  point([22, -32], { armor: 'HUNT', infantry: 'HUNT', support: 'HUNT' }),
  point([7, -10], { armor: 'HUNT', infantry: 'SNEAK', transport: 'MOVE' }),
  point([4, 6], { armor: 'HUNT', infantry: 'ASSAULT', transport: 'MOVE' }),
  point([9, 27], { armor: 'HUNT', infantry: 'ASSAULT', transport: 'MOVE' }),
  point([21, 49], { armor: 'HUNT', infantry: 'HUNT', transport: 'MOVE' }),
  point([10, 79], { armor: 'FAST', infantry: 'QUICK', transport: 'FAST' }),
  point([0, 112], { armor: 'FAST', infantry: 'QUICK', transport: 'FAST' })
];

export const BRIDGE_BREAKTHROUGH_MISSION = {
  id: 'bridge-german-breakthrough',
  appliesTo: {
    playerFactionId: 'french',
    enemyFactionId: 'german'
  },
  objective: {
    id: 'bridge-road-exit',
    type: 'BREAKTHROUGH',
    attackerFactionId: 'german',
    defenderFactionId: 'french',
    exitZone: { minX: -9, maxX: 9, minZ: 106, maxZ: 120 },
    timeLimitSeconds: 900,
    dataQuality: DATA_QUALITY
  },
  enemyPlanSet: {
    id: 'bridge-german-attack-plans-v1',
    factionId: 'german',
    dataQuality: DATA_QUALITY,
    plans: [
      {
        id: 'armored-center-with-flank-screen',
        lanes: [
          {
            id: 'center-assault',
            preferredRoles: ['armor', 'transport'],
            setupSlots: CENTER_SETUP,
            startDelaySeconds: 2,
            route: centerRoute()
          },
          {
            id: 'west-screen',
            preferredRoles: ['infantry', 'support'],
            setupSlots: WEST_SETUP,
            startDelaySeconds: 0,
            route: westRoute()
          },
          {
            id: 'east-screen',
            preferredRoles: ['infantry'],
            setupSlots: EAST_SETUP,
            startDelaySeconds: 4,
            route: eastRoute()
          }
        ]
      },
      {
        id: 'west-feint-east-armor',
        lanes: [
          {
            id: 'west-feint',
            preferredRoles: ['infantry', 'transport'],
            setupSlots: WEST_SETUP,
            startDelaySeconds: 0,
            route: westRoute()
          },
          {
            id: 'center-support',
            preferredRoles: ['support', 'infantry'],
            setupSlots: CENTER_SETUP,
            startDelaySeconds: 7,
            route: centerRoute()
          },
          {
            id: 'east-main-effort',
            preferredRoles: ['armor'],
            setupSlots: EAST_SETUP,
            startDelaySeconds: 3,
            route: eastRoute()
          }
        ]
      },
      {
        id: 'split-infantry-infiltration',
        lanes: [
          {
            id: 'west-infiltration',
            preferredRoles: ['infantry'],
            setupSlots: WEST_SETUP,
            startDelaySeconds: 0,
            route: westRoute()
          },
          {
            id: 'delayed-armor-base',
            preferredRoles: ['armor', 'support'],
            setupSlots: CENTER_SETUP,
            startDelaySeconds: 10,
            route: centerRoute()
          },
          {
            id: 'east-infiltration',
            preferredRoles: ['infantry', 'transport'],
            setupSlots: EAST_SETUP,
            startDelaySeconds: 2,
            route: eastRoute()
          }
        ]
      }
    ]
  }
};

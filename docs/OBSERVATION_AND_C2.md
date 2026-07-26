# Observation and C2 contract

The observation slice is deterministic simulation state. Three.js meshes and
HUD markers are projections of that state; their visibility must never decide
whether a target is known or may be fired on.

## Authoritative records

`SpottingSystem` owns one observation per living observer and target:

```text
targetUnitId, acquisition, visibleNow, lastSeenPosition,
lastSeenAt, confidence
```

It also owns the contact available to each friendly unit:

```text
targetUnitId, position, observedAt, updatedAt,
sourceUnitId, sourceSoldierId, channel,
confidence, uncertaintyM
```

`position` is copied when the target is observed. It does not follow the live
target while LOS is blocked. Confidence then decays and uncertainty grows until
the contact expires.

The acquisition constants, voice distance, relay confidence, decay time, and
uncertainty growth are bounded gameplay approximations. They do not assert
historical optical or radio precision. Binoculars shorten acquisition time;
they do not reveal an occluded target or turn a relayed report into direct LOS.

## Relay rules

- A living observer's acquired sighting is shared within that observer's unit.
- Voice shares a current direct sighting with a nearby friendly unit.
- Radio shares it only when sender and receiver have installed, operational
  endpoints, living configured operators, and the same `commandNetId`.
- Vehicle radio damage uses the authoritative `vehicleComponents.radio` state.
- Relays are computed from one immutable direct-contact snapshot. Unit array
  order cannot create same-step relay chains.
- `DIRECT`, `VOICE`, and `RADIO` contacts may cue movement, stop a HUNT order,
  or draw a last-known marker. Only `canPrecisionTarget()` authorizes precision
  fire, and it returns true only for a currently acquired direct observation.

## Composition-root integration

The integration owner should make these small wiring changes in `main.js`:

1. Construct with scenario profiles:
   `new SpottingSystem(scene, terrain, { unitProfiles: scenario.units })`.
2. Advance exactly once per `simulateStep`, after unit movement and before
   combat: `spotting.advance(units, delta)`. HUNT may query the contact retained
   from the prior step before movement.
3. Replace raw LOS and `mesh.visible` target selection with:
   `hasContact()` for awareness/cueing and `canPrecisionTarget()` for firing.
   A relayed contact alone must not pass a live `targetUnit` to weapon fire.
4. Read `getVisibilityProjection(faction, units)` in the presentation layer.
   `visibleUnitIds` controls live enemy meshes; `contacts` supplies frozen
   last-known markers. Relayed/stale contacts must not expose a moving mesh.
5. Add `spotting.captureState()` to the central simulation snapshot and call
   `spotting.restoreState(snapshot.spotting)` during rewind restore.

`updateSpotting(units, faction, delta)` remains as a temporary compatibility
facade. It advances state and returns the same projection, but intentionally
does not mutate meshes.

## Data ownership

- Scenario records own `commandNetId`, portable-radio assignments, and
  soldier equipment for that battle.
- `VehicleCatalog` explicitly owns radio installation, operator roles, and
  role-based binocular assignment for each represented vehicle.
- `VehicleSystems` creates a damageable radio component only when that catalog
  record says a radio is installed.
- `src/simulation/observation/` contains renderer-neutral equipment,
  communication, and contact helpers.

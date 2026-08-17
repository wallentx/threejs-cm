# Battlefield Audio

## Resulting architecture

Authoritative simulation never reads Web Audio state. `CombatSystem` emits
semantic presentation calls carrying stable context (`position`, source ID,
weapon/impact class, and gameplay importance). The injected family audio
provider resolves those calls to data-owned event IDs. Generic
`SoundEngine.emit()` then owns rendering policy:

```text
Combat / building event
        |
        v
family event resolver + layered definition
        |
        v
distance / delay / variation / occlusion / environment
        |
        v
category and global voice budgets + distant aggregation
        |
        v
layer sources -> filters -> HRTF panner -> dry mixer bus
                                      `-> convolver -> environment bus
```

`GameApp` updates the Web Audio listener from the active Three.js camera. It
injects `SpottingSystem.checkLOS()` as the acoustic obstruction query, so audio
reuses the building and terrain broadphase rather than maintaining a separate
raycaster. It also injects a renderer-neutral map environment resolver built
from map surface polygons, structure placements, and building bounds.

UI sound is non-positional and remains on the UI bus. Audio is presentation
only: it is intentionally absent from deterministic capture/restore and cannot
change combat, spotting, telemetry, or replay outcomes.

## Important configuration

The reusable defaults are in `engine/audio/BattlefieldAcoustics.js`:

- `DEFAULT_SPEED_OF_SOUND_MPS`: `343`.
- `DEFAULT_MAX_ACTIVE_VOICES`: `64`.
- category distance models: reference/max distance, rolloff, near/far cutoff,
  priority, reverb send, and optional distant-aggregation distance.
- buses: Weapons, Explosions, Vehicles, Impacts, Infantry, Environment, and UI.
- environments: open field, forest, village, urban street, small room, large
  building, and church.

Per-event values in the family provider override category defaults. A layer can
independently set gain, duration, delay, maximum distance, synthesis/sample
pool, and filtering. Event variation supports bounded gain, playback-rate, and
filter-scale ranges. `SoundEngine` also accepts constructor overrides for bus
gains, category voice caps, global voice cap, propagation speed, occlusion
interval, and maximum occlusion checks per update.

Procedural noise layers support white, pink, and brown spectra; low-pass,
high-pass, and band-pass shapes with resonance; click-free attack envelopes;
and bounded waveshaper drive. The France 1940 v2 profiles use those controls to
separate ballistic/shock cracks, muzzle reports, pressure bodies, mechanisms,
metal strikes, ricochet rings, and debris tails. All layers in one event still
share one positional HRTF voice.

## Adding a weapon sound

1. Add a stable event ID and event record to the family audio provider.
2. Add or extend `resolveWeaponEvent(weapon)` using canonical weapon fields such
   as `kind` and `caliberMm`; do not inspect mesh names.
3. Define one or more layers. Use `noise`/`oscillator` for procedural layers or
   `buffer` with a decoded `buffers` sample pool. Keep close mechanical detail
   on a short `maxDistance` and the low-frequency report on the longest layer.
4. Set subtle event variation and an appropriate category/priority/distance
   envelope.
5. Add provider-resolution and SoundEngine behavior coverage. Combat already
   supplies the true modeled muzzle position.

Example shape:

```js
{
  category: 'cannon',
  priority: 100,
  variation: { playbackRate: [0.985, 1.015], gain: [0.96, 1.04] },
  layers: [
    { type: 'buffer', buffers: cannonCracks, gain: 1, durationSeconds: 0.4,
      maxDistance: 1600 },
    { type: 'buffer', buffers: cannonTails, gain: 0.75, durationSeconds: 2.5,
      maxDistance: 6000 },
    { type: 'buffer', buffers: breechSamples, gain: 0.16,
      durationSeconds: 0.15, delaySeconds: 0.04, maxDistance: 250 }
  ]
}
```

The decoded-audio service exists, but live family sample-pack binding is still
pending. Current France 1940 records use deterministic procedural seed pools
with colored spectra, transient shaping, and subtle event-level variation.

## Adding an acoustic environment

Add a profile to `ACOUSTIC_ENVIRONMENT_PROFILES` with a stable ID, wet mix,
impulse duration, decay, and high-frequency damping. Then teach the generic map
resolver to select it from a data property, or pass `environment` in a semantic
event when a producer has more authoritative context. Do not import a concrete
map into the audio engine.

Impulse responses are currently deterministic synthetic approximations. Each
profile is generated once, cached, shared by all voices in that environment,
and released at shutdown. Recorded impulse responses can replace the generated
buffers without changing event or voice policy.

## Voice priority and distant aggregation

Priority combines base event priority, estimated perceived gain, gameplay
importance, occlusion, and a retention advantage for existing voices. Category
caps prevent one class from monopolizing the graph; the global cap limits total
HRTF voices. A higher-priority new event can fade-stop the weakest voice. A
weaker event is virtualized before allocating AudioNodes and is retained only
as bounded diagnostics.

Distant small-arms events are keyed by event type and a configurable world
cell. Repeated reports in the short aggregation window reinforce the existing
emitter instead of creating another HRTF graph. This is an intentionally cheap
first-order battlefield-bed approximation, not authoritative combat state.

## Occlusion

At emission, the source-to-listener segment is tested through the existing
spotting LOS port with zero added eye/aim height. A blocked ray reduces gain and
applies a second low-pass filter; terrain, vegetation, and solid building cover
use different approximations. Active voices are rechecked at a throttled
interval with a capped number of queries per update. Gain and cutoff changes
use AudioParam smoothing to avoid clicks or hard obstruction toggles.

## Debugging and performance

The existing debug profiler shows active/global voices, virtualized and
aggregated counts, and the current environment. `SoundEngine.getDiagnostics()`
also exposes each active event's category, position, priority, distance,
propagation delay, occlusion, environment, and cutoff. `body.dataset.audioStats`
provides a compact browser-smoke value. Debug state creates no Three.js objects.

The implementation shares one HRTF panner per audible event, not per layer;
caches noise/sample/impulse buffers; shares mixer and reverb nodes; culls by
layer/event distance before graph creation; bounds diagnostics; throttles LOS;
and disconnects owned nodes on completion, eviction, or disposal. Native Web
Audio nodes cover the current DSP, so no AudioWorklet is justified yet.

## Remaining approximations

- France 1940 playback uses the richer v2 layered synthesis rather than
  recorded close, report, mechanism, and tail sample banks.
- Environment detection is descriptor/polygon based, not portal-aware room
  acoustics, diffraction, or reflection tracing.
- Propagation delay samples listener distance when the event is emitted; it
  does not continuously solve a moving-listener wavefront.
- Distant aggregation reinforces a positional event rather than synthesizing a
  persistent multi-weapon battle bed.
- Continuous engines, environmental loops, and infantry voice lifecycles need
  explicit start/update/stop semantic emitters and should reuse the same voice
  policy.
- Optional Three.js rays/radii are not implemented; diagnostics stay data-only
  to remain free when disabled.

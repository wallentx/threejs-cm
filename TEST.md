# Deferred Test Work

- [ ] Cover atomic direct vehicle target orders through the public command and
  clear ports: retarget must immediately clear old main/auxiliary target IDs,
  fire-control keys, and engagement evidence; the resolved model-local aim
  point must remain finite; a precision-contact dropout must retain the ordered
  spatial aim without selecting a stale automatic target; Clear Target must
  clear every owner before ordinary automatic acquisition may run again.

- [ ] Cover automatic tank threat replacement after target destruction,
  burning, main-gun/breech/gunner loss, and ammunition exhaustion, including
  explicit-order release and deterministic stable candidate ordering. Preserve
  an immobilized target while its cannon remains operational, preserve a Char
  B1 bis as a threat while either its turret 47 mm or hull 75 mm can fight, and
  prove capture/restore plus frame-partition equivalence.

- [ ] Cover vehicle alignment status projection: ordinary turret main guns and
  turret mounts report `TRAVERSING`, the Char B1 bis 75 mm whole-hull laying
  path reports `SLEWING`, and a fixed non-laying mount reports `OUT OF ARC`.
  Assert that only the modeled hull-cannon path changes authoritative hull yaw.
  Interrupt turret traverse with gun/traverse damage, gunner loss, crew
  transfer, crew unavailability, and movement; require the exact blocker phase,
  no unmodeled turret motion, and deterministic traversal resumption when a
  recoverable crew transfer completes.

- [ ] Cover sustained vehicle-engagement learning with stable target IDs:
  harmless stops, ricochets, and penetrations must advance authored armor aim
  points at the bounded thresholds; partial crew/component damage must continue
  escalation while the target remains visibly combat-effective, while burning,
  destruction, or secondary explosion must reset it; Auto may request only an
  available useful alternate round; explicit AP/HE and player surface aim must
  remain unchanged; automatic retargeting must require current precision
  visibility, a material score advantage, and preserve stable
  penetration/aspect/threat/range tie order. Prove exact capture/restore of both
  active evidence and retarget history, WEGO replay, and frame-partition
  equivalence across every threshold.

- [ ] Add a browser visual regression for the material-specific weathered
  plaster, vertical timber, irregular cobblestone, and stitched burlap
  generators at representative camera distances and LODs.
- [ ] Add a Bridge-map layout regression asserting that the western
  cobblestone run starts at the marked x = -32 m cutoff and ends at its
  bridge abutment, the eastern run meets its abutment, and no bridgehead
  sandbags remain.
- [ ] Add a Bridge-map layout regression for the east-side residences and
  garden, both French-bank foliage groups, and the German-bank dirt road with
  tree/hedgerow clearances from the road surface, structures, and river cut;
  assert both German compound road-facing boundaries remain at `z = -23 m`
  with their structures and associated enclosure features entirely behind it;
  assert the east timber shed footprint clears the mill wall and orchard hedge
  and retains the reversed `-PI / 2` facing.
- [ ] Add a browser visual regression proving the OOB skirt, map-boundary
  ribbon, and smoothly fading continuation river remain behind tank smoke and
  flame where VFX crosses the map edge, with the water above OOB land.
- [ ] Extend building visual coverage to assert closed high/medium/core/proxy
  LODs use outward-only wall faces and roofs without undersides while floor
  slabs and stairs are hidden; selected occupancy or exposed breach/collapse
  damage must restore full wall/roof geometry, and clearing selection on an
  intact building must restore the exterior-only geometry without changing
  authoritative building state.
  Also cover exterior-flush window casing on all four facade normals, recessed
  opaque panes, absence of implicit shutter wings, and downward-wound eave
  soffit rings without restoring the hidden full roof underside. Assert that
  perimeter wall endpoints reach the shared exterior envelope on all four
  corners while aperture and internal segment endpoints are not extended.
  Verify closed door leaves meet the exterior casing without a depth crack and
  cheap-LOD window cards overlap the aperture on every facade normal without
  exposing the interior void at oblique angles. Assert plinth facade strips
  share mitered corner edges and contain only outward vertical and top faces,
  with no inner, bottom, or hidden end triangles at any LOD.
- [ ] Extend infantry separation and individual-fire coverage to prove axis-
  rejected distant pairs produce byte-equivalent correction/telemetry output,
  near diagonal pairs still resolve, exact-range targets still perform LOS,
  and only strictly horizontally out-of-range targets skip LOS.
- [ ] Cover the presentation-only simulation phase profiler's enable/reset,
  bounded rolling averages, phase accounting, and steps-per-frame projection;
  prove its samples never enter simulation capture/restore state.
- [ ] Add deferred performance-slice regressions: byte-equivalent static
  collision results with spatially indexed static records plus transient and
  traversable colliders; derived sorted/blocking/expanded navigation caches
  and cached static corner-visibility graphs must preserve stable route output,
  exact live start/goal edges, and Dijkstra tie order while invalidating on
  set/upsert/remove; exact
  compiled elevation, floodplain, river-bank, and terrain-pad height parity
  inside/outside rotated blend envelopes; stable-order nearby-cover query parity; terrain sight
  snapshot validation only on identity/revision change; building projectile
  collider cache invalidation after breach, opening, collapse, add/remove, and
  restore; retained individual-target fallback when that target dies, leaves
  LOS, or loses precision eligibility; and camera-target shadow-focus bounds
  for high/ultra with low-tier shadows disabled.
- [ ] Cover fixed-step infantry presentation batching: authoritative agent,
  fire-control, projectile, movement, and rollback results must remain
  frame-partition equivalent; a current modeled muzzle must be projected before
  every infantry or mortar shot; the final render must reflect the final fixed
  step; and squad-level precision prefiltering must retain stable target order,
  ordered/retained target behavior, individual LOS, and casualty handling.
- [ ] Cover the sustained-contact optimization slice: conservative unit and
  building-run projectile bounds must preserve exact nearest-impact and stable
  tie order, fail open for malformed bounds, and invalidate after building
  collision revision; stable precision-ray LOS caching must invalidate when
  either lifted endpoint or the building/terrain occluder revision changes;
  explicit obstacle `minY` must remain equivalent to the prior eager fallback;
  and casualty reactions must remain capture/restore and frame-partition
  equivalent when processed, self, unrelated, unavailable, out-of-range, and
  newly visible events bypass or perform LOS.
- [ ] Cover the bounded observation/fire-discipline slice: stable input order,
  frame partitions, capture/restore, and replay must preserve primary-observer
  10 Hz service, rotating-secondary coverage, acquisition work, contact source,
  identification, and C2 episodes; ranked observation candidates must choose
  the same acquisition result and stable tie while trying the next candidate
  after occlusion; per-soldier 5 Hz scan cooldown must persist through rollback
  while retained targets and pre-shot LOS remain immediate; actual shooters and
  mortar equipment must still emit from current modeled muzzles. Assert rifles,
  SMGs, and ordinary machine guns reject buttoned armored vehicles, accept an
  exposed commander plus open/unarmored vehicles, and allow a future anti-armor
  weapon only when cataloged 100 m penetration reaches the weakest listed
  positive armor aspect.
- [ ] Update renderer-profile coverage for every quality tier starting with
  dynamic shadows disabled while high/ultra retain 1024/2048 capabilities;
  cover the debug SHADOWS toggle, low-tier rejection, active versus capability
  diagnostics, and mesh-policy application.
- [ ] Cover static-transform optimization: the identity scene root must not
  force unchanged descendants dirty; terrain/building matrices remain frozen
  between events; door, damage, collapse, LOD, removal, and async foliage
  replacement must explicitly refresh the affected matrices without changing
  authoritative state or collision identity.
- [ ] Cover cheap-building `BatchedMesh` presentation across medium/core/proxy:
  per-part opening and breach visibility, exterior/interior geometry switching,
  damage/collapse transforms, LOD selection, raycasting, shadow policy, and GPU
  disposal must preserve descriptor IDs and authoritative collision behavior.

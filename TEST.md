# Deferred Test Work

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
  traversable colliders; exact terrain-pad height parity inside/outside rotated
  blend envelopes; stable-order nearby-cover query parity; terrain sight
  snapshot validation only on identity/revision change; building projectile
  collider cache invalidation after breach, opening, collapse, add/remove, and
  restore; retained individual-target fallback when that target dies, leaves
  LOS, or loses precision eligibility; and camera-target shadow-focus bounds
  for high/ultra with low-tier shadows disabled.

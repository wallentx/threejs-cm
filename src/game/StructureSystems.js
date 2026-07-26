const EVENT_LIMIT = 18;

export function createStructureState(spec, saved = null) {
  if (!spec && !saved) return null;
  const maxHealth = saved?.maxHealth ?? spec?.health ?? 1;
  const health = Math.max(0, Math.min(maxHealth, saved?.health ?? maxHealth));
  return {
    maxHealth,
    health,
    armorMm: saved?.armorMm ?? spec?.armorMm ?? 0,
    destroyed: Boolean(saved?.destroyed) || health <= 0,
    firingDisabled: Boolean(saved?.firingDisabled) || health <= 0,
    eventVersion: saved?.eventVersion ?? 0,
    events: (saved?.events ?? []).map(event => ({ ...event }))
  };
}

export function structureDamageReport(unit) {
  const state = unit.structureState;
  if (!state) return null;
  return {
    health: Math.round((state.health / Math.max(1, state.maxHealth)) * 100),
    destroyed: state.destroyed,
    firingDisabled: state.firingDisabled,
    events: state.events.map(event => ({ ...event }))
  };
}

export function applyStructureDamage(state, amount, event) {
  if (!state || state.destroyed || amount <= 0) {
    return { applied: 0, destroyed: Boolean(state?.destroyed) };
  }
  const applied = Math.min(state.health, amount);
  state.health = Math.max(0, state.health - amount);
  if (state.health <= 0) {
    state.destroyed = true;
    state.firingDisabled = true;
  }
  state.eventVersion++;
  state.events.push({
    type: state.destroyed ? 'structure_destroyed' : 'structure_hit',
    amount: Math.round(applied * 10) / 10,
    ...event,
    version: state.eventVersion
  });
  if (state.events.length > EVENT_LIMIT) state.events.shift();
  return { applied, destroyed: state.destroyed };
}

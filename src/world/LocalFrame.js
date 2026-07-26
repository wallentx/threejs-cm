/**
 * Authored model frame shared by infantry and vehicles.
 *
 * +Y is up and +Z is forward. In that frame an occupant's or vehicle's
 * anatomical right is -X; +X is left. Keep lateral features expressed through
 * this helper so a camera-facing view cannot silently reverse their meaning.
 */
export const LOCAL_RIGHT_X = -1;
export const LOCAL_LEFT_X = 1;

export function lateralX(side, distance) {
  const magnitude = Math.abs(distance);
  if (side === 'right') return LOCAL_RIGHT_X * magnitude;
  if (side === 'left') return LOCAL_LEFT_X * magnitude;
  return 0;
}

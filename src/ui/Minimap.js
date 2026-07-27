export class Minimap {
  constructor(canvas, runtimePort) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.runtime = runtimePort;
    this.zoom = 1.0;
  }

  render(units, cameraManager) {
    if (!this.ctx || !this.canvas) return;

    const w = this.canvas.width;
    const h = this.canvas.height;

    this.ctx.fillStyle = '#1c2419';
    this.ctx.fillRect(0, 0, w, h);

    const { width, depth } = this.runtime.mapDimensions;
    const mapX = x => ((x + width * 0.5) / width) * w;
    const mapZ = z => ((z + depth * 0.5) / depth) * h;
    const bocageObstacles = this.runtime.getBocageObstacles();
    if (bocageObstacles.length > 0) {
      this.ctx.strokeStyle = '#0f1f0b';
      this.ctx.lineWidth = 2;
      bocageObstacles.forEach(obs => {
        const x1 = mapX(obs.minX);
        const z1 = mapZ(obs.minZ);
        const x2 = mapX(obs.maxX);
        const z2 = mapZ(obs.maxZ);

        this.ctx.strokeRect(x1, z1, Math.max(2, x2 - x1), Math.max(2, z2 - z1));
      });
    }

    const projection = this.runtime.getVisibilityProjection(units);
    const visibleUnitIds = projection
      ? new Set(projection.visibleUnitIds)
      : null;

    units.forEach(u => {
      if (visibleUnitIds ? !visibleUnitIds.has(u.id) : (u.mesh && !u.mesh.visible)) return;

      const mx = mapX(u.position.x);
      const mz = mapZ(u.position.z);

      this.ctx.fillStyle = this.runtime.getFactionPresentation(u.faction)?.selectionColor
        ?? '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(
        mx,
        mz,
        this.runtime.selectedUnit?.id === u.id ? 5 : 3,
        0,
        Math.PI * 2
      );
      this.ctx.fill();
    });

    // Reported contacts remain frozen at their last observed position. Their
    // expanding ring communicates uncertainty without exposing the live mesh.
    for (const contact of projection?.contacts ?? []) {
      if (!contact.position || visibleUnitIds?.has(contact.targetUnitId)) continue;
      const mx = mapX(contact.position[0]);
      const mz = mapZ(contact.position[2]);
      const radiusX = Math.max(3, Math.min(18, contact.uncertaintyM / width * w));
      const radiusZ = Math.max(3, Math.min(18, contact.uncertaintyM / depth * h));
      const alpha = Math.max(0.22, Math.min(0.9, contact.confidence));

      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.fillStyle = '#f59e0b';
      this.ctx.lineWidth = 1.25;
      this.ctx.setLineDash(contact.channel === 'RADIO' ? [3, 2] : [1, 2]);
      this.ctx.beginPath();
      this.ctx.ellipse(mx, mz, radiusX, radiusZ, 0, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.fillRect(mx - 1.5, mz - 1.5, 3, 3);
      this.ctx.restore();
    }

    // Safely retrieve camera target from OrbitControls
    const targetPos = (cameraManager && cameraManager.controls && cameraManager.controls.target)
      ? cameraManager.controls.target
      : (cameraManager ? cameraManager.target : null);

    if (targetPos) {
      const camX = mapX(targetPos.x);
      const camZ = mapZ(targetPos.z);

      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(camX - 6, camZ - 4, 12, 8);
    }
  }
}

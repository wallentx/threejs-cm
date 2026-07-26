export class Minimap {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.game = game;
    this.zoom = 1.0;
  }

  render(units, cameraManager) {
    if (!this.ctx || !this.canvas) return;

    const w = this.canvas.width;
    const h = this.canvas.height;

    this.ctx.fillStyle = '#1c2419';
    this.ctx.fillRect(0, 0, w, h);

    if (this.game.terrain && this.game.terrain.bocageObstacles) {
      this.ctx.strokeStyle = '#0f1f0b';
      this.ctx.lineWidth = 2;
      this.game.terrain.bocageObstacles.forEach(obs => {
        const x1 = ((obs.minX + 120) / 240) * w;
        const z1 = ((obs.minZ + 120) / 240) * h;
        const x2 = ((obs.maxX + 120) / 240) * w;
        const z2 = ((obs.maxZ + 120) / 240) * h;

        this.ctx.strokeRect(x1, z1, Math.max(2, x2 - x1), Math.max(2, z2 - z1));
      });
    }

    const projection = this.game.visibilityProjection
      ?? this.game.spotting?.getVisibilityProjection?.('french', units)
      ?? null;
    const visibleUnitIds = projection
      ? new Set(projection.visibleUnitIds)
      : null;

    units.forEach(u => {
      if (visibleUnitIds ? !visibleUnitIds.has(u.id) : (u.mesh && !u.mesh.visible)) return;

      const mx = ((u.position.x + 120) / 240) * w;
      const mz = ((u.position.z + 120) / 240) * h;

      this.ctx.fillStyle = u.faction === 'french' ? '#3b82f6' : '#ef4444';
      this.ctx.beginPath();
      this.ctx.arc(mx, mz, (this.game.selectedUnit && this.game.selectedUnit.id === u.id) ? 5 : 3, 0, Math.PI * 2);
      this.ctx.fill();
    });

    // Reported contacts remain frozen at their last observed position. Their
    // expanding ring communicates uncertainty without exposing the live mesh.
    for (const contact of projection?.contacts ?? []) {
      if (!contact.position || visibleUnitIds?.has(contact.targetUnitId)) continue;
      const mx = ((contact.position[0] + 120) / 240) * w;
      const mz = ((contact.position[2] + 120) / 240) * h;
      const radiusX = Math.max(3, Math.min(18, contact.uncertaintyM / 240 * w));
      const radiusZ = Math.max(3, Math.min(18, contact.uncertaintyM / 240 * h));
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
      const camX = ((targetPos.x + 120) / 240) * w;
      const camZ = ((targetPos.z + 120) / 240) * h;

      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(camX - 6, camZ - 4, 12, 8);
    }
  }
}

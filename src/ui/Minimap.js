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

    units.forEach(u => {
      if (u.mesh && !u.mesh.visible) return;

      const mx = ((u.position.x + 120) / 240) * w;
      const mz = ((u.position.z + 120) / 240) * h;

      this.ctx.fillStyle = u.faction === 'french' ? '#3b82f6' : '#ef4444';
      this.ctx.beginPath();
      this.ctx.arc(mx, mz, (this.game.selectedUnit && this.game.selectedUnit.id === u.id) ? 5 : 3, 0, Math.PI * 2);
      this.ctx.fill();
    });

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

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Renderer } from '../engine/Renderer.js';
import { DebugOverlaySystem } from '../world/debug/DebugOverlaySystem.js';
import { ShotTrajectoryOverlay } from '../world/debug/ShotTrajectoryOverlay.js';
import {
  DEBUG_VEHICLE_SEPARATION_METERS,
  VehicleDebugSandboxSimulation,
  createVehicleDebugVehicles,
  listDebugGunOptions,
  listDebugVehicleOptions
} from './VehicleDebugSandboxSimulation.js';
import {
  createFrance1940VisualFactories,
  FRANCE_1940_ASSET_RESOLVER
} from '../content/france1940/render/index.js';

export {
  DEBUG_VEHICLE_SEPARATION_METERS,
  VehicleDebugSandboxSimulation,
  createVehicleDebugVehicles,
  listDebugGunOptions,
  listDebugVehicleOptions
} from './VehicleDebugSandboxSimulation.js';

export const VEHICLE_SANDBOX_VR_PALETTE = Object.freeze({
  backdrop: 0x021815,
  ground: 0x063b32,
  gridMajor: 0x66ffb2,
  gridMinor: 0x15966f
});

export const VEHICLE_SANDBOX_TAP_GESTURE = Object.freeze({
  maxMovePx: 6,
  maxDoubleTapIntervalMs: 350,
  maxDoubleTapDistancePx: 32
});

const CONTROL_STYLE = 'width:100%;box-sizing:border-box;padding:7px;background:#0f172a;color:#f8fafc;border:1px solid #475569;border-radius:4px;';

function optionMarkup(options, selectedId = null) {
  return options.map(option =>
    `<option value="${option.id}"${option.id === selectedId ? ' selected' : ''}>${option.name}</option>`
  ).join('');
}

function componentReport(unit) {
  return Object.values(unit?.vehicleComponents ?? {})
    .filter(component => component.installed)
    .map(component => {
      const color = component.status === 'OK'
        ? '#4ade80'
        : component.status === 'DAMAGED' ? '#facc15' : '#f87171';
      return `<div class="debug-row"><span>${component.label}</span><span style="color:${color}">${component.status} ${Math.round(component.health)}%</span></div>`;
    }).join('');
}

function crewReport(unit) {
  return (unit?.roster ?? []).map(crewman => {
    const color = crewman.status === 'OK'
      ? '#4ade80'
      : crewman.status === 'WOUNDED' ? '#facc15' : '#f87171';
    return `<div class="debug-row"><span>${crewman.role}</span><span style="color:${color}">${crewman.status} ${Math.round(crewman.health)}%</span></div>`;
  }).join('');
}

function metric(value, suffix, digits = 0) {
  return Number.isFinite(value) ? `${value.toFixed(digits)} ${suffix}` : 'n/a';
}

export function isVehicleSandboxDoubleTap(previousTap, currentTap) {
  if (!previousTap || !currentTap) return false;
  const interval = currentTap.timeStamp - previousTap.timeStamp;
  return interval >= 0
    && interval <= VEHICLE_SANDBOX_TAP_GESTURE.maxDoubleTapIntervalMs
    && previousTap.pointerType === currentTap.pointerType
    && Math.hypot(
      currentTap.clientX - previousTap.clientX,
      currentTap.clientY - previousTap.clientY
    ) <= VEHICLE_SANDBOX_TAP_GESTURE.maxDoubleTapDistancePx;
}

function isEffectivelyVisible(object) {
  for (let current = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.every(material => !material || material.visible !== false);
}

export class VehicleDebugSandboxApp {
  constructor() {
    document.body.dataset.gameStatus = 'loading';
    delete document.body.dataset.gameError;
    this.disposed = false;
    this.mode = 'duel';
    this.lastImpactId = null;
    this.lastStatusUpdate = 0;
    this.pointerStart = null;
    this.pendingTap = null;
    this.animate = this.animate.bind(this);
    this.resizeViewport = this.resizeViewport.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerCancel = this.onPointerCancel.bind(this);
    this.buildShell();
    this.ready = this.init().catch(error => {
      this.handleInitializationError(error);
      return null;
    });
  }

  buildShell() {
    this.container = document.createElement('div');
    this.container.id = 'debug-sandbox-root';
    this.container.innerHTML = `
      <style>
        #debug-sandbox-root{position:fixed;inset:0;z-index:9999;display:grid;grid-template-columns:minmax(0,1fr) 360px;background:#e5e7eb;color:#e2e8f0;font:13px system-ui,sans-serif;user-select:none}
        #debug-sandbox-viewport{position:relative;min-width:0;min-height:0;overflow:hidden;background:#021815}
        #debug-sandbox-viewport canvas{display:block;width:100%!important;height:100%!important;touch-action:none}
        #debug-sandbox-panel{min-width:0;overflow-y:auto;background:#14181e;border-left:1px solid #334155;padding:16px;box-sizing:border-box}
        .debug-section{margin:0 0 16px;padding:11px;background:#0f172a;border:1px solid #334155;border-radius:6px}
        .debug-label{display:block;margin:0 0 5px;color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase}
        .debug-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .debug-row{display:flex;justify-content:space-between;gap:8px;margin:3px 0;font-size:11px}
        .debug-button{width:100%;padding:9px;border:0;border-radius:4px;background:#0284c7;color:white;font-weight:700;cursor:pointer}
        .debug-button:disabled{opacity:.45;cursor:not-allowed}
        .debug-tab{padding:8px;border:1px solid #475569;background:#1e293b;color:#cbd5e1;cursor:pointer}
        .debug-tab[aria-selected="true"]{background:#0369a1;color:white}
        #debug-aim-help{position:absolute;left:12px;bottom:12px;padding:7px 10px;border-radius:4px;background:rgba(15,23,42,.82);color:#e2e8f0;pointer-events:none}
        @media(max-width:760px){
          #debug-sandbox-root{grid-template-columns:1fr;grid-template-rows:minmax(52vh,1fr) minmax(240px,42vh)}
          #debug-sandbox-panel{border-left:0;border-top:1px solid #334155;padding:12px}
        }
      </style>
      <main id="debug-sandbox-viewport" aria-label="Vehicle sandbox 3D view">
        <div id="debug-aim-help">Drag to orbit. Scroll/pinch to zoom. Double tap to center.</div>
      </main>
      <aside id="debug-sandbox-panel" aria-label="Vehicle sandbox controls"></aside>
    `;
    document.body.appendChild(this.container);
    this.viewport = this.container.querySelector('#debug-sandbox-viewport');
    this.panel = this.container.querySelector('#debug-sandbox-panel');
  }

  async init() {
    this.rendererFacade = new Renderer(this.viewport, {
      qualityTier: 'high',
      debugMode: 'final',
      onDeviceLost: info => this.handleInitializationError(
        new Error(`${info.api} rendering device lost: ${info.message}`)
      )
    });
    await this.rendererFacade.initialize();
    this.scene = this.rendererFacade.scene;
    this.camera = this.rendererFacade.camera;
    this.scene.background = new THREE.Color(VEHICLE_SANDBOX_VR_PALETTE.backdrop);
    this.scene.fog = null;
    this.camera.far = 1000;
    this.controls = new OrbitControls(this.camera, this.rendererFacade.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.setupVrMissionGround();
    this.aimMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xff1744, depthTest: false })
    );
    this.aimMarker.name = 'debug-gun-aim-point';
    this.aimMarker.renderOrder = 1000;
    this.aimMarker.visible = false;
    this.aimMarker.userData.presentationOnly = true;
    this.scene.add(this.aimMarker);
    this.visualFactories = createFrance1940VisualFactories({
      assetResolver: FRANCE_1940_ASSET_RESOLVER
    });
    this.vfxRuntime = null;
    if (typeof this.visualFactories.vfxProvider.createRuntime === 'function') {
      try {
        this.vfxRuntime = await this.visualFactories.vfxProvider.createRuntime({
          renderer: this.rendererFacade.graphicsRenderer,
          scene: this.scene,
          getGroundHeightAt: () => 0
        });
      } catch (error) {
        console.warn(
          '[VehicleDebugSandbox] Three-VFX experiment unavailable; retaining procedural fallback:',
          error
        );
      }
    }
    this.simulation = new VehicleDebugSandboxSimulation({
      scene: this.scene,
      visualFactories: this.visualFactories,
      vfxRuntime: this.vfxRuntime
    });
    this.debugOverlays = new DebugOverlaySystem(this.scene);
    this.trajectoryOverlay = new ShotTrajectoryOverlay(this.scene);
    this.vehicleOptions = listDebugVehicleOptions();
    this.armedVehicleOptions = listDebugVehicleOptions({ armedOnly: true });
    this.gunOptions = listDebugGunOptions();
    this.setupUI();
    this.startDuel();

    this.viewport.addEventListener('pointerdown', this.onPointerDown);
    this.viewport.addEventListener('pointerup', this.onPointerUp);
    this.viewport.addEventListener('pointercancel', this.onPointerCancel);
    this.resizeObserver = new ResizeObserver(() => this.resizeViewport());
    this.resizeObserver.observe(this.viewport);
    window.addEventListener('resize', this.resizeViewport);
    this.resizeViewport();
    this.lastTime = performance.now();
    this.animationFrameId = requestAnimationFrame(this.animate);
    window.addEventListener('pagehide', () => this.dispose(), { once: true });
    document.body.dataset.gameBackend = this.rendererFacade.backendName;
    document.body.dataset.vfxRuntime = this.vfxRuntime
      ? this.vfxRuntime.getDiagnostics().implementationId
      : 'procedural-fallback';
    document.body.dataset.gameStatus = 'ready';
  }

  setupVrMissionGround() {
    const geometry = new THREE.PlaneGeometry(600, 600);
    const material = new THREE.MeshStandardMaterial({
      color: VEHICLE_SANDBOX_VR_PALETTE.ground,
      roughness: 0.88,
      metalness: 0.04
    });
    this.ground = new THREE.Mesh(geometry, material);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.grid = new THREE.GridHelper(
      600,
      120,
      VEHICLE_SANDBOX_VR_PALETTE.gridMajor,
      VEHICLE_SANDBOX_VR_PALETTE.gridMinor
    );
    this.grid.position.y = 0.01;
    this.scene.add(this.grid);
  }

  setupUI() {
    this.panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <strong style="color:#38bdf8;font-size:15px">VEHICLE SANDBOX</strong>
        <span style="font-size:10px;color:#94a3b8">REAL COMBAT PATH</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;margin-bottom:14px">
        <button class="debug-tab" data-mode="duel" aria-selected="true">1 vs 1</button>
        <button class="debug-tab" data-mode="gun" aria-selected="false">Gun mode</button>
      </div>
      <section id="duel-controls" class="debug-section">
        <label class="debug-label" for="duel-left">Vehicle A</label>
        <select id="duel-left" style="${CONTROL_STYLE}">${optionMarkup(this.armedVehicleOptions, 'SOMUA_S35')}</select>
        <label class="debug-label" for="duel-right" style="margin-top:9px">Vehicle B</label>
        <select id="duel-right" style="${CONTROL_STYLE}">${optionMarkup(this.armedVehicleOptions, 'PANZER_III_D')}</select>
        <label class="debug-label" for="duel-distance" style="margin-top:9px">Separation (metres)</label>
        <input id="duel-distance" type="number" min="10" max="500" step="5" value="${DEBUG_VEHICLE_SEPARATION_METERS}" style="${CONTROL_STYLE}">
        <button id="duel-start" class="debug-button" style="margin-top:10px">Start fresh duel</button>
        <p style="margin:8px 0 0;color:#94a3b8;font-size:11px">Both crews use normal aiming, reload, ammunition, projectile, armor, crew and component rules.</p>
      </section>
      <section id="gun-controls" class="debug-section" hidden>
        <label class="debug-label" for="gun-target">Target vehicle</label>
        <select id="gun-target" style="${CONTROL_STYLE}">${optionMarkup(this.vehicleOptions, 'SOMUA_S35')}</select>
        <label class="debug-label" for="gun-select" style="margin-top:9px">Gun and ammunition</label>
        <select id="gun-select" style="${CONTROL_STYLE}">${optionMarkup(this.gunOptions, 'KWK36_AP')}</select>
        <div id="gun-details" style="margin-top:8px;color:#cbd5e1;font-size:11px"></div>
        <label class="debug-label" for="gun-distance" style="margin-top:9px">Range (metres)</label>
        <input id="gun-distance" type="number" min="5" max="2000" step="5" value="100" style="${CONTROL_STYLE}">
        <button id="gun-reset" class="debug-button" style="margin-top:10px">Load fresh target</button>
        <p style="margin:8px 0 0;color:#94a3b8;font-size:11px">Orbit to choose the firing aspect, then tap the model. The shot origin is exactly perpendicular to the camera plane through the red dot; projectile flight and damage use the real game systems without crew aim error.</p>
      </section>
      <section class="debug-section">
        <div class="debug-label">Authoritative overlays</div>
        <label><input type="checkbox" data-overlay="hitboxes"> Armor hit volumes</label><br>
        <label><input type="checkbox" data-overlay="vehicleComponents"> Internal components</label><br>
        <label><input type="checkbox" data-overlay="vehicleCrew"> Crew volumes</label>
      </section>
      <section class="debug-section">
        <div class="debug-label">Live outcome</div>
        <div id="sandbox-status" aria-live="polite">Loading...</div>
      </section>
      <section class="debug-section">
        <div class="debug-label">Selected vehicle damage</div>
        <div id="component-report"></div>
      </section>
      <section class="debug-section">
        <div class="debug-label">Crew health and casualties</div>
        <div id="crew-report"></div>
      </section>
    `;
    for (const tab of this.panel.querySelectorAll('[data-mode]')) {
      tab.addEventListener('click', () => this.setMode(tab.dataset.mode));
    }
    this.panel.querySelector('#duel-start').addEventListener('click', () => this.startDuel());
    this.panel.querySelector('#gun-reset').addEventListener('click', () => this.startGunMode());
    this.panel.querySelector('#gun-select').addEventListener('change', () => {
      this.renderGunDetails();
    });
    for (const checkbox of this.panel.querySelectorAll('[data-overlay]')) {
      checkbox.addEventListener('change', () => {
        this.debugOverlays.setEnabled(checkbox.dataset.overlay, checkbox.checked);
        this.updateOverlays();
      });
    }
    this.renderGunDetails();
  }

  renderGunDetails() {
    const selectedId = this.panel.querySelector('#gun-select')?.value;
    const option = this.gunOptions.find(candidate => candidate.id === selectedId);
    const container = this.panel.querySelector('#gun-details');
    if (!option || !container) return;
    const weapon = option.weapon;
    const vehicles = option.compatibleUses.length > 0
      ? option.compatibleUses
          .map(use => `${use.vehicleName} - ${use.mountLabel}`)
          .join(', ')
      : 'No game vehicle; sandbox emplacement only';
    container.innerHTML = `
      <div class="debug-row"><span>Source</span><span>${option.sandboxOnly ? 'sandbox only' : 'canonical game record'}</span></div>
      <div class="debug-row"><span>Used by</span><span style="text-align:right">${vehicles}</span></div>
      <div class="debug-row"><span>Caliber</span><span>${metric(weapon.caliberMm, 'mm')}</span></div>
      <div class="debug-row"><span>Muzzle velocity</span><span>${metric(weapon.muzzleVelocity, 'm/s')}</span></div>
      <div class="debug-row"><span>Projectile mass</span><span>${metric(weapon.projectileMassKg, 'kg', 3)}</span></div>
      <div class="debug-row"><span>Penetration baseline</span><span>${weapon.penetrationMmAt100m > 0 ? metric(weapon.penetrationMmAt100m, 'mm @ 100 m') : 'none'}</span></div>
      <div class="debug-row"><span>Blast radius</span><span>${weapon.explosiveRadius > 0 ? metric(weapon.explosiveRadius, 'm', 1) : 'none'}</span></div>
      <div class="debug-row"><span>Dispersion</span><span>${metric(weapon.dispersionMOA, 'MOA', 1)}</span></div>`;
  }

  setMode(mode) {
    if (!['duel', 'gun'].includes(mode)) return;
    this.mode = mode;
    for (const tab of this.panel.querySelectorAll('[data-mode]')) {
      tab.setAttribute('aria-selected', String(tab.dataset.mode === mode));
    }
    this.panel.querySelector('#duel-controls').hidden = mode !== 'duel';
    this.panel.querySelector('#gun-controls').hidden = mode !== 'gun';
    this.trajectoryOverlay.clear();
    this.aimMarker.visible = false;
    this.lastImpactId = null;
    if (mode === 'duel') this.startDuel();
    else this.startGunMode();
  }

  startDuel() {
    this.clearPendingTap();
    const distance = Number(this.panel.querySelector('#duel-distance').value);
    this.simulation.setupDuel({
      leftVehicleId: this.panel.querySelector('#duel-left').value,
      rightVehicleId: this.panel.querySelector('#duel-right').value,
      separationMeters: Number.isFinite(distance) ? THREE.MathUtils.clamp(distance, 10, 500) : DEBUG_VEHICLE_SEPARATION_METERS
    });
    this.camera.position.set(34, 18, 34);
    this.controls.target.set(0, 1.5, 0);
    this.controls.update();
    this.lastImpactId = null;
    this.trajectoryOverlay.clear();
    this.aimMarker.visible = false;
    this.updateOverlays();
    this.updateStatus(true);
  }

  startGunMode() {
    this.clearPendingTap();
    const distance = Number(this.panel.querySelector('#gun-distance').value);
    this.simulation.setupGun({
      targetVehicleId: this.panel.querySelector('#gun-target').value,
      gunOptionId: this.panel.querySelector('#gun-select').value,
      distanceMeters: Number.isFinite(distance) ? THREE.MathUtils.clamp(distance, 5, 2000) : 100
    });
    this.renderGunDetails();
    const target = this.simulation.visibleUnits[0];
    const extent = Math.max(
      target.vehicleSpec.dimensionsMeters.length,
      target.vehicleSpec.dimensionsMeters.width,
      target.vehicleSpec.dimensionsMeters.height
    );
    this.camera.position.set(extent * 1.8, extent * 1.1, extent * 2.2);
    this.controls.target.set(0, target.vehicleSpec.dimensionsMeters.height * 0.45, 0);
    this.controls.update();
    this.lastImpactId = null;
    this.trajectoryOverlay.clear();
    this.aimMarker.visible = false;
    this.updateOverlays();
    this.updateStatus(true);
  }

  onPointerDown(event) {
    if (event.isPrimary === false) {
      this.pointerStart = null;
      this.clearPendingTap();
      return;
    }
    this.pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  onPointerUp(event) {
    const start = this.pointerStart;
    this.pointerStart = null;
    if (event.isPrimary === false || !start || start.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y)
      > VEHICLE_SANDBOX_TAP_GESTURE.maxMovePx) return;

    const tap = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerType: event.pointerType || 'mouse',
      timeStamp: event.timeStamp
    };
    if (isVehicleSandboxDoubleTap(this.pendingTap, tap)) {
      this.clearPendingTap();
      this.focusCameraAt(tap.clientX, tap.clientY);
      return;
    }

    this.clearPendingTap();
    this.pendingTap = tap;
    if (this.mode === 'gun') {
      tap.timerId = globalThis.setTimeout(() => {
        if (this.pendingTap !== tap) return;
        this.pendingTap = null;
        this.fireGunAt(tap.clientX, tap.clientY);
      }, VEHICLE_SANDBOX_TAP_GESTURE.maxDoubleTapIntervalMs);
    }
  }

  onPointerCancel() {
    this.pointerStart = null;
  }

  clearPendingTap() {
    if (this.pendingTap?.timerId != null) {
      globalThis.clearTimeout(this.pendingTap.timerId);
    }
    this.pendingTap = null;
  }

  raycastAt(clientX, clientY, roots) {
    const rect = this.rendererFacade.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.camera.updateMatrixWorld();
    for (const root of roots) root?.updateWorldMatrix(true, true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(roots.filter(Boolean), true)
      .find(hit => isEffectivelyVisible(hit.object)) ?? null;
  }

  focusCameraAt(clientX, clientY) {
    const roots = [
      ...this.simulation.visibleUnits.map(unit => unit.mesh),
      this.ground
    ];
    const hit = this.raycastAt(clientX, clientY, roots);
    if (!hit) return false;
    this.controls.target.copy(hit.point);
    this.controls.update();
    return true;
  }

  fireGunAt(clientX, clientY) {
    if (this.mode !== 'gun') return false;
    const target = this.simulation.visibleUnits[0];
    if (!target || this.simulation.combat.projectiles.length > 0) return false;
    const hit = this.raycastAt(clientX, clientY, [target.mesh]);
    if (!hit) return false;
    const cameraDirection = this.camera.getWorldDirection(new THREE.Vector3());
    if (this.simulation.queueGunShot(hit.point, cameraDirection)) {
      this.aimMarker.position.copy(hit.point);
      this.aimMarker.visible = true;
      this.updateStatus(true);
      return true;
    }
    return false;
  }

  updateOverlays() {
    this.debugOverlays.update({
      units: this.simulation.visibleUnits,
      focusedUnits: this.simulation.visibleUnits
    });
  }

  updateStatus(force = false) {
    const now = performance.now();
    if (!force && now - this.lastStatusUpdate < 150) return;
    this.lastStatusUpdate = now;
    const telemetry = this.simulation.combat?.telemetry;
    const impacts = telemetry?.impacts ?? [];
    const latest = [...impacts].reverse().find(impact => impact.kind === 'vehicle')
      ?? impacts.at(-1);
    if (latest && latest.impactId !== this.lastImpactId) {
      this.lastImpactId = latest.impactId;
      this.trajectoryOverlay.show(latest);
    }
    const status = this.panel.querySelector('#sandbox-status');
    const report = this.panel.querySelector('#component-report');
    const crew = this.panel.querySelector('#crew-report');
    if (this.mode === 'duel') {
      const [left, right] = this.simulation.visibleUnits;
      const state = unit => unit?.isCombatEffective() ? 'fighting' : 'knocked out';
      status.innerHTML = `
        <div class="debug-row"><span>Shots</span><span>${telemetry?.shotsFired ?? 0}</span></div>
        <div class="debug-row"><span>Impacts</span><span>${impacts.length}</span></div>
        <div class="debug-row"><span>${left?.vehicleSpec.name}</span><span>${state(left)}</span></div>
        <div class="debug-row"><span>${right?.vehicleSpec.name}</span><span>${state(right)}</span></div>`;
      const selected = !right?.isCombatEffective() ? right : left;
      report.innerHTML = componentReport(selected);
      crew.innerHTML = `<strong>${left?.vehicleSpec.name}</strong>${crewReport(left)}<br><strong>${right?.vehicleSpec.name}</strong>${crewReport(right)}`;
    } else {
      const target = this.simulation.visibleUnits[0];
      const phase = this.simulation.gunShot?.phase ?? 'tap target to fire';
      const armorResult = latest?.kind === 'vehicle'
        ? `<div class="debug-row"><span>Armor zone</span><span>${latest.zone ?? 'unknown'}</span></div>
           <div class="debug-row"><span>Impact speed</span><span>${Number.isFinite(latest.impactSpeed) ? `${latest.impactSpeed.toFixed(1)} m/s` : 'n/a'}</span></div>
           <div class="debug-row"><span>Impact angle</span><span>${Number.isFinite(latest.impactAngleDegrees) ? `${latest.impactAngleDegrees.toFixed(1)} deg` : 'n/a'}</span></div>
           <div class="debug-row"><span>Armor</span><span>${Number.isFinite(latest.nominalArmorMm) ? `${latest.nominalArmorMm.toFixed(1)} mm nominal` : 'n/a'}</span></div>
           <div class="debug-row"><span>Effective armor</span><span>${Number.isFinite(latest.effectiveArmorMm) ? `${latest.effectiveArmorMm.toFixed(1)} mm` : 'n/a'}</span></div>
           <div class="debug-row"><span>Penetration</span><span>${Number.isFinite(latest.penetrationMm) ? `${latest.penetrationMm.toFixed(1)} mm` : 'n/a'}</span></div>
           <div class="debug-row"><span>Crew hit</span><span>${latest.crewResult?.casualties?.length ? latest.crewResult.casualties.map(casualty => `${casualty.role}: ${casualty.status} ${Math.round(casualty.health)}%`).join(', ') : 'none'}</span></div>
           <div class="debug-row"><span>Result</span><span>${latest.penetrated ? 'penetration' : (latest.ricocheted ? 'ricochet' : 'stopped')}</span></div>`
        : '';
      status.innerHTML = `
        <div class="debug-row"><span>Shot</span><span>${phase}</span></div>
        <div class="debug-row"><span>Shots</span><span>${telemetry?.shotsFired ?? 0}</span></div>
        <div class="debug-row"><span>Impacts</span><span>${impacts.length}</span></div>
        <div class="debug-row"><span>Target</span><span>${target?.isCombatEffective() ? 'operational' : 'knocked out'}</span></div>
        ${armorResult}`;
      report.innerHTML = componentReport(target);
      crew.innerHTML = crewReport(target);
    }
  }

  resizeViewport() {
    if (!this.rendererFacade) return;
    const width = Math.max(1, this.viewport.clientWidth);
    const height = Math.max(1, this.viewport.clientHeight);
    this.rendererFacade.graphicsRenderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    if (this.disposed) return;
    this.animationFrameId = requestAnimationFrame(this.animate);
    const now = performance.now();
    const delta = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.simulation.advance(delta);
    this.controls.update();
    this.updateOverlays();
    this.updateStatus();
    this.vfxRuntime?.update(delta, this.camera);
    this.rendererFacade.render();
  }

  handleInitializationError(error) {
    const message = error instanceof Error ? error.message : String(error);
    document.body.dataset.gameStatus = 'error';
    document.body.dataset.gameError = message;
    this.container.innerHTML = `<pre style="margin:24px;white-space:pre-wrap;color:#991b1b">Vehicle debug sandbox failed to initialize:\n${message}</pre>`;
    console.error('[VehicleDebugSandbox]', error);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.resizeViewport);
    this.viewport?.removeEventListener('pointerdown', this.onPointerDown);
    this.viewport?.removeEventListener('pointerup', this.onPointerUp);
    this.viewport?.removeEventListener('pointercancel', this.onPointerCancel);
    this.clearPendingTap();
    this.controls?.dispose();
    this.trajectoryOverlay?.dispose();
    this.debugOverlays?.dispose();
    this.simulation?.dispose();
    this.vfxRuntime?.dispose();
    this.aimMarker?.geometry.dispose();
    this.aimMarker?.material.dispose();
    this.ground?.geometry.dispose();
    this.ground?.material.dispose();
    this.grid?.geometry.dispose();
    this.grid?.material.dispose();
    this.rendererFacade?.graphicsRenderer?.dispose();
    this.container.remove();
  }
}

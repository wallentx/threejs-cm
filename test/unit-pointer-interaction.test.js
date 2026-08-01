import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GameApp } from '../src/app/GameApp.js';

function createInteractionHarness() {
  const listeners = new Map();
  let deselections = 0;
  let cancellations = 0;
  const cameraLocks = [];
  const mapClicks = [];
  const app = Object.create(GameApp.prototype);
  app.renderer = {
    domElement: {
      addEventListener(type, listener) { listeners.set(type, listener); }
    }
  };
  app.mouse = new THREE.Vector2();
  app.camera = {};
  app.raycaster = {
    setFromCamera() {},
    intersectObjects: () => [],
    intersectObject: () => []
  };
  app.units = [];
  app.playerFactionId = 'blue';
  app.pointerStart = { x: 0, y: 0 };
  app.pointerButton = null;
  app.pointerDragged = false;
  app.hoveredUnit = null;
  app.mortarAreaDrag = null;
  app.cameraManager = {
    setInteractionLocked(locked) { cameraLocks.push(locked); }
  };
  app.unitHoverPreview = { setHoveredUnit() {} };
  app.terrain = { terrainMesh: null, buildings: [] };
  app.commands = {
    activeMode: null,
    activeUnit: null,
    cancelActiveMode() {
      const cancelled = this.activeMode;
      if (cancelled) cancellations++;
      this.activeMode = null;
      return cancelled;
    },
    setAreaTargetPreview() {},
    handleMapClick(...args) { mapClicks.push(args); }
  };
  app.ui = {
    renderCommandGrid() {},
    showToast() {}
  };
  app.sound = { playUIClick() {} };
  app.deselectUnit = () => { deselections++; };
  app.initInteraction();
  return {
    app,
    listeners,
    getDeselections: () => deselections,
    getCancellations: () => cancellations,
    cameraLocks,
    mapClicks
  };
}

test('right-button drag pans without triggering right-click deselection', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { innerWidth: 1280, innerHeight: 720 };
  try {
    const { listeners, getDeselections } = createInteractionHarness();
    listeners.get('mousedown')({ button: 2, clientX: 300, clientY: 250 });
    listeners.get('contextmenu')({ preventDefault() {} });
    listeners.get('mousemove')({
      button: 2,
      buttons: 2,
      clientX: 420,
      clientY: 290
    });
    listeners.get('mouseup')({
      button: 2,
      clientX: 420,
      clientY: 290,
      preventDefault() {}
    });
    assert.equal(getDeselections(), 0);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('stationary right click still cancels a tool before deselecting', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { innerWidth: 1280, innerHeight: 720 };
  try {
    const {
      app,
      listeners,
      getDeselections,
      getCancellations
    } = createInteractionHarness();
    app.commands.activeMode = 'TARGET';
    listeners.get('mousedown')({ button: 2, clientX: 300, clientY: 250 });
    listeners.get('mouseup')({
      button: 2,
      clientX: 300,
      clientY: 250,
      preventDefault() {}
    });
    assert.equal(getCancellations(), 1);
    assert.equal(getDeselections(), 0);

    listeners.get('mousedown')({ button: 2, clientX: 300, clientY: 250 });
    listeners.get('mouseup')({
      button: 2,
      clientX: 300,
      clientY: 250,
      preventDefault() {}
    });
    assert.equal(getDeselections(), 1);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('mortar spread dragging locks the camera until placement completes', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { innerWidth: 1280, innerHeight: 720 };
  try {
    const { app, listeners, cameraLocks } = createInteractionHarness();
    const center = new THREE.Vector3(5, 0, 7);
    app.terrain.terrainMesh = {};
    app.raycaster.intersectObject = () => [{ point: center.clone() }];
    app.commands.activeMode = 'MORTAR_HE';
    app.commands.activeUnit = {
      getMortarDefaultDispersionRadius: () => 12
    };

    listeners.get('mousedown')({
      button: 0,
      clientX: 300,
      clientY: 250,
      preventDefault() {}
    });
    assert.deepEqual(cameraLocks, [true]);
    assert.ok(app.mortarAreaDrag);

    listeners.get('mousemove')({
      button: 0,
      clientX: 340,
      clientY: 270,
      preventDefault() {}
    });
    listeners.get('mouseup')({
      button: 0,
      clientX: 340,
      clientY: 270,
      preventDefault() {}
    });
    assert.deepEqual(cameraLocks, [true, false]);
    assert.equal(app.mortarAreaDrag, null);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('double-clicking a visible unit intentionally focuses it', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { innerWidth: 1280, innerHeight: 720 };
  try {
    const { app, listeners } = createInteractionHarness();
    const root = {
      visible: true,
      userData: { unitRoot: true, unitId: 'blue-1' },
      parent: null
    };
    const unit = {
      id: 'blue-1',
      faction: 'blue',
      mesh: root
    };
    const selections = [];
    app.units = [unit];
    app.raycaster.intersectObjects = () => [{ object: root }];
    app.selectUnit = (selected, options) => selections.push([selected, options]);

    listeners.get('mousedown')({ button: 0, clientX: 300, clientY: 250 });
    listeners.get('mouseup')({
      button: 0,
      clientX: 300,
      clientY: 250,
      detail: 2
    });

    assert.equal(selections.length, 1);
    assert.equal(selections[0][0], unit);
    assert.equal(selections[0][1].frameCamera, true);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('targeting a vehicle forwards the exact clicked model surface point', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { innerWidth: 1280, innerHeight: 720 };
  try {
    const { app, listeners, mapClicks } = createInteractionHarness();
    const root = {
      visible: true,
      userData: { unitRoot: true, unitId: 'red-tank' },
      parent: null
    };
    const target = {
      id: 'red-tank',
      faction: 'red',
      mesh: root,
      position: new THREE.Vector3(0, 0, 20)
    };
    const surfacePoint = new THREE.Vector3(0.8, 2.1, 19.4);
    app.units = [target];
    app.commands.activeMode = 'TARGET_AP';
    app.raycaster.intersectObjects = () => [{
      object: root,
      point: surfacePoint.clone()
    }];

    listeners.get('mousedown')({ button: 0, clientX: 300, clientY: 250 });
    listeners.get('mouseup')({ button: 0, clientX: 300, clientY: 250 });

    assert.equal(mapClicks.length, 1);
    assert.deepEqual(mapClicks[0][0], surfacePoint);
    assert.equal(mapClicks[0][1], target);
    assert.deepEqual(mapClicks[0][2].targetSurfacePoint, surfacePoint);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

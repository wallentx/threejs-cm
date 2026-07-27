import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { UIManager } from '../src/ui/UIManager.js';

function createHarness() {
  const calls = {
    pause: 0,
    overlays: 0,
    deselect: 0,
    split: 0,
    stance: 0,
    cancelled: 0
  };
  const unit = {
    isHiding: false,
    isDeployed: false,
    stance: 'STANDING',
    addPause() { calls.pause++; },
    clearWaypoints() {},
    updateStanceVisuals() { calls.stance++; },
    targetUnit: null,
    targetPos: null
  };
  const ui = Object.create(UIManager.prototype);
  ui.game = {
    selectedUnit: unit,
    wego: { playMode: 'wego', phase: 'COMMAND_PHASE' },
    commands: {
      activeMode: null,
      renderOverlays() { calls.overlays++; },
      cancelActiveMode() {
        const previous = this.activeMode;
        this.activeMode = null;
        if (previous) calls.cancelled++;
        return previous;
      }
    },
    deselectUnit() { calls.deselect++; },
    splitUnit() { calls.split++; }
  };
  ui.showToast = () => {};
  ui.renderCommandGrid = () => {};
  return { ui, unit, calls };
}

test('UI manager preserves command actions and WEGO order locking', () => {
  const { ui, unit, calls } = createHarness();

  ui.handleDirectAction('PAUSE');
  assert.equal(calls.pause, 1);
  assert.equal(calls.overlays, 1);

  ui.handleDirectAction('DEPLOY');
  assert.equal(unit.isDeployed, true);
  assert.equal(unit.stance, 'KNEELING');
  assert.equal(calls.stance, 1);

  ui.handleDirectAction('SPLIT');
  assert.equal(calls.split, 1);

  ui.game.wego.phase = 'ACTION_PHASE';
  ui.handleDirectAction('PAUSE');
  assert.equal(calls.pause, 1);

  ui.game.wego.playMode = 'realtime';
  ui.handleDirectAction('PAUSE');
  assert.equal(calls.pause, 2);
});

test('cancel and deselect remain available outside order-entry phases', () => {
  const { ui, calls } = createHarness();
  ui.game.wego.phase = 'ACTION_PHASE';
  ui.game.commands.activeMode = 'TARGET';

  ui.handleDirectAction('CANCEL_ACTION');
  assert.equal(calls.cancelled, 1);
  assert.equal(ui.game.commands.activeMode, null);

  ui.handleDirectAction('DESELECT');
  assert.equal(calls.deselect, 1);
  assert.equal(typeof ui.clearUnitHUD, 'function');
  assert.equal(typeof ui.updatePlayModeDisplay, 'function');
  assert.equal(typeof ui.updatePlaybackDisplay, 'function');
});

test('runtime markup exposes restored playback controls and shot inspector', async () => {
  const [markup, css] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/main.css', import.meta.url), 'utf8')
  ]);

  for (const id of [
    'btn-cancel-cmd',
    'btn-deselect-unit',
    'vcr-back',
    'vcr-speed',
    'timeline-slider',
    'shot-inspector-list',
    'btn-clear-shot-trajectory',
    'vehicle-status',
    'vehicle-system-grid',
    'vehicle-mount-grid'
  ]) {
    assert.match(markup, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(markup, /id="app"[^>]*data-game-status="ready"/);
  assert.match(css, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /#shot-inspector-list/);
});

test('shot inspector distinguishes ricochet continuation from a stopped projectile', () => {
  const previousDocument = globalThis.document;
  const list = {
    children: [],
    get childElementCount() { return this.children.length; },
    replaceChildren() { this.children = []; },
    appendChild(child) { this.children.push(child); }
  };
  const element = () => ({
    className: '',
    textContent: '',
    children: [],
    attributes: {},
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener() {}
  });
  globalThis.document = {
    getElementById: id => id === 'shot-inspector-list' ? list : null,
    createElement: element
  };

  try {
    const ui = Object.create(UIManager.prototype);
    ui.lastImpactKey = null;
    ui.game = {};
    ui.updateShotInspector([{
      id: 7,
      shooterId: 'gunner',
      targetId: 'somua',
      kind: 'vehicle',
      weaponId: 'KWK36_AP',
      ammoId: 'KWK36_AP',
      rangeMeters: 85,
      impactSpeed: 700,
      flightTime: 0.12,
      muzzlePosition: [0, 2, -80],
      impactPosition: [1, 1.2, 0],
      zone: 'hull_side',
      nominalArmorMm: 40,
      effectiveArmorMm: 160,
      penetrationMm: 34,
      impactAngleDegrees: 82,
      impactCosine: 0.14,
      penetrated: false,
      ricocheted: true,
      ricochetCount: 1,
      ricochetReason: 'deflected',
      postImpactSpeed: 440,
      retainedEnergyRatio: 0.4,
      crewResult: null
    }]);

    assert.equal(list.children.length, 1);
    const entry = list.children[0];
    assert.match(entry.className, /ricocheted/);
    const text = collectText(entry);
    assert.match(text, /RICOCHET/);
    assert.match(text, /rebound 440 m\/s/);
    assert.match(text, /energy 40%/);
    assert.match(text, /angle 82\.0 deg/);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('shot inspector exposes ordered internal penetration path and all crew casualties', () => {
  const previousDocument = globalThis.document;
  const list = {
    children: [],
    get childElementCount() { return this.children.length; },
    replaceChildren() { this.children = []; },
    appendChild(child) { this.children.push(child); }
  };
  const element = () => ({
    className: '',
    textContent: '',
    children: [],
    attributes: {},
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener() {}
  });
  globalThis.document = {
    getElementById: id => id === 'shot-inspector-list' ? list : null,
    createElement: element
  };

  try {
    const ui = Object.create(UIManager.prototype);
    ui.lastImpactKey = null;
    ui.game = {};
    ui.updateShotInspector([{
      id: 8,
      impactId: 9,
      shooterId: 'gunner',
      targetId: 'somua',
      kind: 'vehicle',
      weaponId: 'KWK36_AP',
      ammoId: 'KWK36_AP',
      rangeMeters: 60,
      impactSpeed: 700,
      flightTime: 0.09,
      muzzlePosition: [0, 1.8, 60],
      impactPosition: [0, 1.2, 2.5],
      zone: 'hull_front',
      nominalArmorMm: 40,
      effectiveArmorMm: 40,
      penetrationMm: 45,
      impactAngleDegrees: 0,
      impactCosine: 1,
      penetrated: true,
      ricocheted: false,
      internalPathHits: [
        { id: 'crew-driver', entryDistanceMeters: 0.78 },
        { id: 'module-engine', entryDistanceMeters: 3.4 }
      ],
      crewResult: {
        casualties: [
          { role: 'DRIVER', status: 'WOUNDED', health: 35 },
          { role: 'RADIO_OPERATOR', status: 'KIA', health: 0 }
        ],
        components: [{ id: 'engine', status: 'DAMAGED', health: 68 }]
      }
    }]);

    const text = collectText(list.children[0]);
    assert.match(text, /PENETRATED/);
    assert.match(text, /DRIVER: WOUNDED/);
    assert.match(text, /RADIO_OPERATOR: KIA/);
    assert.match(text, /modules engine:DAMAGED/);
    assert.match(text, /inside crew-driver@0\.78m -> module-engine@3\.40m/);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('empty selection keeps command and roster cells but makes them inert before creating actions', () => {
  const previousDocument = globalThis.document;
  const panels = {
    'command-grid': { innerHTML: '<button>stale action</button>' },
    'panel-commands': createPanelHarness(),
    'panel-team-roster': createPanelHarness()
  };
  const toggles = [];
  globalThis.document = {
    getElementById: id => panels[id] ?? null,
    body: {
      classList: {
        toggle(name, enabled) {
          toggles.push([name, enabled]);
        }
      }
    }
  };

  try {
    const ui = Object.create(UIManager.prototype);
    ui.game = { selectedUnit: null };
    ui.renderCommandGrid();
    assert.equal(panels['command-grid'].innerHTML, '');
    assert.equal(panels['panel-commands'].hidden, false);
    assert.equal(panels['panel-team-roster'].hidden, false);
    assert.equal(panels['panel-commands'].inert, true);
    assert.equal(panels['panel-team-roster'].inert, true);
    assert.equal(panels['panel-commands'].attributes['aria-disabled'], 'true');
    assert.equal(panels['panel-team-roster'].attributes['aria-disabled'], 'true');
    assert.equal(panels['panel-commands'].classes.get('is-selection-empty'), true);
    assert.equal(panels['panel-team-roster'].classes.get('is-selection-empty'), true);
    assert.deepEqual(toggles, [['no-unit-selected', true]]);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('selection-dependent HUD restores content and interactivity after reselection', () => {
  const previousDocument = globalThis.document;
  const commandGrid = {
    children: [],
    _innerHTML: '',
    set innerHTML(value) {
      this._innerHTML = value;
      if (value === '') this.children = [];
    },
    get innerHTML() {
      return this._innerHTML;
    },
    appendChild(child) {
      this.children.push(child);
    }
  };
  const panels = {
    'command-grid': commandGrid,
    'panel-commands': createPanelHarness(),
    'panel-team-roster': createPanelHarness()
  };
  globalThis.document = {
    getElementById: id => panels[id] ?? null,
    createElement: () => ({
      className: '',
      innerHTML: '',
      classList: { add() {} },
      addEventListener() {}
    }),
    body: { classList: { toggle() {} } }
  };

  try {
    const ui = Object.create(UIManager.prototype);
    ui.activeTab = 'move';
    ui.game = {
      selectedUnit: { id: 'unit_a' },
      commands: { activeMode: null }
    };

    ui.renderCommandGrid();
    assert.ok(commandGrid.children.length > 0);
    assert.equal(panels['panel-commands'].inert, false);
    assert.equal(panels['panel-team-roster'].inert, false);

    ui.game.selectedUnit = null;
    ui.renderCommandGrid();
    assert.equal(commandGrid.children.length, 0);
    assert.equal(panels['panel-commands'].inert, true);
    assert.equal(panels['panel-team-roster'].inert, true);

    ui.game.selectedUnit = { id: 'unit_b' };
    ui.renderCommandGrid();
    assert.ok(commandGrid.children.length > 0);
    assert.equal(panels['panel-commands'].inert, false);
    assert.equal(panels['panel-team-roster'].inert, false);
    assert.equal(panels['panel-commands'].attributes['aria-disabled'], 'false');
    assert.equal(panels['panel-team-roster'].attributes['aria-disabled'], 'false');
    assert.equal(panels['panel-commands'].classes.get('is-selection-empty'), false);
    assert.equal(panels['panel-team-roster'].classes.get('is-selection-empty'), false);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

function createPanelHarness() {
  const classes = new Map();
  return {
    hidden: false,
    inert: false,
    attributes: {},
    classes,
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    classList: {
      toggle(name, enabled) {
        classes.set(name, enabled);
      }
    }
  };
}

function collectText(node) {
  return [node.textContent, ...(node.children ?? []).map(collectText)]
    .filter(Boolean)
    .join(' ');
}

test('portrait mobile retains a stable 2 by 2 HUD including the tactical map', async () => {
  const [markup, css] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/main.css', import.meta.url), 'utf8')
  ]);
  const minimapMarkup = markup.match(/<div id="panel-minimap"[^>]*>/)?.[0] ?? '';
  assert.doesNotMatch(minimapMarkup, /hide-mobile/);
  assert.match(css, /@media\s*\(orientation:\s*portrait\)/);
  assert.doesNotMatch(css, /@media\s*\(max-width:\s*640px\)\s*and\s*\(orientation:\s*portrait\)/);
  assert.match(css, /#hud-panel\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /#hud-panel\s*\{[^}]*grid-template-rows:\s*repeat\(2,\s*132px\)/s);
  assert.match(css, /#panel-minimap\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /#panel-commands\s+\.command-grid\s*\{[^}]*flex:\s*1[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s);
  assert.match(css, /#panel-team-roster\s+\.vehicle-status\s*\{[^}]*flex:\s*1/s);
  assert.match(css, /\.hud-box\.is-selection-empty\s*>\s*\*\s*\{[^}]*visibility:\s*hidden/s);
});

test('realtime mode hides WEGO time sliders, step buttons, and GO execution button', async () => {
  const css = await readFile(new URL('../src/styles/main.css', import.meta.url), 'utf8');
  assert.match(css, /body\[data-play-mode="realtime"\]\s*\.timeline-container/);
  assert.match(css, /body\[data-play-mode="realtime"\]\s*#vcr-rewind/);
  assert.match(css, /body\[data-play-mode="realtime"\]\s*#vcr-back/);
  assert.match(css, /body\[data-play-mode="realtime"\]\s*#vcr-next/);
  assert.match(css, /body\[data-play-mode="realtime"\]\s*#btn-go/);
  assert.match(css, /display:\s*none\s*!important/);

  const dataset = {};
  const previousDocument = globalThis.document;
  globalThis.document = {
    body: { dataset },
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null
  };
  try {
    const ui = Object.create(UIManager.prototype);
    ui.game = { wego: { isPlaying: true } };
    ui.updatePlayModeDisplay('realtime');
    assert.equal(dataset.playMode, 'realtime');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

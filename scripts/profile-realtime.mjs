const CDP_ENDPOINT = process.env.PROFILE_CDP_URL
  ?? 'http://127.0.0.1:9223/json/list';
const GAME_ORIGIN = process.env.PROFILE_GAME_ORIGIN
  ?? 'http://127.0.0.1:5173';
const SAMPLE_SECONDS = Math.max(
  2,
  Math.min(30, Number(process.env.PROFILE_SECONDS) || 8)
);
const FORCE_CONTACT = process.env.PROFILE_CONTACT === '1';
const DISABLE_SHADOWS = process.env.PROFILE_SHADOWS === '0';
const REUSE_BATTLE = process.env.PROFILE_REUSE === '1';

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

class CdpSession {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.console = [];
    this.socket.addEventListener('message', event => this.handleMessage(event));
  }

  async connect() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Chrome debugging socket timed out')),
        3000
      );
      this.socket.addEventListener('open', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.socket.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error('Chrome debugging socket is unavailable'));
      }, { once: true });
    });
    await this.call('Runtime.enable');
    await this.call('Log.enable');
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      this.console.push({
        level: message.params.type,
        text: message.params.args
          .map(argument => argument.value ?? argument.description ?? '')
          .join(' ')
      });
    } else if (message.method === 'Log.entryAdded') {
      this.console.push({
        level: message.params.entry.level,
        text: message.params.entry.text
      });
    } else if (message.method === 'Runtime.exceptionThrown') {
      this.console.push({
        level: 'error',
        text: message.params.exceptionDetails?.text ?? 'Runtime exception'
      });
    }
  }

  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? 'Runtime evaluation failed');
    }
    return result.result?.value;
  }

  close() {
    this.socket.close();
  }
}

async function findGameTarget() {
  const response = await fetch(CDP_ENDPOINT, {
    signal: AbortSignal.timeout(2000)
  });
  if (!response.ok) {
    throw new Error(`Chrome endpoint returned ${response.status}`);
  }
  const targets = await response.json();
  const page = targets.find(target => (
    target.type === 'page'
      && target.url.startsWith(GAME_ORIGIN)
      && target.webSocketDebuggerUrl
  ));
  if (!page) throw new Error(`No Chrome game page is open at ${GAME_ORIGIN}`);
  return page;
}

async function waitFor(session, expression, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await session.evaluate(expression)) return;
    } catch (error) {
      if (!/context|navigation|reload|destroyed/i.test(error.message)) throw error;
    }
    await wait(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function launchDefaultBattle(session) {
  const status = await session.evaluate('document.body.dataset.gameStatus');
  if (status === 'setup') {
    for (let step = 0; step < 4; step++) {
      await session.evaluate(`document.querySelector('[data-setup-action="next"]')?.click()`);
      await waitFor(
        session,
        `document.querySelector('.setup-progress')?.textContent?.includes('Step ${step + 2} of 5') === true`,
        `battle setup step ${step + 2}`
      );
    }
    await session.evaluate(`document.querySelector('#battle-setup-form')?.requestSubmit()`);
  }
  await waitFor(
    session,
    `document.body.dataset.gameStatus === 'ready' && Boolean(window.__CMBN_GAME__)`,
    'ready battlefield'
  );
}

async function stageContactBattle(session) {
  return session.evaluate(`(() => {
    const app = window.__CMBN_GAME__;
    app.wego.isPlaying = false;
    const friendly = app.units.filter(unit => unit.faction === app.playerFactionId);
    const enemy = app.units.filter(unit => unit.faction !== app.playerFactionId);
    const laneCount = Math.max(friendly.length, enemy.length);
    const laneSpacing = 7;
    const halfWidth = (laneCount - 1) * laneSpacing * 0.5;
    const gap = 28;
    const collisionWorld = app.terrain.collisionWorld;
    const pointIsOpen = point => collisionWorld.queryStaticRecords({
      minX: point.x - 2.5,
      maxX: point.x + 2.5,
      minZ: point.z - 2.5,
      maxZ: point.z + 2.5
    }).every(record => (
      record.enabled === false
      || !(record.blocks?.includes('infantry') || record.blocks?.includes('vehicle'))
    ));
    const sightPoint = point => ({
      x: point.x,
      y: (app.terrain.getHeightAt(point.x, point.z) ?? 0) + 1.7,
      z: point.z
    });
    let staging = null;
    for (let centerZ = -80; centerZ <= 80 && !staging; centerZ += 10) {
      for (let centerX = -80; centerX <= 80 && !staging; centerX += 10) {
        const lanes = [];
        let clear = true;
        for (let index = 0; index < laneCount; index++) {
          const x = centerX - halfWidth + index * laneSpacing;
          const from = { x, z: centerZ - gap * 0.5 };
          const to = { x, z: centerZ + gap * 0.5 };
          if (!pointIsOpen(from) || !pointIsOpen(to)
              || !app.spotting.checkLOS(sightPoint(from), sightPoint(to)).clear) {
            clear = false;
            break;
          }
          lanes.push({ from, to });
        }
        if (clear) staging = { centerX, centerZ, lanes };
      }
    }
    if (!staging) throw new Error('No clear contact staging lanes found');

    const relocate = (unit, point, rotation) => {
      const y = app.terrain.getMovementHeightAt?.(point.x, point.z)
        ?? app.terrain.getHeightAt(point.x, point.z);
      const dx = point.x - unit.position.x;
      const dy = y - unit.position.y;
      const dz = point.z - unit.position.z;
      unit.clearWaypoints();
      unit.targetUnitId = null;
      unit.targetPos = null;
      unit.position.set(point.x, y, point.z);
      unit.rotation = rotation;
      unit.mesh?.position.copy(unit.position);
      if (unit.mesh) {
        unit.mesh.rotation.y = rotation;
        unit.mesh.updateMatrixWorld(true);
      }
      for (const agent of unit.soldierAI?.agents ?? []) {
        agent.position.x += dx;
        agent.position.y += dy;
        agent.position.z += dz;
        agent.facing = rotation;
        agent.velocity.set(0, 0, 0);
        agent.commandWaypoint = -1;
        agent.syncRecord();
      }
      unit.soldierAI?.syncMeshes();
    };
    friendly.forEach((unit, index) => {
      const lane = staging.lanes[index % staging.lanes.length];
      relocate(unit, lane.from, 0);
    });
    enemy.forEach((unit, index) => {
      const lane = staging.lanes[index % staging.lanes.length];
      relocate(unit, lane.to, Math.PI);
    });
    app.visibilityProjectionDirty = true;
    app.spottingAccumulator = 0;
    app.wego.isPlaying = true;
    return {
      centerX: staging.centerX,
      centerZ: staging.centerZ,
      gapMeters: gap,
      lanes: staging.lanes.length,
      friendlyUnits: friendly.length,
      enemyUnits: enemy.length
    };
  })()`);
}

function summarizeCpuProfile(profile) {
  const hitCountByNode = new Map();
  for (const nodeId of profile.samples ?? []) {
    hitCountByNode.set(nodeId, (hitCountByNode.get(nodeId) ?? 0) + 1);
  }
  const totalHits = Math.max(1, profile.samples?.length ?? 0);
  return (profile.nodes ?? [])
    .map(node => ({
      function: node.callFrame.functionName || '(anonymous)',
      url: node.callFrame.url || '',
      line: (node.callFrame.lineNumber ?? -1) + 1,
      selfSamples: hitCountByNode.get(node.id) ?? 0
    }))
    .filter(entry => entry.selfSamples > 0 && entry.url.includes('/src/'))
    .sort((left, right) => right.selfSamples - left.selfSamples)
    .slice(0, 20)
    .map(entry => ({
      ...entry,
      selfPercent: Number((entry.selfSamples * 100 / totalHits).toFixed(2))
    }));
}

async function main() {
  const target = await findGameTarget();
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.connect();
  try {
    if (!REUSE_BATTLE) {
      await session.call('Page.enable');
      await session.call('Page.reload', { ignoreCache: true });
      await waitFor(
        session,
        `document.body?.dataset?.gameStatus === 'setup'`,
        'fresh battle setup'
      );
    }
    await launchDefaultBattle(session);
    const contactStaging = FORCE_CONTACT
      ? await stageContactBattle(session)
      : null;
    if (DISABLE_SHADOWS) {
      await session.evaluate(
        `window.__CMBN_GAME__.renderer.setDebugMode('no-shadows')`
      );
    }
    await session.evaluate(`(() => {
      const app = window.__CMBN_GAME__;
      if (!app.ui.debugPanelVisible) app.ui.toggleDebugPanel();
      app.frameProfiler.reset();
      app.simulationPhaseProfiler.reset();
      app.wego.setPlayMode('realtime', { silent: true });
      app.wego.isPlaying = true;
      return true;
    })()`);

    await session.call('Profiler.enable');
    await session.call('Profiler.setSamplingInterval', { interval: 250 });
    await session.call('Profiler.start');
    await wait(SAMPLE_SECONDS * 1000);
    const { profile } = await session.call('Profiler.stop');

    const runtime = await session.evaluate(`(() => {
      const app = window.__CMBN_GAME__;
      const people = app.units.reduce(
        (sum, unit) => sum + (unit.soldierAI?.agents?.length ?? 0),
        0
      );
      const enemyUnits = app.units.filter(
        unit => unit.faction !== app.playerFactionId
      );
      let directObservationCount = 0;
      for (const targetMap of app.spotting?.observations?.values?.() ?? []) {
        for (const observation of targetMap.values()) {
          if (observation.visibleNow) directObservationCount++;
        }
      }
      return {
        href: location.href,
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
        status: document.body.dataset.gameStatus ?? null,
        error: document.body.dataset.gameError ?? null,
        backend: document.body.dataset.rendererBackend ?? null,
        mode: app.wego.playMode,
        scenario: document.body.dataset.scenarioId ?? null,
        map: document.body.dataset.mapId ?? null,
        unitCount: app.units.length,
        soldierCount: people,
        contact: {
          visibleEnemyUnits: enemyUnits.filter(
            unit => app.visibleUnitIdSet?.has(unit.id)
          ).length,
          directObservations: directObservationCount,
          unitsWithTargets: app.units.filter(unit => (
            unit.targetUnitId || unit.targetPos
          )).length
        },
        frame: app.frameProfiler.snapshot(),
        simulation: app.simulationPhaseProfiler.snapshot(),
        renderer: app.renderer.getDiagnostics(),
        collision: {
          colliders: app.terrain?.collisionWorld?.colliders?.size ?? null,
          spatialCells: app.terrain?.collisionWorld?.spatialCells?.size ?? null
        }
      };
    })()`);

    const report = {
      capturedAt: new Date().toISOString(),
      sampleSeconds: SAMPLE_SECONDS,
      profileMode: FORCE_CONTACT ? 'forced-contact' : 'ordinary-realtime',
      shadowsEnabled: !DISABLE_SHADOWS,
      contactStaging,
      runtime,
      topCpuFunctions: summarizeCpuProfile(profile),
      consoleErrors: [...new Map(session.console
        .filter(entry => entry.level === 'error' || entry.level === 'warning')
        .map(entry => [`${entry.level}:${entry.text}`, entry])).values()]
        .slice(0, 50)
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    session.close();
  }
}

main().catch(error => {
  process.stderr.write(`Realtime profile failed: ${error.message}\n`);
  process.exitCode = 1;
});

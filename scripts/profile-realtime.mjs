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
const ENABLE_SHADOWS = process.env.PROFILE_SHADOWS === '1';
const REUSE_BATTLE = process.env.PROFILE_REUSE === '1';
const PAUSE_SIMULATION = process.env.PROFILE_PAUSED === '1';
const STRESS_FORCE = process.env.PROFILE_STRESS === '1';
const TANK_STRESS_FORCE = process.env.PROFILE_TANK_STRESS === '1';
const TRACE_VEHICLE_TARGETING = process.env.PROFILE_TARGET_TRACE === '1';
const TRACE_VEHICLE_FIRE_CONTROL =
  process.env.PROFILE_FIRE_CONTROL_TRACE === '1';
const QUALITY_TIER = ['low', 'high', 'ultra'].includes(process.env.PROFILE_QUALITY)
  ? process.env.PROFILE_QUALITY
  : 'high';

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
    if (STRESS_FORCE || TANK_STRESS_FORCE) {
      await session.evaluate(`document.querySelector('[data-setup-action="next"]')?.click()`);
      await waitFor(
        session,
        `document.querySelector('.setup-progress')?.textContent?.includes('Step 2 of 5') === true`,
        'friendly force setup'
      );
      await configureStressForce(session, 'player', TANK_STRESS_FORCE
        ? {
            'vehicle:SOMUA_S35': 5,
            'vehicle:RENAULT_R35': 5,
            'vehicle:RENAULT_D2': 5,
            'vehicle:HOTCHKISS_H39': 5,
            'vehicle:AMC_35': 5,
            'vehicle:CHAR_B1_BIS': 5
          }
        : {
            'formation:FRENCH_CHASSEURS_PORTES_PLATOON_HQ': 2,
            'formation:FRENCH_CHASSEURS_PORTES_SQUAD': 20,
            'vehicle:CHAR_B1_BIS': 6
          });

      await session.evaluate(`document.querySelector('[data-setup-action="next"]')?.click()`);
      await waitFor(
        session,
        `document.querySelector('.setup-progress')?.textContent?.includes('Step 3 of 5') === true`,
        'enemy force setup'
      );
      await configureStressForce(session, 'enemy', TANK_STRESS_FORCE
        ? {
            'vehicle:PANZER_III_D': 6,
            'vehicle:PANZER_II_C': 6,
            'vehicle:PANZER_35T': 6,
            'vehicle:PANZER_38T': 6,
            'vehicle:PANZER_IV_D': 6
          }
        : {
            'formation:GERMAN_GRENADIER_PLATOON_HQ_1940': 2,
            'formation:GERMAN_GRENADIER_SQUAD_1940': 20,
            'vehicle:PANZER_IV_D': 6
          });
      for (let step = 3; step <= 4; step++) {
        await session.evaluate(`document.querySelector('[data-setup-action="next"]')?.click()`);
        await waitFor(
          session,
          `document.querySelector('.setup-progress')?.textContent?.includes('Step ${step + 1} of 5') === true`,
          `battle setup step ${step + 1}`
        );
      }
    } else for (let step = 0; step < 4; step++) {
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

async function configureStressForce(session, side, counts) {
  await session.evaluate(`document.querySelector(
    '[data-setup-force-mode="custom"][data-side="${side}"]'
  )?.click()`);
  for (const [optionId, count] of Object.entries(counts)) {
    const configured = await session.evaluate(`(() => {
      const input = [...document.querySelectorAll('[data-setup-count-input]')]
        .find(candidate => candidate.dataset.side === ${JSON.stringify(side)}
          && candidate.dataset.optionId === ${JSON.stringify(optionId)});
      if (!input) return false;
      input.value = ${count};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    if (!configured) throw new Error(`Missing ${side} stress option ${optionId}`);
  }
}

async function stageContactBattle(session) {
  return session.evaluate(`(() => {
    const app = window.__CMBN_GAME__;
    app.wego.isPlaying = false;
    const friendly = app.units.filter(unit => unit.faction === app.playerFactionId);
    const enemy = app.units.filter(unit => unit.faction !== app.playerFactionId);
    const interleaveVehicleTypes = units => {
      const buckets = new Map();
      for (const unit of units) {
        const key = String(unit.vehicleId ?? unit.type ?? 'unknown');
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(unit);
      }
      const orderedBuckets = [...buckets.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, bucket]) => bucket);
      const result = [];
      for (let row = 0; result.length < units.length; row++) {
        for (const bucket of orderedBuckets) {
          if (bucket[row]) result.push(bucket[row]);
        }
      }
      return result;
    };
    const friendlyLine = ${TANK_STRESS_FORCE ? 'interleaveVehicleTypes(friendly)' : 'friendly'};
    const enemyLine = ${TANK_STRESS_FORCE ? 'interleaveVehicleTypes(enemy)' : 'enemy'};
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
      if (unit.vehicleWeapon) {
        unit.vehicleWeapon.targetUnitId = null;
        unit.vehicleWeapon.targetPos = null;
      }
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
    friendlyLine.forEach((unit, index) => {
      const lane = staging.lanes[index % staging.lanes.length];
      relocate(unit, lane.from, 0);
    });
    enemyLine.forEach((unit, index) => {
      const lane = staging.lanes[index % staging.lanes.length];
      relocate(unit, lane.to, Math.PI);
    });
    if (${TANK_STRESS_FORCE ? 'true' : 'false'}) {
      // Seed direct observations at the relocated positions before installing
      // the deliberately poor frontal pairings. Otherwise the first combat
      // step can discard those targets before the 10 Hz spotter has run.
      app.spottingStepper.reset();
      app.advanceSpotting(0.5);
      friendlyLine.forEach((unit, index) => {
        if (unit.vehicleWeapon) {
          unit.vehicleWeapon.targetUnitId = enemyLine[index % enemyLine.length].id;
        }
      });
      enemyLine.forEach((unit, index) => {
        if (unit.vehicleWeapon) {
          unit.vehicleWeapon.targetUnitId = friendlyLine[index % friendlyLine.length].id;
        }
      });
    }
    app.visibilityProjectionDirty = true;
    app.spottingAccumulator = 0;
    app.wego.isPlaying = true;
    return {
      centerX: staging.centerX,
      centerZ: staging.centerZ,
      gapMeters: gap,
      lanes: staging.lanes.length,
      friendlyUnits: friendly.length,
      enemyUnits: enemy.length,
      pairedFrontalTargets: ${TANK_STRESS_FORCE ? 'true' : 'false'},
      friendlyLine: friendlyLine.map(unit => unit.vehicleId ?? unit.type),
      enemyLine: enemyLine.map(unit => unit.vehicleId ?? unit.type)
    };
  })()`);
}

function summarizeCpuProfile(profile, { sourceOnly = true } = {}) {
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
    .filter(entry => entry.selfSamples > 0 && (
      !sourceOnly || entry.url.includes('/src/')
    ))
    .sort((left, right) => right.selfSamples - left.selfSamples)
    .slice(0, 20)
    .map(entry => ({
      ...entry,
      selfPercent: Number((entry.selfSamples * 100 / totalHits).toFixed(2))
    }));
}

function summarizeCpuCategories(profile) {
  const nodeById = new Map((profile.nodes ?? []).map(node => [node.id, node]));
  const categories = new Map();
  const categoryFor = url => {
    const normalizedUrl = url.toLowerCase();
    if (normalizedUrl.includes('/src/')) return 'game';
    if (normalizedUrl.includes('/node_modules/three/')
        || normalizedUrl.includes('/node_modules/.vite/deps/three')) return 'three';
    if (normalizedUrl.includes('/node_modules/')) return 'dependency';
    if (url.startsWith(GAME_ORIGIN)) return 'game-other';
    if (!url) return 'browser-or-anonymous';
    return 'browser-or-extension';
  };
  for (const nodeId of profile.samples ?? []) {
    const category = categoryFor(nodeById.get(nodeId)?.callFrame?.url ?? '');
    categories.set(category, (categories.get(category) ?? 0) + 1);
  }
  const total = Math.max(1, profile.samples?.length ?? 0);
  return [...categories.entries()]
    .map(([category, selfSamples]) => ({
      category,
      selfSamples,
      selfPercent: Number((selfSamples * 100 / total).toFixed(2))
    }))
    .sort((left, right) => right.selfSamples - left.selfSamples);
}

async function traceVehicleTargeting(session) {
  return session.evaluate(`(() => {
    const app = window.__CMBN_GAME__;
    const previousPlaying = app.wego.isPlaying;
    app.wego.isPlaying = false;
    app.spottingStepper.reset();
    app.advanceSpotting(0.5);
    const enemiesFor = attacker => app.units.filter(unit =>
      unit.faction !== attacker.faction
      && unit.vehicleSpec?.mainGun
      && unit.isCombatEffective()
      && app.spotting.canPrecisionTarget(attacker, unit)
      && app.spotting.checkLOS(attacker.position, unit.position, {
        cacheStableRay: true
      }).clear
    );
    const attacker = app.units
      .filter(unit => unit.faction === app.playerFactionId
        && unit.vehicleSpec?.mainGun
        && unit.isCombatEffective())
      .sort((left, right) => String(left.id).localeCompare(String(right.id)))
      .find(unit => enemiesFor(unit).length >= 2);
    if (!attacker) {
      app.wego.isPlaying = previousPlaying;
      return { error: 'NO_FRIENDLY_TANK_WITH_TWO_DIRECT_TARGETS' };
    }
    const candidates = enemiesFor(attacker)
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const first = candidates[0];
    const second = candidates[1];
    const snapshot = stage => ({
      stage,
      attackerId: attacker.id,
      orderedTargetId: attacker.targetUnit?.id ?? null,
      orderedTargetMode: attacker.targetMode ?? null,
      orderedTargetPos: attacker.targetPos?.toArray?.() ?? null,
      hasAimIntent: Boolean(attacker.targetAimIntent),
      mainTargetId: attacker.vehicleWeapon?.targetUnitId ?? null,
      mainTargetMode: attacker.vehicleWeapon?.targetMode ?? null,
      mainTargetPos: attacker.vehicleWeapon?.targetPos ?? null,
      mainFireState: attacker.vehicleWeapon?.fireState ?? null,
      mainFireControlPhase: attacker.vehicleWeapon?.fireControl?.phase ?? null,
      mainFireControlTargetKey:
        attacker.vehicleWeapon?.fireControl?.targetKey ?? null,
      learningTargetId:
        attacker.vehicleEngagementLearning?.targetUnitId ?? null,
      mountTargets: Object.fromEntries(Object.entries(attacker.vehicleMounts ?? {})
        .map(([id, state]) => [id, {
          targetUnitId: state.targetUnitId ?? null,
          targetMode: state.targetMode ?? null,
          fireState: state.fireState ?? null
        }])),
      turretYaw: attacker.vehicleWeapon?.turretYaw ?? null,
      renderedTurretYaw: attacker.mesh?.userData?.turret?.rotation?.y ?? null
    });
    const issue = target => {
      app.selectUnit(attacker, { centerCamera: false });
      app.commands.setCommandMode('TARGET_AP');
      const point = target.position.clone();
      return app.commands.handleActiveUnitMapClick(point, target, {
        targetSurfacePoint: point.clone()
      });
    };
    const step = count => {
      for (let index = 0; index < count; index++) app.simulateStep(1 / 30);
    };
    const trace = [snapshot('initial')];
    trace.push({ stage: 'issue-second-result', accepted: issue(second) });
    trace.push(snapshot('issued-second'));
    step(2);
    trace.push(snapshot('after-second-step'));
    trace.push({ stage: 'issue-first-result', accepted: issue(first) });
    trace.push(snapshot('issued-first'));
    step(2);
    trace.push(snapshot('after-first-step'));
    const cleared = app.uiRuntimePort.clearTarget();
    trace.push({ stage: 'clear-result', accepted: cleared });
    trace.push(snapshot('cleared'));
    step(2);
    trace.push(snapshot('after-clear-step'));
    app.wego.isPlaying = previousPlaying;
    return {
      attackerId: attacker.id,
      firstTargetId: first.id,
      secondTargetId: second.id,
      trace
    };
  })()`);
}

async function captureVehicleFiringState(session) {
  return session.evaluate(`(() => {
    const app = window.__CMBN_GAME__;
    const unitsById = new Map(app.units.map(unit => [unit.id, unit]));
    const hasAmmo = state => Boolean(
      (state?.feedAmmo ?? 0) > 0
      || Object.values(state?.ammunition ?? {}).some(rounds => Number(rounds) > 0)
    );
    const hasOperationalCannon = unit => Boolean(
      unit?.isCombatEffective?.()
      && !unit.vehicleDamageState?.burning
      && (
        (unit.vehicleSpec?.mainGun
          && unit.hasOperationalGunner?.()
          && hasAmmo(unit.vehicleWeapon))
        || (unit.vehicleSpec?.weaponMounts ?? [])
          .filter(mount => mount.kind === 'cannon')
          .some(mount => unit.isVehicleMountOperational?.(mount.id)
            && hasAmmo(unit.vehicleMounts?.[mount.id]))
      )
    );
    const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
    return app.units
      .filter(unit => unit.vehicleSpec?.mainGun)
      .sort((left, right) => String(left.id).localeCompare(String(right.id)))
      .map(unit => {
        const weapon = unit.vehicleWeapon;
        const target = weapon?.targetUnitId
          ? unitsById.get(weapon.targetUnitId)
          : null;
        const targetPos = Array.isArray(weapon?.targetPos)
          ? weapon.targetPos
          : null;
        const desiredWorldYaw = targetPos
          ? Math.atan2(targetPos[0] - unit.position.x, targetPos[2] - unit.position.z)
          : null;
        const desiredTurretYaw = desiredWorldYaw == null
          ? null
          : wrap(desiredWorldYaw - unit.rotation);
        const los = target
          ? app.spotting.checkLOS(unit.position, target.position, {
              cacheStableRay: true
            })
          : null;
        const opposingUnits = app.factionRoster.opposingUnitsFor(unit.faction) ?? [];
        const precisionCandidates = opposingUnits.filter(candidate => {
          if (!candidate?.isCombatEffective?.()) return false;
          if (!app.spotting.canPrecisionTarget(unit, candidate)) return false;
          const candidateLos = app.spotting.checkLOS(
            unit.position,
            candidate.position,
            { cacheStableRay: true }
          );
          return candidateLos.clear && candidateLos.dist <= 220;
        });
        const operationalCandidates = precisionCandidates
          .filter(hasOperationalCannon)
          .map(candidate => candidate.id)
          .sort((left, right) => String(left).localeCompare(String(right)));
        return {
          unitId: unit.id,
          vehicleId: unit.vehicleId,
          faction: unit.faction,
          roundsFired: weapon?.roundsFired ?? 0,
          mechanicallyCapable: Boolean(
            unit.isCombatEffective()
            && !unit.vehicleDamageState?.burning
            && unit.vehicleComponents?.main_gun?.operational
            && unit.vehicleComponents?.breech?.operational
            && hasAmmo(weapon)
          ),
          gunnerAvailable: unit.hasOperationalGunner?.() ?? false,
          canFireNow: unit.canVehicleFire?.() ?? false,
          mainGunStatus: unit.vehicleComponents?.main_gun?.status ?? null,
          breechStatus: unit.vehicleComponents?.breech?.status ?? null,
          traverseStatus: unit.vehicleComponents?.turret_traverse?.status ?? null,
          loadedType: weapon?.loadedType ?? null,
          feedAmmo: weapon?.feedAmmo ?? 0,
          reserveAmmo: Object.values(weapon?.ammunition ?? {})
            .reduce((sum, rounds) => sum + (Number(rounds) || 0), 0),
          reloadTimer: weapon?.reloadTimer ?? 0,
          cooldown: weapon?.cooldown ?? 0,
          fireState: weapon?.fireState ?? null,
          fireControlPhase: weapon?.fireControl?.phase ?? null,
          aimProgressSeconds: weapon?.fireControl?.aimProgressSeconds ?? 0,
          aimRequiredSeconds: weapon?.fireControl?.aimRequiredSeconds ?? 0,
          fireControlTargetKey: weapon?.fireControl?.targetKey ?? null,
          orderedTargetId: unit.targetUnit?.id ?? null,
          targetId: weapon?.targetUnitId ?? null,
          targetCombatEffective: target?.isCombatEffective?.() ?? null,
          targetOperationalCannon: target ? hasOperationalCannon(target) : null,
          precisionCandidateCount: precisionCandidates.length,
          operationalCandidateIds: operationalCandidates,
          precisionVisible: target
            ? app.spotting.canPrecisionTarget(unit, target)
            : false,
          losClear: los?.clear ?? null,
          rangeMeters: los?.dist ?? null,
          turretYaw: weapon?.turretYaw ?? null,
          renderedTurretYaw: unit.mesh?.userData?.turret?.rotation?.y ?? null,
          remainingTurretYawError: desiredTurretYaw == null
            ? null
            : wrap(desiredTurretYaw - (weapon?.turretYaw ?? 0))
        };
      });
  })()`);
}

async function traceVehicleFireControl(session, stepCount = 12) {
  return session.evaluate(`(() => {
    const app = window.__CMBN_GAME__;
    const count = ${stepCount};
    const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
    const traces = new Map();
    const restorers = [];
    const candidates = app.units.filter(unit =>
      unit.vehicleSpec?.mainGun
      && unit.isCombatEffective?.()
      && unit.vehicleComponents?.main_gun?.operational
      && unit.vehicleComponents?.breech?.operational
      && unit.hasOperationalGunner?.()
    );
    for (const unit of candidates) {
      const original = unit.updateVehicleCombat;
      traces.set(unit.id, []);
      unit.updateVehicleCombat = function profileVehicleCombat(delta, context) {
        const weapon = this.vehicleWeapon;
        const beforeYaw = weapon?.turretYaw ?? null;
        const targetPosition = context.target?.position ?? this.targetPos;
        const desiredYaw = targetPosition
          ? wrap(Math.atan2(
              targetPosition.x - this.position.x,
              targetPosition.z - this.position.z
            ) - this.rotation)
          : null;
        const availableSeconds = this.vehicleMainGunnerCombatSeconds;
        const fired = original.call(this, delta, context);
        const afterYaw = weapon?.turretYaw ?? null;
        traces.get(this.id).push({
          delta,
          targetId: context.target?.id ?? this.targetUnit?.id ?? null,
          availableSeconds,
          beforeYaw,
          afterYaw,
          yawDelta: beforeYaw == null || afterYaw == null
            ? null
            : wrap(afterYaw - beforeYaw),
          desiredYaw,
          remainingError: desiredYaw == null || afterYaw == null
            ? null
            : wrap(desiredYaw - afterYaw),
          traverseRate: this.vehicleSpec?.turretTraverseRadPerSecond ?? null,
          traverseOperational:
            this.vehicleComponents?.turret_traverse?.operational ?? null,
          gunnerOperational: this.hasOperationalGunner?.() ?? null,
          fireControlPhase: weapon?.fireControl?.phase ?? null,
          fireState: weapon?.fireState ?? null,
          fired
        });
        return fired;
      };
      restorers.push(() => { unit.updateVehicleCombat = original; });
    }
    const previousPlaying = app.wego.isPlaying;
    app.wego.isPlaying = false;
    try {
      for (let index = 0; index < count; index++) app.simulateStep(1 / 30);
    } finally {
      for (const restore of restorers) restore();
      app.wego.isPlaying = previousPlaying;
    }
    return [...traces.entries()]
      .map(([unitId, steps]) => ({ unitId, steps }))
      .filter(row => row.steps.some(step =>
        step.fireControlPhase === 'TRAVERSING'
        || Math.abs(step.remainingError ?? 0) > 0.06
      ));
  })()`);
}

function wrappedAngleDelta(after, before) {
  if (!Number.isFinite(after) || !Number.isFinite(before)) return null;
  return Math.atan2(Math.sin(after - before), Math.cos(after - before));
}

function buildVehicleFiringAudit(beforeRows, afterRows) {
  const beforeById = new Map(beforeRows.map(row => [row.unitId, row]));
  const classify = (before, after, shotDelta, turretYawDelta) => {
    if (!after.mechanicallyCapable) return 'MECHANICALLY_DISABLED';
    if (!after.gunnerAvailable) return 'NO_GUNNER';
    if (!after.targetId) {
      if (after.operationalCandidateIds.length > 0) {
        return 'NO_TARGET_WITH_OPERATIONAL_CANDIDATE';
      }
      return after.precisionCandidateCount > 0
        ? 'NO_OPERATIONAL_TARGET'
        : 'NO_PRECISION_TARGET';
    }
    if (after.targetCombatEffective === false) return 'TARGET_DESTROYED';
    if (after.targetOperationalCannon === false) return 'TARGET_NEUTRALIZED';
    if (!after.precisionVisible && !after.orderedTargetId) return 'NO_PRECISION_OBSERVATION';
    if (after.losClear === false) return 'NO_LOS';
    if ((after.rangeMeters ?? 0) > 220) return 'OUT_OF_RANGE';
    if (after.reloadTimer > 0) return 'RELOADING';
    if (!after.loadedType || after.feedAmmo <= 0) return 'LOADING';
    if (after.cooldown > 0) return 'COOLDOWN';
    if (after.fireControlPhase === 'TRAVERSING') {
      return Math.abs(turretYawDelta ?? 0) > 1e-4
        ? 'TRAVERSING_ACTIVE'
        : 'TRAVERSING_STALLED';
    }
    if (after.fireControlPhase === 'AIMING') {
      return after.aimProgressSeconds > (before?.aimProgressSeconds ?? 0) + 1e-6
        ? 'AIMING_ACTIVE'
        : 'AIMING_STALLED';
    }
    if (shotDelta > 0) return 'FIRED';
    return after.fireControlPhase ?? after.fireState ?? 'UNKNOWN';
  };
  const rows = afterRows.map(after => {
    const before = beforeById.get(after.unitId);
    const shotDelta = after.roundsFired - (before?.roundsFired ?? after.roundsFired);
    const turretYawDelta = wrappedAngleDelta(after.turretYaw, before?.turretYaw);
    const renderedTurretYawDelta = wrappedAngleDelta(
      after.renderedTurretYaw,
      before?.renderedTurretYaw
    );
    return {
      ...after,
      shotDelta,
      targetChanged: before?.targetId !== after.targetId,
      turretYawDelta,
      renderedTurretYawDelta,
      turretPresentationDeltaError: Number.isFinite(turretYawDelta)
        && Number.isFinite(renderedTurretYawDelta)
        ? Math.abs(turretYawDelta - renderedTurretYawDelta)
        : null,
      noShotReason: classify(before, after, shotDelta, turretYawDelta)
    };
  });
  return {
    mechanicallyCapable: rows.filter(row => row.mechanicallyCapable).length,
    mechanicallyCapableWithoutShots: rows.filter(row =>
      row.mechanicallyCapable && row.shotDelta === 0).length,
    stalledTraversal: rows.filter(row =>
      row.noShotReason === 'TRAVERSING_STALLED'),
    noShotVehicles: rows.filter(row =>
      row.mechanicallyCapable && row.shotDelta === 0),
    allVehicles: rows
  };
}

async function main() {
  const target = await findGameTarget();
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.connect();
  try {
    await session.call('Page.enable');
    await session.call('Page.bringToFront');
    if (!REUSE_BATTLE) {
      await session.call('Page.navigate', {
        url: `${GAME_ORIGIN}/?mode=realtime&quality=${QUALITY_TIER}&selected=none&profileRun=${Date.now()}`
      });
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
    if (ENABLE_SHADOWS) {
      await session.evaluate(
        `window.__CMBN_GAME__.renderer.setShadowsEnabled(true)`
      );
    }
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
      app.combat?.ballistics?.resetDiagnostics?.();
      app.wego.setPlayMode('realtime', { silent: true });
      app.wego.isPlaying = ${PAUSE_SIMULATION ? 'false' : 'true'};
      return true;
    })()`);
    const vehicleFiringBefore = await captureVehicleFiringState(session);
    await session.call('Profiler.enable');
    await session.call('Profiler.setSamplingInterval', { interval: 250 });
    await session.call('Profiler.start');
    await wait(SAMPLE_SECONDS * 1000);
    const { profile } = await session.call('Profiler.stop');
    const vehicleFiringAfter = await captureVehicleFiringState(session);
    const vehicleFiringAudit = buildVehicleFiringAudit(
      vehicleFiringBefore,
      vehicleFiringAfter
    );
    const vehicleFireControlTrace = TRACE_VEHICLE_FIRE_CONTROL
      ? await traceVehicleFireControl(session)
      : null;

    const runtime = await session.evaluate(`(() => {
      const app = window.__CMBN_GAME__;
      const people = app.units.reduce(
        (sum, unit) => sum + (unit.soldierAI?.agents?.length ?? 0),
        0
      );
      const enemyUnits = app.units.filter(
        unit => unit.faction !== app.playerFactionId
      );
      const mainGunVehicles = app.units.filter(unit => unit.vehicleSpec?.mainGun);
      const vehicleImpacts = app.combat?.telemetry?.impacts?.filter(impact =>
        impact.kind === 'vehicle'
      ) ?? [];
      const vehicleTypeCounts = Object.fromEntries(
        [...new Set(mainGunVehicles.map(unit => unit.vehicleId))]
          .sort()
          .map(vehicleId => [
            vehicleId,
            mainGunVehicles.filter(unit => unit.vehicleId === vehicleId).length
          ])
      );
      const unitById = new Map(app.units.map(unit => [unit.id, unit]));
      const retainedNeutralizedTargets = mainGunVehicles.flatMap(attacker => {
        const targetId = attacker.vehicleWeapon?.targetUnitId;
        const target = targetId ? unitById.get(targetId) : null;
        if (!target?.vehicleSpec) return [];
        const mainGunOperational = Boolean(
          target.vehicleComponents?.main_gun?.operational
          && target.vehicleComponents?.breech?.operational
          && target.hasOperationalGunner?.()
        );
        if (target.isCombatEffective() && mainGunOperational) return [];
        return [{
          attackerId: attacker.id,
          attackerFireState: attacker.vehicleWeapon?.fireState ?? null,
          targetId,
          targetCombatEffective: target.isCombatEffective(),
          targetMainGunOperational: mainGunOperational,
          targetMainGunStatus: target.vehicleComponents?.main_gun?.status ?? null,
          targetBreechStatus: target.vehicleComponents?.breech?.status ?? null,
          targetHasGunner: target.hasOperationalGunner?.() ?? null
        }];
      });
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
            unit.targetUnit || unit.vehicleWeapon?.targetUnitId || unit.targetPos
          )).length
        },
        vehicleCombat: {
          mainGunVehicles: mainGunVehicles.length,
          vehicleTypeCounts,
          vehiclesWithTargets: mainGunVehicles.filter(
            unit => unit.vehicleWeapon?.targetUnitId
          ).length,
          roundsFired: mainGunVehicles.reduce(
            (sum, unit) => sum + (unit.vehicleWeapon?.roundsFired ?? 0),
            0
          ),
          resolvedVehicleImpacts: vehicleImpacts.length,
          adaptiveAimVehicles: mainGunVehicles.filter(
            unit => (unit.vehicleEngagementLearning?.aimStep ?? 0) > 0
          ).length,
          ammoTrialVehicles: mainGunVehicles.filter(
            unit => unit.vehicleEngagementLearning?.ammoTrialRequested
          ).length,
          retargetRequestedVehicles: mainGunVehicles.filter(
            unit => unit.vehicleEngagementLearning?.retargetRequested
          ).length,
          vehiclesAdaptivelyRetargeted: mainGunVehicles.filter(
            unit => (unit.vehicleEngagementLearning?.adaptiveRetargetCount ?? 0) > 0
          ).length,
          adaptiveRetargets: mainGunVehicles.reduce(
            (sum, unit) => sum
              + (unit.vehicleEngagementLearning?.adaptiveRetargetCount ?? 0),
            0
          ),
          latestAdaptiveRetargets: mainGunVehicles
            .filter(unit => unit.vehicleEngagementLearning?.lastRetargetToUnitId)
            .sort((left, right) => String(left.id).localeCompare(String(right.id)))
            .slice(0, 20)
            .map(unit => ({
              unitId: unit.id,
              fromTargetUnitId:
                unit.vehicleEngagementLearning.lastRetargetFromUnitId,
              toTargetUnitId:
                unit.vehicleEngagementLearning.lastRetargetToUnitId
            })),
          maximumIneffectiveHits: Math.max(
            0,
            ...mainGunVehicles.map(
              unit => unit.vehicleEngagementLearning?.ineffectiveHits ?? 0
            )
          ),
          effectiveHits: mainGunVehicles.reduce(
            (sum, unit) => sum
              + (unit.vehicleEngagementLearning?.effectiveHits ?? 0),
            0
          ),
          retainedNeutralizedTargets
        },
        frame: app.frameProfiler.snapshot(),
        simulation: app.simulationPhaseProfiler.snapshot(),
        ballistics: app.combat?.ballistics?.getDiagnostics?.() ?? null,
        los: app.spotting?.getLosDiagnostics?.() ?? null,
        attention: app.spotting?.getAttentionDiagnostics?.() ?? null,
        renderer: app.renderer.getDiagnostics(),
        collision: {
          colliders: app.terrain?.collisionWorld?.colliders?.size ?? null,
          spatialCells: app.terrain?.collisionWorld?.spatialCells?.size ?? null
        }
      };
    })()`);
    const targetTrace = TRACE_VEHICLE_TARGETING
      ? await traceVehicleTargeting(session)
      : null;

    const report = {
      capturedAt: new Date().toISOString(),
      sampleSeconds: SAMPLE_SECONDS,
      profileMode: `${FORCE_CONTACT ? 'forced-contact' : 'ordinary'}-${PAUSE_SIMULATION ? 'paused' : 'realtime'}`,
      forceScale: TANK_STRESS_FORCE
        ? 'tank-stress-60-units-11-models'
        : (STRESS_FORCE ? 'stress-56-units-252-soldiers' : 'default'),
      qualityTier: QUALITY_TIER,
      shadowsEnabled: runtime.renderer.shadows,
      contactStaging,
      targetTrace,
      vehicleFiringAudit,
      vehicleFireControlTrace,
      runtime,
      cpuCategories: summarizeCpuCategories(profile),
      topCpuFunctions: summarizeCpuProfile(profile),
      topCpuFunctionsAll: summarizeCpuProfile(profile, { sourceOnly: false }),
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

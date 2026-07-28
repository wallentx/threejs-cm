import { CONTACT_CHANNEL, clonePosition } from './ContactState.js';
import {
  identificationProjection,
  normalizeIdentificationProgress,
  validateIdentificationProjection
} from './IdentificationQuality.js';

export const COMMUNICATION_RELAY_DELAY_APPROXIMATION =
  'first-report voice/radio delay gameplay approximation v1';

export const DEFAULT_COMMUNICATION_RELAY_DELAYS = Object.freeze({
  [CONTACT_CHANNEL.VOICE]: 1.5,
  [CONTACT_CHANNEL.RADIO]: 3
});

const RELAY_CHANNELS = new Set([
  CONTACT_CHANNEL.VOICE,
  CONTACT_CHANNEL.RADIO
]);

function stableId(value, field) {
  if ((typeof value !== 'string' && typeof value !== 'number')
      || (typeof value === 'number' && !Number.isFinite(value))
      || String(value).length === 0) {
    throw new TypeError(`${field} must be a stable string or number`);
  }
  return value;
}

function stableIdKey(value) {
  return `${typeof value}:${JSON.stringify(value)}`;
}

function routeKey(route) {
  return [
    route.senderUnitId,
    route.receiverUnitId,
    route.targetUnitId,
    route.channel
  ].map(stableIdKey).join('\u0000');
}

function validateRoute(route) {
  stableId(route?.senderUnitId, 'senderUnitId');
  stableId(route?.receiverUnitId, 'receiverUnitId');
  stableId(route?.targetUnitId, 'targetUnitId');
  if (!RELAY_CHANNELS.has(route?.channel)) {
    throw new TypeError('relay channel must be VOICE or RADIO');
  }
}

function positionValues(position) {
  return Array.isArray(position)
    ? [position[0], position[1], position[2]]
    : [position?.x, position?.y, position?.z];
}

function cloneReport(report, { projectIdentification = false } = {}) {
  const cloned = {
    senderUnitId: report.senderUnitId,
    receiverUnitId: report.receiverUnitId,
    targetUnitId: report.targetUnitId,
    sourceSoldierId: report.sourceSoldierId,
    targetSoldierId: report.targetSoldierId ?? null,
    episodeSequence: report.episodeSequence,
    channel: report.channel,
    confidence: report.confidence,
    identificationProgress: normalizeIdentificationProgress(
      report.identificationProgress ?? 0
    ),
    acquiredAt: report.acquiredAt,
    delaySeconds: report.delaySeconds,
    dueAt: report.dueAt,
    position: clonePosition(report.position),
    approximationLabel: report.approximationLabel
  };
  if (projectIdentification) {
    Object.assign(
      cloned,
      identificationProjection(cloned.identificationProgress)
    );
  }
  return cloned;
}

function validateReport(report) {
  validateRoute(report);
  stableId(report.sourceSoldierId, 'sourceSoldierId');
  if (report.targetSoldierId !== null && report.targetSoldierId !== undefined) {
    stableId(report.targetSoldierId, 'targetSoldierId');
  }
  if (!Number.isSafeInteger(report.episodeSequence) || report.episodeSequence <= 0) {
    throw new TypeError('episodeSequence must be a positive safe integer');
  }
  if (!Number.isFinite(report.confidence)
      || report.confidence < 0
      || report.confidence > 1) {
    throw new TypeError('relay confidence must be between zero and one');
  }
  normalizeIdentificationProgress(
    report.identificationProgress,
    'relay identificationProgress'
  );
  if (!Number.isFinite(report.acquiredAt) || report.acquiredAt < 0) {
    throw new TypeError('acquiredAt must be finite and non-negative');
  }
  if (!Number.isFinite(report.delaySeconds) || report.delaySeconds <= 0) {
    throw new TypeError('delaySeconds must be positive and finite');
  }
  if (!Number.isFinite(report.dueAt)
      || Math.abs(report.dueAt - (report.acquiredAt + report.delaySeconds)) > 1e-9) {
    throw new TypeError('dueAt must equal acquiredAt plus delaySeconds');
  }
  const position = positionValues(report.position);
  if (position.some(value => !Number.isFinite(value))) {
    throw new TypeError('relay position must contain finite x, y, and z values');
  }
  if (report.approximationLabel !== COMMUNICATION_RELAY_DELAY_APPROXIMATION) {
    throw new TypeError('relay report must retain the communication-delay approximation label');
  }
}

function cloneWatermark(watermark) {
  return {
    senderUnitId: watermark.senderUnitId,
    receiverUnitId: watermark.receiverUnitId,
    targetUnitId: watermark.targetUnitId,
    channel: watermark.channel,
    episodeSequence: watermark.episodeSequence
  };
}

function validateWatermark(watermark) {
  validateRoute(watermark);
  if (!Number.isSafeInteger(watermark.episodeSequence)
      || watermark.episodeSequence <= 0) {
    throw new TypeError('watermark episodeSequence must be a positive safe integer');
  }
}

function compareReports(left, right) {
  if (left.dueAt !== right.dueAt) return left.dueAt - right.dueAt;
  return routeKey(left).localeCompare(routeKey(right));
}

export class CommunicationRelayQueue {
  constructor() {
    this.pendingByRoute = new Map();
    this.deliveredByRoute = new Map();
  }

  enqueue(reportInput) {
    validateReport(reportInput);
    const report = cloneReport(reportInput);
    const key = routeKey(report);
    const delivered = this.deliveredByRoute.get(key);
    if (delivered?.episodeSequence >= report.episodeSequence) return false;
    const pending = this.pendingByRoute.get(key);
    if (pending?.episodeSequence >= report.episodeSequence) return false;
    this.pendingByRoute.set(key, report);
    return true;
  }

  pendingReports() {
    return [...this.pendingByRoute.values()]
      .sort(compareReports)
      .map(report => cloneReport(report));
  }

  cancel(report) {
    const key = routeKey(report);
    if (this.pendingByRoute.get(key)?.episodeSequence !== report.episodeSequence) {
      return false;
    }
    this.pendingByRoute.delete(key);
    return true;
  }

  markDelivered(report) {
    const key = routeKey(report);
    if (this.pendingByRoute.get(key)?.episodeSequence !== report.episodeSequence) {
      return false;
    }
    this.pendingByRoute.delete(key);
    const previous = this.deliveredByRoute.get(key);
    if (!previous || previous.episodeSequence < report.episodeSequence) {
      this.deliveredByRoute.set(key, cloneWatermark(report));
    }
    return true;
  }

  pruneMissingUnits(unitIds) {
    for (const [key, report] of this.pendingByRoute) {
      if (!unitIds.has(report.senderUnitId)
          || !unitIds.has(report.receiverUnitId)
          || !unitIds.has(report.targetUnitId)) {
        this.pendingByRoute.delete(key);
      }
    }
    for (const [key, watermark] of this.deliveredByRoute) {
      if (!unitIds.has(watermark.senderUnitId)
          || !unitIds.has(watermark.receiverUnitId)
          || !unitIds.has(watermark.targetUnitId)) {
        this.deliveredByRoute.delete(key);
      }
    }
  }

  captureState() {
    return {
      version: 2,
      pendingReports: [...this.pendingByRoute.values()]
        .sort((left, right) => routeKey(left).localeCompare(routeKey(right)))
        .map(report => cloneReport(report, {
          projectIdentification: true
        })),
      deliveredEpisodeWatermarks: [...this.deliveredByRoute.values()]
        .sort((left, right) => routeKey(left).localeCompare(routeKey(right)))
        .map(cloneWatermark)
    };
  }

  restoreState(state) {
    const version = state?.version ?? 1;
    if (version !== 1 && version !== 2) {
      throw new TypeError(
        `unsupported communication relay queue version ${state.version}`
      );
    }
    const pending = new Map();
    for (const saved of state?.pendingReports ?? []) {
      const identificationProgress = version === 2
        ? validateIdentificationProjection(saved, 'relay report identification')
        : 0;
      const migrated = {
        ...saved,
        identificationProgress
      };
      validateReport(migrated);
      const report = cloneReport(migrated);
      const key = routeKey(report);
      const previous = pending.get(key);
      if (!previous || previous.episodeSequence < report.episodeSequence) {
        pending.set(key, report);
      }
    }
    const delivered = new Map();
    for (const saved of state?.deliveredEpisodeWatermarks ?? []) {
      validateWatermark(saved);
      const watermark = cloneWatermark(saved);
      const key = routeKey(watermark);
      const previous = delivered.get(key);
      if (!previous || previous.episodeSequence < watermark.episodeSequence) {
        delivered.set(key, watermark);
      }
    }
    for (const [key, report] of pending) {
      const deliveredEpisodeSequence =
        delivered.get(key)?.episodeSequence;
      if (version === 2
          && deliveredEpisodeSequence === report.episodeSequence) {
        throw new TypeError(
          'communication relay queue version 2 cannot contain the same route and episode in pending and delivered state'
        );
      }
      // Version 1 snapshots predate the strict queue ownership contract.
      // Migrate their stale pending record by retaining the delivered state.
      if (deliveredEpisodeSequence >= report.episodeSequence) {
        pending.delete(key);
      }
    }
    this.pendingByRoute = pending;
    this.deliveredByRoute = delivered;
  }
}

const DEFAULT_MAX_CACHED_TEMPLATES = 64;
const MISSING_ASSET_ACTIONS = new Set(['throw', 'return-null', 'url']);
const LOADABLE_SCHEMES = new Set(['http', 'https', 'blob']);
const CLEANUP_FAILURE = Symbol('external-model-cleanup-failure');

function requireFunction(value, label) {
  if (typeof value !== 'function') {
    throw new TypeError(`ExternalModelAssetService ${label} must be a function`);
  }
  return value;
}

function requireCacheLimit(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(
      'ExternalModelAssetService maxCachedTemplates must be a positive integer'
    );
  }
  return value;
}

function requireCacheKey(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(
      'ExternalModelAssetService cacheKey must be a non-empty string'
    );
  }
  return value.trim();
}

function requireLoadableUrl(value, label = 'external model URL') {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  const url = value.trim();
  const schemeMatch = url.match(/^([a-z][a-z0-9+.-]*):/i);
  const malformedSchemeMatch = url.match(/^([^/?#]*):/);
  if (!schemeMatch && malformedSchemeMatch) {
    throw new TypeError(`${label} has a malformed explicit scheme`);
  }
  if (!schemeMatch) return url;

  const scheme = schemeMatch[1].toLowerCase();
  if (!LOADABLE_SCHEMES.has(scheme)) {
    throw new TypeError(`${label} uses unsupported scheme ${scheme}`);
  }
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== `${scheme}:`
      || ((scheme === 'http' || scheme === 'https') && !parsed.hostname)
      || (scheme === 'blob' && url.length === 'blob:'.length)
    ) {
      throw new TypeError();
    }
  } catch {
    throw new TypeError(`${label} has a malformed explicit scheme`);
  }
  return url;
}

function normalizeMissingAssetPolicy(policy) {
  const candidate = policy ?? { action: 'throw' };
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError(
      'ExternalModelAssetService missing asset policy must be a record'
    );
  }
  if (!MISSING_ASSET_ACTIONS.has(candidate.action)) {
    throw new TypeError(
      'ExternalModelAssetService missing asset action must be throw, return-null, or url'
    );
  }
  if (candidate.action !== 'url') {
    return Object.freeze({ action: candidate.action });
  }
  const onFailure = candidate.onFailure ?? 'throw';
  if (!['throw', 'return-null'].includes(onFailure)) {
    throw new TypeError(
      'ExternalModelAssetService fallback onFailure must be throw or return-null'
    );
  }
  return Object.freeze({
    action: 'url',
    url: requireLoadableUrl(
      candidate.url,
      'external model fallback URL'
    ),
    onFailure
  });
}

function copyAssetBinding(binding) {
  if (
    !binding
    || typeof binding !== 'object'
    || Array.isArray(binding)
    || typeof binding.logicalId !== 'string'
    || binding.logicalId.trim().length === 0
    || typeof binding.sourcePackId !== 'string'
    || binding.sourcePackId.trim().length === 0
  ) {
    throw new TypeError(
      'ExternalModelAssetService asset binding requires non-empty logicalId and sourcePackId'
    );
  }
  return Object.freeze({
    logicalId: binding.logicalId.trim(),
    sourcePackId: binding.sourcePackId.trim()
  });
}

function createIdentity(requestedUrl, fallbackPolicy, assetBinding) {
  return Object.freeze({
    requestedUrl,
    fallbackAction: fallbackPolicy.action,
    fallbackUrl: fallbackPolicy.action === 'url'
      ? fallbackPolicy.url
      : null,
    fallbackOnFailure: fallbackPolicy.action === 'url'
      ? fallbackPolicy.onFailure
      : null,
    logicalId: assetBinding.logicalId,
    sourcePackId: assetBinding.sourcePackId
  });
}

function identitiesMatch(left, right) {
  return left.requestedUrl === right.requestedUrl
    && left.fallbackAction === right.fallbackAction
    && left.fallbackUrl === right.fallbackUrl
    && left.fallbackOnFailure === right.fallbackOnFailure
    && left.logicalId === right.logicalId
    && left.sourcePackId === right.sourcePackId;
}

function requireIdentityMatch(actual, expected, cacheKey) {
  if (!identitiesMatch(actual, expected)) {
    throw new Error(
      `ExternalModelAssetService cache key identity collision for ${cacheKey}`
    );
  }
}

function isObjectReference(value) {
  return (
    value !== null
    && (typeof value === 'object' || typeof value === 'function')
  );
}

function requireTemplate(template) {
  if (!isObjectReference(template)) {
    throw new TypeError(
      'ExternalModelAssetService parseModel must return an opaque template object'
    );
  }
  return template;
}

function requireFetchedSource(source) {
  if (
    !source
    || typeof source !== 'object'
    || Array.isArray(source)
    || !Object.prototype.hasOwnProperty.call(source, 'payload')
    || !Object.prototype.hasOwnProperty.call(source, 'resolvedUrl')
  ) {
    throw new TypeError(
      'ExternalModelAssetService fetchSource must return payload and resolvedUrl'
    );
  }
  return source;
}

function appendError(errors, error) {
  if (error instanceof AggregateError) {
    for (const nested of error.errors) appendError(errors, nested);
  } else {
    errors.push(error);
  }
}

function combineErrors(errors, message) {
  const flattened = [];
  for (const error of errors) {
    if (error) appendError(flattened, error);
  }
  if (flattened.length === 1) return flattened[0];
  return new AggregateError(flattened, message);
}

function createCleanupFailure(errors, message) {
  const flattened = [];
  for (const error of errors) {
    if (error) appendError(flattened, error);
  }
  const failure = new AggregateError(flattened, message);
  Object.defineProperty(failure, CLEANUP_FAILURE, { value: true });
  return failure;
}

function isCleanupFailure(error) {
  return Boolean(error?.[CLEANUP_FAILURE]);
}

function disposedError(message = 'ExternalModelAssetService is disposed') {
  return new Error(message);
}

/**
 * Owns format-neutral source acquisition and parsed-template reuse while
 * leasing a distinct consumer instance to every caller.
 */
export class ExternalModelAssetService {
  constructor({
    fetchSource,
    releaseSource,
    parseModel,
    cloneModel,
    disposeInstance,
    disposeTemplate,
    disposePipeline,
    maxCachedTemplates = DEFAULT_MAX_CACHED_TEMPLATES,
    missingAssetPolicy = { action: 'throw' }
  } = {}) {
    this.fetchSourceImpl = requireFunction(fetchSource, 'fetchSource');
    this.releaseSourceImpl = requireFunction(releaseSource, 'releaseSource');
    this.parseModelImpl = requireFunction(parseModel, 'parseModel');
    this.cloneModelImpl = requireFunction(cloneModel, 'cloneModel');
    this.disposeInstanceImpl = requireFunction(
      disposeInstance,
      'disposeInstance'
    );
    this.disposeTemplateImpl = requireFunction(
      disposeTemplate,
      'disposeTemplate'
    );
    this.disposePipelineImpl = requireFunction(
      disposePipeline,
      'disposePipeline'
    );
    this.maxCachedTemplates = requireCacheLimit(maxCachedTemplates);
    this.missingAssetPolicy = normalizeMissingAssetPolicy(missingAssetPolicy);

    this.cachedTemplates = new Map();
    this.pending = new Map();
    this.templateRecords = new Set();
    this.activeHandles = new Set();
    this.activeLoads = new Set();
    this.shutdownCleanupErrors = [];
    this.deferTemplateDisposal = false;
    this.disposed = false;
    this.disposeStarted = false;
    this.disposePromise = null;
  }

  load(url, options = {}) {
    let loadPromise;
    loadPromise = Promise.resolve().then(() => this.loadValidated(url, options));
    this.activeLoads.add(loadPromise);
    loadPromise.then(
      () => this.activeLoads.delete(loadPromise),
      () => this.activeLoads.delete(loadPromise)
    );
    return loadPromise;
  }

  async loadValidated(url, {
    cacheKey = url,
    fallbackPolicy = this.missingAssetPolicy,
    assetBinding
  } = {}) {
    if (this.disposed) throw disposedError();

    const requestedUrl = requireLoadableUrl(url);
    const normalizedCacheKey = requireCacheKey(cacheKey);
    const normalizedPolicy = normalizeMissingAssetPolicy(fallbackPolicy);
    const copiedBinding = copyAssetBinding(assetBinding);
    const identity = createIdentity(
      requestedUrl,
      normalizedPolicy,
      copiedBinding
    );

    const cached = this.cachedTemplates.get(normalizedCacheKey);
    if (cached) {
      requireIdentityMatch(cached.identity, identity, normalizedCacheKey);
      const handle = this.createHandle(cached, false);
      if (this.cachedTemplates.get(normalizedCacheKey) === cached) {
        this.cachedTemplates.delete(normalizedCacheKey);
        this.cachedTemplates.set(normalizedCacheKey, cached);
      }
      return handle;
    }

    const inFlight = this.pending.get(normalizedCacheKey);
    if (inFlight) {
      requireIdentityMatch(inFlight.identity, identity, normalizedCacheKey);
      this.reservePendingLease(inFlight);
      return this.consumePending(inFlight);
    }

    const controller = new AbortController();
    const pendingEntry = {
      assetBinding: copiedBinding,
      cacheKey: normalizedCacheKey,
      controller,
      fallbackPolicy: normalizedPolicy,
      identity,
      promise: null,
      record: null,
      requestedUrl,
      reservations: 1
    };
    let pendingPromise;
    pendingPromise = this.acquireTemplate(pendingEntry).finally(() => {
      if (this.pending.get(normalizedCacheKey)?.promise === pendingPromise) {
        this.pending.delete(normalizedCacheKey);
      }
    });
    pendingEntry.promise = pendingPromise;
    this.pending.set(normalizedCacheKey, pendingEntry);
    return this.consumePending(pendingEntry);
  }

  reservePendingLease(entry) {
    if (entry.record) {
      entry.record.leases++;
    } else {
      entry.reservations++;
    }
  }

  async consumePending(entry) {
    const record = await entry.promise;
    if (record === null) return null;
    return this.createHandle(record, true);
  }

  async runAttempt(url, entry, usedFallback) {
    const { controller } = entry;
    let source;
    let sourceAcquired = false;
    let template = null;
    let resolvedUrl = null;
    let operationError = null;
    let releaseError = null;

    try {
      source = await this.fetchSourceImpl(url, {
        signal: controller.signal
      });
      sourceAcquired = true;
      if (this.disposed || controller.signal.aborted) {
        throw disposedError(
          'ExternalModelAssetService was disposed during source fetch'
        );
      }
      const fetchedSource = requireFetchedSource(source);
      resolvedUrl = requireLoadableUrl(
        fetchedSource.resolvedUrl,
        'external model resolved URL'
      );
      const context = Object.freeze({
        signal: controller.signal,
        cacheKey: entry.cacheKey,
        requestedUrl: entry.requestedUrl,
        loadUrl: url,
        resolvedUrl,
        usedFallback,
        assetBinding: entry.assetBinding,
        logicalId: entry.assetBinding.logicalId,
        sourcePackId: entry.assetBinding.sourcePackId
      });
      template = requireTemplate(
        await this.parseModelImpl(fetchedSource.payload, context)
      );
      if (this.disposed || controller.signal.aborted) {
        throw disposedError(
          'ExternalModelAssetService was disposed during model parse'
        );
      }
    } catch (error) {
      operationError = error;
    }

    if (sourceAcquired) {
      try {
        await this.releaseSourceImpl(source);
      } catch (error) {
        releaseError = error;
        if (this.disposed || controller.signal.aborted) {
          appendError(this.shutdownCleanupErrors, error);
        }
      }
    }

    if (
      !operationError
      && (this.disposed || controller.signal.aborted)
    ) {
      operationError = disposedError(
        'ExternalModelAssetService was disposed during source release'
      );
    }

    if (operationError || releaseError) {
      const errors = [operationError, releaseError];
      let templateCleanupError = null;
      if (template) {
        try {
          this.disposeLooseTemplate(template);
        } catch (error) {
          templateCleanupError = error;
          errors.push(error);
          if (this.disposed || controller.signal.aborted) {
            appendError(this.shutdownCleanupErrors, error);
          }
        }
      }
      if (releaseError || templateCleanupError) {
        throw createCleanupFailure(
          errors,
          `External model cleanup failed for ${url}`
        );
      }
      throw combineErrors(
        errors,
        `External model attempt failed for ${url}`
      );
    }

    return {
      resolvedUrl,
      template,
      usedFallback
    };
  }

  async acquireTemplate(entry) {
    let acquired;
    let primaryError;
    try {
      acquired = await this.runAttempt(
        entry.requestedUrl,
        entry,
        false
      );
    } catch (error) {
      primaryError = error;
    }

    if (primaryError) {
      if (this.disposed || entry.controller.signal.aborted) {
        throw disposedError(
          'ExternalModelAssetService was disposed during load'
        );
      }
      if (isCleanupFailure(primaryError)) throw primaryError;
      if (entry.fallbackPolicy.action === 'return-null') return null;
      if (entry.fallbackPolicy.action === 'throw') throw primaryError;
      try {
        acquired = await this.runAttempt(
          entry.fallbackPolicy.url,
          entry,
          true
        );
      } catch (fallbackError) {
        if (this.disposed || entry.controller.signal.aborted) {
          throw disposedError(
            'ExternalModelAssetService was disposed during fallback load'
          );
        }
        if (isCleanupFailure(fallbackError)) throw fallbackError;
        if (entry.fallbackPolicy.onFailure === 'return-null') return null;
        throw new AggregateError(
          [primaryError, fallbackError],
          `Failed to load external model ${entry.requestedUrl} and fallback ${entry.fallbackPolicy.url}`
        );
      }
    }

    if (this.disposed || entry.controller.signal.aborted) {
      try {
        this.disposeLooseTemplate(acquired.template);
      } catch (error) {
        appendError(this.shutdownCleanupErrors, error);
      }
      throw disposedError(
        'ExternalModelAssetService was disposed before template caching'
      );
    }

    const record = {
      assetBinding: entry.assetBinding,
      cacheKey: entry.cacheKey,
      cloneIdentities: new WeakSet(),
      disposed: false,
      identity: entry.identity,
      leases: entry.reservations,
      requestedUrl: entry.requestedUrl,
      resolvedUrl: acquired.resolvedUrl,
      retired: false,
      template: acquired.template,
      usedFallback: acquired.usedFallback
    };
    this.templateRecords.add(record);
    this.cachedTemplates.set(entry.cacheKey, record);

    try {
      this.enforceCacheLimit();
    } catch (evictionError) {
      const errors = [evictionError];
      if (this.cachedTemplates.get(entry.cacheKey) === record) {
        this.cachedTemplates.delete(entry.cacheKey);
      }
      record.retired = true;
      record.leases = 0;
      try {
        this.disposeTemplateRecord(record);
      } catch (error) {
        errors.push(error);
      }
      throw combineErrors(
        errors,
        'Failed to enforce external model template cache limit'
      );
    }

    entry.record = record;
    return record;
  }

  createHandle(record, leaseReserved) {
    if (record.disposed) {
      if (leaseReserved) this.releaseLease(record);
      throw new Error(
        'ExternalModelAssetService template is no longer available'
      );
    }
    if (!leaseReserved) record.leases++;

    if (this.disposed) {
      const errors = [
        disposedError(
          'ExternalModelAssetService was disposed before model cloning'
        )
      ];
      try {
        this.releaseLease(record);
      } catch (error) {
        errors.push(error);
        appendError(this.shutdownCleanupErrors, error);
      }
      throw combineErrors(
        errors,
        'External model lease was cancelled during service disposal'
      );
    }

    let model;
    let cloneError = null;
    try {
      model = this.cloneModelImpl(record.template);
      if (
        !isObjectReference(model)
        || model === record.template
        || record.cloneIdentities.has(model)
      ) {
        throw new TypeError(
          'ExternalModelAssetService cloneModel must return a distinct consumer instance'
        );
      }
    } catch (error) {
      cloneError = error;
    }

    if (cloneError) {
      const errors = [cloneError];
      try {
        this.releaseLease(record);
      } catch (error) {
        errors.push(error);
      }
      throw combineErrors(errors, 'Failed to clone external model template');
    }

    record.cloneIdentities.add(model);
    if (this.disposed) {
      const errors = [
        disposedError(
          'ExternalModelAssetService was disposed during model cloning'
        )
      ];
      try {
        this.disposeInstanceImpl(model);
      } catch (error) {
        errors.push(error);
        appendError(this.shutdownCleanupErrors, error);
      }
      try {
        this.releaseLease(record);
      } catch (error) {
        errors.push(error);
        appendError(this.shutdownCleanupErrors, error);
      }
      throw combineErrors(
        errors,
        'External model clone completed during service disposal'
      );
    }

    const state = { disposed: false };
    let handle;
    handle = Object.freeze({
      kind: 'external-model-resource',
      model,
      requestedUrl: record.requestedUrl,
      resolvedUrl: record.resolvedUrl,
      usedFallback: record.usedFallback,
      assetBinding: record.assetBinding,
      logicalId: record.assetBinding.logicalId,
      sourcePackId: record.assetBinding.sourcePackId,
      dispose: () => this.disposeHandle(handle, record, model, state)
    });
    this.activeHandles.add(handle);
    return handle;
  }

  disposeHandle(handle, record, model, state) {
    if (state.disposed) return false;
    state.disposed = true;
    this.activeHandles.delete(handle);
    const errors = [];
    try {
      this.disposeInstanceImpl(model);
    } catch (error) {
      appendError(errors, error);
    }
    try {
      this.releaseLease(record);
    } catch (error) {
      appendError(errors, error);
    }
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        'Failed to dispose external model resource'
      );
    }
    return true;
  }

  releaseLease(record) {
    if (record.leases <= 0) {
      throw new Error(
        'ExternalModelAssetService template lease underflow'
      );
    }
    record.leases--;
    if (
      record.leases === 0
      && record.retired
      && !this.deferTemplateDisposal
    ) {
      this.disposeTemplateRecord(record);
    }
  }

  retireTemplate(record) {
    if (record.retired) return;
    record.retired = true;
    if (this.cachedTemplates.get(record.cacheKey) === record) {
      this.cachedTemplates.delete(record.cacheKey);
    }
    if (
      record.leases === 0
      && !this.deferTemplateDisposal
    ) {
      this.disposeTemplateRecord(record);
    }
  }

  disposeLooseTemplate(template) {
    this.disposeTemplateImpl(template);
  }

  disposeTemplateRecord(record) {
    if (record.disposed) return false;
    record.disposed = true;
    this.templateRecords.delete(record);
    if (this.cachedTemplates.get(record.cacheKey) === record) {
      this.cachedTemplates.delete(record.cacheKey);
    }
    this.disposeTemplateImpl(record.template);
    return true;
  }

  enforceCacheLimit() {
    const errors = [];
    while (this.cachedTemplates.size > this.maxCachedTemplates) {
      const oldest = this.cachedTemplates.values().next().value;
      try {
        this.retireTemplate(oldest);
      } catch (error) {
        appendError(errors, error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        'Failed to evict external model templates'
      );
    }
  }

  dispose() {
    if (this.disposeStarted) {
      return this.disposePromise.then(
        () => false,
        () => false
      );
    }
    this.disposeStarted = true;
    this.disposed = true;
    for (const entry of this.pending.values()) {
      entry.controller.abort();
    }
    this.disposePromise = this.performDisposal();
    return this.disposePromise;
  }

  async performDisposal() {
    await Promise.resolve();
    const errors = [];

    this.deferTemplateDisposal = true;
    for (const record of [...this.cachedTemplates.values()]) {
      try {
        this.retireTemplate(record);
      } catch (error) {
        appendError(errors, error);
      }
    }
    this.cachedTemplates.clear();
    for (const handle of [...this.activeHandles]) {
      try {
        handle.dispose();
      } catch (error) {
        appendError(errors, error);
      }
    }
    this.deferTemplateDisposal = false;
    for (const record of [...this.templateRecords]) {
      if (record.leases !== 0) continue;
      try {
        this.disposeTemplateRecord(record);
      } catch (error) {
        appendError(errors, error);
      }
    }

    const pendingWork = [
      ...[...this.pending.values()].map(entry => entry.promise),
      ...this.activeLoads
    ];
    await Promise.allSettled(pendingWork);
    await Promise.resolve();

    for (const handle of [...this.activeHandles]) {
      try {
        handle.dispose();
      } catch (error) {
        appendError(errors, error);
      }
    }
    for (const record of [...this.templateRecords]) {
      if (record.leases !== 0) continue;
      try {
        this.disposeTemplateRecord(record);
      } catch (error) {
        appendError(errors, error);
      }
    }
    for (const error of this.shutdownCleanupErrors) {
      appendError(errors, error);
    }
    this.shutdownCleanupErrors.length = 0;
    this.pending.clear();
    this.activeLoads.clear();

    try {
      await this.disposePipelineImpl();
    } catch (error) {
      appendError(errors, error);
    }

    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        'Failed to dispose ExternalModelAssetService'
      );
    }
    return true;
  }
}

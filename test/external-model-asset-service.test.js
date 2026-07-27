import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ExternalModelAssetService } from '../src/assets/ExternalModelAssetService.js';

const TEST_BINDING = Object.freeze({
  logicalId: 'test.model',
  sourcePackId: 'test-pack'
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function loadOptions(cacheKey, overrides = {}) {
  return {
    cacheKey,
    assetBinding: TEST_BINDING,
    ...overrides
  };
}

function createHarness({
  cloneModel,
  disposeInstance,
  disposePipeline,
  disposeTemplate,
  fetchSource,
  maxCachedTemplates = 3,
  missingAssetPolicy,
  parseModel,
  releaseSource
} = {}) {
  const calls = {
    clone: [],
    fetch: [],
    instanceDisposals: [],
    order: [],
    parse: [],
    pipelineDisposals: 0,
    sourceReleases: [],
    templateDisposals: []
  };
  let sourceSequence = 0;
  let templateSequence = 0;
  let cloneSequence = 0;
  const service = new ExternalModelAssetService({
    async fetchSource(url, { signal }) {
      calls.fetch.push({ signal, url });
      calls.order.push(`fetch:${url}`);
      if (fetchSource) {
        return fetchSource(url, { calls, signal });
      }
      sourceSequence++;
      return {
        payload: { sourceId: sourceSequence, url },
        resolvedUrl: url
      };
    },
    async releaseSource(source) {
      calls.sourceReleases.push(source);
      calls.order.push(`release-source:${source?.payload?.url ?? 'unknown'}`);
      return releaseSource?.(source, { calls });
    },
    async parseModel(payload, context) {
      calls.parse.push({ context, payload });
      calls.order.push(`parse:${payload?.url ?? 'unknown'}`);
      if (parseModel) {
        return parseModel(payload, context, { calls });
      }
      templateSequence++;
      return {
        sourceId: payload.sourceId,
        templateId: templateSequence,
        url: payload.url
      };
    },
    cloneModel(template) {
      calls.clone.push(template);
      calls.order.push(`clone:${template?.url ?? 'unknown'}`);
      if (cloneModel) {
        return cloneModel(template, { calls });
      }
      cloneSequence++;
      return {
        cloneId: cloneSequence,
        templateId: template.templateId,
        url: template.url
      };
    },
    disposeInstance(instance) {
      calls.instanceDisposals.push(instance);
      calls.order.push(`dispose-instance:${instance?.url ?? 'unknown'}`);
      return disposeInstance?.(instance, { calls });
    },
    disposeTemplate(template) {
      calls.templateDisposals.push(template);
      calls.order.push(`dispose-template:${template?.url ?? 'unknown'}`);
      return disposeTemplate?.(template, { calls });
    },
    async disposePipeline() {
      calls.pipelineDisposals++;
      calls.order.push('dispose-pipeline');
      return disposePipeline?.({ calls });
    },
    maxCachedTemplates,
    missingAssetPolicy
  });
  return { calls, service };
}

test('constructor, URL, cache-key, policy, and asset-binding inputs are validated', async () => {
  const valid = {
    fetchSource() {},
    releaseSource() {},
    parseModel() {},
    cloneModel() {},
    disposeInstance() {},
    disposeTemplate() {},
    disposePipeline() {},
    maxCachedTemplates: 1
  };
  for (const dependency of [
    'fetchSource',
    'releaseSource',
    'parseModel',
    'cloneModel',
    'disposeInstance',
    'disposeTemplate',
    'disposePipeline'
  ]) {
    assert.throws(
      () => new ExternalModelAssetService({
        ...valid,
        [dependency]: undefined
      }),
      new RegExp(`${dependency} must be a function`)
    );
  }
  for (const maxCachedTemplates of [0, -1, 1.5, Number.NaN]) {
    assert.throws(
      () => new ExternalModelAssetService({
        ...valid,
        maxCachedTemplates
      }),
      /maxCachedTemplates must be a positive integer/
    );
  }
  assert.throws(
    () => new ExternalModelAssetService({
      ...valid,
      missingAssetPolicy: { action: 'sometimes' }
    }),
    /action must be throw, return-null, or url/
  );

  const { calls, service } = createHarness();
  for (const url of [
    '',
    'javascript:alert(1)',
    'file:///tmp/model.glb',
    'data:model/gltf-binary;base64,AAAA',
    'chrome-extension://test/model.glb',
    '1http://malformed.example/model.glb'
  ]) {
    await assert.rejects(
      service.load(url, loadOptions(`unsafe:${url}`)),
      /URL|scheme/
    );
  }
  await assert.rejects(
    service.load('/model.bin', {
      cacheKey: '',
      assetBinding: TEST_BINDING
    }),
    /cacheKey must be a non-empty string/
  );
  await assert.rejects(
    service.load('/model.bin', { cacheKey: 'missing-binding' }),
    /asset binding requires non-empty logicalId and sourcePackId/
  );
  await assert.rejects(
    service.load('/model.bin', {
      cacheKey: 'bad-binding',
      assetBinding: { logicalId: '', sourcePackId: 'pack' }
    }),
    /asset binding requires non-empty logicalId and sourcePackId/
  );
  assert.equal(calls.fetch.length, 0);
  assert.equal(await service.dispose(), true);
});

test('concurrent and cached exact matches share acquisition but return fresh frozen handles', async () => {
  const fetchGate = deferred();
  const { calls, service } = createHarness({
    async fetchSource(url, { signal }) {
      await fetchGate.promise;
      return {
        payload: { sourceId: 1, url },
        resolvedUrl: 'https://cdn.example.test/model.bin'
      };
    }
  });
  const options = loadOptions('model:shared');
  const firstPending = service.load('/model.bin', options);
  const secondPending = service.load('/model.bin', options);
  await Promise.resolve();

  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.fetch[0].signal instanceof AbortSignal, true);
  fetchGate.resolve();
  const [first, second] = await Promise.all([firstPending, secondPending]);
  const cached = await service.load('/model.bin', options);

  assert.notEqual(first, second);
  assert.notEqual(first.model, second.model);
  assert.notEqual(cached, first);
  assert.notEqual(cached.model, first.model);
  assert.notEqual(cached.model, second.model);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(first.kind, 'external-model-resource');
  assert.equal(first.requestedUrl, '/model.bin');
  assert.equal(first.resolvedUrl, 'https://cdn.example.test/model.bin');
  assert.equal(first.usedFallback, false);
  assert.deepEqual(first.assetBinding, TEST_BINDING);
  assert.notEqual(first.assetBinding, TEST_BINDING);
  assert.equal(Object.isFrozen(first.assetBinding), true);
  assert.equal(first.logicalId, 'test.model');
  assert.equal(first.sourcePackId, 'test-pack');
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.parse.length, 1);
  assert.equal(calls.sourceReleases.length, 1);
  assert.equal(calls.clone.length, 3);

  assert.equal(first.dispose(), true);
  assert.equal(first.dispose(), false);
  assert.equal(second.dispose(), true);
  assert.equal(cached.dispose(), true);
  assert.equal(calls.instanceDisposals.length, 3);
  assert.equal(calls.templateDisposals.length, 0);
  assert.equal(await service.dispose(), true);
  assert.equal(calls.templateDisposals.length, 1);
});

test('cached and pending cache-key collisions are rejected before additional pipeline work', async () => {
  const { calls, service } = createHarness();
  const cached = await service.load('/cached.bin', loadOptions('shared'));
  const fetchCount = calls.fetch.length;
  const cloneCount = calls.clone.length;

  await assert.rejects(
    service.load('/different.bin', loadOptions('shared')),
    /cache key identity collision/
  );
  await assert.rejects(
    service.load('/cached.bin', loadOptions('shared', {
      fallbackPolicy: { action: 'return-null' }
    })),
    /cache key identity collision/
  );
  await assert.rejects(
    service.load('/cached.bin', loadOptions('shared', {
      assetBinding: {
        logicalId: 'different.model',
        sourcePackId: 'test-pack'
      }
    })),
    /cache key identity collision/
  );
  await assert.rejects(
    service.load('javascript:cached()', loadOptions('shared')),
    /unsupported scheme javascript/
  );
  await assert.rejects(
    service.load('/cached.bin', loadOptions('shared', {
      fallbackPolicy: {
        action: 'url',
        url: 'file:///tmp/fallback.bin'
      }
    })),
    /unsupported scheme file/
  );
  assert.equal(calls.fetch.length, fetchCount);
  assert.equal(calls.clone.length, cloneCount);

  const pendingGate = deferred();
  const pendingHarness = createHarness({
    async fetchSource(url) {
      await pendingGate.promise;
      return {
        payload: { sourceId: 1, url },
        resolvedUrl: url
      };
    }
  });
  const pending = pendingHarness.service.load(
    '/pending.bin',
    loadOptions('pending')
  );
  await Promise.resolve();
  await assert.rejects(
    pendingHarness.service.load(
      '/collision.bin',
      loadOptions('pending')
    ),
    /cache key identity collision/
  );
  assert.equal(pendingHarness.calls.fetch.length, 1);
  pendingGate.resolve();
  const handle = await pending;
  handle.dispose();
  await pendingHarness.service.dispose();
  cached.dispose();
  await service.dispose();
});

test('unsafe fetched resolved URLs release their source, skip parse, and remain retryable', async () => {
  let unsafe = true;
  const { calls, service } = createHarness({
    fetchSource(url) {
      return {
        payload: { sourceId: 1, url },
        resolvedUrl: unsafe
          ? 'data:model/gltf-binary;base64,AAAA'
          : 'blob:retry-model'
      };
    }
  });
  const options = loadOptions('resolved-url');

  await assert.rejects(
    service.load('/model.bin', options),
    /unsupported scheme data/
  );
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.sourceReleases.length, 1);
  assert.equal(calls.parse.length, 0);
  assert.equal(calls.clone.length, 0);

  unsafe = false;
  const retry = await service.load('/model.bin', options);
  assert.equal(retry.resolvedUrl, 'blob:retry-model');
  assert.equal(calls.fetch.length, 2);
  assert.equal(calls.sourceReleases.length, 2);
  assert.equal(calls.parse.length, 1);
  retry.dispose();
  await service.dispose();
});

test('throw, return-null, fallback, aggregate failure, parse failure, and retry are explicit', async () => {
  const failures = new Set([
    '/primary-fetch-failure.bin',
    '/fallback-fetch-failure.bin'
  ]);
  const parseFailures = new Set(['/primary-parse-failure.bin']);
  const { calls, service } = createHarness({
    fetchSource(url) {
      if (failures.has(url)) throw new Error(`fetch failed: ${url}`);
      return {
        payload: { sourceId: calls.fetch.length, url },
        resolvedUrl: url
      };
    },
    parseModel(payload) {
      if (parseFailures.has(payload.url)) {
        throw new Error(`parse failed: ${payload.url}`);
      }
      return {
        templateId: calls.parse.length,
        url: payload.url
      };
    }
  });

  const fallback = await service.load(
    '/primary-parse-failure.bin',
    loadOptions('fallback-success', {
      fallbackPolicy: {
        action: 'url',
        url: '/fallback.bin',
        onFailure: 'throw'
      }
    })
  );
  assert.equal(fallback.requestedUrl, '/primary-parse-failure.bin');
  assert.equal(fallback.resolvedUrl, '/fallback.bin');
  assert.equal(fallback.usedFallback, true);
  assert.deepEqual(
    calls.sourceReleases.map(source => source.payload.url),
    ['/primary-parse-failure.bin', '/fallback.bin']
  );

  const unavailable = await service.load(
    '/primary-fetch-failure.bin',
    loadOptions('nullable', {
      fallbackPolicy: { action: 'return-null' }
    })
  );
  assert.equal(unavailable, null);
  failures.delete('/primary-fetch-failure.bin');
  const retry = await service.load(
    '/primary-fetch-failure.bin',
    loadOptions('nullable', {
      fallbackPolicy: { action: 'return-null' }
    })
  );
  assert.equal(retry.usedFallback, false);

  let aggregate;
  await assert.rejects(
    service.load(
      '/primary-parse-failure.bin',
      loadOptions('fallback-failure', {
        fallbackPolicy: {
          action: 'url',
          url: '/fallback-fetch-failure.bin',
          onFailure: 'throw'
        }
      })
    ),
    error => {
      aggregate = error;
      return error instanceof AggregateError;
    }
  );
  assert.equal(aggregate.errors.length, 2);
  assert.match(aggregate.errors[0].message, /parse failed/);
  assert.match(aggregate.errors[1].message, /fetch failed/);

  const fallbackNull = await service.load(
    '/primary-parse-failure.bin',
    loadOptions('fallback-null', {
      fallbackPolicy: {
        action: 'url',
        url: '/fallback-fetch-failure.bin',
        onFailure: 'return-null'
      }
    })
  );
  assert.equal(fallbackNull, null);

  fallback.dispose();
  retry.dispose();
  await service.dispose();
});

test('successful acquisition cleanup failures bypass fallback and return-null policies', async () => {
  for (const [label, fallbackPolicy] of [
    ['return-null', { action: 'return-null' }],
    ['fallback-url', {
      action: 'url',
      url: '/must-not-load-fallback.bin',
      onFailure: 'return-null'
    }]
  ]) {
    const harness = createHarness({
      releaseSource() {
        throw new Error(`source release failed: ${label}`);
      }
    });
    let cleanupError;
    await assert.rejects(
      harness.service.load(
        '/primary-success.bin',
        loadOptions(`cleanup:${label}`, { fallbackPolicy })
      ),
      error => {
        cleanupError = error;
        return error instanceof AggregateError;
      }
    );
    assert.deepEqual(
      cleanupError.errors.map(error => error.message),
      [`source release failed: ${label}`]
    );
    assert.deepEqual(
      harness.calls.fetch.map(call => call.url),
      ['/primary-success.bin']
    );
    assert.equal(harness.calls.parse.length, 1);
    assert.equal(harness.calls.sourceReleases.length, 1);
    assert.equal(harness.calls.templateDisposals.length, 1);
    assert.equal(harness.calls.clone.length, 0);
    assert.equal(await harness.service.dispose(), true);
  }

  const fallbackHarness = createHarness({
    fetchSource(url) {
      if (url === '/primary-failure.bin') {
        throw new Error('primary fetch failed');
      }
      return {
        payload: { sourceId: 1, url },
        resolvedUrl: url
      };
    },
    releaseSource() {
      throw new Error('fallback source release failed');
    }
  });
  let fallbackCleanupError;
  await assert.rejects(
    fallbackHarness.service.load(
      '/primary-failure.bin',
      loadOptions('fallback-cleanup', {
        fallbackPolicy: {
          action: 'url',
          url: '/fallback-success.bin',
          onFailure: 'return-null'
        }
      })
    ),
    error => {
      fallbackCleanupError = error;
      return error instanceof AggregateError;
    }
  );
  assert.deepEqual(
    fallbackCleanupError.errors.map(error => error.message),
    ['fallback source release failed']
  );
  assert.deepEqual(
    fallbackHarness.calls.fetch.map(call => call.url),
    ['/primary-failure.bin', '/fallback-success.bin']
  );
  assert.equal(fallbackHarness.calls.parse.length, 1);
  assert.equal(fallbackHarness.calls.sourceReleases.length, 1);
  assert.equal(fallbackHarness.calls.templateDisposals.length, 1);
  assert.equal(await fallbackHarness.service.dispose(), true);
});

test('clone failures and invalid clone identity do not poison a cached template', async () => {
  let cloneAttempt = 0;
  let priorClone;
  const { calls, service } = createHarness({
    cloneModel(template) {
      cloneAttempt++;
      if (cloneAttempt === 1) throw new Error('clone failed');
      if (cloneAttempt === 2) return template;
      if (cloneAttempt === 3) {
        priorClone = { url: template.url };
        return priorClone;
      }
      if (cloneAttempt === 4) return priorClone;
      return { url: template.url };
    }
  });
  const options = loadOptions('clone-retry');

  await assert.rejects(service.load('/clone.bin', options), /clone failed/);
  await assert.rejects(
    service.load('/clone.bin', options),
    /cloneModel must return a distinct consumer instance/
  );
  const valid = await service.load('/clone.bin', options);
  await assert.rejects(
    service.load('/clone.bin', options),
    /cloneModel must return a distinct consumer instance/
  );
  const retry = await service.load('/clone.bin', options);

  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.parse.length, 1);
  assert.equal(calls.clone.length, 5);
  assert.notEqual(retry.model, valid.model);
  valid.dispose();
  retry.dispose();
  await service.dispose();
});

test('true LRU eviction retires leased templates and disposes them after the final handle', async () => {
  const { calls, service } = createHarness({ maxCachedTemplates: 2 });
  const a = await service.load('/a.bin', loadOptions('a'));
  const b = await service.load('/b.bin', loadOptions('b'));
  const aAgain = await service.load('/a.bin', loadOptions('a'));
  const c = await service.load('/c.bin', loadOptions('c'));

  assert.equal(calls.fetch.length, 3);
  assert.equal(calls.templateDisposals.length, 0);
  assert.equal(b.dispose(), true);
  assert.deepEqual(
    calls.templateDisposals.map(template => template.url),
    ['/b.bin']
  );

  a.dispose();
  aAgain.dispose();
  c.dispose();
  const reloadedB = await service.load('/b.bin', loadOptions('b'));
  assert.equal(calls.fetch.length, 4);
  assert.deepEqual(
    calls.templateDisposals.map(template => template.url),
    ['/b.bin', '/a.bin']
  );
  reloadedB.dispose();
  await service.dispose();
  assert.deepEqual(
    calls.templateDisposals.map(template => template.url),
    ['/b.bin', '/a.bin', '/c.bin', '/b.bin']
  );
});

test('disposal during fetch aborts the underlying load and disposes the pipeline last', async () => {
  let observedSignal;
  const { calls, service } = createHarness({
    fetchSource(url, { signal }) {
      observedSignal = signal;
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          const error = new Error(`aborted: ${url}`);
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    }
  });
  const pending = service.load('/pending.bin', loadOptions('pending-fetch'));
  await Promise.resolve();
  const disposing = service.dispose();

  assert.equal(observedSignal.aborted, true);
  await assert.rejects(pending, /disposed|aborted/);
  assert.equal(await disposing, true);
  assert.equal(calls.parse.length, 0);
  assert.equal(calls.clone.length, 0);
  assert.equal(calls.pipelineDisposals, 1);
  assert.equal(calls.order.at(-1), 'dispose-pipeline');
  await assert.rejects(
    service.load('/later.bin', loadOptions('later')),
    /disposed/
  );
  assert.equal(calls.fetch.length, 1);
  assert.equal(await service.dispose(), false);
});

test('late fetch and parse settlements release sources and templates without caching or cloning', async () => {
  const fetchGate = deferred();
  const lateFetch = createHarness({
    async fetchSource(url) {
      await fetchGate.promise;
      return {
        payload: { sourceId: 1, url },
        resolvedUrl: url
      };
    }
  });
  const pendingFetch = lateFetch.service.load(
    '/late-fetch.bin',
    loadOptions('late-fetch')
  );
  await Promise.resolve();
  const disposeFetch = lateFetch.service.dispose();
  fetchGate.resolve();

  await assert.rejects(pendingFetch, /disposed/);
  assert.equal(await disposeFetch, true);
  assert.equal(lateFetch.calls.sourceReleases.length, 1);
  assert.equal(lateFetch.calls.parse.length, 0);
  assert.equal(lateFetch.calls.clone.length, 0);
  assert.equal(lateFetch.calls.order.at(-1), 'dispose-pipeline');

  const parseGate = deferred();
  const lateParse = createHarness({
    async parseModel(payload) {
      await parseGate.promise;
      return { templateId: 1, url: payload.url };
    }
  });
  const pendingParse = lateParse.service.load(
    '/late-parse.bin',
    loadOptions('late-parse')
  );
  while (lateParse.calls.parse.length === 0) await Promise.resolve();
  const disposeParse = lateParse.service.dispose();
  assert.equal(lateParse.calls.pipelineDisposals, 0);
  parseGate.resolve();

  await assert.rejects(pendingParse, /disposed/);
  assert.equal(await disposeParse, true);
  assert.equal(lateParse.calls.sourceReleases.length, 1);
  assert.equal(lateParse.calls.templateDisposals.length, 1);
  assert.equal(lateParse.calls.clone.length, 0);
  assert.equal(lateParse.calls.order.at(-1), 'dispose-pipeline');
});

test('service shutdown cleans instances before templates and pipeline, aggregating all failures', async () => {
  const { calls, service } = createHarness({
    disposeInstance(instance) {
      throw new Error(`instance cleanup failed: ${instance.url}`);
    },
    disposeTemplate(template) {
      throw new Error(`template cleanup failed: ${template.url}`);
    },
    disposePipeline() {
      throw new Error('pipeline cleanup failed');
    }
  });
  const first = await service.load('/first.bin', loadOptions('first'));
  const second = await service.load('/second.bin', loadOptions('second'));

  let cleanupError;
  await assert.rejects(
    service.dispose(),
    error => {
      cleanupError = error;
      return error instanceof AggregateError;
    }
  );
  assert.deepEqual(
    cleanupError.errors.map(error => error.message),
    [
      'instance cleanup failed: /first.bin',
      'instance cleanup failed: /second.bin',
      'template cleanup failed: /first.bin',
      'template cleanup failed: /second.bin',
      'pipeline cleanup failed'
    ]
  );
  assert.equal(calls.instanceDisposals.length, 2);
  assert.equal(calls.templateDisposals.length, 2);
  assert.equal(calls.pipelineDisposals, 1);
  const firstTemplateIndex = calls.order.findIndex(
    entry => entry.startsWith('dispose-template:')
  );
  const lastInstanceIndex = calls.order.findLastIndex(
    entry => entry.startsWith('dispose-instance:')
  );
  assert.ok(lastInstanceIndex < firstTemplateIndex);
  assert.equal(calls.order.at(-1), 'dispose-pipeline');

  assert.equal(first.dispose(), false);
  assert.equal(second.dispose(), false);
  assert.equal(await service.dispose(), false);
  assert.equal(calls.instanceDisposals.length, 2);
  assert.equal(calls.templateDisposals.length, 2);
  assert.equal(calls.pipelineDisposals, 1);
});

test('clone-time reentrant shutdown reports late instance cleanup to load and service disposal', async () => {
  let service;
  let disposal;
  const harness = createHarness({
    cloneModel(template) {
      disposal = service.dispose();
      return { url: template.url };
    },
    disposeInstance() {
      throw new Error('late clone instance cleanup failed');
    }
  });
  service = harness.service;

  let loadError;
  await assert.rejects(
    service.load('/reentrant-clone.bin', loadOptions('reentrant-clone')),
    error => {
      loadError = error;
      return error instanceof AggregateError;
    }
  );
  assert.deepEqual(
    loadError.errors.map(error => error.message),
    [
      'ExternalModelAssetService was disposed during model cloning',
      'late clone instance cleanup failed'
    ]
  );

  let disposalError;
  await assert.rejects(
    disposal,
    error => {
      disposalError = error;
      return error instanceof AggregateError;
    }
  );
  assert.deepEqual(
    disposalError.errors.map(error => error.message),
    ['late clone instance cleanup failed']
  );
  assert.equal(harness.calls.instanceDisposals.length, 1);
  assert.equal(harness.calls.templateDisposals.length, 1);
  assert.equal(harness.calls.pipelineDisposals, 1);
  assert.equal(service.activeHandles.size, 0);
  assert.equal(service.cachedTemplates.size, 0);
  assert.equal(service.templateRecords.size, 0);
  assert.equal(service.pending.size, 0);
  assert.equal(service.activeLoads.size, 0);
  assert.equal(service.shutdownCleanupErrors.length, 0);
  assert.equal(await service.dispose(), false);
  assert.equal(harness.calls.instanceDisposals.length, 1);
  assert.equal(harness.calls.templateDisposals.length, 1);
  assert.equal(harness.calls.pipelineDisposals, 1);
});

test('shutdown aggregates late source-release failure but still disposes the pipeline last', async () => {
  const fetchGate = deferred();
  const { calls, service } = createHarness({
    async fetchSource(url) {
      await fetchGate.promise;
      return {
        payload: { sourceId: 1, url },
        resolvedUrl: url
      };
    },
    releaseSource() {
      throw new Error('late source release failed');
    }
  });
  const pending = service.load('/late-source.bin', loadOptions('late-source'));
  await Promise.resolve();
  const disposing = service.dispose();
  fetchGate.resolve();

  await assert.rejects(pending, /late source release failed|disposed/);
  let cleanupError;
  await assert.rejects(
    disposing,
    error => {
      cleanupError = error;
      return error instanceof AggregateError;
    }
  );
  assert.deepEqual(
    cleanupError.errors.map(error => error.message),
    ['late source release failed']
  );
  assert.equal(calls.sourceReleases.length, 1);
  assert.equal(calls.pipelineDisposals, 1);
  assert.equal(calls.order.at(-1), 'dispose-pipeline');
  assert.equal(await service.dispose(), false);
});

test('generic model service source contains no renderer, loader, family, scenario, or runtime import', async () => {
  const source = await readFile(
    new URL('../src/assets/ExternalModelAssetService.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /^import\s/m);
  assert.doesNotMatch(
    source,
    /\bthree\b|GLTFLoader|SkeletonUtils|GameApp|ScenarioRuntime|UnitFactory/
  );
  assert.doesNotMatch(
    source,
    /\/(?:content|family|scenario|runtime|vehicle|world|ui)\//
  );
  assert.doesNotMatch(source, /\b(?:document|window|HTMLElement)\b/);
});

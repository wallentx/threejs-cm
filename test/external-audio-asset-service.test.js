import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ExternalAudioAssetLoadError,
  ExternalAudioAssetService
} from '../src/assets/ExternalAudioAssetService.js';

function bytes(value = 1) {
  return new Uint8Array([value]).buffer;
}

function response({
  ok = true,
  status = 200,
  arrayBuffer = async () => bytes()
} = {}) {
  return { ok, status, arrayBuffer };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createService({
  fetch = async () => response(),
  decodeAudio = async data => ({ byteLength: data.byteLength }),
  disposeDecodedBuffer,
  missingAssetPolicy,
  maxCachedResources
} = {}) {
  return new ExternalAudioAssetService({
    fetch,
    decodeAudio,
    disposeDecodedBuffer,
    missingAssetPolicy,
    maxCachedResources
  });
}

test('constructor validates injected dependencies, policy, and positive cache bound', () => {
  assert.throws(
    () => new ExternalAudioAssetService(),
    /fetch must be a function/
  );
  assert.throws(
    () => new ExternalAudioAssetService({ fetch() {} }),
    /decodeAudio must be a function/
  );
  assert.throws(
    () => createService({ disposeDecodedBuffer: true }),
    /disposeDecodedBuffer must be a function/
  );
  for (const maxCachedResources of [0, -1, 1.5, Infinity, '64']) {
    assert.throws(
      () => createService({ maxCachedResources }),
      /maxCachedResources must be a positive integer/
    );
  }
  assert.throws(
    () => createService({ missingAssetPolicy: { action: 'ignore' } }),
    /fallback action must be throw, return-null, or url/
  );

  const service = createService();
  assert.equal(service.maxCachedResources, 64);
  assert.equal(service.dispose(), true);
  assert.equal(service.dispose(), false);
});

test('exact concurrent and cached requests share work and retain frozen identity', async () => {
  const fetchCalls = [];
  const readCalls = [];
  const decodeCalls = [];
  const decodedBuffer = { id: 'decoded-rifle' };
  const service = createService({
    async fetch(url, options) {
      fetchCalls.push({ url, options });
      return response({
        async arrayBuffer() {
          readCalls.push(url);
          return bytes(7);
        }
      });
    },
    async decodeAudio(data) {
      decodeCalls.push(data);
      return decodedBuffer;
    }
  });
  const options = {
    cacheKey: 'logical:test.rifle:pack-a',
    fallbackPolicy: { action: 'throw' },
    assetBinding: {
      logicalId: 'test.rifle',
      sourcePackId: 'pack-a'
    }
  };

  const [first, second] = await Promise.all([
    service.load(' /audio/rifle.ogg ', options),
    service.load('/audio/rifle.ogg', options)
  ]);
  const cached = await service.load('/audio/rifle.ogg', options);

  assert.equal(first, second);
  assert.equal(cached, first);
  assert.equal(fetchCalls.length, 1);
  assert.equal(readCalls.length, 1);
  assert.equal(decodeCalls.length, 1);
  assert.equal(fetchCalls[0].url, '/audio/rifle.ogg');
  assert.ok(fetchCalls[0].options.signal instanceof AbortSignal);
  assert.equal(first.kind, 'external-audio-resource');
  assert.equal(first.requestedUrl, '/audio/rifle.ogg');
  assert.equal(first.resolvedUrl, '/audio/rifle.ogg');
  assert.equal(first.usedFallback, false);
  assert.equal(first.buffer, decodedBuffer);
  assert.deepEqual(first.assetBinding, options.assetBinding);
  assert.equal(first.logicalId, 'test.rifle');
  assert.equal(first.sourcePackId, 'pack-a');
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.assetBinding), true);
  service.dispose();
});

test('cached and pending cache-key collisions reject URL, policy, or binding changes', async () => {
  const fetchGate = deferred();
  let fetchCalls = 0;
  const pendingService = createService({
    fetch() {
      fetchCalls++;
      return fetchGate.promise;
    }
  });
  const identity = {
    cacheKey: 'pending-key',
    fallbackPolicy: {
      action: 'url',
      url: '/fallback.ogg',
      onFailure: 'return-null'
    },
    assetBinding: {
      logicalId: 'test.pending',
      sourcePackId: 'pack-a'
    }
  };
  const pending = pendingService.load('/pending.ogg', identity);
  const exact = pendingService.load(' /pending.ogg ', identity);

  await assert.rejects(
    pendingService.load('/other.ogg', identity),
    /cacheKey pending-key collision/
  );
  await assert.rejects(
    pendingService.load('/pending.ogg', {
      ...identity,
      fallbackPolicy: { action: 'throw' }
    }),
    /cacheKey pending-key collision/
  );
  await assert.rejects(
    pendingService.load('/pending.ogg', {
      ...identity,
      assetBinding: {
        logicalId: 'test.pending',
        sourcePackId: 'pack-b'
      }
    }),
    /cacheKey pending-key collision/
  );
  assert.equal(fetchCalls, 1);
  fetchGate.resolve(response());
  assert.equal(await exact, await pending);

  const cachedService = createService();
  const cachedIdentity = {
    cacheKey: 'cached-key',
    assetBinding: {
      logicalId: 'test.cached',
      sourcePackId: 'pack-a'
    }
  };
  const cached = await cachedService.load('/cached.ogg', cachedIdentity);
  await assert.rejects(
    cachedService.load('/different.ogg', cachedIdentity),
    /cacheKey cached-key collision/
  );
  await assert.rejects(
    cachedService.load('/cached.ogg', {
      ...cachedIdentity,
      fallbackPolicy: { action: 'return-null' }
    }),
    /cacheKey cached-key collision/
  );
  await assert.rejects(
    cachedService.load('/cached.ogg', {
      ...cachedIdentity,
      assetBinding: {
        logicalId: 'test.other',
        sourcePackId: 'pack-a'
      }
    }),
    /cacheKey cached-key collision/
  );
  assert.equal(
    await cachedService.load(' /cached.ogg ', cachedIdentity),
    cached
  );

  pendingService.dispose();
  cachedService.dispose();
});

test('validates primary URL, fallback URL, cache key, and binding before I/O', async () => {
  let fetchCalls = 0;
  let decodeCalls = 0;
  const service = createService({
    async fetch() {
      fetchCalls++;
      return response();
    },
    async decodeAudio() {
      decodeCalls++;
      return {};
    }
  });

  for (const [url, message] of [
    ['', /non-empty string/],
    ['   ', /non-empty string/],
    ['javascript:alert(1)', /unsupported scheme javascript/],
    ['file:///tmp/shot.ogg', /unsupported scheme file/],
    ['data:text/plain;base64,QQ==', /unsupported scheme data/]
  ]) {
    await assert.rejects(service.load(url), message);
  }
  for (const cacheKey of ['', '   ', 42, null]) {
    await assert.rejects(
      service.load('/safe.ogg', { cacheKey }),
      /cacheKey must be a non-empty string/
    );
  }
  await assert.rejects(
    service.load('/safe.ogg', {
      fallbackPolicy: {
        action: 'url',
        url: 'javascript:fallback()'
      }
    }),
    /fallback URL uses unsupported scheme javascript/
  );
  await assert.rejects(
    service.load('/safe.ogg', {
      fallbackPolicy: {
        action: 'url',
        url: 'data:image/png;base64,AA=='
      }
    }),
    /fallback URL uses unsupported scheme data/
  );
  await assert.rejects(
    service.load('/safe.ogg', {
      fallbackPolicy: {
        action: 'url',
        url: '/fallback.ogg',
        onFailure: 'ignore'
      }
    }),
    /onFailure must be throw or return-null/
  );
  await assert.rejects(
    service.load('/safe.ogg', {
      assetBinding: {
        logicalId: '',
        sourcePackId: 'pack-a'
      }
    }),
    /binding requires non-empty logicalId and sourcePackId/
  );
  assert.equal(fetchCalls, 0);
  assert.equal(decodeCalls, 0);

  for (const url of [
    '/relative.ogg',
    'https://assets.example/audio.ogg',
    'http://assets.example/audio.ogg',
    'blob:test-audio',
    'data:audio/ogg;base64,T2dnUw=='
  ]) {
    await service.load(url, { cacheKey: `valid:${url}` });
  }
  assert.equal(fetchCalls, 5);
  assert.equal(decodeCalls, 5);
  service.dispose();
});

test('fetch, byte-read, and decode failures obey throw/null policy and remain retryable', async t => {
  for (const stage of ['fetch', 'read', 'decode']) {
    await t.test(stage, async () => {
      let attempts = 0;
      const service = createService({
        async fetch() {
          attempts++;
          if (stage === 'fetch' && attempts <= 2) {
            throw new Error('network unavailable');
          }
          if (stage === 'read' && attempts <= 2) {
            return response({
              async arrayBuffer() {
                throw new Error('body read failed');
              }
            });
          }
          return response();
        },
        async decodeAudio(data) {
          if (stage === 'decode' && attempts <= 2) {
            throw new Error('decoder rejected bytes');
          }
          return { stage, byteLength: data.byteLength };
        }
      });

      await assert.rejects(
        service.load(`/throw-${stage}.ogg`, {
          cacheKey: `throw-${stage}`,
          fallbackPolicy: { action: 'throw' }
        }),
        error => (
          error instanceof ExternalAudioAssetLoadError
          && error.url === `/throw-${stage}.ogg`
        )
      );
      const unavailable = await service.load(`/null-${stage}.ogg`, {
        cacheKey: `null-${stage}`,
        fallbackPolicy: { action: 'return-null' }
      });
      assert.equal(unavailable, null);

      const retry = await service.load(`/null-${stage}.ogg`, {
        cacheKey: `null-${stage}`,
        fallbackPolicy: { action: 'return-null' }
      });
      assert.equal(retry.resolvedUrl, `/null-${stage}.ogg`);
      assert.equal(attempts, 3);
      service.dispose();
    });
  }
});

test('invalid and non-success responses enter the missing-asset policy', async () => {
  const outcomes = [
    {},
    { ok: true, status: 200 },
    response({ ok: false, status: 404 }),
    response()
  ];
  let decodeCalls = 0;
  const service = createService({
    async fetch() {
      return outcomes.shift();
    },
    async decodeAudio() {
      decodeCalls++;
      return {};
    }
  });

  for (const cacheKey of ['missing-contract', 'missing-reader', 'not-found']) {
    assert.equal(
      await service.load('/response.ogg', {
        cacheKey,
        fallbackPolicy: { action: 'return-null' }
      }),
      null
    );
  }
  const retry = await service.load('/response.ogg', {
    cacheKey: 'not-found',
    fallbackPolicy: { action: 'return-null' }
  });
  assert.equal(retry.resolvedUrl, '/response.ogg');
  assert.equal(decodeCalls, 1);
  service.dispose();
});

test('fallback decodes independently and retains both causes when both attempts fail', async () => {
  const reads = [];
  const decodeCalls = [];
  let brokenFallbackFails = true;
  const service = createService({
    async fetch(url) {
      if (url === '/primary.ogg') {
        return response({ ok: false, status: 503 });
      }
      return response({
        async arrayBuffer() {
          reads.push(url);
          return bytes(url === '/fallback.ogg' ? 2 : 3);
        }
      });
    },
    async decodeAudio(data) {
      decodeCalls.push(new Uint8Array(data)[0]);
      if (new Uint8Array(data)[0] === 3 && brokenFallbackFails) {
        throw new Error('fallback decode failed');
      }
      return { decoded: new Uint8Array(data)[0] };
    }
  });

  const fallback = await service.load('/primary.ogg', {
    cacheKey: 'fallback-success',
    fallbackPolicy: {
      action: 'url',
      url: '/fallback.ogg',
      onFailure: 'throw'
    },
    assetBinding: {
      logicalId: 'test.fallback',
      sourcePackId: 'pack-b'
    }
  });
  assert.equal(fallback.requestedUrl, '/primary.ogg');
  assert.equal(fallback.resolvedUrl, '/fallback.ogg');
  assert.equal(fallback.usedFallback, true);
  assert.deepEqual(fallback.buffer, { decoded: 2 });

  let aggregate;
  await assert.rejects(
    service.load('/primary.ogg', {
      cacheKey: 'fallback-failure',
      fallbackPolicy: {
        action: 'url',
        url: '/broken-fallback.ogg',
        onFailure: 'throw'
      }
    }),
    error => {
      aggregate = error;
      return error instanceof AggregateError;
    }
  );
  assert.equal(aggregate.errors.length, 2);
  assert.ok(
    aggregate.errors.every(error => error instanceof ExternalAudioAssetLoadError)
  );
  assert.equal(aggregate.errors[0].url, '/primary.ogg');
  assert.equal(aggregate.errors[1].url, '/broken-fallback.ogg');
  assert.match(aggregate.errors[1].cause.message, /fallback decode failed/);

  assert.equal(
    await service.load('/primary.ogg', {
      cacheKey: 'fallback-null',
      fallbackPolicy: {
        action: 'url',
        url: '/broken-fallback.ogg',
        onFailure: 'return-null'
      }
    }),
    null
  );
  brokenFallbackFails = false;
  const retriedFallback = await service.load('/primary.ogg', {
    cacheKey: 'fallback-null',
    fallbackPolicy: {
      action: 'url',
      url: '/broken-fallback.ogg',
      onFailure: 'return-null'
    }
  });
  assert.equal(retriedFallback.usedFallback, true);
  assert.deepEqual(retriedFallback.buffer, { decoded: 3 });
  assert.deepEqual(reads, [
    '/fallback.ogg',
    '/broken-fallback.ogg',
    '/broken-fallback.ogg',
    '/broken-fallback.ogg'
  ]);
  assert.deepEqual(decodeCalls, [2, 3, 3, 3]);
  service.dispose();
});

test('true LRU eviction and explicit resource disposal release decoded ownership', async () => {
  const decoded = [];
  const disposed = [];
  const service = createService({
    maxCachedResources: 2,
    async decodeAudio(data) {
      const buffer = {
        id: new Uint8Array(data)[0],
        sequence: decoded.length
      };
      decoded.push(buffer);
      return buffer;
    },
    disposeDecodedBuffer(buffer) {
      disposed.push(buffer);
    },
    async fetch(url) {
      return response({
        arrayBuffer: async () => bytes(url.charCodeAt(1))
      });
    }
  });

  const a = await service.load('/a.ogg');
  const b = await service.load('/b.ogg');
  const bBuffer = b.buffer;
  assert.equal(await service.load('/a.ogg'), a, 'cache hit touches a');
  const c = await service.load('/c.ogg');
  assert.deepEqual(disposed, [bBuffer]);
  assert.equal(b.buffer, null);
  assert.notEqual(a.buffer, null);
  assert.notEqual(c.buffer, null);

  const previousA = a.buffer;
  assert.equal(a.dispose(), true);
  assert.equal(a.buffer, null);
  assert.equal(a.dispose(), false);
  assert.equal(disposed.filter(buffer => buffer === previousA).length, 1);
  const reloadedA = await service.load('/a.ogg');
  assert.notEqual(reloadedA, a);
  service.dispose();
});

test('shutdown aborts primary and fallback fetches and rejects late fetch settlement', async () => {
  for (const mode of ['primary', 'fallback']) {
    const gate = deferred();
    const calls = [];
    const service = createService({
      async fetch(url, { signal }) {
        calls.push({ url, signal });
        if (mode === 'fallback' && url === '/primary.ogg') {
          return response({ ok: false, status: 404 });
        }
        return gate.promise;
      }
    });
    const pending = service.load('/primary.ogg', {
      fallbackPolicy: mode === 'fallback'
        ? {
            action: 'url',
            url: '/fallback.ogg',
            onFailure: 'throw'
          }
        : { action: 'throw' }
    });
    while (calls.length < (mode === 'fallback' ? 2 : 1)) {
      await Promise.resolve();
    }

    assert.equal(service.dispose(), true);
    assert.equal(calls.at(-1).signal.aborted, true);
    gate.resolve(response());
    await assert.rejects(pending, /disposed/);
    assert.equal(service.resources.size, 0);
    assert.equal(service.pending.size, 0);
    assert.equal(service.dispose(), false);
  }
});

test('shutdown during byte read or decode prevents caching and releases late decoded output', async t => {
  await t.test('byte read', async () => {
    const readGate = deferred();
    let decodeCalls = 0;
    const service = createService({
      async fetch() {
        return response({ arrayBuffer: () => readGate.promise });
      },
      async decodeAudio() {
        decodeCalls++;
        return {};
      }
    });
    const pending = service.load('/read.ogg');
    await Promise.resolve();
    await Promise.resolve();
    service.dispose();
    readGate.resolve(bytes());

    await assert.rejects(pending, /disposed/);
    assert.equal(decodeCalls, 0);
    assert.equal(service.resources.size, 0);
  });

  await t.test('decode', async () => {
    const decodeGate = deferred();
    const lateBuffer = { id: 'late-buffer' };
    const disposed = [];
    const service = createService({
      decodeAudio() {
        return decodeGate.promise;
      },
      disposeDecodedBuffer(buffer) {
        disposed.push(buffer);
      }
    });
    const pending = service.load('/decode.ogg');
    await Promise.resolve();
    await Promise.resolve();
    service.dispose();
    decodeGate.resolve(lateBuffer);

    await assert.rejects(pending, /disposed/);
    assert.deepEqual(disposed, [lateBuffer]);
    assert.equal(service.resources.size, 0);
    assert.equal(service.pending.size, 0);
  });
});

test('late decoded cleanup failure retains both shutdown and cleanup causes', async () => {
  const decodeGate = deferred();
  const lateBuffer = { id: 'late-throwing-buffer' };
  let cleanupCalls = 0;
  const service = createService({
    decodeAudio() {
      return decodeGate.promise;
    },
    disposeDecodedBuffer(buffer) {
      assert.equal(buffer, lateBuffer);
      cleanupCalls++;
      throw new Error('late decoded cleanup failed');
    }
  });
  const pending = service.load('/late-throwing.ogg');
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(service.dispose(), true);
  decodeGate.resolve(lateBuffer);
  let aggregate;
  await assert.rejects(
    pending,
    error => {
      aggregate = error;
      return error instanceof AggregateError;
    }
  );
  assert.equal(aggregate.errors.length, 2);
  assert.match(aggregate.errors[0].message, /disposed/);
  assert.match(aggregate.errors[1].message, /late decoded cleanup failed/);
  assert.equal(cleanupCalls, 1);
  assert.equal(service.resources.size, 0);
  assert.equal(service.pending.size, 0);
  assert.equal(service.pendingControllers.size, 0);
  assert.equal(service.dispose(), false);
  assert.equal(cleanupCalls, 1);
});

test('best-effort cleanup releases every resource and aggregates disposer failures once', async () => {
  const cleanupAttempts = [];
  const service = createService({
    async fetch(url) {
      return response({
        arrayBuffer: async () => bytes(url.charCodeAt(1))
      });
    },
    async decodeAudio(data) {
      return { id: String.fromCharCode(new Uint8Array(data)[0]) };
    },
    disposeDecodedBuffer(buffer) {
      cleanupAttempts.push(buffer.id);
      if (buffer.id !== 'b') {
        throw new Error(`cleanup ${buffer.id} failed`);
      }
    }
  });
  const a = await service.load('/a.ogg');
  const b = await service.load('/b.ogg');
  const c = await service.load('/c.ogg');

  let aggregate;
  assert.throws(
    () => service.dispose(),
    error => {
      aggregate = error;
      return error instanceof AggregateError;
    }
  );
  assert.deepEqual(cleanupAttempts, ['a', 'b', 'c']);
  assert.deepEqual(
    aggregate.errors.map(error => error.message),
    ['cleanup a failed', 'cleanup c failed']
  );
  assert.equal(a.buffer, null);
  assert.equal(b.buffer, null);
  assert.equal(c.buffer, null);
  assert.equal(service.resources.size, 0);
  assert.equal(service.pending.size, 0);
  assert.equal(service.dispose(), false);
  assert.deepEqual(cleanupAttempts, ['a', 'b', 'c']);
  assert.equal(a.dispose(), false);
  assert.equal(c.dispose(), false);
});

test('individual cleanup failure still removes ownership and remains idempotent', async () => {
  let cleanupCalls = 0;
  const service = createService({
    disposeDecodedBuffer() {
      cleanupCalls++;
      throw new Error('resource cleanup failed');
    }
  });
  const resource = await service.load('/resource.ogg');

  assert.throws(() => resource.dispose(), /resource cleanup failed/);
  assert.equal(resource.buffer, null);
  assert.equal(cleanupCalls, 1);
  assert.equal(resource.dispose(), false);
  assert.equal(cleanupCalls, 1);
  const retry = await service.load('/resource.ogg');
  assert.notEqual(retry, resource);
  assert.throws(() => service.dispose(), AggregateError);
  assert.equal(cleanupCalls, 2);
});

test('service remains renderer-neutral and contains no live audio or family wiring', async () => {
  const source = await readFile(
    new URL('../src/assets/ExternalAudioAssetService.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(
    source,
    /(?:three|content\/|manifest|scenario|render|vehicle|GameApp|SoundEngine)/
  );
  assert.doesNotMatch(
    source,
    /(?:AudioContext|createBufferSource|createGain|playback|Math\.random|Date\.now|performance\.now)/
  );
});

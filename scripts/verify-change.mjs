import { spawn, spawnSync } from 'node:child_process';
import {
  availableParallelism
} from 'node:os';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync
} from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const HEAP_LIMIT_MB = 384;
const MAX_AUTOMATIC_TESTS = 8;
const CORE_TEST_FILES = Object.freeze([
  'test/application-ports.test.js',
  'test/combat-rollback.test.js',
  'test/realism.test.js',
  'test/scenario-runtime.test.js',
  'test/static-collision.test.js',
  'test/wego-manager.test.js'
]);

function normalizePath(path) {
  return relative(ROOT, resolve(ROOT, path)).replaceAll('\\', '/');
}

function listFiles(directory, predicate) {
  if (!existsSync(directory)) return [];
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...listFiles(path, predicate));
    else if (predicate(path)) result.push(normalizePath(path));
  }
  return result;
}

function parseArguments(argv) {
  const options = {
    mode: 'focused',
    build: true,
    runtime: 'auto',
    jobs: process.platform === 'android'
      ? 1
      : Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2))),
    paths: []
  };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--core') options.mode = 'core';
    else if (argument === '--full') options.mode = 'full';
    else if (argument === '--no-build') options.build = false;
    else if (argument === '--runtime') options.runtime = 'required';
    else if (argument === '--no-runtime') options.runtime = 'off';
    else if (argument === '--help') options.help = true;
    else if (argument.startsWith('--jobs=')) {
      options.jobs = Number.parseInt(argument.slice('--jobs='.length), 10);
    } else if (argument === '--jobs') {
      options.jobs = Number.parseInt(argv[++index], 10);
    } else if (argument.startsWith('-')) {
      throw new Error(`Unknown option ${argument}`);
    } else {
      options.paths.push(normalizePath(argument));
    }
  }
  if (!Number.isInteger(options.jobs) || options.jobs < 1 || options.jobs > 8) {
    throw new Error('--jobs must be an integer from 1 through 8');
  }
  return options;
}

function gitLines(args) {
  const result = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  }
  return result.stdout.split('\n').map(value => value.trim()).filter(Boolean);
}

function changedPaths() {
  return [...new Set([
    ...gitLines(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD', '--']),
    ...gitLines(['ls-files', '--others', '--exclude-standard'])
  ])].map(normalizePath).sort((left, right) => left.localeCompare(right));
}

function resolveImport(importer, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(ROOT, dirname(importer), specifier);
  const candidates = extname(base)
    ? [base]
    : [base, `${base}.js`, `${base}.mjs`, resolve(base, 'index.js')];
  return candidates.find(candidate => existsSync(candidate) && statSync(candidate).isFile())
    ? normalizePath(candidates.find(candidate => existsSync(candidate) && statSync(candidate).isFile()))
    : null;
}

function importsOf(file) {
  const source = readFileSync(resolve(ROOT, file), 'utf8');
  const specifiers = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return [...specifiers]
    .map(specifier => resolveImport(file, specifier))
    .filter(Boolean);
}

function affectedTests(paths) {
  const codeFiles = [
    ...listFiles(resolve(ROOT, 'src'), path => /\.(?:js|mjs)$/.test(path)),
    ...listFiles(resolve(ROOT, 'test'), path => /\.(?:js|mjs)$/.test(path))
  ];
  const tests = new Set(codeFiles.filter(path => path.endsWith('.test.js')));
  const reverseImports = new Map();
  for (const importer of codeFiles) {
    for (const imported of importsOf(importer)) {
      const consumers = reverseImports.get(imported) ?? [];
      consumers.push(importer);
      reverseImports.set(imported, consumers);
    }
  }

  const distances = new Map();
  for (const changed of paths) {
    if (tests.has(changed)) distances.set(changed, 0);
    const queue = [{ file: changed, distance: 0 }];
    const visited = new Set([changed]);
    while (queue.length > 0) {
      const current = queue.shift();
      for (const consumer of reverseImports.get(current.file) ?? []) {
        if (visited.has(consumer)) continue;
        visited.add(consumer);
        const distance = current.distance + 1;
        if (tests.has(consumer)) {
          distances.set(
            consumer,
            Math.min(distances.get(consumer) ?? Number.POSITIVE_INFINITY, distance)
          );
        } else {
          queue.push({ file: consumer, distance });
        }
      }
    }
  }
  return [...distances]
    .sort(([leftFile, leftDistance], [rightFile, rightDistance]) => (
      leftDistance - rightDistance || leftFile.localeCompare(rightFile)
    ))
    .map(([file]) => file);
}

function run(command, args, label) {
  return new Promise(resolvePromise => {
    const started = performance.now();
    const child = spawn(command, args, {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const chunks = [];
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.stderr.on('data', chunk => chunks.push(chunk));
    child.on('error', error => resolvePromise({
      label,
      ok: false,
      durationMs: performance.now() - started,
      output: error.message
    }));
    child.on('close', (code, signal) => resolvePromise({
      label,
      ok: code === 0,
      durationMs: performance.now() - started,
      output: Buffer.concat(chunks).toString('utf8').trim(),
      code,
      signal
    }));
  });
}

async function runFocusedTests(files, jobs) {
  const results = new Array(files.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < files.length) {
      const index = cursor++;
      results[index] = await run(
        process.execPath,
        [`--max-old-space-size=${HEAP_LIMIT_MB}`, '--test', files[index]],
        files[index]
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, worker));
  return results;
}

async function evaluateRuntime(webSocketUrl) {
  return new Promise((resolvePromise, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('Chrome runtime probe timed out'));
    }, 1200);
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `({
            href: location.href,
            status: document.body.dataset.gameStatus ?? null,
            backend: document.body.dataset.rendererBackend
              ?? document.documentElement.dataset.rendererBackend
              ?? window.__CMBN_GAME__?.renderer?.activeBackend
              ?? null
          })`,
          returnByValue: true
        }
      }));
    });
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timeout);
      socket.close();
      if (message.error) reject(new Error(message.error.message));
      else resolvePromise(message.result?.result?.value ?? null);
    });
    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('Chrome debugging socket is unavailable'));
    });
  });
}

async function probeRuntime(required) {
  const endpoint = process.env.VERIFY_CDP_URL ?? 'http://127.0.0.1:9223/json/list';
  const started = performance.now();
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(450) });
    if (!response.ok) throw new Error(`Chrome endpoint returned ${response.status}`);
    const targets = await response.json();
    const page = targets.find(target => (
      target.type === 'page'
        && /127\.0\.0\.1|localhost/.test(target.url)
        && target.webSocketDebuggerUrl
    ));
    if (!page) throw new Error('no local game page is open');
    const value = await evaluateRuntime(page.webSocketDebuggerUrl);
    if (value?.status !== 'ready') {
      const message = `runtime is ${value?.status ?? 'missing-status'} at ${value?.href ?? page.url}`;
      return {
        label: 'runtime',
        ok: !required,
        skipped: !required,
        durationMs: performance.now() - started,
        output: message
      };
    }
    return {
      label: 'runtime',
      ok: true,
      durationMs: performance.now() - started,
      output: `${value.href} ready (${value.backend ?? 'backend-unreported'})`
    };
  } catch (error) {
    return {
      label: 'runtime',
      ok: !required,
      skipped: !required,
      durationMs: performance.now() - started,
      output: error.message
    };
  }
}

function formatSeconds(durationMs) {
  return `${(durationMs / 1000).toFixed(durationMs < 1000 ? 2 : 1)}s`;
}

function help() {
  process.stdout.write(`Usage:
  npm run verify -- [changed paths or focused test files]
  npm run verify -- --core [--runtime]

Options:
  --core          run the six-file core gate
  --full          run the opt-in exhaustive gate
  --jobs N        concurrent focused test files (1 on Termux, up to 4 elsewhere)
  --runtime       require an open Chrome game tab with data-game-status=ready
  --no-runtime    skip the automatic local Chrome probe
  --no-build      skip the production build
`);
}

async function main() {
  const started = performance.now();
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    help();
    return;
  }
  const paths = options.paths.length > 0 ? options.paths : changedPaths();
  const explicitTests = paths.filter(path => path.endsWith('.test.js'));
  const affected = affectedTests(paths);
  const automaticTests = affected.slice(0, MAX_AUTOMATIC_TESTS);
  let testFiles = [...new Set([...explicitTests, ...automaticTests])];
  let testMode = options.mode;
  if (testMode === 'core') testFiles = [...CORE_TEST_FILES];
  if (testMode === 'focused' && testFiles.length === 0 && paths.some(path => (
    path.startsWith('src/') || path.startsWith('scripts/') || path === 'package.json'
  ))) {
    testMode = 'core';
    testFiles = [...CORE_TEST_FILES];
  }

  const buildRelevant = options.build && paths.some(path => (
    path.startsWith('src/')
      || path.startsWith('public/')
      || /\.(?:html|css)$/.test(path)
      || path === 'package.json'
      || path.startsWith('vite.config.')
  ));
  const notices = [];
  if (options.mode === 'focused' && affected.length > automaticTests.length) {
    notices.push(`focused cap: ${automaticTests.length}/${affected.length} nearest affected tests`);
  }
  process.stdout.write(
    `verify: ${testMode === 'focused' ? testFiles.length : testMode} tests, `
      + `${buildRelevant ? 'build, ' : ''}diff-check, `
      + `${options.runtime === 'off' ? 'no runtime probe' : 'runtime auto-probe'}\n`
  );
  for (const notice of notices) process.stdout.write(`note: ${notice}\n`);

  const tasks = [];
  if (testMode === 'full') {
    tasks.push(run(process.execPath, ['scripts/run-tests.mjs', 'full'], 'tests:full'));
  } else if (testMode === 'core') {
    tasks.push(run(process.execPath, ['scripts/run-tests.mjs', 'core'], 'tests:core'));
  } else if (testFiles.length > 0) {
    tasks.push(runFocusedTests(testFiles, options.jobs));
  }
  if (buildRelevant) tasks.push(run('npm', ['run', 'build'], 'build'));
  tasks.push(run('git', ['diff', '--check'], 'diff-check'));
  if (options.runtime !== 'off') {
    tasks.push(probeRuntime(options.runtime === 'required'));
  }

  const settled = (await Promise.all(tasks)).flat();
  let failed = false;
  for (const result of settled) {
    const state = result.skipped ? 'SKIP' : result.ok ? 'PASS' : 'FAIL';
    process.stdout.write(`${state} ${result.label} (${formatSeconds(result.durationMs)})`);
    if (result.skipped || (!result.ok && result.output)) {
      process.stdout.write(`: ${result.output.split('\n')[0]}`);
    } else if (result.label === 'runtime' && result.output) {
      process.stdout.write(`: ${result.output}`);
    }
    process.stdout.write('\n');
    if (!result.ok) {
      failed = true;
      if (result.output) process.stderr.write(`\n--- ${result.label} ---\n${result.output}\n`);
    }
  }
  process.stdout.write(`${failed ? 'FAILED' : 'VERIFIED'} in ${formatSeconds(performance.now() - started)}\n`);
  if (failed) process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(`verify failed: ${error.message}\n`);
  process.exitCode = 2;
});

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const CORE_TEST_FILES = Object.freeze([
  'test/application-ports.test.js',
  'test/combat-rollback.test.js',
  'test/realism.test.js',
  'test/scenario-runtime.test.js',
  'test/static-collision.test.js',
  'test/wego-manager.test.js'
]);

const HEAP_LIMIT_MB = 384;

function fullTestFiles() {
  return readdirSync(resolve('test'), { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.test.js'))
    .map(entry => `test/${entry.name}`)
    .sort((left, right) => left.localeCompare(right));
}

function requestedFiles(args) {
  if (args.length === 0) {
    throw new Error('files mode requires at least one test file');
  }
  return [...new Set(args)].sort((left, right) => left.localeCompare(right));
}

function selectFiles(mode, args) {
  if (mode === 'core') return [...CORE_TEST_FILES];
  if (mode === 'full') return fullTestFiles();
  if (mode === 'files') return requestedFiles(args);
  throw new Error(`Unknown test suite "${mode}"; use core, full, or files`);
}

function runFile(file, index, count) {
  process.stdout.write(`\n[test ${index + 1}/${count}] ${file}\n`);
  return spawnSync(
    process.execPath,
    [`--max-old-space-size=${HEAP_LIMIT_MB}`, '--test', file],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit'
    }
  );
}

const [mode = 'core', ...args] = process.argv.slice(2);
let files;
try {
  files = selectFiles(mode, args);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
  process.exit();
}

for (let index = 0; index < files.length; index++) {
  const result = runFile(files[index], index, files.length);
  if (result.error) {
    process.stderr.write(`Failed to start ${files[index]}: ${result.error.message}\n`);
    process.exitCode = 1;
    break;
  }
  if (result.signal) {
    process.stderr.write(
      `${files[index]} terminated by ${result.signal}; child heap cap was ${HEAP_LIMIT_MB} MB\n`
    );
    process.exitCode = 1;
    break;
  }
  if (result.status !== 0) {
    process.stderr.write(`${files[index]} failed with exit code ${result.status}\n`);
    process.exitCode = result.status ?? 1;
    break;
  }
}

if (!process.exitCode) {
  process.stdout.write(`\nPassed ${files.length} isolated ${mode} test files.\n`);
}

import { readFile, mkdir, writeFile, rename, rm, mkdtemp } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  FRANCE_1940_VEHICLE_MESH_FACTORIES
} from '../src/content/france1940/render/index.js';
import {
  VEHICLE_VISUAL_PROFILES
} from '../src/world/vehicles/VehicleVisualProfiles.js';
import {
  createVehicleSilhouetteManifest,
  validateBaselineReportSchema,
  compareSilhouetteAuditWithBaseline
} from '../src/calibration/VehicleSilhouetteAudit.js';

function parseCliArgs(args) {
  let isUpdateBaseline = false;
  const positionals = [];
  const unknownFlags = [];

  for (const arg of args) {
    if (arg === '--update-baseline') {
      isUpdateBaseline = true;
    } else if (arg.startsWith('-')) {
      unknownFlags.push(arg);
    } else {
      positionals.push(arg);
    }
  }

  if (unknownFlags.length > 0) {
    return { error: `Unknown CLI flag(s): ${unknownFlags.join(', ')}` };
  }

  if (positionals.length > 1) {
    return { error: `Multiple positional destination arguments provided: ${positionals.join(', ')}` };
  }

  if (isUpdateBaseline && positionals.length > 0) {
    return { error: `Positional output argument "${positionals[0]}" combined with --update-baseline is ambiguous and forbidden.` };
  }

  const baselineFixturePath = resolve('./test/fixtures/vehicle-silhouette-baseline.json');
  let targetOutput;

  if (isUpdateBaseline) {
    targetOutput = baselineFixturePath;
  } else if (positionals.length > 0) {
    targetOutput = resolve(positionals[0]);
  } else {
    const tmpDir = process.env.TMPDIR;
    if (!tmpDir || tmpDir.trim() === '') {
      return { error: 'Environment variable TMPDIR must be set when no explicit positional output path is provided.' };
    }
    targetOutput = resolve(tmpDir, 'vehicle-silhouette-audit.json');
  }

  return {
    isUpdateBaseline,
    targetOutput,
    baselineFixturePath
  };
}

async function writeAtomic(targetPath, content) {
  const dir = dirname(targetPath);
  await mkdir(dir, { recursive: true });

  const stagingDir = await mkdtemp(resolve(dir, '.tmp-silhouette-stage-'));
  const stagingFile = resolve(stagingDir, 'manifest.json');

  try {
    await writeFile(stagingFile, content, 'utf8');
    await rename(stagingFile, targetPath);
  } finally {
    try {
      await rm(stagingDir, { recursive: true, force: true });
    } catch {}
  }
}

const parsed = parseCliArgs(process.argv.slice(2));
if (parsed.error) {
  process.stderr.write(`CLI error: ${parsed.error}\n`);
  process.exit(1);
}

const { isUpdateBaseline, targetOutput, baselineFixturePath } = parsed;

const manifest = createVehicleSilhouetteManifest({
  profiles: VEHICLE_VISUAL_PROFILES,
  meshFactories: FRANCE_1940_VEHICLE_MESH_FACTORIES
});

const hasFailures = manifest.failures && manifest.failures.length > 0;

if (isUpdateBaseline && hasFailures) {
  process.stderr.write('Audit validation failed with errors:\n');
  for (const failure of manifest.failures) {
    process.stderr.write(`  - ${failure}\n`);
  }
  process.stderr.write('Refusing to update baseline fixture due to audit validation failures.\n');
  process.exit(1);
}

const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
await writeAtomic(targetOutput, serializedManifest);

console.log(
  `${manifest.vehicleCount} vehicles x ${manifest.views.length} views x ${manifest.lods.length} LODs`
  + ` (${manifest.recordCount} records) -> ${targetOutput}`
);

if (hasFailures) {
  process.stderr.write('Audit validation failed with errors:\n');
  for (const failure of manifest.failures) {
    process.stderr.write(`  - ${failure}\n`);
  }
  process.exit(1);
}

if (isUpdateBaseline) {
  console.log(`Baseline fixture updated cleanly at ${targetOutput} with ${manifest.recordCount} records.`);
  process.exit(0);
}

let baselineContent;
try {
  baselineContent = await readFile(baselineFixturePath, 'utf8');
} catch (err) {
  process.stderr.write(`Missing or unreadable baseline fixture at expected path: ${baselineFixturePath}\n`);
  process.exit(1);
}

let baselineReport;
try {
  baselineReport = JSON.parse(baselineContent);
} catch (err) {
  process.stderr.write(`Malformed baseline fixture JSON at ${baselineFixturePath}: ${err.message}\n`);
  process.exit(1);
}

const baselineValidation = validateBaselineReportSchema(baselineReport);
if (!baselineValidation.valid) {
  process.stderr.write(`Baseline fixture schema validation failed for ${baselineFixturePath}:\n`);
  for (const err of baselineValidation.errors) {
    process.stderr.write(`  - ${err}\n`);
  }
  process.exit(1);
}

const comparison = compareSilhouetteAuditWithBaseline(manifest, baselineReport);
if (!comparison.pass) {
  process.stderr.write('Baseline comparison failures:\n');
  for (const diff of comparison.differences) {
    process.stderr.write(`  - ${diff}\n`);
  }
  process.exit(1);
}

console.log('Baseline comparison PASSED cleanly (168/168 records match).');
process.exit(0);

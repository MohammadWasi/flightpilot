import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

type Dependency = { name: string; versions: string[]; license: string };
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const markdown = (value: string) => value.replaceAll('|', '\\|').replace(/[\r\n]/g, ' ');

function dependency(value: unknown, groupLicense?: string): Dependency {
  if (!isRecord(value) || typeof value.name !== 'string')
    throw new Error('Unexpected dependency entry in pnpm license inventory.');
  // pnpm emits grouped entries with `versions`; older/flat inventories use `version`.
  const versions = Array.isArray(value.versions)
    ? value.versions
    : typeof value.version === 'string'
      ? [value.version]
      : [];
  if (!versions.length || !versions.every((version) => typeof version === 'string'))
    throw new Error(`Missing versions for dependency ${value.name}.`);
  const license =
    typeof value.license === 'string' && value.license ? value.license : (groupLicense ?? 'UNKNOWN');
  return { name: value.name, versions: [...new Set(versions)].sort(compare), license };
}

function inventory(value: unknown): Dependency[] {
  if (Array.isArray(value)) return value.map((entry) => dependency(entry));
  if (!isRecord(value)) throw new Error('Expected an object or array from pnpm licenses list.');
  return Object.entries(value).flatMap(([license, entries]) => {
    if (!Array.isArray(entries)) throw new Error('Expected dependency arrays grouped by license.');
    return entries.map((entry) => dependency(entry, license));
  });
}

const packageManagerScript = process.env.npm_execpath;
const args = ['licenses', 'list', '--json'];
const result = packageManagerScript
  ? spawnSync(process.execPath, [packageManagerScript, ...args], {
      cwd: projectRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
  : spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, {
      cwd: projectRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      maxBuffer: 16 * 1024 * 1024,
    });
if (result.error || result.status !== 0)
  throw new Error('Could not read dependency licenses. Install dependencies with pnpm, then retry.');
const dependencies = inventory(JSON.parse(result.stdout) as unknown);
if (!dependencies.length) throw new Error('No installed dependencies found; run pnpm install first.');
const groups = new Map<string, Map<string, Set<string>>>();
for (const item of dependencies) {
  const group = groups.get(item.license) ?? new Map<string, Set<string>>();
  const versions = group.get(item.name) ?? new Set<string>();
  item.versions.forEach((version) => versions.add(version));
  group.set(item.name, versions);
  groups.set(item.license, group);
}
const rows = [...groups.entries()].sort(([a], [b]) => compare(a, b));
const count = rows.reduce((sum, [, group]) => sum + group.size, 0);
const output = [
  '# Third-party dependency notices',
  '',
  "FlightPilot's root MIT license applies to this project's original source. Dependencies retain their own licenses and copyright notices. No dependency source or binaries are vendored in this repository.",
  '',
  'This inventory records package license metadata from the dependencies installed by pnpm, including development dependencies. It is not a replacement for the full upstream license texts or notices. The installed packages include those texts; preserve the applicable notices and satisfy their terms when redistributing dependencies or an application image.',
  '',
  'Some dependencies use LGPL, MPL, or Creative Commons terms. In particular, libvips binaries, lightningcss, and caniuse-lite retain their respective upstream licenses. This project does not relicense them under MIT.',
  '',
  'Regenerate after installing the locked dependencies:',
  '',
  '```sh',
  'pnpm install --frozen-lockfile',
  'pnpm licenses:generate',
  '```',
  '',
  'The generator reads `pnpm licenses list --json` and retains only package names, versions, and license identifiers. Machine-specific install paths and other metadata are omitted. Platform-specific optional packages can change the inventory between operating systems or architectures; regenerate for any binary distribution target.',
  '',
  `This snapshot contains **${count} package entries** across **${groups.size} license groups**.`,
  '',
  ...rows.flatMap(([license, group]) => [
    `## ${markdown(license)}`,
    '',
    '| Package | Installed versions |',
    '| --- | --- |',
    ...[...group.entries()]
      .sort(([a], [b]) => compare(a, b))
      .map(
        ([name, versions]) =>
          `| ${markdown(name)} | ${[...versions].sort(compare).map(markdown).join(', ')} |`,
      ),
    '',
  ]),
].join('\n');
const target = new URL('../THIRD_PARTY_NOTICES.md', import.meta.url);
await writeFile(
  target,
  await format(output, { ...(await resolveConfig(fileURLToPath(target))), parser: 'markdown' }),
);
console.log(`Updated THIRD_PARTY_NOTICES.md with ${count} package entries; install paths omitted.`);

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { validateSampleManifest } from './sample-manifest.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const sampleRoot = join(repositoryRoot, 'assets', 'samples');
const manifest = JSON.parse(readFileSync(join(sampleRoot, 'manifest.json'), 'utf8'));

const fileSizes = new Map();
const filesOnDisk = [];
const directories = [sampleRoot];
while (directories.length > 0) {
  const directory = directories.pop();
  if (!directory) continue;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      directories.push(absolutePath);
      continue;
    }
    if (!entry.isFile() || entry.name === 'manifest.json') continue;
    const localPath = relative(sampleRoot, absolutePath);
    filesOnDisk.push(localPath);
    fileSizes.set(localPath, statSync(absolutePath).size);
  }
}

const result = validateSampleManifest(manifest, {
  fileSizes,
  filesOnDisk,
  implementationExists: (implementation) => existsSync(join(repositoryRoot, implementation)),
});

console.log(
  `Sample manifest verified: ${manifest.assets.length} entries, ${result.packagedBytes} bytes`,
);

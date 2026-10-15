import { access, readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const sampleRoot = join(repositoryRoot, 'assets', 'samples');
const manifestPath = join(sampleRoot, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets)) {
  throw new Error('Sample manifest must use schemaVersion 1 and contain an assets array');
}

const ids = new Set();
let packagedBytes = 0;
for (const asset of manifest.assets) {
  if (!asset.id || ids.has(asset.id))
    throw new Error(`Invalid or duplicate sample id: ${asset.id}`);
  ids.add(asset.id);
  if (!asset.license || !asset.source)
    throw new Error(`Sample ${asset.id} lacks licence provenance`);
  if (asset.kind === 'procedural') {
    if (!asset.implementation)
      throw new Error(`Procedural sample ${asset.id} lacks implementation`);
    await access(join(repositoryRoot, asset.implementation));
    if (asset.packagedBytes !== 0)
      throw new Error(`Procedural sample ${asset.id} must have zero bytes`);
  } else if (asset.kind === 'file') {
    const filePath = join(sampleRoot, asset.file);
    const fileStats = await stat(filePath);
    if (fileStats.size !== asset.packagedBytes) {
      throw new Error(`Sample ${asset.id} byte count does not match its manifest entry`);
    }
    packagedBytes += fileStats.size;
  } else {
    throw new Error(`Sample ${asset.id} has unsupported kind ${asset.kind}`);
  }
}

const declaredFiles = new Set(
  manifest.assets.filter((asset) => asset.kind === 'file').map((asset) => asset.file),
);
const directories = [sampleRoot];
while (directories.length > 0) {
  const directory = directories.pop();
  if (!directory) continue;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      directories.push(absolutePath);
      continue;
    }
    if (!entry.isFile()) continue;
    const localPath = relative(sampleRoot, absolutePath);
    if (localPath !== 'manifest.json' && !declaredFiles.has(localPath)) {
      throw new Error(`Sample file is missing from manifest: ${localPath}`);
    }
  }
}

if (packagedBytes > manifest.maximumPackagedBytes) {
  throw new Error(
    `Sample pack is ${packagedBytes} bytes; limit is ${manifest.maximumPackagedBytes}`,
  );
}

console.log(`Sample manifest verified: ${manifest.assets.length} entries, ${packagedBytes} bytes`);

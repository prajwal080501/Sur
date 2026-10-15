const ALLOWED_FILE_LICENCE = 'CC0-1.0';
const OWNED_LICENCE = 'LicenseRef-Sur-Original';

function fail(message) {
  throw new Error(message);
}

function isHttpUrl(value) {
  return typeof value === 'string' && /^https:\/\/\S+$/.test(value);
}

/**
 * @param {object} manifest
 * @param {{ fileSizes: Map<string, number>, filesOnDisk: readonly string[], implementationExists: (path: string) => boolean }} options
 */
export function validateSampleManifest(manifest, options) {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets)) {
    fail('Sample manifest must use schemaVersion 1 and contain an assets array');
  }
  if (!Number.isFinite(manifest.maximumPackagedBytes) || manifest.maximumPackagedBytes <= 0) {
    fail('Sample manifest must declare a positive maximumPackagedBytes');
  }

  const ids = new Set();
  const declaredFiles = new Set();
  let packagedBytes = 0;

  for (const asset of manifest.assets) {
    if (!asset.id || ids.has(asset.id)) fail(`Invalid or duplicate sample id: ${asset.id}`);
    ids.add(asset.id);
    if (!asset.license || !asset.source) fail(`Sample ${asset.id} lacks licence provenance`);
    if (asset.license !== ALLOWED_FILE_LICENCE && asset.license !== OWNED_LICENCE) {
      fail(`Sample ${asset.id} licence ${asset.license} is not CC0-1.0 or an owned Sur recording`);
    }

    if (asset.kind === 'procedural') {
      if (asset.license !== OWNED_LICENCE) {
        fail(`Procedural sample ${asset.id} must be an owned Sur recording`);
      }
      if (!asset.implementation) fail(`Procedural sample ${asset.id} lacks implementation`);
      if (!options.implementationExists(asset.implementation)) {
        fail(`Procedural sample ${asset.id} implementation is missing`);
      }
      if (asset.packagedBytes !== 0) fail(`Procedural sample ${asset.id} must have zero bytes`);
      continue;
    }

    if (asset.kind !== 'file') fail(`Sample ${asset.id} has unsupported kind ${asset.kind}`);
    if (asset.license !== ALLOWED_FILE_LICENCE) {
      fail(`Sample ${asset.id} licence ${asset.license} is not CC0-1.0 or an owned Sur recording`);
    }
    if (!asset.author || typeof asset.author !== 'string') {
      fail(`Sample ${asset.id} lacks an author`);
    }
    if (!isHttpUrl(asset.sourceUrl)) {
      fail(`Sample ${asset.id} lacks an https source URL`);
    }
    if (!asset.file || declaredFiles.has(asset.file)) {
      fail(`Sample ${asset.id} has a missing or duplicate file`);
    }
    declaredFiles.add(asset.file);
    const size = options.fileSizes.get(asset.file);
    if (size === undefined) fail(`Sample ${asset.id} file is missing: ${asset.file}`);
    if (size !== asset.packagedBytes) {
      fail(`Sample ${asset.id} byte count does not match its manifest entry`);
    }
    packagedBytes += size;
  }

  for (const file of options.filesOnDisk) {
    if (!declaredFiles.has(file)) fail(`Sample file is missing from manifest: ${file}`);
  }

  if (packagedBytes > manifest.maximumPackagedBytes) {
    fail(`Sample pack is ${packagedBytes} bytes; limit is ${manifest.maximumPackagedBytes}`);
  }

  return { packagedBytes };
}

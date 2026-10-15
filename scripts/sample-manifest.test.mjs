import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSampleManifest } from './sample-manifest.mjs';

test('rejects a recorded sample that is not CC0', () => {
  assert.throws(
    () =>
      validateSampleManifest(
        {
          schemaVersion: 1,
          maximumPackagedBytes: 1000,
          assets: [
            {
              id: 'piano-c4',
              kind: 'file',
              license: 'CC-BY-3.0',
              author: 'Example',
              source: 'Example piano',
              sourceUrl: 'https://example.com/piano',
              file: 'piano/C4.ogg',
              packagedBytes: 10,
            },
          ],
        },
        { fileSizes: new Map([['piano/C4.ogg', 10]]), filesOnDisk: ['piano/C4.ogg'] },
      ),
    /CC0/,
  );
});

test('accepts owned procedural assets and CC0 files with matching bytes', () => {
  const result = validateSampleManifest(
    {
      schemaVersion: 1,
      maximumPackagedBytes: 1000,
      assets: [
        {
          id: 'pad',
          kind: 'procedural',
          license: 'LicenseRef-Sur-Original',
          source: 'Original synthesis',
          implementation: 'packages/audio-engine/src/accompaniment/tone-accompaniment.ts',
          packagedBytes: 0,
        },
        {
          id: 'piano-c4',
          kind: 'file',
          license: 'CC0-1.0',
          author: 'Example',
          source: 'Example piano',
          sourceUrl: 'https://example.com/piano',
          file: 'piano/C4.ogg',
          packagedBytes: 10,
        },
      ],
    },
    {
      fileSizes: new Map([['piano/C4.ogg', 10]]),
      filesOnDisk: ['piano/C4.ogg'],
      implementationExists: () => true,
    },
  );
  assert.equal(result.packagedBytes, 10);
});

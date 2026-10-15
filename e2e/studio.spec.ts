import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installSyntheticMicrophone } from './synthetic-microphone.js';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => installSyntheticMicrophone(page));

test('detects pitch and advances to key confirmation', async ({ page }) => {
  await page.goto('/studio');
  if (process.platform === 'darwin') {
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __surSyntheticWorklet?: boolean }).__surSyntheticWorklet,
        ),
      )
      .toBe(true);
  }
  await page.getByRole('button', { name: 'Start listening' }).click();
  await expect(page.getByText('listening', { exact: true })).toBeVisible({ timeout: 5_000 });
  if (process.platform === 'darwin') {
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __surSyntheticFrames?: number }).__surSyntheticFrames ?? 0,
        ),
      )
      .toBeGreaterThan(2);
  }
  await expect(page.locator('.pitch-note')).toHaveText('A4', { timeout: 5_000 });
  await expect(page.getByText('Detected', { exact: true })).toBeVisible({ timeout: 8_000 });
  await page.getByRole('button', { name: 'Lock key' }).click();
  await expect(page.getByText(/Key locked to/)).toBeVisible();

  await page.locator('.ready-panel').getByLabel('Style').selectOption('piano');
  await page.locator('.ready-panel select:has(option[value="keherwa"])').selectOption('keherwa');

  await page.getByRole('button', { name: 'Start accompaniment' }).click();
  await expect(page.getByText('accompanying', { exact: true })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText('Current chord', { exact: true })).toBeVisible();
  await expect(page.locator('.accompaniment-live > strong')).not.toHaveText('Listening…', {
    timeout: 5_000,
  });
  if (process.platform === 'darwin') {
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __surStartedAudioSamples?: number }).__surStartedAudioSamples ??
            0,
        ),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __surStartedNonSilentSamples?: number })
              .__surStartedNonSilentSamples ?? 0,
        ),
      )
      .toBeGreaterThan(0);
  }
  await page.locator('.accompaniment-live').getByLabel('Instrument').selectOption('strum');
  await page.locator('.accompaniment-live select:has(option[value="keherwa"])').selectOption('pop');
  await page.getByRole('button', { name: 'Hold chord' }).click();
  await expect(page.getByRole('button', { name: 'Release chord' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByText('ready', { exact: true })).toBeVisible();
});

test('serves the range and latency tools', async ({ page }) => {
  await page.goto('/riyaz/range');
  await expect(page.getByRole('heading', { name: 'Find your comfortable range' })).toBeVisible();
  await page.goto('/dev/latency');
  await expect(page.getByRole('heading', { name: 'Audio latency lab' })).toBeVisible();
});

test('renders a public share and handles revoked links', async ({ page }) => {
  await page.route('**/api/v1/public/shares/demo1234', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        title: 'Morning riyaz',
        singer: 'Asha',
        key: 'A minor',
        tempoBpm: 90,
        audioUrl: 'https://media.sur.test/demo1234/audio.mp3',
        videoUrl: null,
        chords: [
          {
            tMs: 0,
            bar: 1,
            beat: 1,
            symbol: 'Am',
            roman: 'i',
            pitches: [57, 60, 64],
            confidence: 0.9,
            source: 'rules',
          },
        ],
      }),
    }),
  );
  await page.goto('/s/demo1234');
  await expect(page.getByRole('heading', { name: 'Morning riyaz' })).toBeVisible();
  await expect(page.getByText('Sung by Asha')).toBeVisible();
  await expect(page.getByText('A minor')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chords' })).toBeVisible();

  await page.route('**/api/v1/public/shares/gone1234', (route) =>
    route.fulfill({ status: 410, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/s/gone1234');
  await expect(page.getByRole('heading', { name: 'Performance unavailable' })).toBeVisible();
  await expect(page.getByText('This share has expired or was removed.')).toBeVisible();
});

test('records separate local tracks and reaches review', async ({ page }) => {
  await page.goto('/studio');
  await page.getByRole('button', { name: 'Start listening' }).click();
  await expect(page.getByText('Detected', { exact: true })).toBeVisible({ timeout: 8_000 });
  await page.getByRole('button', { name: 'Lock key' }).click();
  await page.getByRole('button', { name: 'Record a take' }).click();
  await expect(page.getByText('recording', { exact: true })).toBeVisible({ timeout: 8_000 });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Finish recording' }).click();
  await expect(page.getByText('Take saved locally', { exact: true })).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByRole('button', { name: 'Download voice WAV' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download backing WAV' })).toBeVisible();
  const voiceDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download voice WAV' }).click();
  expect((await voiceDownloadPromise).suggestedFilename()).toBe('sur-voice.wav');
  await expect(page.getByLabel('Performance report')).toContainText('Pitch accuracy');
  await expect(page.getByLabel('Performance report')).toContainText('A4–A4');
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('sur-local-audio');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error ?? new Error('Unable to open take store'));
        });
        return new Promise<number>((resolve, reject) => {
          const request = database.transaction('takes').objectStore('takes').count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error ?? new Error('Unable to count saved takes'));
        });
      }),
    )
    .toBe(1);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('sur-local-audio');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error ?? new Error('Unable to open take store'));
        });
        return new Promise<boolean>((resolve, reject) => {
          const request = database.transaction('takes').objectStore('takes').getAll();
          request.onsuccess = () => {
            const take = request.result.at(-1) as
              { report?: { rangeLowMidi?: number } } | undefined;
            resolve(take?.report?.rangeLowMidi === 69);
          };
          request.onerror = () => reject(request.error ?? new Error('Unable to read saved take'));
        });
      }),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Keep take' }).click();
  await expect(page.getByText('mix', { exact: true })).toBeVisible();
  await page.getByLabel('Vocal preset').selectOption('warm');
  await page.getByLabel(/Voice balance/).fill('0.65');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Normalize and download WAV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('sur-mix.wav');
  const wavPath = await download.path();
  expect(wavPath).not.toBeNull();
  const wavBytes = await readFile(wavPath ?? '');
  expect(wavBytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
  await expect(page.getByText('mix', { exact: true })).toBeVisible();
  await expect(page.getByText(/Last export: -14\.0 LUFS/)).toBeVisible();
  await page.getByLabel('MP3 quality').selectOption('320');
  const mp3DownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Normalize and download MP3' }).click();
  const mp3Download = await mp3DownloadPromise;
  expect(mp3Download.suggestedFilename()).toBe('sur-mix.mp3');
  const mp3Path = await mp3Download.path();
  expect(mp3Path).not.toBeNull();
  const mp3Bytes = await readFile(mp3Path ?? '');
  expect(mp3Bytes.length).toBeGreaterThan(1_000);
  expect(mp3Bytes[0]).toBe(0xff);
  expect((mp3Bytes[1] ?? 0) & 0xe0).toBe(0xe0);
});

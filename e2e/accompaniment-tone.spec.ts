import { expect, test } from '@playwright/test';

test('a test tone resumes audio, detects a chord, and schedules accompaniment', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Object.getOwnPropertyDescriptor(AudioBufferSourceNode.prototype, 'start')
      ?.value as AudioBufferSourceNode['start'];
    AudioBufferSourceNode.prototype.start = function (...args) {
      const testWindow = window as unknown as { __surNonSilent?: number };
      const channel = this.buffer?.getChannelData(0);
      if (channel?.some((sample) => Math.abs(sample) > 0.0001)) {
        testWindow.__surNonSilent = (testWindow.__surNonSilent ?? 0) + 1;
      }
      return Reflect.apply(original, this, args);
    };
  });

  await page.goto('/dev/accompaniment');
  await page.getByRole('button', { name: 'Play test tone' }).click();
  await expect(page.getByTestId('audio-state')).toHaveText('running', { timeout: 5_000 });
  await expect(page.getByTestId('detected-pitch')).toHaveText(/^[FA]4$/, { timeout: 8_000 });
  await expect(page.getByTestId('current-chord')).toHaveText('F', { timeout: 12_000 });
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __surNonSilent?: number }).__surNonSilent ?? 0),
    )
    .toBeGreaterThan(0);
});

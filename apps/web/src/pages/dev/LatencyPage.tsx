import { useEffect, useRef, useState } from 'react';

export function LatencyPage() {
  const [running, setRunning] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [resultMs, setResultMs] = useState<number | null>(() => {
    const stored = localStorage.getItem('sur.outputLatencyMs');
    return stored === null ? null : Number(stored);
  });
  const context = useRef<AudioContext | null>(null);
  const targets = useRef<number[]>([]);
  const offsets = useRef<number[]>([]);

  useEffect(
    () => () => {
      void context.current?.close();
    },
    [],
  );

  const startCalibration = async () => {
    await context.current?.close();
    const audioContext = new AudioContext({ latencyHint: 'interactive' });
    await audioContext.resume();
    context.current = audioContext;
    offsets.current = [];
    setTapCount(0);
    setRunning(true);
    const first = audioContext.currentTime + 1;
    targets.current = Array.from({ length: 8 }, (_, index) => first + index * 0.75);
    for (const target of targets.current) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.frequency.value = 1000;
      gain.gain.setValueAtTime(0, target);
      gain.gain.linearRampToValueAtTime(0.18, target + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, target + 0.05);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(target);
      oscillator.stop(target + 0.06);
    }
  };

  const recordTap = () => {
    const audioContext = context.current;
    const target = targets.current[offsets.current.length];
    if (!running || !audioContext || target === undefined) return;
    offsets.current.push((audioContext.currentTime - target) * 1000);
    const count = offsets.current.length;
    setTapCount(count);
    if (count === 8) {
      const sorted = [...offsets.current].sort((left, right) => left - right);
      const median = Math.round(((sorted[3] ?? 0) + (sorted[4] ?? 0)) / 2);
      localStorage.setItem('sur.outputLatencyMs', String(median));
      setResultMs(median);
      setRunning(false);
    }
  };

  return (
    <section className="content" aria-labelledby="latency-title">
      <p className="eyebrow">Development tool</p>
      <h1 id="latency-title">Audio latency lab</h1>
      <p>
        Start the clicks, then tap once for every click. Use wired headphones for a useful result.
      </p>
      <div className="calibration-panel">
        <button type="button" onClick={() => void startCalibration()} disabled={running}>
          Start eight-click test
        </button>
        <button
          type="button"
          className="secondary tap-button"
          onPointerDown={recordTap}
          disabled={!running}
        >
          Tap {running ? `${tapCount}/8` : ''}
        </button>
      </div>
      <p className="notice" aria-live="polite">
        {resultMs === null
          ? 'No saved calibration.'
          : `Saved median tap offset: ${resultMs} ms. This includes human reaction time and is an estimate, not a loopback measurement.`}
      </p>
    </section>
  );
}

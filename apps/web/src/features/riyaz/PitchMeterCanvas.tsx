import type { PitchFrame } from '@sur/shared-types';
import { useEffect, useRef } from 'react';

interface PitchMeterCanvasProps {
  readonly getFrame: () => PitchFrame | null;
  readonly saPitchClass: number;
}

const HISTORY_SIZE = 768;

export function PitchMeterCanvas({ getFrame, saPitchClass }: PitchMeterCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const times = useRef(new Float64Array(HISTORY_SIZE));
  const midis = useRef(new Float32Array(HISTORY_SIZE).fill(Number.NaN));
  const historyIndex = useRef(0);
  const lastFrameTime = useRef(-1);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    let animationFrame = 0;
    const draw = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
        canvas.width = width * ratio;
        canvas.height = height * ratio;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const meterHeight = 76;
      const middle = width / 2;
      context.fillStyle = 'rgba(90, 180, 125, 0.12)';
      context.fillRect(middle - width * 0.15, 0, width * 0.3, meterHeight);
      context.strokeStyle = '#5a544d';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(middle, 0);
      context.lineTo(middle, meterHeight);
      context.stroke();

      const frame = getFrame();
      const cents = frame?.cents;
      if (cents !== null && cents !== undefined) {
        const x = middle + (Math.max(-50, Math.min(50, cents)) / 50) * middle;
        const magnitude = Math.abs(cents);
        context.strokeStyle = magnitude <= 15 ? '#73d49b' : magnitude <= 35 ? '#e9aa78' : '#ef746f';
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(x, 10);
        context.lineTo(x, meterHeight - 10);
        context.stroke();
      }

      if (frame && frame.timeMs !== lastFrameTime.current) {
        const index = historyIndex.current % HISTORY_SIZE;
        times.current[index] = frame.timeMs;
        midis.current[index] = frame.midi ?? Number.NaN;
        historyIndex.current += 1;
        lastFrameTime.current = frame.timeMs;
      }

      const traceTop = meterHeight + 20;
      const traceHeight = height - traceTop - 10;
      const latestMidi = frame?.midi ?? 60 + saPitchClass;
      const tonicMidi = saPitchClass + 12 * Math.round((latestMidi - saPitchClass) / 12);
      const rangeMin = tonicMidi - 5;
      const rangeMax = tonicMidi + 19;
      const yForMidi = (midi: number) =>
        traceTop + traceHeight - ((midi - rangeMin) / (rangeMax - rangeMin)) * traceHeight;

      context.font = '11px system-ui';
      context.fillStyle = '#8f887f';
      context.strokeStyle = '#3d3934';
      context.lineWidth = 1;
      for (const [label, note] of [
        ['Sa', tonicMidi],
        ['Pa', tonicMidi + 7],
        ["Sa'", tonicMidi + 12],
      ] as const) {
        const y = yForMidi(note);
        context.beginPath();
        context.moveTo(32, y);
        context.lineTo(width, y);
        context.stroke();
        context.fillText(label, 4, y + 4);
      }

      if (frame) {
        const cutoff = frame.timeMs - 8000;
        context.strokeStyle = '#e9aa78';
        context.lineWidth = 2;
        context.beginPath();
        let drawing = false;
        const count = Math.min(historyIndex.current, HISTORY_SIZE);
        for (let offset = count - 1; offset >= 0; offset -= 1) {
          const rawIndex = historyIndex.current - 1 - offset;
          const index = ((rawIndex % HISTORY_SIZE) + HISTORY_SIZE) % HISTORY_SIZE;
          const time = times.current[index] ?? 0;
          const midi = midis.current[index] ?? Number.NaN;
          if (time < cutoff || Number.isNaN(midi)) {
            drawing = false;
            continue;
          }
          const x = ((time - cutoff) / 8000) * width;
          const y = yForMidi(midi);
          if (drawing) context.lineTo(x, y);
          else context.moveTo(x, y);
          drawing = true;
        }
        context.stroke();
      }
      animationFrame = requestAnimationFrame(draw);
    };
    animationFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrame);
  }, [getFrame, saPitchClass]);

  return <canvas className="pitch-canvas" ref={canvasRef} aria-hidden="true" />;
}

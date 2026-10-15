import {
  alignRecordedTracks,
  applyVocalPreset,
  createTakeReport,
  mixVoiceAndBacking,
  renderBackingFromChords,
  sargamName,
  westernNoteName,
} from '@sur/audio-engine';
import type { VocalPreset } from '@sur/audio-engine';
import type { ChordEvent, KeyEstimate, PitchFrame, TakeReport } from '@sur/shared-types';
import { useEffect, useRef, useState } from 'react';
import { PitchMeterCanvas } from '../features/riyaz/PitchMeterCanvas.js';
import { useLivePitch } from '../features/riyaz/useLivePitch.js';
import { useTanpura } from '../features/riyaz/useTanpura.js';
import { LocalTakeStore } from '../features/recording/localTakeStore.js';
import {
  encodeWavInWorker,
  normalizeMixInWorker,
  type WorkerNormalizedMix,
} from '../features/recording/audioExportWorkerClient.js';
import { MP3_BITRATES, type Mp3Bitrate } from '../features/recording/mp3.js';
import { primeSharedAudioContext } from '../features/audio/shared-audio.js';
import { useAccompaniment } from '../features/studio/useAccompaniment.js';
import { useKeyDetection, type KeyMode } from '../features/studio/useKeyDetection.js';
import { useStudioStore } from '../features/studio/useStudioStore.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

interface LocalTake {
  readonly id: string;
  readonly voice: Float32Array;
  readonly backing: readonly [Float32Array, Float32Array];
  readonly sampleRate: number;
  readonly durationMs: number;
  readonly chordEvents: readonly ChordEvent[];
  readonly report: TakeReport;
}

function keyLabel(key: KeyEstimate, mode: KeyMode): string {
  const tonic = NOTE_NAMES[key.tonicPc] ?? 'C';
  return mode === 'indian' ? `Sa = ${tonic}` : `${tonic} ${key.mode}`;
}

export function StudioPage() {
  const [saPitchClass, setSaPitchClass] = useState(1);
  const [keyMode, setKeyMode] = useState<KeyMode>('western');
  const [selectedKey, setSelectedKey] = useState<KeyEstimate | null>(null);
  const [take, setTake] = useState<LocalTake | null>(null);
  const [mixPreset, setMixPreset] = useState<VocalPreset>('natural');
  const [voiceBalance, setVoiceBalance] = useState(0.55);
  const [mp3Bitrate, setMp3Bitrate] = useState<Mp3Bitrate>(192);
  const [mixMeasurement, setMixMeasurement] = useState<WorkerNormalizedMix | null>(null);
  const [mixError, setMixError] = useState<string | null>(null);
  const recordingStarted = useRef(false);
  const recordingPitchFrames = useRef<PitchFrame[]>([]);
  const recordingId = useRef<string | null>(null);
  const chunkIndex = useRef(0);
  const chunkWrites = useRef<Promise<void>>(Promise.resolve());
  const takeStore = useRef(new LocalTakeStore());
  const state = useStudioStore((store) => store.state);
  const send = useStudioStore((store) => store.send);
  const pitch = useLivePitch();
  const keyDetection = useKeyDetection();
  const accompaniment = useAccompaniment();
  const midi = pitch.frame?.midi ?? null;
  const cents = pitch.frame?.cents ?? null;
  const selectedSaMidi = saPitchClass + 12 * Math.round((49 - saPitchClass) / 12);
  const tanpura = useTanpura(selectedSaMidi);

  useEffect(
    () =>
      pitch.onNote((note) => {
        if (state === 'listening') keyDetection.push(note);
        if (state === 'accompanying' || state === 'recording') accompaniment.pushNote(note);
      }),
    [accompaniment.pushNote, keyDetection.push, pitch.onNote, state],
  );

  useEffect(
    () =>
      pitch.onPcmChunk((pcm) => {
        const id = recordingId.current;
        if (!id) return;
        const index = chunkIndex.current;
        chunkIndex.current += 1;
        chunkWrites.current = chunkWrites.current.then(() =>
          takeStore.current.appendVoiceChunk(id, index, pcm),
        );
      }),
    [pitch.onPcmChunk],
  );

  useEffect(
    () =>
      pitch.onFrame((frame) => {
        if (state === 'recording') recordingPitchFrames.current.push(frame);
      }),
    [pitch.onFrame, state],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'h' || state !== 'accompanying') return;
      accompaniment.setHold(!accompaniment.held);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [accompaniment.held, accompaniment.setHold, state]);

  useEffect(() => {
    if (!keyDetection.estimate || state !== 'listening') return;
    setSelectedKey(keyDetection.estimate);
    let cancelled = false;
    void pitch.stop().then(() => {
      if (!cancelled) send({ type: 'KEY_DETECTED' });
    });
    return () => {
      cancelled = true;
    };
  }, [keyDetection.estimate, pitch.stop, send, state]);

  useEffect(() => {
    if (state !== 'countIn' || !accompaniment.countInComplete || recordingStarted.current) {
      return;
    }
    recordingStarted.current = true;
    pitch.startRecording();
    send({ type: 'COUNT_IN_COMPLETE' });
  }, [accompaniment.countInComplete, pitch.startRecording, send, state]);

  const startListening = async () => {
    primeSharedAudioContext();
    keyDetection.begin(keyMode);
    if (await pitch.start()) send({ type: state === 'keyConfirm' ? 'RELISTEN' : 'START_LISTEN' });
  };

  const stopListening = async () => {
    await pitch.stop();
    keyDetection.reset();
    send({ type: 'CANCEL' });
  };

  const nudgeKey = (semitones: number) => {
    setSelectedKey((current) =>
      current ? { ...current, tonicPc: (current.tonicPc + semitones + 12) % 12 } : current,
    );
  };

  const confirmKey = () => {
    if (!selectedKey) return;
    keyDetection.lock(selectedKey);
    setSaPitchClass(selectedKey.tonicPc);
    send({ type: 'CONFIRM_KEY' });
  };

  const startAccompanying = async () => {
    if (!selectedKey) return;
    primeSharedAudioContext();
    if (tanpura.playing) await tanpura.toggle();
    const [micReady, engineReady] = await Promise.all([
      pitch.start(),
      accompaniment.prepare(selectedKey),
    ]);
    if (!micReady || !engineReady) {
      if (micReady) await pitch.stop();
      return;
    }
    accompaniment.start();
    send({ type: 'PLAY' });
  };

  const stopAccompanying = async () => {
    accompaniment.stop();
    await pitch.stop();
    send({ type: 'STOP' });
  };

  const startRecordingSession = async () => {
    if (!selectedKey) return;
    primeSharedAudioContext();
    if (tanpura.playing) await tanpura.toggle();
    recordingStarted.current = false;
    recordingPitchFrames.current = [];
    recordingId.current = crypto.randomUUID();
    chunkIndex.current = 0;
    chunkWrites.current = Promise.resolve();
    setTake(null);
    const [micReady, engineReady] = await Promise.all([
      pitch.start(),
      accompaniment.prepare(selectedKey),
    ]);
    if (!micReady || !engineReady) {
      if (micReady) await pitch.stop();
      return;
    }
    accompaniment.start();
    send({ type: 'RECORD' });
  };

  const finishRecording = async () => {
    if (!selectedKey) return;
    const captured = await pitch.stopRecording();
    const durationMs = (captured.voice.length / captured.sampleRate) * 1000;
    const chordEvents = accompaniment.getChordLog();
    const backing = renderBackingFromChords(chordEvents, durationMs, captured.sampleRate, {
      style: accompaniment.style,
      rhythm: accompaniment.rhythm,
      bpm: accompaniment.bpm,
      harmonyGain: accompaniment.harmonyVolume,
      rhythmGain: accompaniment.rhythmVolume,
    });
    const aligned = alignRecordedTracks(captured.voice, backing, 0);
    const report = createTakeReport(recordingPitchFrames.current, selectedKey);
    await chunkWrites.current;
    const id = recordingId.current ?? crypto.randomUUID();
    const copyPcm = (pcm: Float32Array) => {
      const copy = new ArrayBuffer(pcm.byteLength);
      new Float32Array(copy).set(pcm);
      return copy;
    };
    await takeStore.current.finalizeTake({
      id,
      createdAt: new Date().toISOString(),
      sampleRate: captured.sampleRate,
      durationMs,
      chordEvents,
      report,
      voice: copyPcm(aligned.voice),
      backingLeft: copyPcm(aligned.backing[0]),
      backingRight: copyPcm(aligned.backing[1]),
    });
    recordingId.current = null;
    accompaniment.stop();
    await pitch.stop();
    setTake({ id, ...aligned, sampleRate: captured.sampleRate, durationMs, chordEvents, report });
    send({ type: 'STOP' });
  };

  const downloadBlob = (name: string, file: ArrayBuffer, mimeType: string) => {
    const url = URL.createObjectURL(new Blob([file], { type: mimeType }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const downloadWav = async (name: string, channels: readonly Float32Array[]) => {
    if (!take) return;
    const wav = await encodeWavInWorker(channels, take.sampleRate);
    downloadBlob(name, wav, 'audio/wav');
  };

  const downloadMix = async (format: 'wav' | 'mp3') => {
    if (!take) return;
    send({ type: 'EXPORT' });
    setMixError(null);
    try {
      const processedVoice = applyVocalPreset(take.voice, take.sampleRate, mixPreset);
      const mixed = mixVoiceAndBacking(processedVoice, take.backing, voiceBalance);
      const normalized = await normalizeMixInWorker(mixed, take.sampleRate, format, mp3Bitrate);
      setMixMeasurement(normalized);
      downloadBlob(
        `sur-mix.${format}`,
        normalized.file,
        format === 'mp3' ? 'audio/mpeg' : 'audio/wav',
      );
    } catch (reason) {
      setMixError(reason instanceof Error ? reason.message : 'Unable to export the mix');
    } finally {
      send({ type: 'EXPORT_COMPLETE', shared: false });
    }
  };

  return (
    <section className="hero" aria-labelledby="studio-title">
      <p className="eyebrow">Private on-device music tools</p>
      <h1 id="studio-title">Sing first. Let Sur find the music.</h1>
      <p className="lede">
        The first development slice is wiring the pitch, key, and accompaniment path before cloud
        features enter the product.
      </p>
      <div className="status" aria-live="polite">
        <span>Studio state</span>
        <strong>{state}</strong>
      </div>
      {(state === 'idle' || state === 'listening') && (
        <fieldset className="mode-picker" disabled={state === 'listening'}>
          <legend>Detection mode</legend>
          <label>
            <input
              type="radio"
              name="key-mode"
              checked={keyMode === 'western'}
              onChange={() => setKeyMode('western')}
            />
            Western key
          </label>
          <label>
            <input
              type="radio"
              name="key-mode"
              checked={keyMode === 'indian'}
              onChange={() => setKeyMode('indian')}
            />
            Indian Sa
          </label>
        </fieldset>
      )}
      <div className="pitch-readout" aria-live="polite">
        <span className="pitch-note">{midi === null ? '—' : westernNoteName(midi)}</span>
        <span>{midi === null ? 'Sing a steady note' : sargamName(midi, saPitchClass)}</span>
        <span>{cents === null ? 'No pitch detected' : `${Math.round(cents)} cents`}</span>
      </div>
      <label className="sa-picker">
        <span>Sa</span>
        <select
          value={saPitchClass}
          onChange={(event) => setSaPitchClass(Number(event.target.value))}
        >
          {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map(
            (name, pitchClass) => (
              <option key={name} value={pitchClass}>
                {name}
              </option>
            ),
          )}
        </select>
      </label>
      <PitchMeterCanvas getFrame={pitch.getLatestFrame} saPitchClass={saPitchClass} />
      {pitch.status === 'denied' && <p className="error">Microphone permission was denied.</p>}
      {pitch.status === 'unsupported' && (
        <p className="error">This browser does not support the required audio worklet APIs.</p>
      )}
      {pitch.error && <p className="error">{pitch.error}</p>}
      {state === 'listening' && keyDetection.needsMoreAudio && (
        <p className="notice">Keep singing—the key estimate needs a little more confidence.</p>
      )}
      {state === 'keyConfirm' && selectedKey && (
        <div className="key-confirm" aria-live="polite">
          <span>Detected</span>
          <strong>{keyLabel(selectedKey, keyMode)}</strong>
          <span>{Math.round(selectedKey.confidence * 100)}% confidence</span>
          <div className="key-actions">
            <button type="button" className="secondary square-button" onClick={() => nudgeKey(-1)}>
              −<span className="sr-only">Lower by one semitone</span>
            </button>
            <button type="button" onClick={confirmKey}>
              Lock key
            </button>
            <button type="button" className="secondary square-button" onClick={() => nudgeKey(1)}>
              +<span className="sr-only">Raise by one semitone</span>
            </button>
          </div>
          {keyDetection.estimate?.alternatives.length ? (
            <div className="alternatives">
              <span>Alternatives</span>
              {keyDetection.estimate.alternatives.map((alternative) => (
                <button
                  type="button"
                  className="text-button"
                  key={`${alternative.tonicPc}-${alternative.mode}`}
                  onClick={() => setSelectedKey(alternative)}
                >
                  {keyLabel(alternative, keyMode)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
      {state === 'ready' && selectedKey && (
        <div className="ready-panel">
          <p className="notice">Key locked to {keyLabel(selectedKey, keyMode)}.</p>
          <h2>Tanpura</h2>
          <div className="control-row">
            <label>
              Tuning
              <select
                value={tanpura.tuning}
                onChange={(event) => tanpura.setTuning(event.target.value as 'Pa' | 'Ma' | 'Ni')}
              >
                <option value="Pa">Pa</option>
                <option value="Ma">Ma</option>
                <option value="Ni">Ni</option>
              </select>
            </label>
            <label>
              Tempo
              <select
                value={tanpura.tempo}
                onChange={(event) =>
                  tanpura.setTempo(event.target.value as 'slow' | 'medium' | 'fast')
                }
              >
                <option value="slow">Slow</option>
                <option value="medium">Medium</option>
                <option value="fast">Fast</option>
              </select>
            </label>
            <label>
              Volume
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={tanpura.volume}
                onChange={(event) => tanpura.setVolume(Number(event.target.value))}
              />
            </label>
          </div>
          <button
            type="button"
            className={tanpura.playing ? 'secondary' : undefined}
            onClick={() => void tanpura.toggle()}
          >
            {tanpura.playing ? 'Stop tanpura' : 'Start tanpura'}
          </button>
          <h2>Accompaniment</h2>
          <div className="control-row">
            <label>
              Style
              <select
                value={accompaniment.style}
                onChange={(event) =>
                  accompaniment.setStyle(event.target.value as 'pad' | 'piano' | 'strum')
                }
              >
                <option value="pad">Pad</option>
                <option value="piano">Piano</option>
                <option value="strum">Strum</option>
              </select>
            </label>
            <label>
              Tempo {accompaniment.bpm} BPM
              <input
                type="range"
                min="50"
                max="180"
                value={accompaniment.bpm}
                onChange={(event) => accompaniment.setTempo(Number(event.target.value))}
              />
            </label>
            <label>
              Rhythm
              <select
                value={accompaniment.rhythm}
                onChange={(event) =>
                  accompaniment.setRhythm(
                    event.target.value as 'none' | 'keherwa' | 'dadra' | 'pop',
                  )
                }
              >
                <option value="none">None</option>
                <option value="keherwa">Tabla — Keherwa (8 beat)</option>
                <option value="dadra">Tabla — Dadra (6 beat)</option>
                <option value="pop">Pop drums</option>
              </select>
            </label>
            <label>
              Harmony {Math.round(accompaniment.harmonyVolume * 100)}%
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={accompaniment.harmonyVolume}
                onChange={(event) => accompaniment.setHarmonyVolume(Number(event.target.value))}
              />
            </label>
            <label>
              Rhythm {Math.round(accompaniment.rhythmVolume * 100)}%
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={accompaniment.rhythmVolume}
                onChange={(event) => accompaniment.setRhythmVolume(Number(event.target.value))}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={accompaniment.status === 'loading'}
            onClick={() => void startAccompanying()}
          >
            {accompaniment.status === 'loading' ? 'Loading instruments…' : 'Start accompaniment'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={accompaniment.status === 'loading'}
            onClick={() => void startRecordingSession()}
          >
            Record a take
          </button>
        </div>
      )}
      {state === 'countIn' && <p className="count-in">Count in…</p>}
      {(state === 'accompanying' || state === 'recording') && (
        <div className="accompaniment-live" aria-live="polite">
          <span>Current chord</span>
          <strong>{accompaniment.chord?.symbol ?? 'Listening…'}</strong>
          <div className="beat-dots" aria-label={`Beat ${accompaniment.beat?.beat ?? 0} of 4`}>
            {[1, 2, 3, 4].map((beat) => (
              <span className={accompaniment.beat?.beat === beat ? 'active' : ''} key={beat} />
            ))}
          </div>
          <div className="control-row">
            <label>
              Instrument
              <select
                value={accompaniment.style}
                onChange={(event) =>
                  accompaniment.setStyle(event.target.value as 'pad' | 'piano' | 'strum')
                }
              >
                <option value="pad">Pad</option>
                <option value="piano">Piano</option>
                <option value="strum">Strum</option>
              </select>
            </label>
            <label>
              Rhythm
              <select
                value={accompaniment.rhythm}
                onChange={(event) =>
                  accompaniment.setRhythm(
                    event.target.value as 'none' | 'keherwa' | 'dadra' | 'pop',
                  )
                }
              >
                <option value="none">None</option>
                <option value="keherwa">Tabla — Keherwa</option>
                <option value="dadra">Tabla — Dadra</option>
                <option value="pop">Pop drums</option>
              </select>
            </label>
          </div>
          <div className="key-actions">
            <button
              type="button"
              className={accompaniment.held ? undefined : 'secondary'}
              onClick={() => accompaniment.setHold(!accompaniment.held)}
            >
              {accompaniment.held ? 'Release chord' : 'Hold chord'}
            </button>
            {state === 'accompanying' ? (
              <button type="button" className="secondary" onClick={() => void stopAccompanying()}>
                Stop
              </button>
            ) : (
              <button type="button" onClick={() => void finishRecording()}>
                Finish recording
              </button>
            )}
          </div>
          <span>Press H to hold or release.</span>
        </div>
      )}
      {state === 'review' && take && (
        <div className="take-review">
          <span>Take saved locally</span>
          <strong>{(take.durationMs / 1000).toFixed(1)} seconds</strong>
          <span>{take.chordEvents.length} chord events</span>
          <div className="take-report" aria-label="Performance report">
            <div>
              <span>Pitch accuracy</span>
              <strong>{take.report.pitchAccuracyPct.toFixed(0)}%</strong>
            </div>
            <div>
              <span>Range used</span>
              <strong>
                {take.report.weakestNotes.length > 0
                  ? `${westernNoteName(take.report.rangeLowMidi)}–${westernNoteName(take.report.rangeHighMidi)}`
                  : 'No voiced notes'}
              </strong>
            </div>
            <div>
              <span>Stability</span>
              <strong>{take.report.stabilityCents.toFixed(1)} cents</strong>
            </div>
            <div>
              <span>Weakest notes</span>
              <strong>
                {take.report.weakestNotes.map(westernNoteName).join(', ') || 'Not enough data'}
              </strong>
            </div>
          </div>
          <div className="key-actions">
            <button type="button" onClick={() => void downloadWav('sur-voice.wav', [take.voice])}>
              Download voice WAV
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => void downloadWav('sur-backing.wav', take.backing)}
            >
              Download backing WAV
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setTake(null);
                send({ type: 'RETAKE' });
              }}
            >
              Retake
            </button>
            <button type="button" onClick={() => send({ type: 'KEEP' })}>
              Keep take
            </button>
          </div>
        </div>
      )}
      {state === 'mix' && take && (
        <div className="take-review">
          <span>Offline vocal mix</span>
          <label>
            Vocal preset
            <select
              value={mixPreset}
              onChange={(event) => setMixPreset(event.target.value as VocalPreset)}
            >
              <option value="natural">Natural</option>
              <option value="bollywood-shine">Bollywood Shine</option>
              <option value="warm">Warm</option>
              <option value="classical-hall">Classical Hall</option>
            </select>
          </label>
          <label>
            Voice balance {Math.round(voiceBalance * 100)}%
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={voiceBalance}
              onChange={(event) => setVoiceBalance(Number(event.target.value))}
            />
          </label>
          <label>
            MP3 quality
            <select
              value={mp3Bitrate}
              onChange={(event) => setMp3Bitrate(Number(event.target.value) as Mp3Bitrate)}
            >
              {MP3_BITRATES.map((bitrate) => (
                <option key={bitrate} value={bitrate}>
                  {bitrate} kbps
                </option>
              ))}
            </select>
          </label>
          {mixMeasurement && (
            <span>
              Last export: {mixMeasurement.integratedLufs.toFixed(1)} LUFS,{' '}
              {mixMeasurement.truePeakDbtp.toFixed(1)} dBTP
            </span>
          )}
          {mixError && <span className="error">{mixError}</span>}
          <button type="button" onClick={() => void downloadMix('wav')}>
            Normalize and download WAV
          </button>
          <button type="button" className="secondary" onClick={() => void downloadMix('mp3')}>
            Normalize and download MP3
          </button>
        </div>
      )}
      {state === 'exporting' && <p className="notice">Normalizing mix to −14 LUFS…</p>}
      {accompaniment.error && <p className="error">{accompaniment.error}</p>}
      {state === 'idle' ? (
        <button
          type="button"
          disabled={pitch.status === 'requesting'}
          onClick={() => void startListening()}
        >
          {pitch.status === 'requesting' ? 'Requesting microphone…' : 'Start listening'}
        </button>
      ) : state === 'listening' ? (
        <button type="button" className="secondary" onClick={() => void stopListening()}>
          Cancel
        </button>
      ) : state === 'keyConfirm' ? (
        <button type="button" className="text-button" onClick={() => void startListening()}>
          Listen again
        </button>
      ) : null}
    </section>
  );
}

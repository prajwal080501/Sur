# ACC 03 Accompaniment transport verification

The Tone.js transport is isolated behind the `@sur/audio-engine/tone-accompaniment` export so the
instrument runtime can be lazy-loaded without entering the initial PWA bundle. Pure transport tests
verify bar and beat positions, one-beat-ahead decision targets, and tempo conversion.

Pad, Piano, and Strum now use separate deterministic sample buffers and style patterns through
Tone.js `Sampler`. A requested style is prepared immediately and activated at the next chord event,
without stopping the transport. Keherwa (8 beat), Dadra (6 beat), and pop drums use an independent
percussion player and gain bus, while the offline backing renderer reproduces the selected harmonic
and rhythm arrangement.

The generated buffers are original Sur synthesis with zero packaged sample bytes. Their provenance
is recorded in `assets/samples/manifest.json`; `pnpm verify:samples` rejects missing provenance,
undeclared files, byte-count mismatches, and packs over 15 MB. Owned or CC0 acoustic recordings,
device timing measurements, five-minute drift evidence, and listening-based loop-continuity evidence
remain pending and are not claimed.

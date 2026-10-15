# MIX-02 Loudness normalization verification

The offline mix worker applies the two-stage K-weighting filters and 400 ms overlapping absolute
and relative gates defined by ITU-R BS.1770 for 44.1 kHz and 48 kHz input. It applies gain toward
the default −14 LUFS target while bounding estimated four-times-interpolated true peak at −1 dBTP.
Silence, target normalization, peak-ceiling priority, and unsupported sample rates are unit-tested.
The browser flow verifies worker processing, WAV download, and the reported result.

The interpolation is a deterministic development estimate, not yet the required production
oversampling limiter. `pnpm test:loudness` independently measures a generated 24-bit WAV using
ffmpeg `loudnorm`; the current fixture measures −14.05 LUFS and −10.68 dBTP, satisfying the numeric
acceptance bounds. Real-program material, a fixture that actively drives the peak limiter, and
mid-range Android performance evidence remain pending.

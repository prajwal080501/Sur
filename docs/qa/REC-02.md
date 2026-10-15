# REC 02 Export verification

The WAV encoder supports mono or stereo 16-bit and 24-bit PCM at caller-selected sample rates. Tests
validate RIFF metadata, byte rate, bit depth, data size, interleaving, and mismatched-channel errors.
Voice, backing, and normalized-mix exports are encoded in a dedicated browser worker. The Chrome
flow downloads both a standalone voice WAV and the normalized stereo mix, verifying their filenames
and keeping encoding work off the UI thread.

MP3 export uses the pinned `@breezystack/lamejs` encoder in the same worker and supports 128, 160,
192, 256, and 320 kbps. Unit tests verify mono/stereo MPEG frame output and rejected input, while the
Chrome flow verifies the downloaded MP3's frame sync bytes. The codec licence and replacement
boundary are recorded in `docs/THIRD_PARTY_LICENSES.md`.

Default operating-system playback checks and the three-minute mid-range Android timing target remain
pending.

# REC 01 Separate track recording verification

The deterministic alignment layer accepts a measured latency offset, moves the voice earlier or
later as required, and returns voice and stereo backing tracks with identical lengths. Unit tests
cover positive and negative offsets.

Browser PCM capture, two-second crash-safe IndexedDB chunks, and the loopback alignment measurement
remain pending before the separate-track acceptance criterion can be claimed.

# LRN-01 Post-take report verification

The report is derived entirely on-device from the pitch frames captured during recording. Voiced
frames require confidence of at least 0.7. Pitch accuracy is the percentage of those frames within
25 cents of the nearest note in the locked key's major or natural-minor scale. Range uses the lowest
and highest rounded MIDI notes. Stability is the median absolute cents deviation around each held
note's median, considering contiguous notes held for at least 300 ms. Weakest notes are the three
rounded MIDI notes with the highest mean distance from the nearest in-key note.

Unit tests cover accuracy, range, weakest-note ranking, held-note stability, and unvoiced input. The
report JSON is stored atomically with the local take. A three-minute real-device timing measurement
remains pending, so the specification's one-second performance target is not yet claimed.

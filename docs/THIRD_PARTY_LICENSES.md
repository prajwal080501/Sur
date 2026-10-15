# Third-party licences

Sur keeps codec and audio dependencies explicit so distribution and replacement obligations remain
reviewable.

| Package               | Version | Licence  | Purpose                                       | Source                               |
| --------------------- | ------- | -------- | --------------------------------------------- | ------------------------------------ |
| `@breezystack/lamejs` | 1.2.7   | LGPL-3.0 | Browser-worker MP3 encoding                   | <https://github.com/shijinyu/lamejs> |
| `tone`                | 15.x    | MIT      | Browser accompaniment transport and synthesis | <https://github.com/Tonejs/Tone.js>  |

The MP3 encoder is isolated behind `audioExportWorkerClient.ts` and loaded only through the export
worker. This preserves a narrow replacement boundary. Before production distribution, legal review
must confirm that the deployed bundle, corresponding source offer, notices, and relinking path meet
the LGPL requirements.

Recorded accompaniment samples live in `assets/samples/` and are listed, with author, source URL,
and licence, in `assets/samples/manifest.json`. The sample gate accepts `CC0-1.0` files and
`LicenseRef-Sur-Original` procedural assets. It rejects every other licence.

These sources were checked and not included:

| Source                                                                                                            | Why it was not included                                                                                      |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Salamander Grand Piano (Alexander Holm)                                                                           | CC BY 3.0, not CC0                                                                                           |
| University of Iowa Musical Instrument Samples, including the Freesound reupload <https://freesound.org/s/485915/> | Academic-use terms, not CC0                                                                                  |
| Philharmonia Orchestra sound samples                                                                              | Free with required credit, not CC0                                                                           |
| Noiiz tabla one-shots                                                                                             | Commercial library; licence is not CC0                                                                       |
| Freesound “Tabla Teentaal with Baya” by tablage, <https://freesound.org/s/525154/>                                | Attribution requested, not CC0                                                                               |
| Pixabay sound effects                                                                                             | Pixabay Content License, not CC0                                                                             |
| OpenGameArt `guitar-1` by AntumDeluge, <https://opengameart.org/content/guitar-0>                                 | CC0, but it is one chord strum rather than isolated notes, so it cannot be pitch-shifted as a guitar sampler |

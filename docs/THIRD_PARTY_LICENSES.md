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

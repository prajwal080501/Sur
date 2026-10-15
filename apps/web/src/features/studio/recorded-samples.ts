import type { RecordedSamples } from '@sur/audio-engine/tone-accompaniment';
import guitarC3 from '../../../../../assets/samples/guitar/C3.ogg?url';
import guitarC4 from '../../../../../assets/samples/guitar/C4.ogg?url';
import guitarC5 from '../../../../../assets/samples/guitar/C5.ogg?url';
import pianoC3 from '../../../../../assets/samples/piano/C3.ogg?url';
import pianoC4 from '../../../../../assets/samples/piano/C4.ogg?url';
import pianoC5 from '../../../../../assets/samples/piano/C5.ogg?url';
import hat from '../../../../../assets/samples/drums/hat.ogg?url';
import kick from '../../../../../assets/samples/drums/kick.ogg?url';
import snare from '../../../../../assets/samples/drums/snare.ogg?url';
import tablaBass from '../../../../../assets/samples/tabla/bass.ogg?url';
import tablaTreble from '../../../../../assets/samples/tabla/treble.ogg?url';

export const recordedSamples: RecordedSamples = {
  piano: { C3: pianoC3, C4: pianoC4, C5: pianoC5 },
  guitar: { C3: guitarC3, C4: guitarC4, C5: guitarC5 },
  percussion: {
    'tabla-bass': tablaBass,
    'tabla-treble': tablaTreble,
    kick,
    snare,
    hat,
  },
};

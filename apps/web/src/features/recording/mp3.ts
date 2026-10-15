export const MP3_BITRATES = [128, 160, 192, 256, 320] as const;
export type Mp3Bitrate = (typeof MP3_BITRATES)[number];

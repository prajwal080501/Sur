import { transitionStudio } from '@sur/audio-engine';
import type { StudioEvent, StudioState } from '@sur/shared-types';
import { create } from 'zustand';

interface StudioStore {
  state: StudioState;
  send: (event: StudioEvent) => void;
}

export const useStudioStore = create<StudioStore>((set) => ({
  state: 'idle',
  send: (event) => set(({ state }) => ({ state: transitionStudio(state, event) })),
}));

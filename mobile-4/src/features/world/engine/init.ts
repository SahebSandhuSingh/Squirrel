/** The engine's first message: all the static geography plus the territories as they stand. */
import type { Territory } from '../types';
import { cityFeatures, corridorFeatures, geoFeatures, placeFeatures, territoryFeatures } from './features';
import type { CameraView, HostMessage } from './protocol';

export function initMessage(world: Territory[], discovered: Set<string>, opts: { intro: boolean; view: CameraView; detail?: boolean }): HostMessage {
  return {
    type: 'init',
    intro: opts.intro,
    view: opts.view,
    geo: geoFeatures(),
    ...territoryFeatures(world, discovered, !!opts.detail),
    cities: cityFeatures(world),
    ...placeFeatures(),
    corridors: corridorFeatures(),
  };
}

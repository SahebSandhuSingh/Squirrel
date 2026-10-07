/** Which campus map backend this build talks to: a real one when configured, else the preview. */
import { CAMPUS_MAP_API_URL } from '@/api/config';
import { campusGeography } from '../data/campus';
import { httpCampusMapService } from './httpService';
import { previewCampusMapService } from './previewService';
import type { CampusMapService } from './types';

let service: CampusMapService | null = null;

export function campusMapService(): CampusMapService {
  service ??= CAMPUS_MAP_API_URL ? httpCampusMapService(CAMPUS_MAP_API_URL, campusGeography()) : previewCampusMapService(campusGeography());
  return service;
}

export type { CampusMapService, LiveEvent } from './types';

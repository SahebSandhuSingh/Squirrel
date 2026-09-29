/**
 * Discovery services (Dev B): shared zones, the activity heatmap and Squirrel Dates (suggestion only:
 * nothing here invites anyone; meeting up goes through the normal events flow).
 * The backend decides every overlap, aggregation and suggestion; these only call it.
 * Shared zones are zone-level facts — never routes, times or anyone's live location.
 */
import { campusApi } from '@/api/campus';
import type { HeatWindow } from '@/api/campus/types';

/** Zones you and one other person have both been active in (the existing overlap API). */
export const getSharedZonesWith = async (userId: string) => (await campusApi.sharedContext(userId)).shared_zones;
/** Everyone you share at least one zone with. */
export const getSharedZonesIndex = () => campusApi.sharedZones();

export const HEAT_WINDOWS: HeatWindow[] = ['1h', '24h', '7d'];
export const getHeatmap = (window: HeatWindow) => campusApi.heatmap(window);

/** Rule-based suggestions from the backend. Pass a user id to ask about one person only. */
export const getDateSuggestions = (forUserId?: string) => campusApi.dateSuggestions(forUserId);
export const dismissDateSuggestion = (suggestionId: string) => campusApi.dismissDateSuggestion(suggestionId);
/** Opt in / out. Off by default; opting out deletes the zone visits Dates keeps. */
export const getDateSettings = () => campusApi.dateSettings();
export const setDatesEnabled = (enabled: boolean) => campusApi.setDateSettings(enabled);

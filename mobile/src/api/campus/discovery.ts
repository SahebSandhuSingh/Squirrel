/**
 * Discovery services (Dev B): shared zones, the activity heatmap and Squirrel Dates.
 * The backend decides every overlap, aggregation and suggestion; these only call it.
 * Shared zones are zone-level facts — never routes, times or anyone's live location.
 */
import { campusApi } from '@/api/campus';
import type { HeatWindow } from '@/api/campus/types';

const key = (kind: string, id: string) => `${kind}:${id}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Zones you and one other person have both been active in (the existing overlap API). */
export const getSharedZonesWith = async (userId: string) => (await campusApi.sharedContext(userId)).shared_zones;
/** Everyone you share at least one zone with. */
export const getSharedZonesIndex = () => campusApi.sharedZones();

export const HEAT_WINDOWS: HeatWindow[] = ['1h', '24h', '7d'];
export const getHeatmap = (window: HeatWindow) => campusApi.heatmap(window);

/** Rule-based suggestions from the backend. Pass a user id to ask about one person only. */
export const getDateSuggestions = (forUserId?: string) => campusApi.dateSuggestions(forUserId);
export const dismissDateSuggestion = (suggestionId: string) => campusApi.dismissDateSuggestion(suggestionId);
export const inviteFromSuggestion = (suggestionId: string) => campusApi.inviteFromSuggestion(suggestionId, key('date-invite', suggestionId));

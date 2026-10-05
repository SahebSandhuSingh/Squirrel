/**
 * Poke → Poke back → Friends service. The backend decides everything (validity, mutual poke,
 * friendship); these just call it. UI state lives in state/socialStore.ts.
 */
import { campusApi } from '@/api/campus';

const key = (kind: string, userId: string) => `${kind}:${userId}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const getPokeStatus = (userId: string) => campusApi.pokeStatus(userId);
export const sendPoke = (userId: string) => campusApi.sendPoke(userId, key('poke', userId));
export const pokeBack = (userId: string) => campusApi.pokeBack(userId, key('poke-back', userId));
export const getIncomingPokes = () => campusApi.incomingPokes();
export const getFriendshipStatus = (userId: string) => campusApi.friendshipStatus(userId);
export const getNotifications = (cursor?: string | null) => campusApi.notifications(cursor);
export const markNotificationsRead = (ids: string[]) => campusApi.markNotificationsRead(ids);

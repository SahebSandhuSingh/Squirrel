import type { Meetup } from '@/api/campus/types';

/** Check-in window from the backend's timestamps (the server still enforces it). */
export const checkInOpen = (m: Meetup, now = Date.now()) => Date.parse(m.check_in_opens_at) <= now && Date.parse(m.check_in_closes_at) >= now;

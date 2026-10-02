/**
 * Private profile details collected in onboarding ("About you"). Owner-only: returned by
 * GET/PATCH /v1/me and nowhere else — never on a public profile, a leaderboard or the map.
 * The mobile client validates the same rules (mobile-4/src/logic/profileValidation.ts); this is
 * the authoritative copy.
 */
import { z } from 'zod';
import { config } from '../config.js';
import { one, query, type Queryable } from '../db/pool.js';

export const GENDERS = ['female', 'male', 'non_binary', 'undisclosed'] as const;
export const MIN_AGE = 16;
export const MAX_AGE = 99;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** One of the configured campus domains (or a subdomain of one); with none configured, any .ac.in address. */
export function isCollegeEmail(email: string, domains: readonly string[] = config.campus.emailDomains) {
  if (!EMAIL.test(email)) return false;
  const host = email.split('@')[1]!;
  return domains.length
    ? domains.some((d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`))
    : host.endsWith('.ac.in');
}

const email = z.string().trim().toLowerCase().max(254).regex(EMAIL, 'Enter a valid email address');

export const ProfileDetailsInput = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name').max(60, 'Keep it under 60 characters').regex(/\p{L}/u, 'Enter your full name'),
  personal_email: email,
  college_email: email,
  phone: z.string().trim().regex(/^\+91[6-9]\d{9}$/, 'Phone must be an Indian mobile in E.164 form, e.g. +919876543210'),
  gender: z.enum(GENDERS),
  age: z.number().int().min(MIN_AGE, `Age must be between ${MIN_AGE} and ${MAX_AGE}`).max(MAX_AGE, `Age must be between ${MIN_AGE} and ${MAX_AGE}`),
  course: z.string().trim().min(1, 'Course is required').max(60, 'Keep it under 60 characters'),
  cgpa: z.number().min(0).max(10, 'CGPA is on a 10-point scale')
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'CGPA can have at most 2 decimals')
    .nullable().optional(),
}).strict().superRefine((d, ctx) => {
  if (!isCollegeEmail(d.college_email)) {
    const dom = config.campus.emailDomains[0];
    ctx.addIssue({ code: 'custom', path: ['college_email'], message: dom ? `Use your official @${dom} address` : 'Use your official college (.ac.in) address' });
  }
  if (d.personal_email === d.college_email) {
    ctx.addIssue({ code: 'custom', path: ['personal_email'], message: 'Use a personal address, different from your college email' });
  }
});

export type ProfileDetailsInputT = z.infer<typeof ProfileDetailsInput>;

export type ProfileDetails = {
  full_name: string; personal_email: string; college_email: string; phone: string;
  gender: (typeof GENDERS)[number]; age: number; course: string; cgpa: number | null;
};

type Row = Omit<ProfileDetails, 'cgpa'> & { cgpa: string | null }; // pg returns numeric as a string

/** The owner's details, or null if they haven't been saved yet. */
export async function getProfileDetails(userId: string, q?: Queryable): Promise<ProfileDetails | null> {
  const r = await one<Row>(
    `SELECT full_name, personal_email, college_email, phone, gender, age, course, cgpa FROM user_profile_details WHERE user_id = $1`,
    [userId], q,
  );
  return r ? { ...r, cgpa: r.cgpa === null ? null : Number(r.cgpa) } : null;
}

/** Replace the owner's details (the client always sends the whole form, so this is a full upsert). */
export async function saveProfileDetails(userId: string, d: ProfileDetailsInputT, q?: Queryable) {
  await query(
    `INSERT INTO user_profile_details (user_id, full_name, personal_email, college_email, phone, gender, age, course, cgpa)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (user_id) DO UPDATE SET
       full_name = EXCLUDED.full_name, personal_email = EXCLUDED.personal_email, college_email = EXCLUDED.college_email,
       phone = EXCLUDED.phone, gender = EXCLUDED.gender, age = EXCLUDED.age, course = EXCLUDED.course,
       cgpa = EXCLUDED.cgpa, updated_at = now()`,
    [userId, d.full_name, d.personal_email, d.college_email, d.phone, d.gender, d.age, d.course, d.cgpa ?? null], q,
  );
}

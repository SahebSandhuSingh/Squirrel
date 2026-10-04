/**
 * Profile-building validation (onboarding "About you"). Pure functions, so the rules are the
 * same everywhere and unit-tested (profileValidation.test.mjs). The backend re-validates.
 *
 * Compulsory: full name, personal email, college email, phone, gender, age, course.
 * Optional: CGPA — blank never blocks; if entered it must be a valid 0–10 score.
 */
export type DetailsForm = {
  full_name: string;
  personal_email: string;
  college_email: string;
  phone: string;
  gender: string;
  age: string;
  course: string;
  cgpa: string;
};
export type DetailsField = keyof DetailsForm;
export type DetailsErrors = Partial<Record<DetailsField, string>>;

export const REQUIRED_FIELDS: DetailsField[] = ['full_name', 'personal_email', 'college_email', 'phone', 'gender', 'age', 'course'];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_AGE = 16;
export const MAX_AGE = 99;

/** "+91 98765 43210", "098765-43210", "9876543210" → "+919876543210"; null if not a valid Indian mobile. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
  return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : null;
}

/** Ends with one of the campus domains (e.g. iiserkol.ac.in); with none configured, any .ac.in address. */
export function isCollegeEmail(email: string, domains: string[]) {
  const e = email.trim().toLowerCase();
  if (!EMAIL.test(e)) return false;
  const host = e.split('@')[1];
  return domains.length ? domains.some((d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`)) : host.endsWith('.ac.in');
}

export function validateDetails(f: DetailsForm, collegeDomains: string[]): DetailsErrors {
  const e: DetailsErrors = {};
  const name = f.full_name.trim();
  if (!name) e.full_name = 'Full name is required.';
  else if (name.length < 2 || !/[a-zA-ZÀ-ɏऀ-ॿ]/.test(name)) e.full_name = 'Enter your full name.';
  else if (name.length > 60) e.full_name = 'Keep it under 60 characters.';

  const personal = f.personal_email.trim().toLowerCase();
  const college = f.college_email.trim().toLowerCase();
  if (!personal) e.personal_email = 'Personal email is required.';
  else if (!EMAIL.test(personal)) e.personal_email = 'That doesn’t look like an email address.';
  else if (personal === college) e.personal_email = 'Use a personal address, different from your college email.';

  if (!college) e.college_email = 'College email is required.';
  else if (!EMAIL.test(college)) e.college_email = 'That doesn’t look like an email address.';
  else if (!isCollegeEmail(college, collegeDomains)) e.college_email = collegeDomains.length ? `Use your official @${collegeDomains[0]} address.` : 'Use your official college (.ac.in) address.';

  if (!f.phone.trim()) e.phone = 'Phone number is required.';
  else if (!normalizePhone(f.phone)) e.phone = 'Enter a valid 10-digit mobile number.';

  if (!f.gender) e.gender = 'Pick one — “Prefer not to say” is fine.';

  if (!f.age.trim()) e.age = 'Age is required.';
  else if (!/^\d{1,3}$/.test(f.age.trim())) e.age = 'Age should be a whole number.';
  else if (+f.age < MIN_AGE || +f.age > MAX_AGE) e.age = `Enter an age between ${MIN_AGE} and ${MAX_AGE}.`;

  if (!f.course.trim()) e.course = 'Course is required.';
  else if (f.course.trim().length > 60) e.course = 'Keep it under 60 characters.';

  const cg = f.cgpa.trim();
  if (cg) {
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(cg)) e.cgpa = 'Use a number like 8.4 (up to 2 decimals).';
    else if (+cg < 0 || +cg > 10) e.cgpa = 'CGPA is on a 10-point scale.';
  }
  return e;
}

export const isComplete = (errors: DetailsErrors) => Object.keys(errors).length === 0;

import assert from 'node:assert/strict';
import test from 'node:test';
import { isCollegeEmail, isComplete, normalizePhone, REQUIRED_FIELDS, validateDetails } from './profileValidation.ts';

const ok = { full_name: 'Aanya Sharma', personal_email: 'aanya@gmail.com', college_email: 'as21ms001@iiserkol.ac.in', phone: '98765 43210', gender: 'female', age: '20', course: 'BS-MS', cgpa: '' };
const DOMAINS = ['iiserkol.ac.in'];

test('a complete form passes; CGPA can be blank', () => {
  assert.ok(isComplete(validateDetails(ok, DOMAINS)));
});

test('every compulsory field blocks completion when empty', () => {
  for (const f of REQUIRED_FIELDS) {
    const e = validateDetails({ ...ok, [f]: '' }, DOMAINS);
    assert.ok(e[f], `${f} should be required`);
    assert.equal(isComplete(e), false);
  }
});

test('optional CGPA: blank is fine, invalid values are not', () => {
  assert.equal(validateDetails({ ...ok, cgpa: '' }, DOMAINS).cgpa, undefined);
  assert.equal(validateDetails({ ...ok, cgpa: '8.45' }, DOMAINS).cgpa, undefined);
  assert.ok(validateDetails({ ...ok, cgpa: '10.5' }, DOMAINS).cgpa);
  assert.ok(validateDetails({ ...ok, cgpa: 'eight' }, DOMAINS).cgpa);
  assert.ok(validateDetails({ ...ok, cgpa: '8.456' }, DOMAINS).cgpa);
});

test('emails: format, college domain, and different addresses', () => {
  assert.ok(validateDetails({ ...ok, personal_email: 'nope' }, DOMAINS).personal_email);
  assert.ok(validateDetails({ ...ok, college_email: 'aanya@gmail.com' }, DOMAINS).college_email);
  assert.ok(validateDetails({ ...ok, personal_email: ok.college_email }, DOMAINS).personal_email);
  assert.ok(isCollegeEmail('x@students.iiserkol.ac.in', DOMAINS));
  assert.ok(isCollegeEmail('x@any.ac.in', []));
  assert.equal(isCollegeEmail('x@iiserkol.ac.in.evil.com', DOMAINS), false);
});

test('phone numbers normalise to +91 and reject bad ones', () => {
  assert.equal(normalizePhone('+91 98765-43210'), '+919876543210');
  assert.equal(normalizePhone('09876543210'), '+919876543210');
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone('5876543210'), null);
});

test('age must be a whole number in range', () => {
  assert.ok(validateDetails({ ...ok, age: '15' }, DOMAINS).age);
  assert.ok(validateDetails({ ...ok, age: '20.5' }, DOMAINS).age);
  assert.equal(validateDetails({ ...ok, age: '19' }, DOMAINS).age, undefined);
});

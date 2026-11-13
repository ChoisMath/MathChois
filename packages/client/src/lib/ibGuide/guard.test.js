import { it, expect } from 'vitest';
import { resolveIbGuideRedirect } from './guard';

it.each([
  [{ isAuthenticated: false, role: null, allowed: null }, '/'],
  [{ isAuthenticated: true, role: null, allowed: null }, null],
  [{ isAuthenticated: true, role: null, allowed: false }, '/student/classrooms'],
  [{ isAuthenticated: true, role: 'student', allowed: false }, '/student/classrooms'],
  [{ isAuthenticated: true, role: 'teacher', allowed: false }, '/teacher/classrooms'],
  [{ isAuthenticated: true, role: 'student', allowed: true }, null],
])('%o → %s', (a, out) => expect(resolveIbGuideRedirect(a)).toBe(out));

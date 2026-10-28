import { it, expect } from 'vitest';
import { resolveAiHubRedirect } from './guard';

it.each([
  [{ isAuthenticated: false, role: null, allowed: null }, '/'],
  [{ isAuthenticated: true, role: null, allowed: null }, '/choose-role'],
  [{ isAuthenticated: true, role: 'student', allowed: false }, '/student/classrooms'],
  [{ isAuthenticated: true, role: 'student', allowed: true }, null],
  [{ isAuthenticated: true, role: 'teacher', allowed: true }, null],
])('%o → %s', (a, out) => expect(resolveAiHubRedirect(a)).toBe(out));

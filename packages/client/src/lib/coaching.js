import { api } from './api';

export const convertSolution = (imageUrl, pageId) => api.post('/api/coaching/convert', { imageUrl, pageId });
export const reviewSolution = (pageId, workImageUrl, solutionLatex) =>
  api.post('/api/coaching/review', { pageId, workImageUrl, solutionLatex }); // → { attempt, used, limit, resetAt }
export const listAttempts = (pageId) => api.get(`/api/coaching/pages/${pageId}/attempts`); // → { attempts, used, limit, resetAt }

/** 교사가 특정 학생의 페이지 코칭 시도 조회 (읽기 전용) → { attempts, used, limit, resetAt } */
export const getStudentPageAttempts = (classroomId, studentId, pageId) =>
  api.get(`/api/coaching/classrooms/${classroomId}/students/${studentId}/pages/${pageId}/attempts`);

/** 교사: 학생 페이지 횟수 리셋 → { used, limit, resetAt } */
export const resetStudentQuota = (classroomId, studentId, pageId) =>
  api.post(`/api/coaching/classrooms/${classroomId}/students/${studentId}/pages/${pageId}/reset`, {});

/** 교사: 해당 페이지에 시도한 학생 목록 → CoachingStudentSummary[] */
export const getPageStudents = (classroomId, pageId) =>
  api.get(`/api/coaching/classrooms/${classroomId}/pages/${pageId}/students`);

/** Excalidraw 필기 blob을 ai-coaching 버킷에 업로드 → URL */
export async function uploadWorkImage(blob, directory) {
  const fd = new FormData();
  fd.append('file', blob, 'work.png');
  const res = await api.upload(
    `/api/files/upload?bucket=ai-coaching&directory=${encodeURIComponent(directory)}`,
    fd,
  );
  return res.url;
}

function qs(params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const getMyHistory = (params) => api.get(`/api/coaching/history${qs(params)}`);
export const getStudentHistory = (classroomId, studentId, params) =>
  api.get(`/api/coaching/classrooms/${classroomId}/students/${studentId}/history${qs(params)}`);

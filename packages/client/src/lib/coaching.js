import { api } from './api';

export const convertSolution = (imageUrl) => api.post('/api/coaching/convert', { imageUrl });
export const reviewSolution = (pageId, workImageUrl, solutionLatex) =>
  api.post('/api/coaching/review', { pageId, workImageUrl, solutionLatex });
export const listAttempts = (pageId) => api.get(`/api/coaching/pages/${pageId}/attempts`);

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

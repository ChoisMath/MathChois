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

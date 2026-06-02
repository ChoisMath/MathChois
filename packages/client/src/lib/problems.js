import { api } from './api';

export const ocrProblem = (imageUrl) => api.post('/api/problems/ocr', { imageUrl });
export const ocrMarkscheme = (imageUrl) => api.post('/api/problems/markscheme-ocr', { imageUrl });
export const generateSolution = (problemLatex) => api.post('/api/problems/generate-solution', { problemLatex });
export const createProblem = (body) => api.post('/api/problems', body);
export const updateProblem = (id, body) => api.patch(`/api/problems/${id}`, body);
export const deleteProblem = (id) => api.delete(`/api/problems/${id}`);
export const getProblem = (id) => api.get(`/api/problems/${id}`);
export const getFacets = () => api.get('/api/problems/facets');

export function listProblems(filters = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return api.get(`/api/problems${qs ? `?${qs}` : ''}`);
}

/** problem-bank 버킷에 이미지 업로드 → URL 반환 */
export async function uploadProblemImage(file, directory) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await api.upload(
    `/api/files/upload?bucket=problem-bank&directory=${encodeURIComponent(directory)}`,
    fd,
  );
  return res.url;
}

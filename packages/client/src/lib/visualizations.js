import { api } from './api';

export function buildVisualizationQuery(filters = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && v !== '' && v !== false) params.set(k, String(v));
  }
  return params.toString();
}

export function listVisualizations(filters = {}) {
  const qs = buildVisualizationQuery(filters);
  return api.get(`/api/visualizations${qs ? `?${qs}` : ''}`);
}

export const getVisualization = (id) => api.get(`/api/visualizations/${id}`);
export const getFacets = () => api.get('/api/visualizations/facets');
export const createVisualization = (body) => api.post('/api/visualizations', body);
export const updateVisualization = (id, body) => api.patch(`/api/visualizations/${id}`, body);
export const deleteVisualization = (id) => api.delete(`/api/visualizations/${id}`);

/** visualizations 버킷에 HTML 업로드 → URL 반환 */
export async function uploadVisualizationHtml(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await api.upload('/api/files/upload?bucket=visualizations&directory=library', fd);
  return res.url;
}

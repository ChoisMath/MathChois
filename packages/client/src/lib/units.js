import { api } from './api';

// ─── 단원 API ───────────────────────────────────────

export const listUnits = (cid) => api.get(`/api/classrooms/${cid}/units`);
export const createUnit = (cid, { title, description, isHidden }) =>
  api.post(`/api/classrooms/${cid}/units`, { title, description, isHidden });
export const updateUnit = (id, patch) => api.patch(`/api/units/${id}`, patch);
export const deleteUnit = (id) => api.delete(`/api/units/${id}`);
export const reorderUnits = (cid, ids) => api.put(`/api/classrooms/${cid}/units/reorder`, { ids });
export const addItemsToUnit = (id, { chapterIds, classroomVideoIds }) =>
  api.post(`/api/units/${id}/items`, { chapterIds, classroomVideoIds });

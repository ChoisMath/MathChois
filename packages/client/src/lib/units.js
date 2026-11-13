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
/** 여러 단원을 여러 학급으로 통째 복사 → { results: [{ classroomId, ok, ...개수 | error }] } */
export const copyUnits = (unitIds, targetClassroomIds) =>
  api.post('/api/units/copy', { unitIds, targetClassroomIds });
/** 단원 복사 한 번에 고를 수 있는 단원·학급 수(서버 routes/units.ts 와 같다) */
export const COPY_LIST_MAX = 50;

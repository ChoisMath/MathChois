import { api } from './api';

export const getClassroomDashboard = (classroomId) =>
  api.get(`/api/dashboard/classrooms/${classroomId}`);

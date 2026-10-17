import { api, getAccessToken, refreshToken, ApiError } from './api';

// ─── 쿼리/포맷 유틸 ─────────────────────────────────

export function buildVideoQuery(filters = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && v !== '' && v !== false) params.set(k, String(v));
  }
  return params.toString();
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

/** 길이 초 → "12:34" 배지용 (없으면 '') */
export function formatDuration(sec) {
  if (sec == null || !Number.isFinite(Number(sec))) return '';
  const s = Math.max(0, Math.floor(Number(sec)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
    : `${m}:${String(r).padStart(2, '0')}`;
}

// ─── 라이브러리 API ─────────────────────────────────

export function listVideos(filters = {}) {
  const qs = buildVideoQuery(filters);
  return api.get(`/api/videos${qs ? `?${qs}` : ''}`);
}
export const getVideo = (id) => api.get(`/api/videos/${id}`);
export const getVideoUsage = (id) => api.get(`/api/videos/${id}/usage`);
export const getVideoFacets = () => api.get('/api/videos/facets');
export const createVideo = (body) => api.post('/api/videos', body);
export const updateVideo = (id, body) => api.patch(`/api/videos/${id}`, body);
export const deleteVideo = (id, { force } = {}) => api.delete(`/api/videos/${id}${force ? '?force=1' : ''}`);

// ─── 학급 배정 / 댓글 API ───────────────────────────

export const listClassroomVideos = (classroomId) => api.get(`/api/classrooms/${classroomId}/videos`);
export const addClassroomVideo = (classroomId, videoId, note) =>
  api.post(`/api/classrooms/${classroomId}/videos`, { videoId, note: note ?? null });
export const reorderClassroomVideos = (classroomId, ids) =>
  api.patch(`/api/classrooms/${classroomId}/videos/reorder`, { ids });
export const getClassroomVideo = (id) => api.get(`/api/classroom-videos/${id}`);
export const updateClassroomVideo = (id, body) => api.patch(`/api/classroom-videos/${id}`, body);
export const removeClassroomVideo = (id) => api.delete(`/api/classroom-videos/${id}`);

export const listVideoComments = (classroomVideoId) => api.get(`/api/classroom-videos/${classroomVideoId}/comments`);
export const createVideoComment = (classroomVideoId, body) =>
  api.post(`/api/classroom-videos/${classroomVideoId}/comments`, body);
export const updateVideoComment = (id, content) => api.patch(`/api/video-comments/${id}`, { content });
export const deleteVideoComment = (id) => api.delete(`/api/video-comments/${id}`);

// ─── 댓글 읽음/미읽음 API ─────────────────────────────

/** 댓글 목록을 본 시각 기록(미읽음 배지 초기화) — 204 */
export const markVideoCommentsSeen = (classroomVideoId) => api.post(`/api/classroom-videos/${classroomVideoId}/seen`);
/** 학급의 영상별 미읽음 댓글 수 → { byClassroomVideo: {cvId→n}, total } */
export const getClassroomVideoUnread = (classroomId) => api.get(`/api/classrooms/${classroomId}/videos/unread`);
/** 내 모든 학급의 미읽음 댓글 수 → { byClassroom: {classroomId→n}, total } */
export const getVideoUnreadTotals = () => api.get('/api/videos/unread');

// ─── 시청 기록 API ───────────────────────────────────

/** 학생: 시청 위치 저장(10초 간격 + 일시정지/종료/이탈 시에만 호출 — 분당 300회 제한) */
export const saveVideoProgress = (classroomVideoId, { positionSec, durationSec } = {}) =>
  api.put(`/api/classroom-videos/${classroomVideoId}/progress`, {
    positionSec: Math.max(0, Math.floor(Number(positionSec) || 0)),
    ...(Number.isFinite(Number(durationSec)) && Number(durationSec) > 0
      ? { durationSec: Math.floor(Number(durationSec)) } : {}),
  });
/** 학생: 본인 시청 기록 (없으면 null) */
export const getVideoProgress = (classroomVideoId) => api.get(`/api/classroom-videos/${classroomVideoId}/progress`);
/** 교사: 학생별 시청 현황 요약 */
export const getVideoProgressSummary = (classroomVideoId) =>
  api.get(`/api/classroom-videos/${classroomVideoId}/progress/summary`);
/** 학급 전체 영상 시청 기록 맵 — 학생: cvId→{positionSec,maxPositionSec,completed}, 교사: cvId→{watchedCount,completedCount,totalStudents} */
export const getClassroomVideoProgress = (classroomId) => api.get(`/api/classrooms/${classroomId}/videos/progress`);

/** 시청률 % (0~100 반올림·클램프). 길이를 모르면 null */
export function progressPercent(maxPositionSec, durationSec) {
  const d = Number(durationSec);
  if (!Number.isFinite(d) || d <= 0) return null;
  const m = Number(maxPositionSec) || 0;
  return Math.max(0, Math.min(100, Math.round((m / d) * 100)));
}

// ─── 업로드 (XHR: 진행률 필요 — fetch 는 업로드 progress 미지원) ─────

function xhrUpload(url, file, onProgress, token) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new ApiError(0, '네트워크 오류로 업로드에 실패했습니다.'));
    xhr.onabort = () => reject(new ApiError(0, '업로드가 취소되었습니다.'));
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText || '{}'); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new ApiError(xhr.status, body.error ?? xhr.statusText ?? '업로드 실패'));
    };
    const fd = new FormData();
    fd.append('file', file, file.name);
    xhr.send(fd);
  });
}

/**
 * 영상/썸네일 업로드 → {url, fileName, fileSize, mimeType}
 * kind: 'video' | 'thumbnail'. 401 이면 토큰 갱신 후 1회 재시도.
 */
export async function uploadVideoFile(file, kind = 'video', onProgress) {
  const url = `/api/videos/upload?kind=${kind}`;
  try {
    return await xhrUpload(url, file, onProgress, getAccessToken());
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) return xhrUpload(url, file, onProgress, getAccessToken());
    }
    throw err;
  }
}

// ─── 로컬 메타 추출 (길이·썸네일) ───────────────────

/**
 * File 또는 같은 origin 의 영상 URL(`/api/files/videos/library/…`)로 메타데이터까지 로드한 <video> 를 만든다.
 * URL 문자열이면 object URL 을 만들지 않는다(수정 화면에서 기존 영상으로 썸네일을 다시 캡처할 때 사용).
 */
function loadVideoElement(source) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const objectUrl = typeof source === 'string' ? null : URL.createObjectURL(source);
    const cleanup = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
    video.onloadedmetadata = () => resolve({ video, cleanup });
    video.onerror = () => { cleanup(); reject(new Error('이 브라우저에서 재생할 수 없는 영상 형식입니다.')); };
    video.src = objectUrl ?? source;
  });
}

/** 파일(또는 같은 origin 영상 URL)의 길이(초) — 실패 시 null */
export async function probeVideoDuration(source) {
  try {
    const { video, cleanup } = await loadVideoElement(source);
    const d = Number.isFinite(video.duration) ? Math.round(video.duration) : null;
    cleanup();
    return d;
  } catch {
    return null;
  }
}

/**
 * 특정 시각 프레임을 JPEG Blob 으로 캡처 (썸네일).
 * source: File 또는 같은 origin 영상 URL. atSec 생략 시 1초(짧은 영상이면 중간) 지점. 실패 시 null.
 */
export function captureVideoThumbnail(source, atSec) {
  return new Promise((resolve) => {
    loadVideoElement(source).then(({ video, cleanup }) => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const t = atSec != null ? Math.min(Math.max(0, atSec), Math.max(0, duration - 0.1))
        : (duration >= 2 ? 1 : duration / 2);
      const finish = (blob) => { cleanup(); resolve(blob); };
      video.onseeked = () => {
        try {
          const w = video.videoWidth || 640;
          const h = video.videoHeight || 360;
          const scale = Math.min(1, 640 / w);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => finish(blob), 'image/jpeg', 0.85);
        } catch {
          finish(null);
        }
      };
      video.onerror = () => finish(null);
      video.currentTime = t;
    }).catch(() => resolve(null));
  });
}

import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import {
  uploadVideoFile, createVideo, updateVideo, probeVideoDuration, captureVideoThumbnail,
  formatBytes, formatDuration,
} from '../../lib/videos';

const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 서버 한도와 동일 (2GB)
const ACCEPT = '.mp4,.m4v,.webm,.mov,video/mp4,video/webm,video/quicktime,video/x-m4v';

/**
 * 영상자료 등록/수정 폼.
 * props: initial(수정 시 기존 레코드) / onSaved(video) / onCancel()
 *
 * 파일 선택 시 브라우저에서 길이를 읽고 썸네일(1초 지점 프레임)을 자동 캡처한다.
 * 업로드는 전용 스트리밍 라우트(`/api/videos/upload`)로 진행률을 표시하며 보낸다.
 */
export default function VideoForm({ initial = null, onSaved, onCancel }) {
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [majorUnit, setMajorUnit] = useState(initial?.majorUnit ?? '');
  const [minorUnit, setMinorUnit] = useState(initial?.minorUnit ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');

  const [file, setFile] = useState(null);
  const [durationSec, setDurationSec] = useState(initial?.durationSec ?? null);
  const [thumbBlob, setThumbBlob] = useState(null);
  const [thumbPreview, setThumbPreview] = useState(initial?.thumbnailUrl ?? null);
  const [captureAt, setCaptureAt] = useState(1);
  const [probing, setProbing] = useState(false);

  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);   // 0~1 (영상 업로드)
  const [stage, setStage] = useState('');        // 진행 단계 안내
  const [error, setError] = useState('');
  const previewUrlRef = useRef(null);

  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);

  const setThumbFromBlob = (blob) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    if (blob) {
      previewUrlRef.current = URL.createObjectURL(blob);
      setThumbPreview(previewUrlRef.current);
    } else {
      previewUrlRef.current = null;
      setThumbPreview(initial?.thumbnailUrl ?? null);
    }
    setThumbBlob(blob);
  };

  const handleFile = async (f) => {
    setError('');
    setFile(f);
    if (!f) { setDurationSec(initial?.durationSec ?? null); setThumbFromBlob(null); return; }
    if (f.size > MAX_VIDEO_BYTES) {
      setError(`파일이 너무 큽니다 (${formatBytes(f.size)}). 최대 2GB 까지 업로드할 수 있습니다.`);
      setFile(null);
      return;
    }
    setProbing(true);
    try {
      const [d, blob] = await Promise.all([probeVideoDuration(f), captureVideoThumbnail(f)]);
      setDurationSec(d);
      setThumbFromBlob(blob);
      setCaptureAt(1);
      if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''));
    } finally {
      setProbing(false);
    }
  };

  const recapture = async () => {
    if (!file) return;
    setProbing(true);
    try {
      const next = durationSec ? Math.min(durationSec - 1, captureAt + Math.max(5, Math.floor(durationSec / 8))) : captureAt + 5;
      const at = next <= captureAt ? 1 : next;
      const blob = await captureVideoThumbnail(file, at);
      if (blob) { setThumbFromBlob(blob); setCaptureAt(at); }
    } finally {
      setProbing(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) { setError('제목을 입력하세요.'); return; }
    if (!isEdit && !file) { setError('영상 파일을 선택하세요.'); return; }

    setSaving(true);
    setProgress(0);
    try {
      const meta = {
        title: title.trim(),
        subject: subject.trim() || null,
        majorUnit: majorUnit.trim() || null,
        minorUnit: minorUnit.trim() || null,
        description: description.trim() || null,
      };

      let fileFields = {};
      if (file) {
        setStage('영상 업로드 중…');
        const up = await uploadVideoFile(file, 'video', setProgress);
        fileFields = {
          videoUrl: up.url,
          mimeType: up.mimeType,
          fileSize: up.fileSize,
          durationSec: durationSec ?? null,
        };
      }
      if (thumbBlob) {
        setStage('썸네일 업로드 중…');
        const thumbFile = new File([thumbBlob], 'thumbnail.jpg', { type: 'image/jpeg' });
        const up = await uploadVideoFile(thumbFile, 'thumbnail');
        fileFields.thumbnailUrl = up.url;
      }

      setStage('저장 중…');
      const saved = isEdit
        ? await updateVideo(initial.id, { ...meta, ...fileFields })
        : await createVideo({ ...meta, ...fileFields });
      onSaved?.(saved);
    } catch (err) {
      setError(err.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
      setStage('');
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 whitespace-normal break-keep">
        mp4 / webm / mov 형식, 최대 2GB. 등록한 영상은 모든 교사가 검색·학급 배정에 사용할 수 있습니다(수정·삭제는 등록자만).
      </p>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{isEdit ? '영상 파일 교체 (선택)' : '영상 파일 *'}</span>
        <input type="file" accept={ACCEPT} disabled={saving}
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
        {file && (
          <span className="text-xs text-gray-500">
            {file.name} · {formatBytes(file.size)}{durationSec != null ? ` · ${formatDuration(durationSec)}` : ''}
          </span>
        )}
        {isEdit && !file && <span className="text-xs text-gray-400">선택하지 않으면 기존 영상이 유지됩니다.</span>}
      </label>

      {(thumbPreview || probing) && (
        <div className="flex items-start gap-3">
          <div className="w-40 aspect-video bg-gray-100 rounded overflow-hidden flex items-center justify-center shrink-0">
            {thumbPreview
              ? <img src={thumbPreview} alt="썸네일 미리보기" className="w-full h-full object-cover" />
              : <span className="text-xs text-gray-400">분석 중…</span>}
          </div>
          <div className="text-xs text-gray-500 flex flex-col gap-1">
            <span>썸네일 (자동 캡처)</span>
            {file && (
              <button type="button" onClick={recapture} disabled={probing || saving}
                className="inline-flex items-center gap-1 px-2 min-h-9 border rounded text-gray-700 disabled:opacity-50">
                <Camera className="h-3.5 w-3.5" /> 다른 장면으로
              </button>
            )}
          </div>
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">제목 *</span>
        <input className="border rounded px-2 min-h-11" value={title}
          onChange={(e) => setTitle(e.target.value)} placeholder="예: 이차함수의 그래프 개념 설명" />
      </label>

      <div className="flex flex-wrap gap-2">
        <input className="border rounded px-2 min-h-11 text-sm flex-1 min-w-32" placeholder="과목"
          value={subject} onChange={(e) => setSubject(e.target.value)} />
        <input className="border rounded px-2 min-h-11 text-sm flex-1 min-w-32" placeholder="대단원"
          value={majorUnit} onChange={(e) => setMajorUnit(e.target.value)} />
        <input className="border rounded px-2 min-h-11 text-sm flex-1 min-w-32" placeholder="소단원"
          value={minorUnit} onChange={(e) => setMinorUnit(e.target.value)} />
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">설명</span>
        <textarea className="border rounded px-2 py-1" rows={3} value={description}
          onChange={(e) => setDescription(e.target.value)} placeholder="영상 내용, 시청 전 안내 등" />
      </label>

      {saving && (
        <div className="flex flex-col gap-1">
          <div className="h-2 rounded bg-gray-200 overflow-hidden">
            <div className="h-full bg-blue-600 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span className="text-xs text-gray-500">{stage} {stage.startsWith('영상') ? `${Math.round(progress * 100)}%` : ''}</span>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving}
            className="px-3 min-h-11 border rounded whitespace-nowrap disabled:opacity-50">취소</button>
        )}
        <button type="submit" disabled={saving || probing}
          className="px-4 min-h-11 bg-emerald-600 text-white rounded disabled:opacity-50 whitespace-nowrap">
          {saving ? '업로드 중…' : (isEdit ? '수정' : '등록')}
        </button>
      </div>
    </form>
  );
}

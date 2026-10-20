import { useEffect, useRef, useState } from 'react';
import { Camera, Film, Image as ImageIcon, ImagePlus, Plus, Save, X } from 'lucide-react';
import {
  uploadVideoFile, createVideo, updateVideo, probeVideoDuration, captureVideoThumbnail,
  formatBytes, formatDuration,
} from '../../lib/videos';
import { fileNameFromUrl } from '../../lib/fileAccept';
import FileDropZone from '../common/FileDropZone';
import IconButton from '../common/IconButton';

const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 서버 한도와 동일 (2GB)
const MAX_THUMB_BYTES = 5 * 1024 * 1024;        // 서버 한도와 동일 (5MB)
const ACCEPT = '.mp4,.m4v,.webm,.mov,video/mp4,video/webm,video/quicktime,video/x-m4v';
const THUMB_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';
const THUMB_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']); // 서버 THUMB_MIMES 와 동일

/**
 * 영상자료 등록/수정 폼.
 * props: initial(수정 시 기존 레코드) / onSaved(video) / onCancel()
 *
 * 파일 선택 시 브라우저에서 길이를 읽고 썸네일(1초 지점 프레임)을 자동 캡처한다.
 * 썸네일은 (a) 자동 캡처 — 등록된 파일이 아닌 상태로 표시, (b) 직접 올린 이미지(JPEG/PNG/WebP),
 * (c) 수정 시 기존 썸네일 유지 중 하나다. 수정 화면에서는 기존 영상 URL 로 다른 장면을 다시 캡처할 수도 있다.
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
  // thumb: null → 새 썸네일 없음(수정이면 기존 유지)
  //        { source: 'auto', blob, atSec } → 영상에서 자동 캡처한 프레임 (등록된 파일이 아님)
  //        { source: 'custom', file }      → 사용자가 직접 등록한 이미지 파일
  const [thumb, setThumb] = useState(null);
  const [thumbPreview, setThumbPreview] = useState(initial?.thumbnailUrl ?? null);
  const [captureAt, setCaptureAt] = useState(1);
  const [probing, setProbing] = useState(false);

  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);   // 0~1 (영상 업로드)
  const [stage, setStage] = useState('');        // 진행 단계 안내
  const [error, setError] = useState('');
  const previewUrlRef = useRef(null);

  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);

  /** 썸네일 상태 + 미리보기 URL 을 함께 바꾼다 (이전 object URL 은 해제) */
  const applyThumb = (next) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const src = next?.source === 'custom' ? next.file : next?.blob;
    if (src) {
      previewUrlRef.current = URL.createObjectURL(src);
      setThumbPreview(previewUrlRef.current);
    } else {
      previewUrlRef.current = null;
      setThumbPreview(initial?.thumbnailUrl ?? null);
    }
    setThumb(next);
  };

  // 자동 캡처에 쓸 소스: 새로 고른 파일 > (수정) 기존 영상 URL
  const captureSource = file ?? (isEdit ? initial?.videoUrl ?? null : null);

  const handleFile = async (f) => {
    setError('');
    setFile(f);
    if (!f) {
      setDurationSec(initial?.durationSec ?? null);
      setCaptureAt(1);
      if (thumb?.source === 'auto') applyThumb(null); // 자동 캡처는 영상에 딸린 것 — 직접 등록한 이미지는 유지
      return;
    }
    setProbing(true);
    try {
      const keepCustom = thumb?.source === 'custom';
      const [d, blob] = await Promise.all([
        probeVideoDuration(f),
        keepCustom ? Promise.resolve(null) : captureVideoThumbnail(f),
      ]);
      setDurationSec(d);
      setCaptureAt(1);
      if (!keepCustom) applyThumb(blob ? { source: 'auto', blob, atSec: 1 } : null);
      if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''));
    } finally {
      setProbing(false);
    }
  };

  /** 영상의 다른 지점을 자동 캡처 (새 파일 또는 수정 중인 기존 영상) */
  const recapture = async () => {
    if (!captureSource) return;
    setError('');
    setProbing(true);
    try {
      const next = durationSec
        ? Math.min(durationSec - 1, captureAt + Math.max(5, Math.floor(durationSec / 8)))
        : captureAt + 5;
      const at = next <= captureAt ? 1 : next;
      const blob = await captureVideoThumbnail(captureSource, at);
      if (blob) {
        applyThumb({ source: 'auto', blob, atSec: at });
        setCaptureAt(at);
      } else {
        setError('썸네일을 자동으로 캡처하지 못했습니다. 이미지를 직접 등록해 주세요.');
      }
    } finally {
      setProbing(false);
    }
  };

  /** 썸네일 이미지 직접 등록 / 제거 */
  const handleThumbFile = async (f) => {
    setError('');
    if (f) {
      if (!THUMB_MIMES.has(f.type)) {
        setError('썸네일은 JPEG / PNG / WebP 이미지만 등록할 수 있습니다.');
        return;
      }
      applyThumb({ source: 'custom', file: f });
      return;
    }
    // 등록 이미지 제거 → 새 영상이 있으면 자동 캡처로 되돌리고, 없으면 기존 썸네일 유지
    if (file) {
      setProbing(true);
      try {
        const blob = await captureVideoThumbnail(file, captureAt);
        applyThumb(blob ? { source: 'auto', blob, atSec: captureAt } : null);
      } finally {
        setProbing(false);
      }
    } else {
      applyThumb(null);
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
      if (thumb) {
        setStage('썸네일 업로드 중…');
        const thumbFile = thumb.source === 'custom'
          ? thumb.file
          : new File([thumb.blob], 'thumbnail.jpg', { type: 'image/jpeg' });
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

  // ─── 썸네일 영역 문구 (상태별) ─────────────────────
  const isAutoThumb = thumb?.source === 'auto';
  const isCustomThumb = thumb?.source === 'custom';
  let thumbLabel;
  let thumbStatus = null;
  if (probing && !thumbPreview) {
    thumbLabel = '영상 분석 중…';
  } else if (isAutoThumb) {
    thumbLabel = '자동 캡처 화면 — 등록된 썸네일 파일 없음';
    thumbStatus = (
      <span className="text-xs text-amber-700">
        영상 {formatDuration(thumb.atSec)} 지점 프레임을 사용합니다. 이미지를 직접 등록하면 대체됩니다.
      </span>
    );
  } else if (isEdit && initial?.thumbnailUrl) {
    thumbLabel = '현재 썸네일 유지 — 새로 등록한 파일 없음';
    thumbStatus = (
      <span className="text-xs text-gray-600">
        교체하려면 이미지를 등록하거나 [다른 장면으로]를 눌러 기존 영상에서 다시 캡처하세요.
      </span>
    );
  } else {
    thumbLabel = '썸네일 없음';
    thumbStatus = (
      <span className="text-xs text-gray-600">
        영상을 선택하면 자동으로 캡처됩니다. 이미지를 직접 등록할 수도 있습니다.
      </span>
    );
  }

  const thumbPreviewNode = (
    <div className="w-36 aspect-video bg-gray-100 rounded overflow-hidden flex items-center justify-center shrink-0 border border-gray-200">
      {thumbPreview
        ? <img src={thumbPreview} alt="썸네일 미리보기" className="w-full h-full object-cover" />
        : probing
          ? <span className="text-xs text-gray-400">분석 중…</span>
          : <ImageIcon className="h-6 w-6 text-gray-300" />}
    </div>
  );

  const videoCurrent = isEdit ? (
    <span className="text-xs text-gray-600 break-all">
      현재 영상: {fileNameFromUrl(initial.videoUrl) || '(파일)'}
      {initial.fileSize ? ` · ${formatBytes(initial.fileSize)}` : ''}
      {initial.durationSec != null ? ` · ${formatDuration(initial.durationSec)}` : ''}
      {' '}— 선택하지 않으면 기존 영상이 유지됩니다.
    </span>
  ) : null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 whitespace-normal break-keep">
        mp4 / webm / mov 형식, 최대 2GB. 등록한 영상은 모든 교사가 검색·학급 배정에 사용할 수 있습니다(수정·삭제는 등록자만).
      </p>

      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{isEdit ? '영상 파일 교체 (선택)' : '영상 파일 *'}</span>
        <FileDropZone
          file={file}
          onFile={handleFile}
          accept={ACCEPT}
          maxBytes={MAX_VIDEO_BYTES}
          icon={Film}
          disabled={saving}
          label={isEdit ? '클릭하거나 영상을 끌어다 놓으면 기존 영상을 교체합니다' : '클릭하거나 영상 파일을 끌어다 놓으세요'}
          hint="mp4 / webm / mov, 최대 2GB"
          current={videoCurrent}
          selectedHint={`${durationSec != null ? `길이 ${formatDuration(durationSec)} · ` : ''}클릭하거나 다른 파일을 끌어다 놓으면 바뀝니다`}
        />
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium">썸네일</span>
        <FileDropZone
          file={isCustomThumb ? thumb.file : null}
          onFile={handleThumbFile}
          accept={THUMB_ACCEPT}
          maxBytes={MAX_THUMB_BYTES}
          icon={ImagePlus}
          disabled={saving || probing}
          label={thumbLabel}
          hint="JPEG / PNG / WebP, 5MB 이하 · 클릭하거나 이미지를 끌어다 놓으세요"
          current={thumbStatus}
          selectedHint="등록한 이미지가 썸네일로 사용됩니다"
          preview={thumbPreviewNode}
          actions={({ open }) => (
            <>
              <IconButton icon={ImagePlus} label={isCustomThumb || thumbPreview ? '썸네일 교체' : '이미지 선택'}
                size="sm" onClick={open} disabled={saving || probing} />
              {captureSource && (
                <IconButton icon={Camera} label="다른 장면으로" size="sm" onClick={recapture} disabled={saving || probing} />
              )}
            </>
          )}
        />
      </div>

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
          <IconButton icon={X} label="취소" onClick={onCancel} disabled={saving} />
        )}
        <IconButton type="submit" icon={isEdit ? Save : Plus} variant="primary" label={isEdit ? '수정' : '등록'}
          busy={saving} busyLabel="업로드 중…" disabled={probing} />
      </div>
    </form>
  );
}

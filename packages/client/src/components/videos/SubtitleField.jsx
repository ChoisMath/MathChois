import { useState } from 'react';
import { Captions, RefreshCw, Trash2, Undo2 } from 'lucide-react';
import { MAX_SUBTITLE_BYTES } from '@mathchois/shared';
import { readSubtitleFile, subtitleLengthWarning } from '../../lib/subtitleFile';
import { formatDuration } from '../../lib/videos';
import FileDropZone from '../common/FileDropZone';
import IconButton from '../common/IconButton';

const ACCEPT = '.srt,.vtt';

/**
 * 영상자료 폼의 "자막 (한국어)" 칸 (제어 컴포넌트).
 *
 * props
 * - current: 이미 등록된 자막(VideoSubtitle) 또는 null
 * - value: 저장 시 반영할 변경 — null | { action: 'upload', file, info: { cueCount, lastEnd } } | { action: 'delete' }
 * - onChange(next)
 * - durationSec: 영상 길이(초) — 자막이 더 길면 경고. 영상을 교체하면 다시 계산하며, 기존 자막을 유지할 때도
 *   그 자막의 lastEnd(서버가 저장)로 비교한다
 * - disabled
 *
 * 파일을 고르면 브라우저에서 바로 읽어 문장 수를 보여 주고, 실제 업로드·삭제는 폼 [저장] 때 한다.
 */
export default function SubtitleField({ current = null, value = null, onChange, durationSec = null, disabled = false }) {
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);

  const handleFile = async (file) => {
    setError('');
    if (!file) { onChange(null); return; }
    setReading(true);
    try {
      const info = await readSubtitleFile(file, durationSec);
      if (!info.ok) {
        setError(info.error);
        onChange(null);
        return;
      }
      onChange({ action: 'upload', file, info: { cueCount: info.cueCount, lastEnd: info.lastEnd } });
    } catch {
      setError('자막 파일을 읽지 못했습니다.');
      onChange(null);
    } finally {
      setReading(false);
    }
  };

  const uploading = value?.action === 'upload';
  const deleting = value?.action === 'delete';
  const warning = uploading
    ? subtitleLengthWarning(value.info.lastEnd, durationSec)
    : (!deleting && current ? subtitleLengthWarning(current.lastEnd, durationSec) : undefined);

  let label = '자막 없음 — .srt / .vtt 파일(UTF-8, 2MB 이하)을 올릴 수 있습니다';
  let status = null;
  if (deleting) {
    label = '삭제 예정';
    status = <span className="text-xs text-red-600">저장하면 자막이 삭제됩니다</span>;
  } else if (current) {
    label = '자막 등록됨 — 새 파일을 올리면 교체됩니다';
    status = (
      <span className="text-xs text-gray-600">
        등록됨 · 문장 {current.cueCount}개 · {(current.updatedAt || '').slice(0, 10)}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium">자막 (한국어)</span>
      <FileDropZone
        file={uploading ? value.file : null}
        onFile={handleFile}
        accept={ACCEPT}
        maxBytes={MAX_SUBTITLE_BYTES}
        icon={Captions}
        disabled={disabled || reading}
        label={reading ? '자막 파일 읽는 중…' : label}
        hint="Vrew·CapCut 등에서 내보낸 .srt / .vtt · 클릭하거나 끌어다 놓으세요"
        current={status}
        selectedHint={uploading
          ? `문장 ${value.info.cueCount}개 · 마지막 ${formatDuration(value.info.lastEnd)} · 저장하면 올라갑니다`
          : undefined}
        actions={({ open }) => (
          value ? (
            <IconButton icon={Undo2} label="되돌리기" size="sm" disabled={disabled}
              onClick={() => { setError(''); onChange(null); }} />
          ) : current ? (
            <>
              <IconButton icon={RefreshCw} label="자막 교체" size="sm" onClick={open} disabled={disabled} />
              <IconButton icon={Trash2} label="자막 삭제" size="sm" variant="danger" disabled={disabled}
                onClick={() => { setError(''); onChange({ action: 'delete' }); }} />
            </>
          ) : null
        )}
      />
      {warning && <p className="text-xs text-amber-700">{warning}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

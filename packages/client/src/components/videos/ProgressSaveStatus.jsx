import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { formatTime } from '../../lib/videoPlayer';

/**
 * 학생 시청 기록 저장 상태 한 줄 (플레이어 아래).
 * 저장 실패가 조용히 묻히지 않도록 사유를 그대로 보여 준다(교사 문의 시 진단용).
 * status: null(아직 없음) | { state: 'saving'|'saved'|'error', positionSec, completed?, message? }
 */
export default function ProgressSaveStatus({ status, className = '' }) {
  if (!status) return null;
  if (status.state === 'error') {
    return (
      <p className={`inline-flex items-center gap-1 text-xs text-red-600 ${className}`} role="status">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        시청 기록 저장 실패: {status.message || '알 수 없는 오류'} — 다음 보고 때 다시 시도합니다
      </p>
    );
  }
  if (status.state === 'saving') {
    return (
      <p className={`inline-flex items-center gap-1 text-xs text-gray-400 ${className}`} role="status">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> 시청 기록 저장 중…
      </p>
    );
  }
  return (
    <p className={`inline-flex items-center gap-1 text-xs ${status.completed ? 'text-green-700' : 'text-gray-500'} ${className}`} role="status">
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
      시청 기록 저장됨 · {formatTime(status.positionSec)}{status.completed ? ' · 학습 완료' : ''}
    </p>
  );
}

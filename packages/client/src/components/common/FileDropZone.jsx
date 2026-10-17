import { useCallback, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { fileMatchesAccept } from '../../lib/fileAccept';
import { formatBytes } from '../../lib/videos';

/**
 * 클릭 / 드래그 앤 드롭으로 파일 하나를 고르는 영역.
 *
 * - 마우스를 올리면 테두리가 진해지고, 파일을 끌어오면 파란 테두리로 바뀐다.
 * - 클릭(또는 Enter/Space)하면 OS 파일 선택창이 열린다.
 * - 드롭된 파일도 `accept` 와 `maxBytes` 로 검사해 맞지 않으면 안내 문구를 띄운다.
 *
 * props
 *  - file: 현재 선택된 File (없으면 null) — 있으면 "선택됨" 스타일로 표시
 *  - onFile(file|null): 선택·제거 시 호출. 제거(X)는 null
 *  - accept: `<input accept>` 문자열 (".html,text/html")
 *  - maxBytes: 초과하면 거부 (선택)
 *  - icon: 빈 상태 아이콘 (lucide 컴포넌트)
 *  - label / hint: 빈 상태 제목 / 형식·용량 안내
 *  - current: 파일이 없을 때 추가로 보여줄 노드 (수정 화면의 "기존 파일 유지" 등)
 *  - selectedHint: 파일이 있을 때 보조 문구 (기본: 클릭하거나 끌어다 놓아 변경)
 *  - preview: 왼쪽에 붙는 미리보기 노드 (썸네일 등)
 *  - actions({ open }): 오른쪽 하단 버튼 영역 — 클릭이 영역 클릭으로 번지지 않는다
 *  - clearable: X(제거) 버튼 표시 여부 (기본 true)
 *  - disabled, className
 */
export default function FileDropZone({
  file = null,
  onFile,
  accept = '',
  maxBytes = null,
  icon: Icon = Upload,
  label = '클릭하거나 파일을 끌어다 놓으세요',
  hint = '',
  current = null,
  selectedHint = '클릭하거나 다른 파일을 끌어다 놓으면 바뀝니다',
  preview = null,
  actions = null,
  clearable = true,
  disabled = false,
  className = '',
}) {
  const inputRef = useRef(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [reject, setReject] = useState('');

  // 파일 선택창 열기 — 이벤트 핸들러에서만 호출된다(렌더 중 ref 접근 없음)
  const open = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const pick = (f) => {
    setReject('');
    if (!f) return;
    if (!fileMatchesAccept(f, accept)) {
      setReject(`지원하지 않는 파일 형식입니다 (${f.name}).${hint ? ` ${hint}` : ''}`);
      return;
    }
    if (maxBytes != null && f.size > maxBytes) {
      setReject(`파일이 너무 큽니다 (${formatBytes(f.size)}). 최대 ${formatBytes(maxBytes)} 까지 가능합니다.`);
      return;
    }
    onFile?.(f);
  };

  const hasFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

  const onDragEnter = (e) => {
    if (disabled || !hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (e) => {
    if (disabled || !hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e) => {
    if (disabled || !hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e) => {
    if (disabled) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const dropped = e.dataTransfer?.files?.[0] ?? null;
    pick(dropped);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  };

  const tone = dragging
    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
    : file
      ? 'border-solid border-emerald-500 bg-emerald-50/60 hover:border-emerald-600'
      : 'border-dashed border-gray-300 bg-white hover:border-gray-500 hover:bg-gray-50';

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        onClick={(e) => { if (e.target !== inputRef.current) open(); }}
        onKeyDown={onKeyDown}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative flex flex-wrap items-center gap-3 rounded-lg border-2 px-3 py-3 min-h-20 transition-colors select-none outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${tone} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={disabled}
          tabIndex={-1}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            e.target.value = ''; // 같은 파일을 다시 골라도 change 가 나도록
            pick(f);
          }}
        />

        {preview}

        <div className="flex min-w-0 flex-1 items-center gap-3">
          {!preview && (
            <Icon className={`h-7 w-7 shrink-0 ${file ? 'text-emerald-600' : dragging ? 'text-blue-600' : 'text-gray-400'}`} />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
            {file ? (
              <>
                <span className="font-medium text-gray-900 truncate" title={file.name}>{file.name}</span>
                <span className="text-xs text-gray-600">{formatBytes(file.size)}</span>
                {!disabled && <span className="text-xs text-gray-500">{selectedHint}</span>}
              </>
            ) : (
              <>
                <span className={`font-medium ${dragging ? 'text-blue-700' : 'text-gray-700'}`}>
                  {dragging ? '여기에 놓으세요' : label}
                </span>
                {hint && <span className="text-xs text-gray-500">{hint}</span>}
                {current}
              </>
            )}
          </div>
        </div>

        {(actions || (file && clearable)) && (
          <div className="flex items-center gap-1.5 ml-auto" onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}>
            <ZoneActions actions={actions} open={open} />
            {file && clearable && (
              <button type="button" disabled={disabled} aria-label="선택한 파일 제거"
                onClick={() => { setReject(''); onFile?.(null); }}
                className="inline-flex items-center justify-center h-9 w-9 rounded border border-gray-300 bg-white text-gray-600 hover:text-red-600 hover:border-red-300 disabled:opacity-50">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
      {reject && <p className="text-xs text-red-600">{reject}</p>}
    </div>
  );
}

/** actions 렌더 프롭 — `open` 은 버튼 onClick 등 이벤트 핸들러에서만 호출된다 */
function ZoneActions({ actions, open }) {
  if (!actions) return null;
  return typeof actions === 'function' ? actions({ open }) : actions;
}

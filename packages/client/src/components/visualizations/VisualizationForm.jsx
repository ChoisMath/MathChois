import { useState } from 'react';
import { FileCode2, Plus, Save, X } from 'lucide-react';
import { uploadVisualizationHtml, createVisualization, updateVisualization } from '../../lib/visualizations';
import { fileNameFromUrl } from '../../lib/fileAccept';
import FileDropZone from '../common/FileDropZone';
import IconButton from '../common/IconButton';

const ACCEPT = '.html,.htm,text/html';

/**
 * 시각화자료 등록/수정 폼.
 * props: initial(수정 시 기존 레코드) / onSaved(vis) / onCancel()
 */
export default function VisualizationForm({ initial = null, onSaved, onCancel }) {
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [majorUnit, setMajorUnit] = useState(initial?.majorUnit ?? '');
  const [minorUnit, setMinorUnit] = useState(initial?.minorUnit ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleFile = (f) => {
    setError('');
    setFile(f);
    if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) { setError('제목을 입력하세요.'); return; }
    if (!isEdit && !file) { setError('HTML 파일을 선택하세요.'); return; }

    setSaving(true);
    try {
      let htmlUrl = initial?.htmlUrl;
      if (file) htmlUrl = await uploadVisualizationHtml(file);

      const meta = {
        title: title.trim(),
        subject: subject.trim() || null,
        majorUnit: majorUnit.trim() || null,
        minorUnit: minorUnit.trim() || null,
        description: description.trim() || null,
      };

      const saved = isEdit
        ? await updateVisualization(initial.id, file ? { ...meta, htmlUrl } : meta)
        : await createVisualization({ ...meta, htmlUrl });

      onSaved?.(saved);
    } catch (err) {
      setError(err.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const current = isEdit ? (
    <span className="text-xs text-gray-600 break-all">
      현재 파일: {fileNameFromUrl(initial.htmlUrl) || '(파일)'} — 선택하지 않으면 기존 HTML이 유지됩니다.
    </span>
  ) : null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 whitespace-normal break-keep">
        외부 의존 없이 단독 실행 가능한 standalone HTML 파일만 등록하세요.
      </p>

      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{isEdit ? 'HTML 파일 교체 (선택)' : 'HTML 파일 *'}</span>
        <FileDropZone
          file={file}
          onFile={handleFile}
          accept={ACCEPT}
          icon={FileCode2}
          disabled={saving}
          label={isEdit ? '클릭하거나 HTML 파일을 끌어다 놓으면 기존 파일을 교체합니다' : '클릭하거나 HTML 파일을 끌어다 놓으세요'}
          hint=".html 파일 1개"
          current={current}
        />
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">제목 *</span>
        <input className="border rounded px-2 min-h-11" value={title}
          onChange={(e) => setTitle(e.target.value)} placeholder="예: 원의 방정식 시각화" />
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
        <textarea className="border rounded px-2 py-1" rows={2} value={description}
          onChange={(e) => setDescription(e.target.value)} placeholder="간단한 설명" />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <IconButton icon={X} label="취소" onClick={onCancel} disabled={saving} />
        )}
        <IconButton type="submit" icon={isEdit ? Save : Plus} variant="primary" label={isEdit ? '수정' : '등록'}
          busy={saving} busyLabel="저장 중…" />
      </div>
    </form>
  );
}

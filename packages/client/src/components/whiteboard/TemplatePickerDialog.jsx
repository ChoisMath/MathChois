import { useEffect, useState } from 'react';
import { X, Ban } from 'lucide-react';
import { TEMPLATES, TEMPLATE_CATEGORIES } from '../../lib/whiteboardTemplates';
import TemplateThumb from './TemplateThumb';

/**
 * 템플릿 선택 다이얼로그.
 *  - variant="dialog": 모달 (교사 기본 템플릿 / 보드 내 삽입)
 *  - variant="overlay": 학생 빈 보드 최초 진입 — "템플릿으로 시작하거나 아무 곳이나 클릭하여 닫으세요…"
 *  - allowNone: "없음(학생이 선택)" 항목
 */
export default function TemplatePickerDialog({
  onSelect, onClose, allowNone = false, title = '템플릿 선택', variant = 'dialog', currentKey = null,
}) {
  const [category, setCategory] = useState(TEMPLATE_CATEGORIES[0].key);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const list = TEMPLATES.filter((t) => t.category === category);

  const grid = (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {allowNone && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 hover:border-blue-400 cursor-pointer bg-white ${currentKey === null ? 'border-blue-500' : 'border-gray-200'}`}
        >
          <div className="w-full aspect-video flex items-center justify-center bg-gray-50 rounded">
            <Ban className="h-8 w-8 text-gray-400" />
          </div>
          <span className="text-xs text-gray-700">없음 (학생이 선택)</span>
        </button>
      )}
      {list.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onSelect(t.key)}
          title={t.name}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 hover:border-blue-400 cursor-pointer bg-white ${currentKey === t.key ? 'border-blue-500' : 'border-gray-200'}`}
        >
          <div className="w-full aspect-video overflow-hidden rounded border border-gray-100">
            <TemplateThumb templateKey={t.key} />
          </div>
          <span className="text-xs text-gray-700 text-center leading-tight line-clamp-2">{t.name}</span>
        </button>
      ))}
    </div>
  );

  const tabs = (
    <div className="flex gap-1 mb-3">
      {TEMPLATE_CATEGORIES.map((c) => (
        <button
          key={c.key} type="button" onClick={() => setCategory(c.key)}
          className={`px-3 py-1.5 rounded-full text-sm cursor-pointer ${category === c.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          {c.name}
        </button>
      ))}
    </div>
  );

  if (variant === 'overlay') {
    return (
      <div className="absolute inset-0 z-40 bg-white/85 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
        <div className="max-w-5xl mx-auto p-6" onClick={(e) => e.stopPropagation()}>
          <p className="text-gray-500 text-sm mb-3">템플릿으로 시작하거나 아무 곳이나 클릭하여 닫으세요…</p>
          {tabs}
          {grid}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 cursor-pointer" aria-label="닫기">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          {tabs}
          {grid}
        </div>
      </div>
    </div>
  );
}

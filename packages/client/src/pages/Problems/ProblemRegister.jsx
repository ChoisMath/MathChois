import { useState } from 'react';
import { Loader, Upload, Wand2 } from 'lucide-react';
import ProblemView from '../../components/common/ProblemView';
import { validateFigures } from '../../lib/problemContent';
import {
  ocrProblem, ocrMarkscheme, generateSolution,
  createProblem, updateProblem, uploadProblemImage,
} from '../../lib/problems';

const EMPTY = {
  title: '', problemLatex: '', figureNotes: [], figures: [],
  originalImageUrl: null, subject: '', majorUnit: '', minorUnit: '',
  difficulty: '', problemType: '', detailType: '', keywords: [],
  answer: '', solution: '', solutionSource: null, markschemeImageUrl: null,
};

export default function ProblemRegister({ initial, onSaved }) {
  const [form, setForm] = useState(initial ?? EMPTY);
  const [dir] = useState(() => `drafts/${Date.now()}`);
  const [busy, setBusy] = useState('');   // '' | 'ocr' | 'markscheme' | 'solution' | 'save'
  const [error, setError] = useState('');

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const handleProblemImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy('ocr'); setError('');
    try {
      const url = await uploadProblemImage(file, dir);
      const res = await ocrProblem(url);
      set({
        originalImageUrl: url,
        problemLatex: res.latex,
        figureNotes: res.figureNotes,
        figures: res.figureNotes.map((alt, i) => ({ idx: i + 1, alt, imageUrl: '' })),
        ...res.meta,
        keywords: res.meta.keywords ?? [],
      });
    } catch (err) { setError(err.message); }
    setBusy('');
  };

  const handleFigureImage = async (idx, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadProblemImage(file, `${dir}/figures`);
    set({ figures: form.figures.map((fig) => fig.idx === idx ? { ...fig, imageUrl: url } : fig) });
  };

  const handleMarkscheme = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy('markscheme'); setError('');
    try {
      const url = await uploadProblemImage(file, `${dir}/markscheme`);
      const res = await ocrMarkscheme(url);
      set({ answer: res.answer, solution: res.solution, solutionSource: 'teacher-markscheme', markschemeImageUrl: url });
    } catch (err) { setError(err.message); }
    setBusy('');
  };

  const handleGenerateSolution = async () => {
    if (!form.problemLatex) { setError('먼저 문제 본문을 입력하세요.'); return; }
    setBusy('solution'); setError('');
    try {
      const res = await generateSolution(form.problemLatex);
      set({ answer: res.answer, solution: res.solution, solutionSource: 'ai' });
    } catch (err) { setError(err.message); }
    setBusy('');
  };

  const handleSave = async () => {
    const v = validateFigures(form.problemLatex, form.figureNotes);
    if (!v.ok) { setError(v.message); return; }
    setBusy('save'); setError('');
    try {
      const solutionSource = form.solutionSource === 'teacher-markscheme'
        ? 'teacher-markscheme'
        : (form.solution ? 'teacher-verified' : form.solutionSource);
      const payload = { ...form, solutionSource, title: form.title || null };
      const saved = initial?.id
        ? await updateProblem(initial.id, payload)
        : await createProblem(payload);
      onSaved?.(saved);
      if (!initial) setForm(EMPTY);
    } catch (err) { setError(err.message); }
    setBusy('');
  };

  const META_FIELDS = [
    ['subject', '과목'], ['majorUnit', '대단원'], ['minorUnit', '소단원'],
    ['difficulty', '난이도'], ['problemType', '유형'], ['detailType', '세부유형'],
  ];

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* 좌: 입력 */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <label className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md cursor-pointer w-fit">
          {busy === 'ocr' ? <Loader className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span className="whitespace-nowrap">문제 이미지 업로드 + AI 분석</span>
          <input type="file" accept="image/*" className="hidden" disabled={!!busy} onChange={handleProblemImage} />
        </label>

        <input className="border rounded px-3 py-2" placeholder="제목(선택)"
          value={form.title} onChange={(e) => set({ title: e.target.value })} />

        <textarea className="border rounded px-3 py-2 font-mono text-sm h-40" placeholder="문제 본문 (Markdown + LaTeX)"
          value={form.problemLatex} onChange={(e) => set({ problemLatex: e.target.value })} />

        {/* 그림 슬롯 */}
        {form.figures.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-gray-500">감지된 그림 — 각 슬롯에 이미지를 삽입하세요</p>
            {form.figures.map((fig) => (
              <div key={fig.idx} className="flex items-center gap-2">
                <span className="text-xs whitespace-nowrap">[그림 {fig.idx}] {fig.alt}</span>
                <input type="file" accept="image/*" onChange={(e) => handleFigureImage(fig.idx, e)} />
                {fig.imageUrl && <span className="text-green-600 text-xs">✓</span>}
              </div>
            ))}
          </div>
        )}

        {/* 분류 */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {META_FIELDS.map(([key, label]) => (
            <input key={key} className="border rounded px-2 py-1 text-sm" placeholder={label}
              value={form[key] ?? ''} onChange={(e) => set({ [key]: e.target.value })} />
          ))}
          <input className="border rounded px-2 py-1 text-sm col-span-2 sm:col-span-3" placeholder="키워드(쉼표로 구분)"
            value={(form.keywords || []).join(', ')}
            onChange={(e) => set({ keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
        </div>

        {/* 정답·해설 */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 px-3 py-2 border rounded-md cursor-pointer">
            {busy === 'markscheme' ? <Loader className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            <span className="whitespace-nowrap">마크스킴 이미지</span>
            <input type="file" accept="image/*" className="hidden" disabled={!!busy} onChange={handleMarkscheme} />
          </label>
          <button onClick={handleGenerateSolution} disabled={!!busy}
            className="flex items-center gap-1 px-3 py-2 border rounded-md disabled:opacity-50">
            {busy === 'solution' ? <Loader className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            <span className="whitespace-nowrap">AI 정답·해설 생성</span>
          </button>
          {form.solutionSource && <span className="text-xs text-gray-500">출처: {form.solutionSource}</span>}
        </div>
        <input className="border rounded px-3 py-2" placeholder="정답"
          value={form.answer ?? ''} onChange={(e) => set({ answer: e.target.value })} />
        <textarea className="border rounded px-3 py-2 font-mono text-sm h-32" placeholder="해설 (Markdown + LaTeX)"
          value={form.solution ?? ''} onChange={(e) => set({ solution: e.target.value })} />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button onClick={handleSave} disabled={!!busy || !form.problemLatex}
          className="px-4 py-2 bg-green-600 text-white rounded-md disabled:opacity-50 w-fit">
          {busy === 'save' ? '저장 중…' : (initial ? '수정 저장' : '문항 저장')}
        </button>
      </div>

      {/* 우: 미리보기 */}
      <div className="flex-1 min-w-0 border rounded-md p-3 bg-white">
        <p className="text-xs text-gray-400 mb-2">미리보기</p>
        <ProblemView latex={form.problemLatex} figures={form.figures} />
        {form.solution && (
          <>
            <hr className="my-3" />
            <p className="text-xs text-gray-400 mb-1">해설</p>
            <ProblemView latex={form.solution} figures={[]} />
          </>
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { IA_DOCS } from '@mathchois/shared';
import IconButton from '../../components/common/IconButton';
import ProtectedPage from '../../components/ibGuide/ProtectedPage';
import { useAuth } from '../../contexts/AuthContext';
import { useIbGuideData } from '../../hooks/useIbGuideData';
import { IA_DOC_LABELS } from '../../lib/ibGuide/labels';
import { createFetchQueue } from '../../lib/ibGuide/pageFetch';
import {
  ZOOM_STEPS, availableDocs, carryPage, neighbours, pagesToLoad, resolveDoc, stepZoom,
} from '../../lib/ibGuide/viewer';
import './IaViewer.css';

const MAX_FIT = 1000; // 100% 일 때 쪽 폭의 상한(px)
const PAGE_GAP = 16; // .ia-viewer-pages 의 gap 과 같게

/**
 * IA 예시 쪽 보기 — /ib/ia/:exId?doc=student|annotated|comments. 전체 화면(허브 틀 밖).
 * 쪽은 JWT 로 받은 워터마크 WebP 를 <canvas> 에 그린다. 내려받기·인쇄 단추는 없다.
 */
export default function IaViewerPage() {
  const { exId } = useParams();
  const { examples, status } = useIbGuideData();

  if (status !== 'ready') {
    return <div className="ia-viewer ia-viewer--msg"><p role="status">불러오는 중...</p></div>;
  }
  const example = examples.find((e) => e.id === exId);
  if (!example) return <Navigate to="/ib/ia" replace />;
  if (!resolveDoc(example, null)) return <Navigate to="/ib/ia" replace />;
  return <IaViewer example={example} examples={examples} />;
}

function IaViewer({ example, examples }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const exId = example.id;
  const doc = resolveDoc(example, searchParams.get('doc'));
  const docs = availableDocs(example);
  const counts = useMemo(
    () => Object.fromEntries(IA_DOCS.map((d) => [d, example.docs?.[d]?.pages ?? 0])),
    [example],
  );
  const total = counts[doc];
  const { prev, next } = neighbours(examples, exId);

  const scrollRef = useRef(null);
  const pageEls = useRef({});
  const [visible, setVisible] = useState([]);
  const [current, setCurrent] = useState(1);
  const currentRef = useRef(1);
  const [zoom, setZoom] = useState(100);
  const [fitWidth, setFitWidth] = useState(0);
  // 문서별로 마지막에 보던 쪽 — 채점 코멘트로 갔다 돌아올 때 쓴다
  const remembered = useRef({});
  const pendingScroll = useRef(null);
  const deniedRef = useRef(false);

  // 받기 줄은 문서마다 새로 — 이전 문서의 쪽은 key 가 바뀌어 사라지며 각자 취소된다
  const queue = useMemo(
    () => createFetchQueue({
      max: 3,
      // 지금 보는 쪽에서 가까운 쪽부터, 같은 거리면 아래쪽(읽어 갈 방향) 먼저
      priority: (n) => Math.abs(n - currentRef.current) + (n < currentRef.current ? 0.5 : 0),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 문서가 바뀔 때만 새 줄
    [exId, doc],
  );

  const onDenied = useCallback(() => {
    if (deniedRef.current) return;
    deniedRef.current = true;
    navigate(`/${profile?.role ?? 'student'}/classrooms`, { replace: true });
  }, [navigate, profile?.role]);

  // ── 화면 폭에 맞춘 쪽 폭 ──
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const measure = () => {
      const cs = getComputedStyle(el);
      const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      setFitWidth(Math.max(0, Math.min(MAX_FIT, Math.floor(inner))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pageWidth = Math.round((fitWidth * zoom) / 100);

  // ── 지금 쪽: 보이는 영역 위쪽 1/4 선에 걸친 쪽(맨 아래까지 내렸으면 마지막 쪽) ──
  const updateCurrent = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !total) return;
    let n = 1;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2 && el.scrollTop > 0) {
      n = total;
    } else {
      const line = el.getBoundingClientRect().top + el.clientHeight * 0.25;
      for (let i = 1; i <= total; i++) {
        const box = pageEls.current[i];
        if (box && box.getBoundingClientRect().bottom + PAGE_GAP / 2 > line) { n = i; break; }
        n = i;
      }
    }
    currentRef.current = n;
    setCurrent(n);
  }, [total]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; updateCurrent(); });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [updateCurrent]);

  // ── 보이는 쪽(위아래 200px 여유) ──
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !total) return undefined;
    const seen = new Set();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const n = Number(e.target.dataset.page);
        if (e.isIntersecting) seen.add(n); else seen.delete(n);
      }
      setVisible([...seen].sort((a, b) => a - b));
    }, { root, rootMargin: '200px 0px' });
    for (let i = 1; i <= total; i++) if (pageEls.current[i]) io.observe(pageEls.current[i]);
    return () => io.disconnect();
  }, [exId, doc, total]);

  const toLoad = useMemo(() => new Set(pagesToLoad(visible, total)), [visible, total]);

  // ── 문서·예시가 바뀐 뒤: 정해 둔 쪽(탭 이동) 또는 맨 위로 ──
  const scrollToPage = useCallback((n) => {
    const el = scrollRef.current;
    const box = pageEls.current[n];
    if (!el) return;
    el.scrollTop = box && n > 1
      ? box.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - PAGE_GAP
      : 0;
  }, []);

  const prevExId = useRef(exId);
  useLayoutEffect(() => {
    if (prevExId.current !== exId) {
      prevExId.current = exId;
      remembered.current = {};
      pendingScroll.current = null;
    }
    const target = pendingScroll.current ?? 1;
    pendingScroll.current = null;
    setVisible([]);
    scrollToPage(target);
    currentRef.current = target;
    setCurrent(target);
  }, [exId, doc, scrollToPage]);

  // ── 확대·축소: 보던 쪽을 그대로 위에 둔다(다시 받지 않는다 — 크기만 CSS) ──
  const firstZoom = useRef(true);
  useLayoutEffect(() => {
    if (firstZoom.current) { firstZoom.current = false; return; }
    scrollToPage(currentRef.current);
  }, [zoom, scrollToPage]);

  // ── 탭 ──
  const switchDoc = (to) => {
    if (to === doc || !docs.includes(to)) return;
    remembered.current[doc] = currentRef.current;
    pendingScroll.current = carryPage({ from: doc, to, page: currentRef.current, counts, remembered: remembered.current });
    setSearchParams({ doc: to }, { replace: true });
  };
  const tabRefs = useRef({});
  const onTabKey = (e) => {
    const i = docs.indexOf(doc);
    let to = null;
    if (e.key === 'ArrowRight') to = docs[(i + 1) % docs.length];
    else if (e.key === 'ArrowLeft') to = docs[(i - 1 + docs.length) % docs.length];
    else if (e.key === 'Home') to = docs[0];
    else if (e.key === 'End') to = docs[docs.length - 1];
    if (!to) return;
    e.preventDefault();
    switchDoc(to);
    tabRefs.current[to]?.focus();
  };

  // ── 인쇄·저장 단축키 막기(화면에 있는 동안만) ──
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // 한글 입력 상태에서는 e.key 가 ㅔ·ㄴ 으로 오므로 물리 키(e.code)도 본다.
      const key = (e.key ?? '').toLowerCase();
      if (e.code === 'KeyP' || e.code === 'KeyS' || key === 'p' || key === 's') e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const goExample = (id) => navigate(`/ib/ia/${id}?doc=${doc}`);
  const pages = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <div className="ia-viewer">
      <header className="ia-viewer-bar">
        <IconButton icon={ArrowLeft} label="목록" onClick={() => navigate('/ib/ia')} className="ia-viewer-btn ia-viewer-back" />
        <h1 className="ia-viewer-heading">
          <span className="ia-viewer-no">예시 {example.no}</span>
          {example.title && <span className="ia-viewer-title">{example.title}</span>}
        </h1>
        <div className="ia-viewer-tabs" role="tablist" aria-label="문서">
          {IA_DOCS.map((d) => {
            const enabled = docs.includes(d);
            const selected = d === doc;
            return (
              <button
                key={d}
                ref={(el) => { tabRefs.current[d] = el; }}
                type="button"
                role="tab"
                id={`ia-tab-${d}`}
                aria-selected={selected}
                aria-controls="ia-viewer-panel"
                tabIndex={selected ? 0 : -1}
                disabled={!enabled}
                className="ia-viewer-tab"
                onClick={() => switchDoc(d)}
                onKeyDown={onTabKey}
              >
                {IA_DOC_LABELS[d]}
              </button>
            );
          })}
        </div>
        <div className="ia-viewer-zoom">
          <IconButton icon={ZoomOut} label="축소" disabled={zoom <= ZOOM_STEPS[0]} onClick={() => setZoom((z) => stepZoom(z, -1))} className="ia-viewer-btn" />
          <span className="ia-viewer-percent" aria-live="polite">{zoom}%</span>
          <IconButton icon={ZoomIn} label="확대" disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} onClick={() => setZoom((z) => stepZoom(z, 1))} className="ia-viewer-btn" />
        </div>
        <span className="ia-viewer-indicator" data-testid="ia-page-indicator">{current} / {total}</span>
        <div className="ia-viewer-nav">
          <IconButton icon={ChevronLeft} label="이전 예시" disabled={!prev} onClick={() => prev && goExample(prev)} className="ia-viewer-btn" />
          <IconButton icon={ChevronRight} label="다음 예시" disabled={!next} onClick={() => next && goExample(next)} className="ia-viewer-btn" />
        </div>
      </header>

      <div
        ref={scrollRef}
        className="ia-viewer-scroll"
        role="tabpanel"
        id="ia-viewer-panel"
        aria-labelledby={`ia-tab-${doc}`}
        tabIndex={0}
      >
        <div className="ia-viewer-pages">
          {pages.map((n) => (
            <div key={`${exId}/${doc}/${n}`} ref={(el) => { pageEls.current[n] = el; }} data-page={n} className="ia-viewer-slot">
              <ProtectedPage
                exId={exId}
                doc={doc}
                n={n}
                load={fitWidth > 0 && toLoad.has(n)}
                width={pageWidth}
                queue={queue}
                onDenied={onDenied}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

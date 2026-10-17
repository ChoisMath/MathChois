import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowLeftRight, ChevronLeft, ChevronRight, Maximize, Minimize, Sparkles } from 'lucide-react';
import { getClassroomVideo, getVideoProgress, reportVideoProgress } from '../../lib/videos';
import ProgressSaveStatus from '../../components/videos/ProgressSaveStatus';
import { getCachedChapterAndPages } from '../../lib/dataCache';
import { loadSplitSettings, saveSplitSettings, loadSplitPage, saveSplitPage } from '../../lib/splitLayout';
import { useOrientation } from '../../hooks/useOrientation';
import SplitPane from '../../components/common/SplitPane';
import VideoPlayer from '../../components/videos/VideoPlayer';
import VideoComments from '../../components/videos/VideoComments';
import CollapsibleSection from '../../components/videos/CollapsibleSection';
import StudyViewer from '../Study/StudyViewer';

/* ─── AI 코칭 페이지 안내 (분할 화면에서는 풀지 않는다 — v1 비목표) ─── */
function AiPagePlaceholder({ chapterId, pageId, index, total, onPrev, onNext }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 bg-indigo-50 text-center px-6">
      <Sparkles className="h-8 w-8 text-indigo-500" />
      <p className="text-sm font-semibold text-indigo-900">AI 코칭 페이지 ({index + 1} / {total})</p>
      <p className="text-xs text-indigo-700">AI 코칭 페이지는 전체 화면에서 풀 수 있어요. 분할 화면에서는 다른 페이지로 넘겨 필기하세요.</p>
      <Link to={`/student/study/${chapterId}/page/${pageId}`}
        className="inline-flex items-center min-h-9 px-3 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700">
        전체 화면으로 열기
      </Link>
      <div className="flex gap-2 mt-2">
        <button type="button" onClick={onPrev} disabled={!onPrev}
          className="inline-flex items-center gap-1 min-h-9 px-3 rounded-md border border-indigo-200 bg-white text-sm text-indigo-800 disabled:opacity-40 cursor-pointer">
          <ChevronLeft className="h-4 w-4" /> 이전 페이지
        </button>
        <button type="button" onClick={onNext} disabled={!onNext}
          className="inline-flex items-center gap-1 min-h-9 px-3 rounded-md border border-indigo-200 bg-white text-sm text-indigo-800 disabled:opacity-40 cursor-pointer">
          다음 페이지 <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * 영상 2분할 필기 화면 (학생 전용, DashboardLayout 바깥 전체화면 레이아웃).
 * 경로: /student/classrooms/:classroomId/videos/:cvId/split?page=<pageId>
 *
 * - 한쪽(기본 좌측)에 학급 영상 플레이어, 다른 쪽에 교사가 연결한 "필기 챕터"의 StudyViewer(임베드 모드).
 * - 페이지 이동은 `?page=` 쿼리만 바꾸므로 플레이어가 유지된다(영상이 끊기지 않음).
 * - 분할 비율(영상 패널 기준)·영상 위치는 기기에 저장(lib/splitLayout.js). 세로 화면은 위/아래 분할.
 * - 전체화면은 분할 루트를 대상으로 해 "영상은 반쪽, 나머지는 필기창" 이 된다.
 * - 플레이어 단축키는 마지막으로 포인터가 닿은 패널이 영상일 때만 활성(필기 중 Space 가 영상을 멈추지 않도록).
 */
export default function ClassroomVideoSplit() {
  const { classroomId, cvId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const rootRef = useRef(null);
  const videoPaneRef = useRef(null);
  const playerRef = useRef(null);

  const [detail, setDetail] = useState(null);
  const [progress, setProgress] = useState(null);
  const [pages, setPages] = useState(null); // null = 아직 로드 전
  const [saveStatus, setSaveStatus] = useState(null); // 마지막 시청 기록 저장 결과(진단 표시)
  // 오류는 cvId 와 함께 저장해, 다른 영상으로 이동하면 effect 안에서 setState 없이 자연히 사라진다
  const [errorState, setErrorState] = useState(null); // { cvId, message } | null
  const error = errorState?.cvId === cvId ? errorState.message : '';

  const [split, setSplit] = useState(loadSplitSettings);
  const orientation = useOrientation();
  const [activePane, setActivePane] = useState('video');
  const [realFull, setRealFull] = useState(false);
  const [pseudoFull, setPseudoFull] = useState(false);
  const isFull = realFull || pseudoFull;

  const watchPath = `/student/classrooms/${classroomId}/videos/${cvId}`;

  /* ── 데이터 로드: 학급 영상 상세(+시청 기록) → 연결 챕터의 페이지 목록 ── */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [d, p] = await Promise.all([
          getClassroomVideo(cvId),
          getVideoProgress(cvId).catch(() => null),
        ]);
        if (!alive) return;
        if (!d.chapter) {
          // 연결이 해제/삭제된 영상 — 일반 상세로
          navigate(watchPath, { replace: true });
          return;
        }
        setDetail(d);
        setProgress(p);
        const { pages: pgs } = await getCachedChapterAndPages(d.chapterId);
        if (alive) setPages(pgs || []);
      } catch (err) {
        if (alive) setErrorState({ cvId, message: err.message ?? '영상을 불러올 수 없습니다.' });
      }
    })();
    return () => { alive = false; };
  }, [cvId, navigate, watchPath]);

  /* ── 현재 페이지: ?page= → 기기에 기억된 페이지 → 첫 페이지 ── */
  const pageParam = searchParams.get('page');
  const pageId = useMemo(() => {
    if (!pages) return null;
    if (pageParam && pages.some((p) => p.id === pageParam)) return pageParam;
    const remembered = loadSplitPage(cvId);
    if (remembered && pages.some((p) => p.id === remembered)) return remembered;
    return pages[0]?.id ?? null;
  }, [pages, pageParam, cvId]);

  // 잘못된/없는 ?page= 는 유효한 페이지로 교정(히스토리 추가 없이)
  useEffect(() => {
    if (pageId && pageId !== pageParam) setSearchParams({ page: pageId }, { replace: true });
  }, [pageId, pageParam, setSearchParams]);

  // StudyViewer 의 데이터 로드 effect 가 이 콜백에 의존하므로 안정적인 참조여야 한다
  const handleNavigatePage = useCallback((pid) => {
    saveSplitPage(cvId, pid);
    setSearchParams({ page: pid });
  }, [cvId, setSearchParams]);

  const goBack = useCallback(() => navigate(watchPath), [navigate, watchPath]);

  /* ── 분할 설정 ── */
  const videoFirst = split.videoSide === 'start';
  const paneRatio = videoFirst ? split.ratio : 1 - split.ratio; // SplitPane 의 첫 패널 비율
  const handleRatio = useCallback((r) => {
    setSplit(saveSplitSettings({ ratio: videoFirst ? r : 1 - r }));
  }, [videoFirst]);
  const swapSides = useCallback(() => {
    setSplit((prev) => saveSplitSettings({ videoSide: prev.videoSide === 'start' ? 'end' : 'start' }));
  }, []);

  /* ── 전체화면 상태 추적 + CSS 폴백 Esc 해제 ── */
  useEffect(() => {
    const onChange = () => setRealFull(!!document.fullscreenElement && document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  useEffect(() => {
    if (!pseudoFull) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') playerRef.current?.exitPseudoFullscreen(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pseudoFull]);
  const toggleFullscreen = useCallback(() => playerRef.current?.toggleFullscreen(), []);

  /* ── 플레이어 연동 ── */
  const handleProgress = useCallback((positionSec, durationSec, opts) => {
    reportVideoProgress(cvId, { positionSec, durationSec, keepalive: !!opts?.keepalive })
      .then((st) => setSaveStatus(st));
  }, [cvId]);
  const getCurrentTime = useCallback(() => playerRef.current?.getCurrentTime() ?? 0, []);
  const seekTo = useCallback((sec) => playerRef.current?.seekTo(sec), []);

  const onRootPointerDownCapture = useCallback((e) => {
    setActivePane(videoPaneRef.current?.contains(e.target) ? 'video' : 'notes');
  }, []);

  /* ── 로딩/오류 ── */
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3" style={{ height: '100dvh' }}>
        <p className="text-red-600">{error}</p>
        <Link to={watchPath} className="text-blue-600 hover:underline text-sm">← 영상으로 돌아가기</Link>
      </div>
    );
  }
  if (!detail || !pages) {
    return <div className="flex items-center justify-center" style={{ height: '100dvh' }}><p className="text-gray-500">로딩 중...</p></div>;
  }

  const v = detail.video;
  const pageIndex = pages.findIndex((p) => p.id === pageId);
  const page = pageIndex >= 0 ? pages[pageIndex] : null;
  const prevId = pageIndex > 0 ? pages[pageIndex - 1].id : null;
  const nextId = pageIndex >= 0 && pageIndex < pages.length - 1 ? pages[pageIndex + 1].id : null;

  const videoPane = (
    <div ref={videoPaneRef} className="h-full flex flex-col bg-black">
      <div className="flex-1 min-h-0">
        <VideoPlayer
          ref={playerRef}
          src={v.videoUrl}
          poster={v.thumbnailUrl}
          title={v.title}
          storageKey={`cv:${detail.id}`}
          initialPosition={progress?.positionSec ?? 0}
          onProgress={handleProgress}
          hotkeys={activePane === 'video'}
          fill
          fullscreenTargetRef={rootRef}
          onPseudoFullscreenChange={setPseudoFull}
        />
      </div>
      {!isFull && (
        <div className="bg-white border-t px-3 py-1.5 overflow-y-auto max-h-[45%] shrink-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900 truncate" title={v.title}>{v.title}</p>
            <ProgressSaveStatus status={saveStatus} className="shrink-0" />
          </div>
          <CollapsibleSection label={`댓글 ${detail.commentCount ?? 0}`}>
            <VideoComments classroomVideoId={detail.id} isTeacher={false} getCurrentTime={getCurrentTime} onSeek={seekTo} />
          </CollapsibleSection>
        </div>
      )}
    </div>
  );

  const notesPane = page?.aiProblemId ? (
    <AiPagePlaceholder
      chapterId={detail.chapterId} pageId={page.id} index={pageIndex} total={pages.length}
      onPrev={prevId ? () => handleNavigatePage(prevId) : null}
      onNext={nextId ? () => handleNavigatePage(nextId) : null}
    />
  ) : (
    <StudyViewer
      embedded
      chapterId={detail.chapterId}
      pageId={pageId}
      onNavigatePage={handleNavigatePage}
      onExit={goBack}
    />
  );

  return (
    <div
      ref={rootRef}
      onPointerDownCapture={onRootPointerDownCapture}
      className={`flex flex-col bg-gray-100 ${pseudoFull ? 'fixed inset-0 z-[80]' : ''}`}
      style={{ height: '100dvh' }}
    >
      {!isFull && (
        <div className="h-12 bg-white border-b flex items-center justify-between gap-2 px-2 sm:px-3 shrink-0">
          <button type="button" onClick={goBack}
            className="inline-flex items-center gap-1 min-h-9 px-2 rounded-md text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 cursor-pointer">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">영상으로 돌아가기</span>
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 text-center" title={v.title}>
            {v.title}
            <span className="ml-2 text-xs font-normal text-gray-500">· {detail.chapter.title}</span>
          </span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={swapSides} title={orientation === 'vertical' ? '위/아래 바꾸기' : '좌/우 바꾸기 (왼손잡이)'}
              className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 cursor-pointer">
              <ArrowLeftRight className={`h-5 w-5 ${orientation === 'vertical' ? 'rotate-90' : ''}`} />
            </button>
            <button type="button" onClick={toggleFullscreen} title="전체화면 (영상은 반쪽, 나머지는 필기창)"
              className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 cursor-pointer">
              <Maximize className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        {/* DOM 순서는 항상 [영상, 필기] — 좌우 바꾸기는 reverse(CSS order) 로만 처리해 플레이어가 리마운트되지 않는다 */}
        <SplitPane orientation={orientation} ratio={paneRatio} onRatioChange={handleRatio} reverse={!videoFirst}>
          {videoPane}
          {notesPane}
        </SplitPane>

        {/* 전체화면 중: 상단 바 대신 작은 플로팅 버튼 */}
        {isFull && (
          <div className="absolute top-2 right-2 z-40 flex gap-1">
            <button type="button" onClick={swapSides} title="영상 위치 바꾸기"
              className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 cursor-pointer">
              <ArrowLeftRight className={`h-4 w-4 ${orientation === 'vertical' ? 'rotate-90' : ''}`} />
            </button>
            <button type="button" onClick={toggleFullscreen} title="전체화면 종료 (Esc)"
              className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 cursor-pointer">
              <Minimize className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

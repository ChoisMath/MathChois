import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clapperboard, MessageSquare, Users, CheckCircle2, Columns2, BookOpen, RefreshCw } from 'lucide-react';
import { useIntervalRefresh } from '../../hooks/useIntervalRefresh';
import { useAuth } from '../../contexts/AuthContext';
import {
  getClassroomVideo, formatDuration, getVideoProgress, reportVideoProgress, getVideoProgressSummary,
} from '../../lib/videos';
import ProgressSaveStatus from '../../components/videos/ProgressSaveStatus';
import { formatTime } from '../../lib/videoPlayer';
import { loadSplitPage } from '../../lib/splitLayout';
import VideoPlayer from '../../components/videos/VideoPlayer';
import VideoComments from '../../components/videos/VideoComments';
import CollapsibleSection from '../../components/videos/CollapsibleSection';
import IconButton from '../../components/common/IconButton';
import { UNASSIGNED } from '@mathchois/shared';

function formatWatchedAt(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/* ─── 교사용 시청 현황 패널 (접기/펼치기) ─── */
const PROGRESS_PANEL_REFRESH_MS = 30000;

function VideoProgressPanel({ classroomVideoId }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const s = await getVideoProgressSummary(classroomVideoId);
      if (aliveRef.current) { setSummary(s); setError(''); }
    } catch (err) {
      if (aliveRef.current) setError(err.message ?? '시청 현황을 불러올 수 없습니다.');
    } finally {
      if (aliveRef.current) setRefreshing(false);
    }
  }, [classroomVideoId]);

  useEffect(() => {
    aliveRef.current = true;
    load();
    return () => { aliveRef.current = false; };
  }, [load]);

  // 학생 시청은 실시간 소켓 이벤트가 없으므로 주기적으로 + 탭에 돌아왔을 때 다시 읽는다
  useIntervalRefresh(load, PROGRESS_PANEL_REFRESH_MS, typeof document !== 'undefined' && document.visibilityState === 'visible');
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const headline = summary
    ? `시청 ${summary.watchedCount}/${summary.totalStudents} · 완료 ${summary.completedCount}`
    : (error || '불러오는 중...');

  return (
    <CollapsibleSection className="mt-2" label={`시청 현황 · ${headline}`}>
      <section className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        <Users className="h-4 w-4 text-gray-500" />
        <span className="font-semibold text-gray-800">시청 현황</span>
        <span className={`text-xs ${error ? 'text-red-600' : 'text-gray-500'}`}>{headline}</span>
        <span className="flex-1" />
        <button type="button" onClick={load} disabled={refreshing} title="시청 현황 새로고침 (30초마다 자동 갱신)"
          className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-50 cursor-pointer">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {summary && (
        summary.students.length === 0 ? (
          <p className="px-3 pb-3 text-xs text-gray-400">학급에 학생이 없습니다.</p>
        ) : (
          <ul className="px-3 pb-3 divide-y divide-gray-100">
            {summary.students.map((st) => {
              const pct = st.progressPct ?? 0;
              const watched = st.updatedAt != null;
              return (
                <li key={st.studentId} className="py-2 flex items-center gap-3 text-sm">
                  <span className="w-24 sm:w-32 shrink-0 truncate text-gray-800">{st.name ?? '이름 없음'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="h-2 rounded bg-gray-100 overflow-hidden" role="progressbar"
                      aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
                      title={summary.durationSec ? `${pct}%` : `최대 ${formatTime(st.maxPositionSec)} 시청`}>
                      <div className={`h-full rounded ${st.completed ? 'bg-green-500' : 'bg-blue-500'}`}
                        style={{ width: `${summary.durationSec ? pct : (watched ? 100 : 0)}%` }} />
                    </div>
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-gray-600">
                    {summary.durationSec ? `${pct}%` : (watched ? formatTime(st.maxPositionSec) : '-')}
                  </span>
                  <span className="w-12 shrink-0 text-center">
                    {st.completed && (
                      <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-green-700 bg-green-50 rounded px-1.5 py-0.5">
                        <CheckCircle2 className="h-3 w-3" />완료
                      </span>
                    )}
                  </span>
                  <span className="hidden sm:inline w-28 shrink-0 text-right text-xs text-gray-400">
                    {watched ? formatWatchedAt(st.updatedAt) : '시청 전'}
                  </span>
                </li>
              );
            })}
          </ul>
        )
      )}
      </section>
    </CollapsibleSection>
  );
}

/**
 * 학급 영상 시청 화면 (YouTube 식: 플레이어 + 정보 + 댓글, 넓은 화면에선 우측에 같은 학급의 다른 영상).
 * 경로: /teacher/classrooms/:classroomId/videos/:cvId, /student/classrooms/:classroomId/videos/:cvId
 */
export default function ClassroomVideoWatch() {
  const { classroomId, cvId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isTeacher = profile?.role === 'teacher';
  const base = isTeacher ? '/teacher' : '/student';

  const playerRef = useRef(null);
  const [detail, setDetail] = useState(null);
  const [progress, setProgress] = useState(null); // 학생 본인 서버 시청 기록
  const [saveStatus, setSaveStatus] = useState(null); // 학생: 마지막 시청 기록 저장 결과(진단 표시)
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (isAlive) => {
    setLoading(true);
    setError('');
    try {
      const [d, p] = await Promise.all([
        getClassroomVideo(cvId),
        // 학생만 — 실패해도 영상 시청은 가능해야 하므로 null 로 대체
        isTeacher ? Promise.resolve(null) : getVideoProgress(cvId).catch(() => null),
      ]);
      if (isAlive()) { setDetail(d); setProgress(p); }
    } catch (err) {
      if (isAlive()) setError(err.message ?? '영상을 불러올 수 없습니다.');
    } finally {
      if (isAlive()) setLoading(false);
    }
  }, [cvId, isTeacher]);

  useEffect(() => {
    let alive = true;
    load(() => alive);
    return () => { alive = false; };
  }, [load]);

  // 학생: 플레이어가 보고하는 위치를 서버에 저장 (플레이어 쪽에서 10초 간격으로 제한됨)
  const handleProgress = useCallback((positionSec, durationSec, opts) => {
    if (isTeacher) return;
    reportVideoProgress(cvId, { positionSec, durationSec, keepalive: !!opts?.keepalive })
      .then((st) => setSaveStatus(st));
  }, [cvId, isTeacher]);

  const getCurrentTime = useCallback(() => playerRef.current?.getCurrentTime() ?? 0, []);
  const seekTo = useCallback((sec) => {
    playerRef.current?.seekTo(sec);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-gray-500">로딩 중...</p></div>;
  }
  if (error || !detail) {
    return (
      <div className="max-w-3xl mx-auto">
        <p className="text-red-600 mb-3">{error || '영상을 찾을 수 없습니다.'}</p>
        <Link to={`${base}/classrooms/${classroomId}?tab=videos`} className="text-blue-600 hover:underline text-sm">← 학급으로 돌아가기</Link>
      </div>
    );
  }

  const v = detail.video;
  const meta = [v.subject, v.majorUnit, v.minorUnit].filter(Boolean).join(' · ');
  const splitPage = isTeacher ? null : loadSplitPage(detail.id); // 2분할에서 마지막으로 본 챕터 페이지(기기 저장)

  return (
    <div className="max-w-7xl mx-auto">
      {/* 학급의 영상 탭, 이 영상이 든 단원(또는 미분류) 화면으로 돌아간다 */}
      <button onClick={() => navigate(`${base}/classrooms/${classroomId}?tab=videos&unit=${detail.unitId ?? UNASSIGNED}`)}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3 cursor-pointer">
        <ArrowLeft className="h-4 w-4" /> {detail.classroom?.name ?? '학급'}
      </button>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
        {/* ── 플레이어 + 정보 + 댓글 ── */}
        <div className="min-w-0">
          <VideoPlayer
            ref={playerRef}
            src={v.videoUrl}
            poster={v.thumbnailUrl}
            title={v.title}
            storageKey={`cv:${detail.id}`}
            initialPosition={isTeacher ? 0 : (progress?.positionSec ?? 0)}
            onProgress={isTeacher ? undefined : handleProgress}
          />

          <div className="flex items-start justify-between gap-3 mt-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900">{v.title}</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {[meta, formatDuration(v.durationSec)].filter(Boolean).join(' · ')}
              </p>
            </div>
            {/* 필기 챕터가 연결된 영상: 학생은 2분할 진입, 교사는 연결 칩 */}
            {!isTeacher && <ProgressSaveStatus status={saveStatus} className="shrink-0 mt-1" />}
            {detail.chapter && (isTeacher ? (
              <Link to={`/teacher/chapters/${detail.chapter.id}/edit`}
                className="shrink-0 inline-flex items-center gap-1 max-w-[50%] text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1 hover:bg-amber-100"
                title="학생이 2분할 화면에서 옆에 놓고 필기하는 챕터">
                <BookOpen className="h-3.5 w-3.5 shrink-0" /><span className="truncate">필기 챕터 · {detail.chapter.title}</span>
              </Link>
            ) : (
              <IconButton
                as={Link}
                to={`${base}/classrooms/${classroomId}/videos/${detail.id}/split${splitPage ? `?page=${encodeURIComponent(splitPage)}` : ''}`}
                icon={Columns2} label={`2분할로 필기하며 보기 · ${detail.chapter.title}`} />
            ))}
          </div>

          {isTeacher && <VideoProgressPanel classroomVideoId={detail.id} />}

          {detail.note && (
            <div className="mt-3 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-sm text-blue-900 whitespace-pre-wrap">
              <span className="font-semibold mr-1">선생님 안내</span>{detail.note}
            </div>
          )}
          {v.description && (
            <CollapsibleSection label="설명" className="mt-2">
              <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg px-3 py-2">{v.description}</p>
            </CollapsibleSection>
          )}

          <VideoComments
            classroomVideoId={detail.id}
            isTeacher={isTeacher}
            getCurrentTime={getCurrentTime}
            onSeek={seekTo}
          />
        </div>

        {/* ── 같은 단원(단원이 없으면 같은 학급)의 다른 영상 ── */}
        <aside className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-700 mb-2 break-keep [overflow-wrap:anywhere]">
            {detail.unit ? `이 단원의 다른 영상 · ${detail.unit.title}` : '이 학급의 다른 영상'}
          </h2>
          {detail.siblings?.length ? (
            <ul className="flex flex-col gap-2">
              {detail.siblings.map((s) => (
                <li key={s.id}>
                  <Link to={`${base}/classrooms/${classroomId}/videos/${s.id}`}
                    className="flex gap-2 rounded-lg p-1.5 hover:bg-gray-100 transition-colors">
                    <div className="relative w-32 aspect-video bg-gray-900 rounded overflow-hidden shrink-0 flex items-center justify-center">
                      {s.video.thumbnailUrl
                        ? <img src={s.video.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                        : <Clapperboard className="h-5 w-5 text-gray-500" />}
                      {s.video.durationSec != null && (
                        <span className="absolute bottom-1 right-1 text-[10px] px-1 rounded bg-black/75 text-white tabular-nums">
                          {formatDuration(s.video.durationSec)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 line-clamp-2">{s.video.title}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {[s.video.subject, s.video.minorUnit].filter(Boolean).join(' · ')}
                      </p>
                      <p className="text-xs text-gray-400 inline-flex items-center gap-1 mt-0.5">
                        <MessageSquare className="h-3 w-3" />{s.commentCount ?? 0}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-400">다른 영상이 없습니다.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

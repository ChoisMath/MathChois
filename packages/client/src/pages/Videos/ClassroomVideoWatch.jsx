import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clapperboard, MessageSquare, Users, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getClassroomVideo, formatDuration, getVideoProgress, saveVideoProgress, getVideoProgressSummary,
} from '../../lib/videos';
import { formatTime } from '../../lib/videoPlayer';
import VideoPlayer from '../../components/videos/VideoPlayer';
import VideoComments from '../../components/videos/VideoComments';
import CollapsibleSection from '../../components/videos/CollapsibleSection';

function formatWatchedAt(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/* ─── 교사용 시청 현황 패널 (접기/펼치기) ─── */
function VideoProgressPanel({ classroomVideoId }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    getVideoProgressSummary(classroomVideoId)
      .then((s) => { if (alive) setSummary(s); })
      .catch((err) => { if (alive) setError(err.message ?? '시청 현황을 불러올 수 없습니다.'); });
    return () => { alive = false; };
  }, [classroomVideoId]);

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
  const handleProgress = useCallback((positionSec, durationSec) => {
    if (isTeacher) return;
    saveVideoProgress(cvId, { positionSec, durationSec }).catch(() => { /* 다음 보고 때 재시도 */ });
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
        <Link to={`${base}/classrooms/${classroomId}`} className="text-blue-600 hover:underline text-sm">← 학급으로 돌아가기</Link>
      </div>
    );
  }

  const v = detail.video;
  const meta = [v.subject, v.majorUnit, v.minorUnit].filter(Boolean).join(' · ');

  return (
    <div className="max-w-7xl mx-auto">
      <button onClick={() => navigate(`${base}/classrooms/${classroomId}`)}
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

          <h1 className="text-lg font-bold text-gray-900 mt-3">{v.title}</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {[meta, formatDuration(v.durationSec)].filter(Boolean).join(' · ')}
          </p>

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

        {/* ── 같은 학급의 다른 영상 ── */}
        <aside className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">이 학급의 다른 영상</h2>
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

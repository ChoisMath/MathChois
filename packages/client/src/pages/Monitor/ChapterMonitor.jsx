import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, PenLine, Users, FileText, Download } from 'lucide-react';
import { api } from '../../lib/api';
import { joinRoom, leaveRoom, getSocket } from '../../lib/socket';
import { getCachedChapterAndPages } from '../../lib/dataCache';
import { usePdfDownloader } from '../../lib/pdfDownloader';
import { PdfDownloadButton } from '../../components/common/PdfDownloadButton';

function formatTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function ProgressBadge({ done, total }) {
  if (total === 0) return <span className="text-xs text-gray-400">페이지 없음</span>;
  const pct = done / total;
  let color = 'bg-gray-100 text-gray-500';
  if (pct === 1) color = 'bg-green-100 text-green-700';
  else if (pct > 0) color = 'bg-yellow-100 text-yellow-700';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
      {done} / {total} 페이지
    </span>
  );
}

const ChapterMonitor = () => {
  const { classroomId, chapterId } = useParams();
  const navigate = useNavigate();

  const [chapter, setChapter]         = useState(null);
  const [pages, setPages]             = useState([]);
  const [members, setMembers]         = useState([]);
  const [notesSummary, setNotesSummary] = useState({});
  const [loading, setLoading]         = useState(true);
  const [presence, setPresence]       = useState({}); // { [studentId]: { pageId, studentName, joinedAt } }

  const { downloadMultiplePages } = usePdfDownloader();
  const [downloadingStudentId, setDownloadingStudentId] = useState(null);

  const pagesRef = useRef([]);
  useEffect(() => { pagesRef.current = pages; }, [pages]);

  /* ── 초기 데이터 로드 ── */
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      try {
        /* 챕터+페이지는 공유 캐시 활용, 학생 진도 요약은 서버에서 일괄 조회 */
        const [{ chapter: chap, pages: pgs }, summaryData] = await Promise.all([
          getCachedChapterAndPages(chapterId),
          api.get(`/api/notes/student-summary/${chapterId}`),
        ]);

        setChapter(chap);
        setPages(pgs);
        setMembers((summaryData?.members || []).map((m) => ({
          studentId: m.studentId,
          profile: { id: m.studentId, name: m.name, avatarUrl: m.avatarUrl },
        })));

        if (pgs.length > 0) {
          const summary = {};
          for (const n of (summaryData?.notes || [])) {
            if (!summary[n.studentId]) {
              summary[n.studentId] = { pagesWithNotes: new Set(), updatedAt: null, lastPageId: null };
            }
            summary[n.studentId].pagesWithNotes.add(n.pageId);
            if (!summary[n.studentId].updatedAt || n.updatedAt > summary[n.studentId].updatedAt) {
              summary[n.studentId].updatedAt = n.updatedAt;
              summary[n.studentId].lastPageId = n.pageId;
            }
          }
          setNotesSummary(summary);
        }
      } catch (err) {
        console.error('ChapterMonitor fetchData error:', err);
      }

      setLoading(false);
    };

    fetchData();
  }, [classroomId, chapterId]);

  /* ── Socket.IO: notes + presence (단일 room 구독) ── */
  useEffect(() => {
    if (pages.length === 0) return;
    const sock = getSocket();
    if (!sock) return;

    joinRoom(`chapter:${chapterId}`);

    // 학생 필기 업데이트
    const onNoteUpdated = (data) => {
      const { studentId, pageId, updatedAt } = data;
      if (!studentId || !pageId) return;
      setNotesSummary((prev) => {
        const entry = prev[studentId]
          ? { ...prev[studentId], pagesWithNotes: new Set(prev[studentId].pagesWithNotes) }
          : { pagesWithNotes: new Set(), updatedAt: null, lastPageId: null };
        entry.pagesWithNotes.add(pageId);
        if (!entry.updatedAt || updatedAt > entry.updatedAt) {
          entry.updatedAt = updatedAt;
          entry.lastPageId = pageId;
        }
        return { ...prev, [studentId]: entry };
      });
    };

    // Presence 초기 조회
    const fetchPresence = () => {
      sock.emit('presence:get', { chapterId }, (list) => {
        if (!Array.isArray(list)) return;
        const map = {};
        for (const entry of list) {
          map[entry.studentId] = { pageId: entry.pageId, studentName: entry.studentName, joinedAt: entry.joinedAt };
        }
        setPresence(map);
      });
    };
    if (sock.connected) fetchPresence();

    // Presence 실시간
    const onUpdated = (data) => {
      setPresence((prev) => ({
        ...prev,
        [data.studentId]: { pageId: data.pageId, studentName: data.studentName, joinedAt: data.joinedAt },
      }));
    };
    const onLeft = (data) => {
      setPresence((prev) => { const next = { ...prev }; delete next[data.studentId]; return next; });
    };

    sock.on('student-note:updated', onNoteUpdated);
    sock.on('presence:updated', onUpdated);
    sock.on('presence:left', onLeft);
    sock.on('connect', fetchPresence);

    return () => {
      sock.off('student-note:updated', onNoteUpdated);
      sock.off('presence:updated', onUpdated);
      sock.off('presence:left', onLeft);
      sock.off('connect', fetchPresence);
      leaveRoom(`chapter:${chapterId}`);
    };
  }, [chapterId, pages]);

  /* ── 교사 필기 버튼 → 마지막 방문 페이지 (없으면 첫 페이지) ── */
  const handleTeacherNote = () => {
    if (pages.length === 0) return;
    const savedPageId   = localStorage.getItem(`mc_teacherLastPage_${chapterId}`);
    const savedPageValid = savedPageId && pages.some((p) => p.id === savedPageId);
    navigate(
      `/teacher/classrooms/${classroomId}/chapters/${chapterId}/study/page/${savedPageValid ? savedPageId : pages[0].id}`
    );
  };

  /* ── 학생 PDF 다운로드 ── */
  const handleDownloadStudentPdf = async (e, student) => {
    e.stopPropagation();
    if (pages.length === 0) return;
    setDownloadingStudentId(student.studentId);

    try {
      const pageIds = pages.map(p => p.id).join(',');
      const notes = await api.get(`/api/notes/student-notes-for/${student.studentId}?pageIds=${pageIds}`);

      const notesMap = {};
      (notes || []).forEach(n => { notesMap[n.pageId] = n.excalidrawData; });

      const pageDataList = pages.map((p) => ({
        elements: notesMap[p.id]?.elements || [],
        files: notesMap[p.id]?.files || {},
        bgUrl: p.imageUrl
      }));

      await downloadMultiplePages(`${student.profile?.name || '학생'}_${chapter?.title || '챕터'}_필기`, pageDataList);
    } catch (err) {
      console.error(err);
      alert('PDF 다운로드 중 오류가 발생했습니다.');
    } finally {
      setDownloadingStudentId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/teacher/classrooms/${classroomId}`)} title="뒤로 가기"
            className="p-1.5 text-gray-400 hover:text-gray-600 cursor-pointer flex items-center justify-center"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{chapter?.title} — 학생 현황</h1>
          {Object.keys(presence).length > 0 && (
            <span className="text-sm text-green-600 font-medium">
              {Object.keys(presence).length}명 접속 중
            </span>
          )}
        </div>
        <button
          onClick={handleTeacherNote}
          disabled={pages.length === 0} title="교사 필기"
          className="inline-flex items-center justify-center p-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
        >
          <PenLine className="h-5 w-5" />
        </button>
      </div>

      {/* 페이지 없음 */}
      {pages.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-gray-500">이 챕터에 페이지가 없습니다.</p>
          <p className="mt-1 text-sm text-gray-400">챕터 편집에서 페이지를 추가하세요.</p>
        </div>
      )}

      {/* 학생 없음 */}
      {pages.length > 0 && members.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-gray-500">이 클래스룸에 학생이 없습니다.</p>
        </div>
      )}

      {/* 학생 카드 그리드 */}
      {pages.length > 0 && members.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {members.map((m) => {
            const profile = m.profile;
            const summary = notesSummary[m.studentId] || { pagesWithNotes: new Set(), updatedAt: null };
            const done = summary.pagesWithNotes.size;
            const total = pages.length;
            const pct = total > 0 ? done / total : 0;
            const isOnline = !!presence[m.studentId];
            const currentPageId = presence[m.studentId]?.pageId;
            const currentPageIndex = currentPageId
              ? pages.findIndex((p) => p.id === currentPageId)
              : -1;

            return (
              <div
                key={m.studentId}
                onClick={() => {
                  const initialPageId = isOnline
                    ? currentPageId
                    : notesSummary[m.studentId]?.lastPageId;
                  navigate(
                    `/teacher/classrooms/${classroomId}/chapters/${chapterId}/monitor/${m.studentId}`,
                    initialPageId ? { state: { initialPageId } } : undefined
                  );
                }}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all flex flex-col h-full"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="relative">
                      {profile?.avatarUrl ? (
                        <img src={profile.avatarUrl} alt={profile.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-bold shrink-0">
                          {(profile?.name || '?')[0]}
                        </div>
                      )}
                      {isOnline && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">
                        {profile?.name || '이름 없음'}
                      </p>
                      {isOnline && currentPageIndex >= 0 && (
                        <p className="text-xs text-green-600 truncate">
                          {currentPageIndex + 1}페이지 학습 중
                        </p>
                      )}
                    </div>
                  </div>
                  <PdfDownloadButton
                    onClick={(e) => handleDownloadStudentPdf(e, m)}
                    isDownloading={downloadingStudentId === m.studentId}
                    className="p-1 shrink-0 text-gray-400 hover:text-blue-600 bg-transparent hover:bg-blue-50"
                  />
                </div>

                {/* 진도 바 */}
                <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2 mt-auto">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      pct === 1 ? 'bg-green-500' : pct > 0 ? 'bg-yellow-400' : 'bg-gray-300'
                    }`}
                    style={{ width: `${pct * 100}%` }}
                  />
                </div>

                <div className="flex items-center justify-between mt-2 pt-1">
                  <ProgressBadge done={done} total={total} />
                  {summary.updatedAt && (
                    <span className="text-xs text-gray-400">{formatTime(summary.updatedAt)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ChapterMonitor;

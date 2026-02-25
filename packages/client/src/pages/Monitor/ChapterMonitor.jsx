import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, PenLine, Users, FileText, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
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

  const { downloadMultiplePages } = usePdfDownloader();
  const [downloadingStudentId, setDownloadingStudentId] = useState(null);

  const pagesRef = useRef([]);
  useEffect(() => { pagesRef.current = pages; }, [pages]);

  /* ── 초기 데이터 로드 ── */
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      /* 챕터+페이지는 공유 캐시 활용, 학생 목록은 항상 최신 데이터 */
      const [{ chapter: chap, pages: pgs }, membersRes] = await Promise.all([
        getCachedChapterAndPages(chapterId, supabase),
        supabase
          .from('classroom_members')
          .select('student_id, profiles(id, name, avatar_url)')
          .eq('classroom_id', classroomId),
      ]);

      const mems = membersRes.data || [];

      setChapter(chap);
      setPages(pgs);
      setMembers(mems);

      if (pgs.length > 0) {
        const pageIds = pgs.map((p) => p.id);
        const { data: notes } = await supabase
          .from('student_notes')
          .select('student_id, page_id, updated_at')
          .in('page_id', pageIds);

        const summary = {};
        for (const n of (notes || [])) {
          if (!summary[n.student_id]) {
            summary[n.student_id] = { pagesWithNotes: new Set(), updatedAt: null };
          }
          summary[n.student_id].pagesWithNotes.add(n.page_id);
          if (!summary[n.student_id].updatedAt || n.updated_at > summary[n.student_id].updatedAt) {
            summary[n.student_id].updatedAt = n.updated_at;
          }
        }
        setNotesSummary(summary);
      }

      setLoading(false);
    };

    fetchData();
  }, [classroomId, chapterId]);

  /* ── Realtime 구독 ── */
  useEffect(() => {
    if (pages.length === 0) return;

    const pageIds = pages.map((p) => p.id);
    const channel = supabase
      .channel(`monitor_${chapterId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'student_notes',
          filter: `page_id=in.(${pageIds.join(',')})`,
        },
        (payload) => {
          const { student_id, page_id, updated_at } = payload.new || {};
          if (!student_id || !page_id) return;
          setNotesSummary((prev) => {
            const entry = prev[student_id]
              ? { ...prev[student_id], pagesWithNotes: new Set(prev[student_id].pagesWithNotes) }
              : { pagesWithNotes: new Set(), updatedAt: null };
            entry.pagesWithNotes.add(page_id);
            if (!entry.updatedAt || updated_at > entry.updatedAt) {
              entry.updatedAt = updated_at;
            }
            return { ...prev, [student_id]: entry };
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
    setDownloadingStudentId(student.student_id);

    try {
      const { data: notes } = await supabase
        .from('student_notes')
        .select('page_id, excalidraw_data')
        .eq('student_id', student.student_id)
        .in('page_id', pages.map(p => p.id));

      const notesMap = {};
      (notes || []).forEach(n => { notesMap[n.page_id] = n.excalidraw_data; });

      const pageDataList = pages.map((p) => ({
        elements: notesMap[p.id]?.elements || [],
        files: notesMap[p.id]?.files || {},
        bgUrl: p.image_url
      }));

      await downloadMultiplePages(`${student.profiles?.name || '학생'}_${chapter?.title || '챕터'}_필기`, pageDataList);
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
            const profile = m.profiles;
            const summary = notesSummary[m.student_id] || { pagesWithNotes: new Set(), updatedAt: null };
            const done = summary.pagesWithNotes.size;
            const total = pages.length;
            const pct = total > 0 ? done / total : 0;

            return (
              <div
                key={m.student_id}
                onClick={() => navigate(
                  `/teacher/classrooms/${classroomId}/chapters/${chapterId}/monitor/${m.student_id}`
                )}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all flex flex-col h-full"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt={profile.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-bold shrink-0">
                        {(profile?.name || '?')[0]}
                      </div>
                    )}
                    <p className="font-medium text-gray-900 text-sm truncate">
                      {profile?.name || '이름 없음'}
                    </p>
                  </div>
                  <PdfDownloadButton
                    onClick={(e) => handleDownloadStudentPdf(e, m)}
                    isDownloading={downloadingStudentId === m.student_id}
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

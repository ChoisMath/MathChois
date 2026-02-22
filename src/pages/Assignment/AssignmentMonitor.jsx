import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Clock, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { usePdfDownloader } from '../../lib/pdfDownloader';
import { PdfDownloadButton } from '../../components/common/PdfDownloadButton';

function formatTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function formatDeadline(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* 제출 상태 → 스타일 */
function statusStyle(status) {
  switch (status) {
    case 'submitted':      return { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-300',  label: '제출완료' };
    case 'late_submitted': return { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300', label: '지연제출' };
    case 'rejected':       return { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', label: '반려' };
    case 'graded':         return { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-300',   label: '채점완료' };
    default:               return { bg: 'bg-white',      text: 'text-gray-500',   border: 'border-gray-200',   label: '미제출' };
  }
}

const AssignmentMonitor = () => {
  const { classroomId, assignmentId } = useParams();
  const navigate = useNavigate();

  const [assignment, setAssignment]     = useState(null);
  const [members, setMembers]           = useState([]);
  const [submissions, setSubmissions]   = useState({}); // studentId → submission
  const [loading, setLoading]           = useState(true);
  
  const { downloadMultiplePages } = usePdfDownloader();
  const [downloadingStudentId, setDownloadingStudentId] = useState(null);
  const [pages, setPages] = useState([]);

  const subsRef = useRef({});
  useEffect(() => { subsRef.current = submissions; }, [submissions]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [asnRes, pgsRes, membersRes, subsRes] = await Promise.all([
        supabase.from('assignments').select('id, title, deadline, max_score').eq('id', assignmentId).single(),
        supabase.from('assignment_pages').select('id, image_url, position').eq('assignment_id', assignmentId).order('position'),
        supabase.from('classroom_members')
          .select('student_id, profiles(id, name, avatar_url)')
          .eq('classroom_id', classroomId),
        supabase.from('assignment_submissions')
          .select('student_id, status, score, max_score, submitted_at, is_late')
          .eq('assignment_id', assignmentId),
      ]);

      setAssignment(asnRes.data);
      setPages(pgsRes.data || []);
      setMembers(membersRes.data || []);

      const map = {};
      for (const s of (subsRes.data || [])) map[s.student_id] = s;
      setSubmissions(map);

      setLoading(false);
    };
    fetchData();
  }, [classroomId, assignmentId]);

  /* Realtime: assignment_submissions 변경 감지 */
  useEffect(() => {
    const channel = supabase
      .channel(`asn_monitor_${assignmentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'assignment_submissions',
          filter: `assignment_id=eq.${assignmentId}`,
        },
        (payload) => {
          const row = payload.new;
          if (!row) return;
          setSubmissions((prev) => ({ ...prev, [row.student_id]: row }));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [assignmentId]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-gray-500">로딩 중...</p>
    </div>
  );

  /* ── 학생 PDF 다운로드 ── */
  const handleDownloadStudentPdf = async (e, student) => {
    e.stopPropagation();
    if (pages.length === 0) return;
    setDownloadingStudentId(student.student_id);

    try {
      const { data: notes } = await supabase
        .from('assignment_notes')
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

      await downloadMultiplePages(`${student.profiles?.name || '학생'}_${assignment?.title || '과제'}_필기`, pageDataList);
    } catch (err) {
      console.error(err);
      alert('PDF 다운로드 중 오류가 발생했습니다.');
    } finally {
      setDownloadingStudentId(null);
    }
  };

  const submitted   = Object.values(submissions).filter((s) => ['submitted', 'late_submitted', 'rejected', 'graded'].includes(s.status)).length;
  const graded      = Object.values(submissions).filter((s) => s.status === 'graded').length;

  return (
    <div className="max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/teacher/classrooms/${classroomId}`)}
            className="p-1.5 text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{assignment?.title} — 제출 현황</h1>
            {assignment?.deadline && (
              <p className="text-sm text-gray-400 flex items-center gap-1 mt-0.5">
                <Clock className="h-3.5 w-3.5" />
                마감: {formatDeadline(assignment.deadline)}
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">제출 {submitted} / {members.length}명</p>
          <p className="text-xs text-gray-400">채점 완료 {graded}명</p>
        </div>
      </div>

      {members.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-gray-500">이 클래스룸에 학생이 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {members.map((m) => {
            const profile = m.profiles;
            const sub = submissions[m.student_id] || null;
            const { bg, text, border, label } = statusStyle(sub?.status);

            return (
              <div
                key={m.student_id}
                onClick={() => navigate(
                  `/teacher/classrooms/${classroomId}/assignments/${assignmentId}/monitor/${m.student_id}`
                )}
                className={`flex flex-col h-full rounded-xl shadow-sm border p-4 cursor-pointer hover:shadow-md transition-all ${bg} ${border}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt={profile.name}
                        className="w-9 h-9 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
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

                <div className="flex items-center justify-between mt-auto pt-2 border-t border-transparent text-gray-400 hover:border-gray-100">
                  <span className={`text-xs font-medium ${text}`}>{label}</span>
                  <div className="text-right">
                    {sub?.status === 'graded' && sub.score != null && (
                      <span className="text-xs font-semibold text-blue-700 block mb-0.5">
                        {sub.score}/{sub.max_score ?? assignment?.max_score}점
                      </span>
                    )}
                    {sub?.submitted_at && (
                      <p className="text-xs text-gray-400">{formatTime(sub.submitted_at)}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AssignmentMonitor;

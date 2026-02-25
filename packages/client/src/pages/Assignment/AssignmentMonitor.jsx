import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Clock, Download } from 'lucide-react';
import { api } from '../../lib/api';
import { connectSocket, subscribeToRoom } from '../../lib/socket';
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
      try {
        const [asnData, pgsData, membersData, subsData] = await Promise.all([
          api.get(`/api/assignments/${assignmentId}`),
          api.get(`/api/assignments/${assignmentId}/pages`),
          api.get(`/api/classrooms/${classroomId}/members`),
          api.get(`/api/assignments/${assignmentId}/submissions`),
        ]);

        setAssignment(asnData);
        setPages(pgsData || []);
        setMembers(membersData || []);

        const map = {};
        for (const s of (subsData || [])) map[s.studentId] = s;
        setSubmissions(map);
      } catch (err) {
        console.error('데이터 로드 실패:', err);
      }
      setLoading(false);
    };
    fetchData();
  }, [classroomId, assignmentId]);

  /* Socket.IO: assignment_submissions 변경 감지 */
  useEffect(() => {
    try { connectSocket(); } catch { /* 토큰 없음 */ }
    return subscribeToRoom(`assignment:${assignmentId}`, 'submission:updated', (data) => {
      if (!data?.studentId) return;
      setSubmissions((prev) => ({
        ...prev,
        [data.studentId]: { ...prev[data.studentId], ...data },
      }));
    });
  }, [assignmentId]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-gray-500">로딩 중...</p>
    </div>
  );

  /* ── 학생 PDF 다운로드 ── */
  const handleDownloadStudentPdf = async (e, member) => {
    e.stopPropagation();
    if (pages.length === 0) return;
    setDownloadingStudentId(member.studentId);

    try {
      const notes = await api.get(
        `/api/assignment-notes/${assignmentId}/bulk?pageIds=${pages.map(p => p.id).join(',')}&studentId=${member.studentId}`
      );

      const notesMap = {};
      (notes || []).forEach(n => { notesMap[n.pageId] = n.excalidrawData; });

      const pageDataList = pages.map((p) => ({
        elements: notesMap[p.id]?.elements || [],
        files: notesMap[p.id]?.files || {},
        bgUrl: p.imageUrl
      }));

      await downloadMultiplePages(`${member.student?.name || '학생'}_${assignment?.title || '과제'}_필기`, pageDataList);
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
            const profile = m.student;
            const sub = submissions[m.studentId] || null;
            const { bg, text, border, label } = statusStyle(sub?.status);

            return (
              <div
                key={m.studentId}
                onClick={() => navigate(
                  `/teacher/classrooms/${classroomId}/assignments/${assignmentId}/monitor/${m.studentId}`
                )}
                className={`flex flex-col h-full rounded-xl shadow-sm border p-4 cursor-pointer hover:shadow-md transition-all ${bg} ${border}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {profile?.avatarUrl ? (
                      <img src={profile.avatarUrl} alt={profile.name}
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
                    isDownloading={downloadingStudentId === m.studentId}
                    className="p-1 shrink-0 text-gray-400 hover:text-blue-600 bg-transparent hover:bg-blue-50"
                  />
                </div>

                <div className="flex items-center justify-between mt-auto pt-2 border-t border-transparent text-gray-400 hover:border-gray-100">
                  <span className={`text-xs font-medium ${text}`}>{label}</span>
                  <div className="text-right">
                    {sub?.status === 'graded' && sub.score != null && (
                      <span className="text-xs font-semibold text-blue-700 block mb-0.5">
                        {sub.score}/{sub.maxScore ?? assignment?.maxScore}점
                      </span>
                    )}
                    {sub?.submittedAt && (
                      <p className="text-xs text-gray-400">{formatTime(sub.submittedAt)}</p>
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

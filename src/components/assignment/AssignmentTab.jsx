import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ClipboardList, Clock, Trophy, Users, Loader, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { usePdfDownloader } from '../../lib/pdfDownloader';
import { PdfDownloadButton } from '../common/PdfDownloadButton';

function formatDeadline(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/* 제출 상태 → 색상/레이블 */
function statusStyle(status) {
  switch (status) {
    case 'submitted':      return { bg: 'bg-green-100',  text: 'text-green-700',  label: '제출완료' };
    case 'late_submitted': return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '지연제출' };
    case 'rejected':       return { bg: 'bg-orange-100', text: 'text-orange-700', label: '반려' };
    case 'graded':         return { bg: 'bg-blue-100',   text: 'text-blue-700',   label: '채점완료' };
    default:               return { bg: 'bg-gray-100',   text: 'text-gray-500',   label: '미제출' };
  }
}

const AssignmentTab = ({ classroomId, isTeacher, hideCreateButton, onUnsubmittedCount }) => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState({}); // assignmentId → submission (student)
  const [submissionCounts, setSubmissionCounts] = useState({}); // assignmentId → count (teacher)
  const [totalStudents, setTotalStudents] = useState(0); // teacher: total students in classroom
  const [loading, setLoading]         = useState(true);
  const [creating, setCreating]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);

  /* PDF 다운로드 */
  const { downloadMultiplePages } = usePdfDownloader();
  const [downloadingAsnId, setDownloadingAsnId] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    const { data: asns } = await supabase
      .from('assignments')
      .select('id, title, description, deadline, max_score, position')
      .eq('classroom_id', classroomId)
      .order('position');
    setAssignments(asns || []);

    if (isTeacher && asns?.length > 0) {
      /* 교사: 총 학생 수 */
      const { count } = await supabase
        .from('classroom_members')
        .select('id', { count: 'exact', head: true })
        .eq('classroom_id', classroomId);
      setTotalStudents(count || 0);

      /* 교사: 과제별 제출 수 */
      const { data: allSubs } = await supabase
        .from('assignment_submissions')
        .select('assignment_id')
        .in('assignment_id', asns.map((a) => a.id));
      const countMap = {};
      for (const s of (allSubs || [])) {
        countMap[s.assignment_id] = (countMap[s.assignment_id] || 0) + 1;
      }
      setSubmissionCounts(countMap);
    }

    /* 학생: 본인 제출 현황 */
    if (!isTeacher && user && asns?.length > 0) {
      const { data: subs } = await supabase
        .from('assignment_submissions')
        .select('assignment_id, status, score, max_score, rejection_comment')
        .eq('student_id', user.id)
        .in('assignment_id', asns.map((a) => a.id));
      const map = {};
      for (const s of (subs || [])) map[s.assignment_id] = s;
      setSubmissions(map);

      /* 미제출 개수 계산 → 부모에게 알림 */
      if (onUnsubmittedCount) {
        const unsubmitted = (asns || []).filter((a) => !map[a.id] || map[a.id].status === 'rejected').length;
        onUnsubmittedCount(unsubmitted);
      }
    }

    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [classroomId]);

  const handleCreate = async () => {
    setCreating(true);
    const maxPos = assignments.length > 0 ? Math.max(...assignments.map((a) => a.position)) + 1 : 0;
    const { data: newAsn } = await supabase
      .from('assignments')
      .insert({
        classroom_id: classroomId,
        teacher_id:   user.id,
        title:        '새 과제',
        position:     maxPos,
      })
      .select().single();
    setCreating(false);
    if (newAsn) {
      navigate(`/teacher/classrooms/${classroomId}/assignments/${newAsn.id}/edit`);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    /* Storage 파일 정리 */
    const { data: pgs } = await supabase
      .from('assignment_pages').select('image_url').eq('assignment_id', deleteTarget.id);
    const paths = (pgs || [])
      .map((p) => {
        try {
          const url = new URL(p.image_url);
          const marker = '/object/public/chapter-pages/';
          const idx = url.pathname.indexOf(marker);
          return idx !== -1 ? url.pathname.slice(idx + marker.length) : null;
        } catch { return null; }
      })
      .filter(Boolean);
    if (paths.length > 0) await supabase.storage.from('chapter-pages').remove(paths);

    await supabase.from('assignments').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    fetchData();
  };

  /* 학생: 과제 카드 클릭 → 첫 페이지로 이동 */
  const handleStudentClick = async (asn) => {
    const { data: pgs } = await supabase
      .from('assignment_pages').select('id').eq('assignment_id', asn.id).order('position').limit(1);
    if (pgs?.length > 0) {
      navigate(`/student/assignments/${asn.id}/page/${pgs[0].id}`);
    }
  };

  /* ── 학생 과제 PDF 일괄 다운로드 ── */
  const handleDownloadStudentAssignmentPdf = async (e, asn) => {
    e.stopPropagation();
    if (!profile || !user) return;
    setDownloadingAsnId(asn.id);
    try {
      const title = `${profile.name || '학생'}_${asn.title}_전체`;
      const { data: pgs } = await supabase
        .from('assignment_pages')
        .select('id, image_url')
        .eq('assignment_id', asn.id)
        .order('position');
        
      if (!pgs || pgs.length === 0) return;
      
      const { data: notes } = await supabase
        .from('assignment_notes')
        .select('page_id, excalidraw_data')
        .eq('student_id', user.id)
        .in('page_id', pgs.map(p => p.id));
        
      const notesMap = Object.fromEntries((notes || []).map(n => [n.page_id, n.excalidraw_data]));
      
      const pageDataList = pgs.map(pg => {
        const note = notesMap[pg.id] || { elements: [], files: {}, bgPosition: null };
        return {
          bgUrl: pg.image_url,
          elements: note.elements || [],
          files: note.files || {},
          bgPosition: note.bgPosition,
        };
      });
      await downloadMultiplePages(title, pageDataList);
    } finally {
      setDownloadingAsnId(null);
    }
  };

  if (loading) return <p className="text-gray-400 text-sm">로딩 중...</p>;

  return (
    <div>
      {isTeacher && !hideCreateButton && (
        <div className="flex justify-end mb-4">
          <button
            onClick={handleCreate}
            disabled={creating}
            title="새 과제"
            className="inline-flex items-center justify-center p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
          >
            {creating ? <Loader className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
          </button>
        </div>
      )}

      {assignments.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl h-40 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
          <ClipboardList className="h-8 w-8" />
          <span>등록된 과제가 없습니다.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assignments.map((asn) => {
            const sub = submissions[asn.id] || null;
            const { bg, text, label } = statusStyle(sub?.status);
            const isLate = asn.deadline && new Date() > new Date(asn.deadline);
            const submitted = submissionCounts[asn.id] || 0;

            return (
              <div
                key={asn.id}
                onClick={isTeacher
                  ? () => navigate(`/teacher/classrooms/${classroomId}/assignments/${asn.id}/monitor`)
                  : () => handleStudentClick(asn)}
                className="group bg-white rounded-xl border border-gray-200 shadow-sm p-4 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all flex flex-col gap-2"
              >
                {/* 제목 행 */}
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-gray-900 leading-snug flex-1">{asn.title}</p>
                  {isTeacher && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/teacher/classrooms/${classroomId}/assignments/${asn.id}/edit`); }}
                        title="편집"
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50 cursor-pointer"
                      >
                        <ClipboardList className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(asn); }}
                        title="삭제"
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                {asn.description && (
                  <p className="text-xs text-gray-500 line-clamp-2">{asn.description}</p>
                )}

                <div className="flex items-center gap-2 mt-auto pt-1 flex-wrap">
                  {asn.deadline && (
                    <span className={`flex items-center gap-1 text-xs ${isLate ? 'text-red-500' : 'text-gray-400'}`}>
                      <Clock className="h-3 w-3" />
                      {formatDeadline(asn.deadline)}
                      {isLate && ' (마감)'}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Trophy className="h-3 w-3" />
                    {asn.max_score}점
                  </span>
                  {isTeacher && (
                    <span className="flex items-center gap-1 text-xs text-blue-600 ml-auto">
                      <Users className="h-3 w-3" />
                      {submitted}/{totalStudents}
                    </span>
                  )}
                  {!isTeacher && (
                    <div className="flex items-center gap-2 ml-auto">
                      <PdfDownloadButton
                        onClick={(e) => handleDownloadStudentAssignmentPdf(e, asn)}
                        isDownloading={downloadingAsnId === asn.id}
                        className="p-1 px-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md transition-colors"
                      />
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${bg} ${text}`}>
                        {label}
                        {sub?.status === 'graded' && sub.score != null && ` (${sub.score}/${sub.max_score ?? asn.max_score})`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-2">과제 삭제</h2>
            <p className="text-sm text-gray-600 mb-6 whitespace-normal break-keep">
              <span className="font-medium text-gray-900">"{deleteTarget.title}"</span>을(를) 삭제하면
              모든 페이지·학생 필기·제출 내역이 영구 삭제됩니다. 계속하시겠습니까?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} title="취소"
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md cursor-pointer disabled:opacity-50">
                <X className="w-5 h-5" />
              </button>
              <button onClick={handleDelete} disabled={deleting} title="삭제"
                className="p-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 cursor-pointer">
                {deleting ? <Loader className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssignmentTab;


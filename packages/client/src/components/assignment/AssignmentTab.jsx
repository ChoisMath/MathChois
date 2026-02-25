import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ClipboardList, Clock, Trophy, Users, Loader, X, Download, Edit2 } from 'lucide-react';
import { api } from '../../lib/api';
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

const AssignmentTab = ({ classroomId, isTeacher, onUnsubmittedCount }) => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState({}); // assignmentId → submission (student)
  const [submissionCounts, setSubmissionCounts] = useState({}); // assignmentId → count (teacher)
  const [totalStudents, setTotalStudents] = useState(0); // teacher: total students in classroom
  const [loading, setLoading]         = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);

  /* 생성/가져오기 모달 */
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTab, setCreateTab]   = useState('new'); // 'new' | 'import'
  const [newTitle, setNewTitle]     = useState('');
  const [newDesc, setNewDesc]       = useState('');
  const [creating, setCreating]     = useState(false);

  /* 가져오기 */
  const [importClassrooms, setImportClassrooms]       = useState([]);
  const [importSrcCid, setImportSrcCid]               = useState('');
  const [importAssignments, setImportAssignments]     = useState([]);
  const [importSelectedAsnId, setImportSelectedAsnId] = useState('');
  const [importing, setImporting]                     = useState(false);

  /* PDF 다운로드 */
  const { downloadMultiplePages } = usePdfDownloader();
  const [downloadingAsnId, setDownloadingAsnId] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const asns = await api.get(`/api/classrooms/${classroomId}/assignments`);
      setAssignments(asns || []);

      if (isTeacher && asns?.length > 0) {
        /* 교사: 총 학생 수 */
        const members = await api.get(`/api/classrooms/${classroomId}/members`);
        setTotalStudents(members?.length || 0);

        /* 교사: 과제별 제출 수 */
        const allSubs = await api.get(`/api/submissions/counts?assignmentIds=${asns.map((a) => a.id).join(',')}`);
        const countMap = {};
        for (const s of (allSubs || [])) {
          countMap[s.assignmentId] = (countMap[s.assignmentId] || 0) + 1;
        }
        setSubmissionCounts(countMap);
      }

      /* 학생: 본인 제출 현황 */
      if (!isTeacher && user && asns?.length > 0) {
        const subs = await api.get(`/api/submissions/student?assignmentIds=${asns.map((a) => a.id).join(',')}`);
        const map = {};
        for (const s of (subs || [])) map[s.assignmentId] = s;
        setSubmissions(map);

        /* 미제출 개수 계산 → 부모에게 알림 */
        if (onUnsubmittedCount) {
          const unsubmitted = (asns || []).filter((a) => !map[a.id] || map[a.id].status === 'rejected').length;
          onUnsubmittedCount(unsubmitted);
        }
      }
    } catch (err) {
      console.error('[AssignmentTab] fetchData error:', err);
    }

    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [classroomId]);

  /* 가져오기 탭 전환 시 다른 클래스 목록 로드 */
  useEffect(() => {
    if (createTab !== 'import' || !user) return;
    api.get(`/api/classrooms/other/${classroomId}`)
      .then((data) => {
        setImportClassrooms(data || []);
        setImportSrcCid('');
        setImportAssignments([]);
        setImportSelectedAsnId('');
      })
      .catch((err) => console.error('[AssignmentTab] import classrooms error:', err));
  }, [createTab, user, classroomId]);

  /* 모달 닫기 (상태 초기화) */
  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateTab('new');
    setNewTitle(''); setNewDesc('');
    setImportSrcCid(''); setImportAssignments([]); setImportSelectedAsnId('');
  };

  /* 직접 만들기 */
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const maxPos = assignments.length > 0 ? Math.max(...assignments.map((a) => a.position)) + 1 : 0;
      const newAsn = await api.post(`/api/classrooms/${classroomId}/assignments`, {
        title:       newTitle.trim(),
        description: newDesc.trim() || undefined,
        position:    maxPos,
      });
      if (newAsn) {
        closeCreateModal();
        navigate(`/teacher/classrooms/${classroomId}/assignments/${newAsn.id}/edit`);
      }
    } catch (err) {
      console.error('[AssignmentTab] create error:', err);
    }
    setCreating(false);
  };

  /* 가져오기: 클래스 선택 → 과제 목록 로드 */
  const handleImportClassroomChange = async (cid) => {
    setImportSrcCid(cid);
    setImportSelectedAsnId('');
    if (!cid) { setImportAssignments([]); return; }
    try {
      const data = await api.get(`/api/classrooms/${cid}/assignments`);
      setImportAssignments(data || []);
    } catch (err) {
      console.error('[AssignmentTab] import assignments error:', err);
      setImportAssignments([]);
    }
  };

  /* 가져오기 실행 */
  const handleImportAssignment = async () => {
    if (!importSelectedAsnId) return;
    setImporting(true);
    try {
      await api.post(`/api/assignments/${importSelectedAsnId}/import`, { targetClassroomId: classroomId });
      closeCreateModal();
      fetchData();
    } catch (err) {
      console.error('[AssignmentTab] import error:', err);
    }
    setImporting(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    try {
      await api.delete(`/api/assignments/${deleteTarget.id}`);
    } catch (err) {
      console.error('[AssignmentTab] delete error:', err);
    }

    setDeleting(false);
    setDeleteTarget(null);
    fetchData();
  };

  /* 학생: 과제 카드 클릭 → 첫 페이지로 이동 */
  const handleStudentClick = async (asn) => {
    try {
      const pgs = await api.get(`/api/assignments/${asn.id}/pages`);
      if (pgs?.length > 0) {
        navigate(`/student/assignments/${asn.id}/page/${pgs[0].id}`);
      }
    } catch (err) {
      console.error('[AssignmentTab] student click error:', err);
    }
  };

  /* ── 학생 과제 PDF 일괄 다운로드 ── */
  const handleDownloadStudentAssignmentPdf = async (e, asn) => {
    e.stopPropagation();
    if (!profile || !user) return;
    setDownloadingAsnId(asn.id);
    try {
      const title = `${profile.name || '학생'}_${asn.title}_전체`;
      const pgs = await api.get(`/api/assignments/${asn.id}/pages`);

      if (!pgs || pgs.length === 0) return;

      const notes = await api.get(
        `/api/assignment-notes/${asn.id}/bulk?pageIds=${pgs.map(p => p.id).join(',')}`
      );

      const notesMap = Object.fromEntries((notes || []).map(n => [n.pageId, n.excalidrawData]));

      const pageDataList = pgs.map(pg => {
        const note = notesMap[pg.id] || { elements: [], files: {}, bgPosition: null };
        return {
          bgUrl: pg.imageUrl,
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
      {isTeacher && (
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowCreateModal(true)}
            title="새 과제"
            className="inline-flex items-center justify-center p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      )}

      {assignments.length === 0 ? (
        <div
          onClick={isTeacher ? () => setShowCreateModal(true) : undefined}
          className={`border-2 border-dashed border-gray-200 rounded-xl h-40 flex flex-col items-center justify-center text-gray-400 text-sm gap-2 ${
            isTeacher ? 'cursor-pointer hover:border-blue-300 hover:text-blue-400 transition-colors' : ''
          }`}
        >
          {isTeacher
            ? <><Plus className="h-8 w-8" /><span>새 과제 추가</span></>
            : <><ClipboardList className="h-8 w-8" /><span>등록된 과제가 없습니다.</span></>}
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
                        <Edit2 className="h-4 w-4" />
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
                    {asn.maxScore}점
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
                        {sub?.status === 'graded' && sub.score != null && ` (${sub.score}/${sub.maxScore ?? asn.maxScore})`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 생성/가져오기 모달 */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-gray-900 mb-4">새 과제</h2>

            {/* 탭 */}
            <div className="flex border-b mb-4">
              {[['new', '직접 만들기'], ['import', '가져오기']].map(([tab, label]) => (
                <button key={tab} type="button" onClick={() => setCreateTab(tab)}
                  className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors cursor-pointer ${
                    createTab === tab
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            {/* 직접 만들기 */}
            {createTab === 'new' && (
              <form onSubmit={handleCreate} className="flex flex-col">
                <input autoFocus type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="과제 제목"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md mb-3 focus:ring-blue-500 focus:border-blue-500" />
                <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="설명 (선택)" rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md mb-4 focus:ring-blue-500 focus:border-blue-500 resize-none whitespace-normal break-keep" />
                <div className="flex justify-end gap-3 mt-auto">
                  <button type="button" onClick={closeCreateModal} title="취소"
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md cursor-pointer flex items-center justify-center"><X className="h-5 w-5" /></button>
                  <button type="submit" disabled={creating || !newTitle.trim()} title={creating ? '생성 중...' : '만들기'}
                    className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 cursor-pointer flex items-center justify-center">
                    {creating ? <Loader className="animate-spin h-5 w-5" /> : <Plus className="h-5 w-5" />}
                  </button>
                </div>
              </form>
            )}

            {/* 가져오기 */}
            {createTab === 'import' && (
              <div>
                {importClassrooms.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">가져올 수 있는 다른 클래스가 없습니다.</p>
                ) : (
                  <>
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-gray-500 mb-1">클래스 선택</label>
                      <select value={importSrcCid}
                        onChange={(e) => handleImportClassroomChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500">
                        <option value="">-- 클래스를 선택하세요 --</option>
                        {importClassrooms.map((cls) => (
                          <option key={cls.id} value={cls.id}>{cls.name}</option>
                        ))}
                      </select>
                    </div>

                    {importSrcCid && (
                      <div className="mb-4">
                        <label className="block text-xs font-medium text-gray-500 mb-1">과제 선택</label>
                        {importAssignments.length === 0 ? (
                          <p className="text-sm text-gray-400 py-2">이 클래스에 과제가 없습니다.</p>
                        ) : (
                          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md divide-y">
                            {importAssignments.map((asn) => (
                              <button key={asn.id} type="button"
                                onClick={() => setImportSelectedAsnId(asn.id)}
                                className={`w-full text-left px-3 py-2.5 text-sm transition-colors cursor-pointer ${
                                  importSelectedAsnId === asn.id
                                    ? 'bg-blue-50 text-blue-700 font-medium'
                                    : 'hover:bg-gray-50 text-gray-700'
                                }`}>
                                {asn.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                <div className="flex justify-end gap-3 mt-2">
                  <button type="button" onClick={closeCreateModal} title="취소"
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md cursor-pointer flex items-center justify-center"><X className="h-5 w-5" /></button>
                  <button type="button" onClick={handleImportAssignment}
                    disabled={!importSelectedAsnId || importing} title={importing ? '가져오는 중...' : '가져오기'}
                    className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 cursor-pointer flex items-center justify-center">
                    {importing ? <Loader className="animate-spin h-5 w-5" /> : <Download className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            )}
          </div>
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

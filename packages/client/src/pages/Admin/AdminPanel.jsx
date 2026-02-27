import { useState, useEffect, useCallback } from 'react';
import {
  Users, Building2, BarChart3, Trash2, Shield, ShieldOff,
  UserCog, ChevronDown, ChevronUp, RefreshCw, AlertTriangle,
  HardDrive, Database, X, Search, KeyRound, Pencil, Check, Mail,
  ChevronRight, GraduationCap, FolderOpen,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

// ─── 유틸리티 ─────────────────────────────────────

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function RoleBadge({ role }) {
  if (role === 'teacher') return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">교사</span>;
  if (role === 'student') return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">학생</span>;
  return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500">미설정</span>;
}

// ─── 사용자 관리 탭 ────────────────────────────────

function UsersTab() {
  const { profile: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedUser, setExpandedUser] = useState(null);
  const [userDetail, setUserDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [editingNameId, setEditingNameId] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');

  // Sub-tab state
  const [subTab, setSubTab] = useState('teachers');

  // Hierarchy state (students sub-tab)
  const [hierarchy, setHierarchy] = useState(null);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [expandedTeachers, setExpandedTeachers] = useState(new Set());
  const [expandedClassrooms, setExpandedClassrooms] = useState(new Set());
  const [studentSearch, setStudentSearch] = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      const data = await api.get('/api/admin/users');
      setUsers(data);
    } catch (err) {
      console.error('사용자 목록 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHierarchy = useCallback(async () => {
    setHierarchyLoading(true);
    try {
      const data = await api.get('/api/admin/teachers-with-students');
      setHierarchy(data);
    } catch (err) {
      console.error('계층 데이터 로드 실패:', err);
    } finally {
      setHierarchyLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Lazy load hierarchy on first students sub-tab switch
  useEffect(() => {
    if (subTab === 'students' && !hierarchy) {
      fetchHierarchy();
    }
  }, [subTab, hierarchy, fetchHierarchy]);

  // Reset edit state on sub-tab switch
  const handleSubTabChange = (tab) => {
    setSubTab(tab);
    setEditingNameId(null);
  };

  const syncHierarchy = useCallback(async () => {
    if (hierarchy) await fetchHierarchy();
  }, [hierarchy, fetchHierarchy]);

  const toggleDetail = async (userId) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      setUserDetail(null);
      return;
    }
    setExpandedUser(userId);
    setDetailLoading(true);
    try {
      const detail = await api.get(`/api/admin/users/${userId}/detail`);
      setUserDetail(detail);
    } catch (err) {
      console.error('상세 정보 로드 실패:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    setActionLoading(userId);
    try {
      await api.patch(`/api/admin/users/${userId}/role`, { role: newRole });
      await fetchUsers();
      await syncHierarchy();
      if (expandedUser === userId) {
        const detail = await api.get(`/api/admin/users/${userId}/detail`);
        setUserDetail(detail);
      }
    } catch (err) {
      alert(err.message || '역할 변경 실패');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAdminToggle = async (userId, currentIsAdmin) => {
    if (userId === me?.id && currentIsAdmin) {
      alert('자기 자신의 관리자 권한은 해제할 수 없습니다.');
      return;
    }
    setActionLoading(userId);
    try {
      await api.patch(`/api/admin/users/${userId}/admin`, { isAdmin: !currentIsAdmin });
      await fetchUsers();
    } catch (err) {
      alert(err.message || '관리자 설정 실패');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (userId, userName, fromStudentTab = false) => {
    if (userId === me?.id) {
      alert('자기 자신은 삭제할 수 없습니다.');
      return;
    }
    const msg = fromStudentTab
      ? `"${userName}" 학생을 삭제하시겠습니까?\n모든 클래스에서 삭제되며 전체 데이터가 영구 삭제됩니다.`
      : `정말 "${userName}" 사용자를 삭제하시겠습니까?\n모든 데이터가 영구 삭제됩니다.`;
    if (!confirm(msg)) return;
    setActionLoading(userId);
    try {
      await api.delete(`/api/admin/users/${userId}`);
      setExpandedUser(null);
      await fetchUsers();
      await syncHierarchy();
    } catch (err) {
      alert(err.message || '삭제 실패');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetUser = async (userId, userName) => {
    if (!confirm(`"${userName}"의 모든 학습 데이터를 초기화하시겠습니까?\n계정은 유지되지만 클래스룸, 필기, 과제 등 모든 데이터가 삭제됩니다.`)) return;
    setActionLoading(userId);
    try {
      await api.post(`/api/admin/users/${userId}/reset`);
      await fetchUsers();
      await syncHierarchy();
      if (expandedUser === userId) {
        const detail = await api.get(`/api/admin/users/${userId}/detail`);
        setUserDetail(detail);
      }
    } catch (err) {
      alert(err.message || '초기화 실패');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetPassword = async (userId, userName, authMethod) => {
    if (authMethod !== 'email') {
      alert('Google 계정은 비밀번호 초기화가 불가합니다.');
      return;
    }
    if (!confirm(`"${userName}"의 비밀번호를 초기화하시겠습니까?\n다음 로그인 시 입력하는 비밀번호가 새 비밀번호로 설정됩니다.`)) return;
    setActionLoading(userId);
    try {
      await api.post(`/api/admin/users/${userId}/reset-password`);
      alert('비밀번호가 초기화되었습니다.\n사용자가 다음 로그인 시 새 비밀번호를 설정합니다.');
      await fetchUsers();
      await syncHierarchy();
    } catch (err) {
      alert(err.message || '비밀번호 초기화 실패');
    } finally {
      setActionLoading(null);
    }
  };

  const startEditName = (userId, currentName) => {
    setEditingNameId(userId);
    setEditNameValue(currentName || '');
  };

  const handleSaveName = async (userId) => {
    if (!editNameValue.trim()) {
      alert('이름을 입력해 주세요.');
      return;
    }
    setActionLoading(userId);
    try {
      await api.patch(`/api/admin/users/${userId}/name`, { name: editNameValue.trim() });
      setEditingNameId(null);
      await fetchUsers();
      await syncHierarchy();
    } catch (err) {
      alert(err.message || '이름 변경 실패');
    } finally {
      setActionLoading(null);
    }
  };

  // Counts for sub-tab badges
  const teacherCount = users.filter(u => u.role === 'teacher' || !u.role).length;
  const studentCount = users.filter(u => u.role === 'student').length;

  if (loading) return <p className="text-gray-500 py-8 text-center">로딩 중...</p>;

  // ─── Inline name edit component ───
  const NameCell = ({ id, name, authMethod, avatarUrl, compact = false }) => (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      {avatarUrl
        ? <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full flex-shrink-0" referrerPolicy="no-referrer" />
        : <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
            {authMethod === 'email' && <Mail className="h-4 w-4 text-gray-400" />}
          </div>
      }
      <div className="min-w-0">
        {editingNameId === id ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={editNameValue}
              onChange={e => setEditNameValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveName(id)}
              className="text-sm border border-blue-300 rounded px-1.5 py-0.5 w-28 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
            />
            <button onClick={() => handleSaveName(id)} className="p-0.5 text-green-600 hover:bg-green-50 rounded cursor-pointer" title="저장">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setEditingNameId(null)} className="p-0.5 text-gray-400 hover:bg-gray-100 rounded cursor-pointer" title="취소">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 group/name">
            <span className={`font-medium text-gray-900 truncate ${compact ? 'text-xs' : 'text-sm'}`}>{name || '(이름 없음)'}</span>
            <button
              onClick={() => startEditName(id, name)}
              className="p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded cursor-pointer opacity-0 group-hover/name:opacity-100 transition-opacity"
              title="이름 변경"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        )}
        {!compact && (
          <div className="text-xs text-gray-500 truncate">{/* email shown externally */}</div>
        )}
      </div>
    </div>
  );

  // ─── Student action buttons (used in hierarchy view) ───
  const StudentActions = ({ student }) => (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      {student.authMethod === 'email' && (
        <button
          onClick={() => handleResetPassword(student.id, student.name, student.authMethod)}
          disabled={actionLoading === student.id}
          title={student.mustResetPassword ? '비밀번호 초기화 대기 중' : '비밀번호 초기화'}
          className={`p-1 rounded transition-colors cursor-pointer ${
            student.mustResetPassword ? 'text-amber-600 bg-amber-50' : 'text-violet-500 hover:bg-violet-50'
          }`}
        >
          <KeyRound className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        onClick={() => handleResetUser(student.id, student.name)}
        disabled={actionLoading === student.id}
        title="데이터 초기화"
        className="p-1 text-orange-500 hover:bg-orange-50 rounded transition-colors cursor-pointer"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => handleDelete(student.id, student.name, true)}
        disabled={actionLoading === student.id || student.id === me?.id}
        title="학생 삭제"
        className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer disabled:opacity-30"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  // ─── Teachers sub-tab rendering ───
  const renderTeachersTab = () => {
    const filtered = users
      .filter(u => u.role === 'teacher' || !u.role)
      .filter(u => {
        if (!search) return true;
        const q = search.toLowerCase();
        return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
      });

    return (
      <>
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="이름 또는 이메일 검색..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="text-sm text-gray-500 mb-3">총 {filtered.length}명</div>

        <div className="space-y-2">
          {filtered.map(u => (
            <div key={u.id} className="border border-gray-200 rounded-lg bg-white overflow-hidden group/row">
              <div className="flex items-center gap-3 p-3">
                <NameCell id={u.id} name={u.name} authMethod={u.authMethod} avatarUrl={u.avatarUrl} />
                <div className="text-xs text-gray-500 truncate flex items-center gap-1 flex-shrink-0 max-w-[180px]">
                  {u.email}
                  {u.authMethod === 'email' && (
                    <span className="px-1 py-0 text-[10px] font-medium rounded bg-violet-100 text-violet-600">이메일</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <RoleBadge role={u.role} />
                  {u.isAdmin && <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">관리자</span>}
                </div>
                <span className="text-xs text-gray-500 flex-shrink-0 w-16 text-center">{u.classroomCount}개 클래스</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <select
                    value={u.role || ''}
                    onChange={e => handleRoleChange(u.id, e.target.value)}
                    disabled={actionLoading === u.id}
                    className="text-xs border border-gray-300 rounded px-1.5 py-1 cursor-pointer"
                  >
                    <option value="" disabled>역할</option>
                    <option value="teacher">교사</option>
                    <option value="student">학생</option>
                  </select>
                  <button
                    onClick={() => handleAdminToggle(u.id, u.isAdmin)}
                    disabled={actionLoading === u.id}
                    title={u.isAdmin ? '관리자 해제' : '관리자 지정'}
                    className={`p-1.5 rounded transition-colors cursor-pointer ${u.isAdmin ? 'text-amber-600 hover:bg-amber-50' : 'text-gray-400 hover:bg-gray-50'}`}
                  >
                    {u.isAdmin ? <Shield className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
                  </button>
                  {u.authMethod === 'email' && (
                    <button
                      onClick={() => handleResetPassword(u.id, u.name, u.authMethod)}
                      disabled={actionLoading === u.id}
                      title={u.mustResetPassword ? '비밀번호 초기화 대기 중' : '비밀번호 초기화'}
                      className={`p-1.5 rounded transition-colors cursor-pointer ${u.mustResetPassword ? 'text-amber-600 bg-amber-50' : 'text-violet-500 hover:bg-violet-50'}`}
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={() => handleResetUser(u.id, u.name)} disabled={actionLoading === u.id} title="데이터 초기화" className="p-1.5 text-orange-500 hover:bg-orange-50 rounded transition-colors cursor-pointer">
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(u.id, u.name)} disabled={actionLoading === u.id || u.id === me?.id} title="사용자 삭제" className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer disabled:opacity-30">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => toggleDetail(u.id)} title="상세 정보" className="p-1.5 text-gray-500 hover:bg-gray-50 rounded transition-colors cursor-pointer">
                    {expandedUser === u.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {expandedUser === u.id && (
                <div className="border-t border-gray-100 bg-gray-50 p-4">
                  {detailLoading ? (
                    <p className="text-sm text-gray-500">로딩 중...</p>
                  ) : userDetail ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-1"><HardDrive className="h-4 w-4" /> Storage</h4>
                        <p className="text-lg font-semibold text-gray-900">{formatBytes(userDetail.storageBytes)}</p>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-1"><Database className="h-4 w-4" /> Database (교사)</h4>
                        <ul className="space-y-0.5 text-gray-600">
                          <li>클래스룸: {userDetail.dbRows.teacher.classrooms}</li>
                          <li>게시물: {userDetail.dbRows.teacher.posts}</li>
                          <li>교사 필기: {userDetail.dbRows.teacher.teacherNotes}</li>
                          <li>코멘트: {userDetail.dbRows.teacher.comments}</li>
                          <li>과제: {userDetail.dbRows.teacher.assignments}</li>
                          <li>과제 코멘트: {userDetail.dbRows.teacher.assignmentComments}</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-1"><Database className="h-4 w-4" /> Database (학생)</h4>
                        <ul className="space-y-0.5 text-gray-600">
                          <li>가입 클래스: {userDetail.dbRows.student.memberships}</li>
                          <li>필기 노트: {userDetail.dbRows.student.notes}</li>
                          <li>과제 제출: {userDetail.dbRows.student.submissions}</li>
                          <li>과제 필기: {userDetail.dbRows.student.assignmentNotes}</li>
                        </ul>
                      </div>
                      {userDetail.classrooms?.length > 0 && (
                        <div className="md:col-span-3">
                          <h4 className="font-medium text-gray-700 mb-2">{u.role === 'teacher' ? '개설한 클래스룸' : '가입한 클래스룸'}</h4>
                          <div className="flex flex-wrap gap-2">
                            {userDetail.classrooms.map(c => (
                              <span key={c.id} className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-700">
                                {c.name} <span className="text-gray-400">({c.classCode})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">정보를 불러올 수 없습니다.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </>
    );
  };

  // ─── Students sub-tab rendering (hierarchy view) ───
  const renderStudentsTab = () => {
    if (hierarchyLoading && !hierarchy) {
      return <p className="text-gray-500 py-8 text-center">로딩 중...</p>;
    }
    if (!hierarchy) {
      return <p className="text-gray-500 py-8 text-center">데이터를 불러올 수 없습니다.</p>;
    }

    const { teachers: teacherEntries, unassignedStudents } = hierarchy;
    const q = studentSearch.toLowerCase();
    const isSearching = !!q;

    // Filter helpers
    const matchStudent = (s) => s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q);

    // Filtered hierarchy
    const filteredTeachers = isSearching
      ? teacherEntries
          .map(te => ({
            ...te,
            classrooms: te.classrooms
              .map(cr => ({ ...cr, students: cr.students.filter(matchStudent) }))
              .filter(cr => cr.students.length > 0),
          }))
          .filter(te => te.classrooms.length > 0)
      : teacherEntries;

    const filteredUnassigned = isSearching
      ? unassignedStudents.filter(matchStudent)
      : unassignedStudents;

    // Summary counts
    const totalStudents = teacherEntries.reduce((sum, te) => sum + te.classrooms.reduce((s2, cr) => s2 + cr.students.length, 0), 0) + unassignedStudents.length;

    const toggleTeacher = (teacherId) => {
      setExpandedTeachers(prev => {
        const next = new Set(prev);
        next.has(teacherId) ? next.delete(teacherId) : next.add(teacherId);
        return next;
      });
    };

    const toggleClassroom = (classroomId) => {
      setExpandedClassrooms(prev => {
        const next = new Set(prev);
        next.has(classroomId) ? next.delete(classroomId) : next.add(classroomId);
        return next;
      });
    };

    const isTeacherOpen = (teacherId) => isSearching || expandedTeachers.has(teacherId);
    const isClassroomOpen = (classroomId) => isSearching || expandedClassrooms.has(classroomId);

    return (
      <>
        {/* Search */}
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={studentSearch}
            onChange={e => setStudentSearch(e.target.value)}
            placeholder="학생 이름 또는 이메일 검색..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Summary */}
        <div className="text-sm text-gray-500 mb-3">
          교사 {teacherEntries.length}명 · 클래스룸 {teacherEntries.reduce((s, te) => s + te.classrooms.length, 0)}개 · 학생 {totalStudents}명
          {unassignedStudents.length > 0 && <span className="text-gray-400"> (미배정 {unassignedStudents.length}명)</span>}
        </div>

        {/* Empty state */}
        {filteredTeachers.length === 0 && filteredUnassigned.length === 0 && (
          <p className="text-gray-400 py-8 text-center">
            {isSearching ? '검색 결과가 없습니다.' : '클래스룸을 개설한 교사가 없습니다.'}
          </p>
        )}

        {/* Teacher → Classroom → Student hierarchy */}
        <div className="space-y-1">
          {filteredTeachers.map(({ teacher, classrooms: tClassrooms }) => {
            const tStudentCount = tClassrooms.reduce((s, cr) => s + cr.students.length, 0);
            const tOpen = isTeacherOpen(teacher.id);
            return (
              <div key={teacher.id}>
                {/* Teacher row */}
                <button
                  onClick={() => toggleTeacher(teacher.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer text-left"
                >
                  {tOpen
                    ? <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  }
                  <span className="text-sm font-medium text-gray-800">{teacher.name || '(이름 없음)'}</span>
                  <span className="text-xs text-gray-400 truncate">{teacher.email}</span>
                  <span className="ml-auto text-xs text-gray-500 flex-shrink-0">
                    {tClassrooms.length}개 클래스 · {tStudentCount}명
                  </span>
                </button>

                {/* Classrooms */}
                {tOpen && (
                  <div className="ml-4 space-y-0.5">
                    {tClassrooms.map(cr => {
                      const crOpen = isClassroomOpen(cr.id);
                      return (
                        <div key={cr.id}>
                          {/* Classroom row */}
                          <button
                            onClick={() => toggleClassroom(cr.id)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 rounded hover:bg-gray-50 transition-colors cursor-pointer text-left"
                          >
                            {crOpen
                              ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                              : <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                            }
                            <FolderOpen className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                            <span className="text-sm text-gray-700">{cr.name}</span>
                            <span className="text-xs font-mono text-gray-400">({cr.classCode})</span>
                            <span className="ml-auto text-xs text-gray-500 flex-shrink-0">{cr.students.length}명</span>
                          </button>

                          {/* Students */}
                          {crOpen && (
                            <div className="ml-8 space-y-0.5 py-0.5">
                              {cr.students.length === 0 ? (
                                <p className="text-xs text-gray-400 px-3 py-1">학생이 없습니다</p>
                              ) : cr.students.map(s => (
                                <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-gray-50 group/student">
                                  <GraduationCap className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    {editingNameId === s.id ? (
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          value={editNameValue}
                                          onChange={e => setEditNameValue(e.target.value)}
                                          onKeyDown={e => e.key === 'Enter' && handleSaveName(s.id)}
                                          className="text-xs border border-blue-300 rounded px-1.5 py-0.5 w-24 focus:ring-blue-500 focus:border-blue-500"
                                          autoFocus
                                        />
                                        <button onClick={() => handleSaveName(s.id)} className="p-0.5 text-green-600 hover:bg-green-50 rounded cursor-pointer" title="저장">
                                          <Check className="h-3 w-3" />
                                        </button>
                                        <button onClick={() => setEditingNameId(null)} className="p-0.5 text-gray-400 hover:bg-gray-100 rounded cursor-pointer" title="취소">
                                          <X className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs font-medium text-gray-800">{s.name || '(이름 없음)'}</span>
                                        <button
                                          onClick={() => startEditName(s.id, s.name)}
                                          className="p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded cursor-pointer opacity-0 group-hover/student:opacity-100 transition-opacity"
                                          title="이름 변경"
                                        >
                                          <Pencil className="h-2.5 w-2.5" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  <span className="text-xs text-gray-400 truncate max-w-[160px] flex-shrink-0 flex items-center gap-1">
                                    {s.email}
                                    {s.authMethod === 'email' && (
                                      <span className="px-1 py-0 text-[10px] font-medium rounded bg-violet-100 text-violet-600">이메일</span>
                                    )}
                                  </span>
                                  <StudentActions student={s} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Unassigned students */}
          {filteredUnassigned.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-200">
                <span className="text-sm font-medium text-gray-500">미배정 학생 ({filteredUnassigned.length}명)</span>
              </div>
              <div className="ml-4 space-y-0.5 py-0.5">
                {filteredUnassigned.map(s => (
                  <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-gray-50 group/student">
                    <GraduationCap className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      {editingNameId === s.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editNameValue}
                            onChange={e => setEditNameValue(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveName(s.id)}
                            className="text-xs border border-blue-300 rounded px-1.5 py-0.5 w-24 focus:ring-blue-500 focus:border-blue-500"
                            autoFocus
                          />
                          <button onClick={() => handleSaveName(s.id)} className="p-0.5 text-green-600 hover:bg-green-50 rounded cursor-pointer" title="저장">
                            <Check className="h-3 w-3" />
                          </button>
                          <button onClick={() => setEditingNameId(null)} className="p-0.5 text-gray-400 hover:bg-gray-100 rounded cursor-pointer" title="취소">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-medium text-gray-800">{s.name || '(이름 없음)'}</span>
                          <button
                            onClick={() => startEditName(s.id, s.name)}
                            className="p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded cursor-pointer opacity-0 group-hover/student:opacity-100 transition-opacity"
                            title="이름 변경"
                          >
                            <Pencil className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 truncate max-w-[160px] flex-shrink-0 flex items-center gap-1">
                      {s.email}
                      {s.authMethod === 'email' && (
                        <span className="px-1 py-0 text-[10px] font-medium rounded bg-violet-100 text-violet-600">이메일</span>
                      )}
                    </span>
                    <StudentActions student={s} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <div>
      {/* Sub-tab pills */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => handleSubTabChange('teachers')}
          className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer ${
            subTab === 'teachers'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          교사 ({teacherCount})
        </button>
        <button
          onClick={() => handleSubTabChange('students')}
          className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer ${
            subTab === 'students'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <GraduationCap className="h-3.5 w-3.5" />
          학생 ({studentCount})
        </button>
      </div>

      {subTab === 'teachers' && renderTeachersTab()}
      {subTab === 'students' && renderStudentsTab()}
    </div>
  );
}

// ─── 클래스룸 탭 ──────────────────────────────────

function ClassroomsTab() {
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/admin/classrooms')
      .then(data => setClassrooms(data))
      .catch(err => console.error('클래스룸 로드 실패:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500 py-8 text-center">로딩 중...</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="py-3 px-3 font-medium text-gray-600">클래스명</th>
            <th className="py-3 px-3 font-medium text-gray-600">담당 교사</th>
            <th className="py-3 px-3 font-medium text-gray-600 text-center">학생 수</th>
            <th className="py-3 px-3 font-medium text-gray-600 text-center">단원 수</th>
            <th className="py-3 px-3 font-medium text-gray-600">코드</th>
            <th className="py-3 px-3 font-medium text-gray-600">생성일</th>
          </tr>
        </thead>
        <tbody>
          {classrooms.length === 0 ? (
            <tr><td colSpan={6} className="py-8 text-center text-gray-400">클래스룸이 없습니다.</td></tr>
          ) : classrooms.map(c => (
            <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2.5 px-3 font-medium text-gray-900">{c.name}</td>
              <td className="py-2.5 px-3 text-gray-600">
                {c.teacher?.name || '(알 수 없음)'}
                {c.teacher?.email && <span className="text-gray-400 text-xs ml-1">({c.teacher.email})</span>}
              </td>
              <td className="py-2.5 px-3 text-center">{c.studentCount}</td>
              <td className="py-2.5 px-3 text-center">{c.chapterCount}</td>
              <td className="py-2.5 px-3 font-mono text-xs text-gray-500">{c.classCode}</td>
              <td className="py-2.5 px-3 text-gray-500 text-xs">
                {c.createdAt ? new Date(c.createdAt).toLocaleDateString('ko-KR') : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── 시스템 현황 탭 ────────────────────────────────

function StatsTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/admin/stats')
      .then(data => setStats(data))
      .catch(err => console.error('통계 로드 실패:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500 py-8 text-center">로딩 중...</p>;
  if (!stats) return <p className="text-gray-500 py-8 text-center">통계를 불러올 수 없습니다.</p>;

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="전체 사용자" value={stats.summary.totalUsers} color="blue" />
        <SummaryCard label="교사" value={stats.summary.teachers} color="indigo" />
        <SummaryCard label="학생" value={stats.summary.students} color="green" />
        <SummaryCard label="클래스룸" value={stats.summary.classrooms} color="purple" />
      </div>

      {/* Storage */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-gray-500" /> Storage 사용량
        </h3>
        <p className="text-2xl font-bold text-gray-900 mb-3">{formatBytes(stats.storage.totalSize)}</p>
        <div className="grid grid-cols-3 gap-3">
          {stats.storage.buckets.map(b => (
            <div key={b.bucket} className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">{b.bucket}</p>
              <p className="text-sm font-semibold text-gray-800">{formatBytes(b.size)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* DB 테이블 */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
          <Database className="h-5 w-5 text-gray-500" /> Database 사용량
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {stats.database.map(t => (
            <div key={t.table} className="flex justify-between items-center bg-gray-50 rounded px-3 py-2">
              <span className="text-xs text-gray-600 font-mono">{t.table}</span>
              <span className="text-sm font-semibold text-gray-800">{t.rows.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          총 {stats.database.reduce((sum, t) => sum + t.rows, 0).toLocaleString()} rows
        </p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  };
  return (
    <div className={`rounded-lg border p-4 ${colors[color]}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

// ─── 데이터 초기화 탭 ──────────────────────────────

function ResetTab() {
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState(null);

  const handleResetAll = async () => {
    if (confirmText !== 'RESET') return;
    if (!confirm('최종 확인: 관리자를 제외한 모든 사용자 계정과 데이터가 삭제됩니다.\n이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?')) return;

    setResetting(true);
    setResult(null);
    try {
      await api.post('/api/admin/reset');
      setResult({ success: true, message: '전체 데이터가 초기화되었습니다.' });
      setConfirmText('');
    } catch (err) {
      setResult({ success: false, message: err.message || '초기화 실패' });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-red-800">전체 데이터 초기화</h3>
            <p className="text-sm text-red-700 mt-1">
              이 작업은 다음을 수행합니다:
            </p>
            <ul className="text-sm text-red-700 mt-2 space-y-1 list-disc list-inside">
              <li>관리자가 아닌 모든 사용자 계정 삭제</li>
              <li>모든 클래스룸, 단원, 페이지 데이터 삭제</li>
              <li>모든 학생 필기 및 과제 데이터 삭제</li>
              <li>모든 게시물 삭제</li>
              <li>모든 업로드 파일(Storage) 삭제</li>
              <li>관리자 계정은 유지됩니다</li>
            </ul>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-red-800 mb-2">
            확인을 위해 <span className="font-mono font-bold">RESET</span>을 입력하세요
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="RESET"
              className="flex-1 px-3 py-2 border border-red-300 rounded-lg text-sm font-mono focus:ring-red-500 focus:border-red-500"
            />
            <button
              onClick={handleResetAll}
              disabled={confirmText !== 'RESET' || resetting}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              {resetting ? '초기화 중...' : '전체 초기화'}
            </button>
          </div>
        </div>

        {result && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${
            result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {result.message}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 메인 AdminPanel ───────────────────────────────

const TABS = [
  { id: 'users', label: '사용자 관리', icon: Users },
  { id: 'classrooms', label: '클래스룸', icon: Building2 },
  { id: 'stats', label: '시스템 현황', icon: BarChart3 },
  { id: 'reset', label: '데이터 초기화', icon: Trash2 },
];

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('users');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <UserCog className="h-7 w-7 text-amber-600" />
          관리자 패널
        </h1>
        <p className="text-sm text-gray-500 mt-1">사용자, 클래스룸, 시스템 데이터를 관리합니다.</p>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'classrooms' && <ClassroomsTab />}
      {activeTab === 'stats' && <StatsTab />}
      {activeTab === 'reset' && <ResetTab />}
    </div>
  );
}

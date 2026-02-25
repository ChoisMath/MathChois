import { useState, useEffect, useCallback } from 'react';
import {
  Users, Building2, BarChart3, Trash2, Shield, ShieldOff,
  UserCog, ChevronDown, ChevronUp, RefreshCw, AlertTriangle,
  HardDrive, Database, X, Search,
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

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

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

  const handleDelete = async (userId, userName) => {
    if (userId === me?.id) {
      alert('자기 자신은 삭제할 수 없습니다.');
      return;
    }
    if (!confirm(`정말 "${userName}" 사용자를 삭제하시겠습니까?\n모든 데이터가 영구 삭제됩니다.`)) return;
    setActionLoading(userId);
    try {
      await api.delete(`/api/admin/users/${userId}`);
      setExpandedUser(null);
      await fetchUsers();
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

  const filtered = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (u.name?.toLowerCase().includes(q)) || (u.email?.toLowerCase().includes(q));
  });

  if (loading) return <p className="text-gray-500 py-8 text-center">로딩 중...</p>;

  return (
    <div>
      {/* 검색 */}
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

      {/* 사용자 목록 */}
      <div className="space-y-2">
        {filtered.map(u => (
          <div key={u.id} className="border border-gray-200 rounded-lg bg-white overflow-hidden">
            <div className="flex items-center gap-3 p-3">
              {/* 아바타 + 이름 */}
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {u.avatarUrl
                  ? <img src={u.avatarUrl} alt="" className="h-8 w-8 rounded-full flex-shrink-0" referrerPolicy="no-referrer" />
                  : <div className="h-8 w-8 rounded-full bg-gray-200 flex-shrink-0" />
                }
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{u.name || '(이름 없음)'}</div>
                  <div className="text-xs text-gray-500 truncate">{u.email}</div>
                </div>
              </div>

              {/* 역할 */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <RoleBadge role={u.role} />
                {u.isAdmin && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">관리자</span>
                )}
              </div>

              {/* 클래스룸 수 */}
              <span className="text-xs text-gray-500 flex-shrink-0 w-16 text-center">
                {u.classroomCount}개 클래스
              </span>

              {/* 액션 버튼들 */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* 역할 변경 */}
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

                {/* 관리자 토글 */}
                <button
                  onClick={() => handleAdminToggle(u.id, u.isAdmin)}
                  disabled={actionLoading === u.id}
                  title={u.isAdmin ? '관리자 해제' : '관리자 지정'}
                  className={`p-1.5 rounded transition-colors cursor-pointer ${
                    u.isAdmin
                      ? 'text-amber-600 hover:bg-amber-50'
                      : 'text-gray-400 hover:bg-gray-50'
                  }`}
                >
                  {u.isAdmin ? <Shield className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
                </button>

                {/* 데이터 초기화 */}
                <button
                  onClick={() => handleResetUser(u.id, u.name)}
                  disabled={actionLoading === u.id}
                  title="데이터 초기화"
                  className="p-1.5 text-orange-500 hover:bg-orange-50 rounded transition-colors cursor-pointer"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>

                {/* 삭제 */}
                <button
                  onClick={() => handleDelete(u.id, u.name)}
                  disabled={actionLoading === u.id || u.id === me?.id}
                  title="사용자 삭제"
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                {/* 상세 펼치기 */}
                <button
                  onClick={() => toggleDetail(u.id)}
                  title="상세 정보"
                  className="p-1.5 text-gray-500 hover:bg-gray-50 rounded transition-colors cursor-pointer"
                >
                  {expandedUser === u.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* 상세 패널 */}
            {expandedUser === u.id && (
              <div className="border-t border-gray-100 bg-gray-50 p-4">
                {detailLoading ? (
                  <p className="text-sm text-gray-500">로딩 중...</p>
                ) : userDetail ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    {/* Storage */}
                    <div>
                      <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-1">
                        <HardDrive className="h-4 w-4" /> Storage
                      </h4>
                      <p className="text-lg font-semibold text-gray-900">{formatBytes(userDetail.storageBytes)}</p>
                    </div>

                    {/* DB Rows */}
                    <div>
                      <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-1">
                        <Database className="h-4 w-4" /> Database (교사)
                      </h4>
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
                      <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-1">
                        <Database className="h-4 w-4" /> Database (학생)
                      </h4>
                      <ul className="space-y-0.5 text-gray-600">
                        <li>가입 클래스: {userDetail.dbRows.student.memberships}</li>
                        <li>필기 노트: {userDetail.dbRows.student.notes}</li>
                        <li>과제 제출: {userDetail.dbRows.student.submissions}</li>
                        <li>과제 필기: {userDetail.dbRows.student.assignmentNotes}</li>
                      </ul>
                    </div>

                    {/* 클래스룸 목록 */}
                    {userDetail.classrooms?.length > 0 && (
                      <div className="md:col-span-3">
                        <h4 className="font-medium text-gray-700 mb-2">
                          {u.role === 'teacher' ? '개설한 클래스룸' : '가입한 클래스룸'}
                        </h4>
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

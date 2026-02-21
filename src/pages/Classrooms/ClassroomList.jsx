import { useState, useEffect } from 'react';
import { Plus, Users, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

function generateClassCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const ClassroomList = () => {
  const { user, profile } = useAuth();
  const isTeacher = profile?.role === 'teacher';
  const prefix = isTeacher ? '/teacher' : '/student';

  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

const fetchClassrooms = async () => {
    setLoading(true);
    if (isTeacher) {
      const { data, error } = await supabase
        .from('classrooms')
        .select('*')
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false });
      if (error) { console.error('[ClassroomList] 목록 조회 오류:', error); setLoading(false); return; }

      // 각 클래스룸의 학생 수를 별도 조회
      const withCounts = await Promise.all(
        (data || []).map(async (classroom) => {
          const { count } = await supabase
            .from('classroom_members')
            .select('*', { count: 'exact', head: true })
            .eq('classroom_id', classroom.id);
          return { ...classroom, memberCount: count ?? 0 };
        })
      );
      setClassrooms(withCounts);
    } else {
      const { data, error } = await supabase
        .from('classroom_members')
        .select('classroom:classrooms(*)')
        .eq('student_id', user.id);
      if (error) { console.error('[ClassroomList] 목록 조회 오류:', error); setLoading(false); return; }

      const rows = data?.map((d) => d.classroom) || [];
      const withCounts = await Promise.all(
        rows.map(async (classroom) => {
          const { count } = await supabase
            .from('classroom_members')
            .select('*', { count: 'exact', head: true })
            .eq('classroom_id', classroom.id);
          return { ...classroom, memberCount: count ?? 0 };
        })
      );
      setClassrooms(withCounts);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchClassrooms();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError('');
    const { error } = await supabase.from('classrooms').insert({
      name: newName.trim(),
      teacher_id: user.id,
      class_code: generateClassCode(),
    });
    setCreating(false);
    if (error) {
      console.error('[ClassroomList] 클래스룸 생성 오류:', error);
      setCreateError(error.message);
    } else {
      setNewName('');
      setShowCreateModal(false);
      fetchClassrooms();
    }
  };

const getMemberCount = (classroom) => {
    return classroom.memberCount ?? 0;
  };

  if (loading) {
    return <p className="text-gray-500">로딩 중...</p>;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">클래스룸</h1>
        {isTeacher && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 cursor-pointer"
          >
            <Plus className="-ml-1 mr-2 h-5 w-5" />
            새 클래스룸
          </button>
        )}
      </div>

{classrooms.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-gray-500">
            {isTeacher ? '아직 생성한 클래스룸이 없습니다.' : '아직 참여한 클래스룸이 없습니다.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {classrooms.map((classroom) => (
            <Link key={classroom.id} to={`${prefix}/classrooms/${classroom.id}`} className="block hover:no-underline">
              <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="h-12 w-12 rounded-md bg-blue-100 flex items-center justify-center">
                        <Users className="h-6 w-6 text-blue-600" />
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <div className="text-lg font-medium text-gray-900">{classroom.name}</div>
                      {isTeacher && (
                        <div className="text-xs text-gray-400 font-mono mt-1">코드: {classroom.class_code}</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 px-5 py-3">
                  <div className="text-sm font-medium text-blue-700 flex items-center justify-between">
                    <span>학생 {getMemberCount(classroom)}명</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* 생성 모달 */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form onSubmit={handleCreate} className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-gray-900 mb-4">새 클래스룸 만들기</h2>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="클래스룸 이름"
              className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm mb-4 focus:ring-blue-500 focus:border-blue-500"
            />
            {createError && (
              <p className="text-sm text-red-600 mb-3">{createError}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowCreateModal(false); setCreateError(''); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
              >
                {creating ? '생성 중...' : '만들기'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default ClassroomList;

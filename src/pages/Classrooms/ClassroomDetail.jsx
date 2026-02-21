import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Users, BookOpen, Copy, Check, Trash2, ChevronRight, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

const ClassroomDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const isTeacher = profile?.role === 'teacher';

  const [classroom, setClassroom] = useState(null);
  const [members, setMembers] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const { data: cls } = await supabase
        .from('classrooms')
        .select('*')
        .eq('id', id)
        .single();
      setClassroom(cls);

      const { data: mems } = await supabase
        .from('classroom_members')
        .select('*, student:profiles(id, name, email, avatar_url)')
        .eq('classroom_id', id)
        .order('joined_at', { ascending: true });
      setMembers(mems || []);

      const { data: chaps } = await supabase
        .from('chapters')
        .select('id, title, position, pages(id, position)')
        .eq('classroom_id', id)
        .order('position');
      // 각 챕터의 첫 페이지(position 최소값) 계산
      const chaptersWithFirstPage = (chaps || []).map((ch) => ({
        ...ch,
        pageCount: ch.pages?.length || 0,
        firstPage: ch.pages?.sort((a, b) => a.position - b.position)[0] || null,
      }));
      setChapters(chaptersWithFirstPage);

      setLoading(false);
    };
    fetchData();
  }, [id]);

  const handleCopyCode = async () => {
    if (!classroom?.class_code) return;
    await navigator.clipboard.writeText(classroom.class_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.from('classrooms').delete().eq('id', id);
    setDeleting(false);
    if (error) {
      console.error('[ClassroomDetail] 삭제 오류:', error);
      setShowDeleteConfirm(false);
      // 에러 메시지를 UI에 표시하기 위해 alert 대신 콘솔 확인
      window.alert(`삭제 실패: ${error.message}`);
    } else {
      navigate(isTeacher ? '/teacher/classrooms' : '/student/classrooms', { replace: true });
    }
  };

  const handleLeave = async () => {
    if (!confirm('이 클래스룸에서 나가시겠습니까?')) return;
    await supabase
      .from('classroom_members')
      .delete()
      .eq('classroom_id', id)
      .eq('student_id', user.id);
    navigate('/student/classrooms', { replace: true });
  };

  if (loading) {
    return <p className="text-gray-500">로딩 중...</p>;
  }

  if (!classroom) {
    return <p className="text-gray-500">클래스룸을 찾을 수 없습니다.</p>;
  }

  return (
    <>
    <div className="max-w-7xl mx-auto">
      <div className="md:flex md:items-center md:justify-between mb-8">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            {classroom.name}
          </h2>
        </div>
        <div className="mt-4 flex md:mt-0 md:ml-4 gap-3">
          {isTeacher ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50 cursor-pointer"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              삭제
            </button>
          ) : (
            <button
              onClick={handleLeave}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
            >
              나가기
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* 클래스 코드 (교사에게만 표시) */}
          {isTeacher && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">클래스 코드</h3>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-mono font-bold text-blue-600 tracking-widest">
                  {classroom.class_code}
                </span>
                <button
                  onClick={handleCopyCode}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                  title="코드 복사"
                >
                  {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
                </button>
              </div>
              <p className="text-sm text-gray-400 mt-2">이 코드를 학생에게 공유하세요.</p>
            </div>
          )}

          {/* 챕터 섹션 */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 flex items-center">
                <BookOpen className="mr-2 h-5 w-5 text-gray-500" />
                교재 챕터
              </h3>
              {isTeacher && (
                <Link
                  to={`/teacher/classrooms/${id}/chapters`}
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  챕터 관리 <ChevronRight className="h-4 w-4" />
                </Link>
              )}
            </div>

            {chapters.length === 0 ? (
              <div className="border border-dashed border-gray-300 rounded-lg h-32 flex items-center justify-center text-gray-400 text-sm">
                {isTeacher ? '챕터가 없습니다. 챕터 관리에서 추가하세요.' : '등록된 챕터가 없습니다.'}
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {chapters.map((ch) => (
                  <li key={ch.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{ch.title}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <FileText className="h-3 w-3" />
                        {ch.pageCount}페이지
                      </p>
                    </div>
                    {!isTeacher && (
                      ch.firstPage ? (
                        <Link
                          to={`/student/study/${ch.id}/page/${ch.firstPage.id}`}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          학습하기
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-400">페이지 없음</span>
                      )
                    )}
                    {isTeacher && (
                      <Link
                        to={`/teacher/chapters/${ch.id}/edit`}
                        className="text-sm text-gray-500 hover:text-gray-700"
                      >
                        편집
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Sidebar - 멤버 목록 */}
        <div className="space-y-6">
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <Users className="mr-2 h-5 w-5 text-gray-500" />
              학생 ({members.length}명)
            </h3>
            {members.length === 0 ? (
              <p className="text-sm text-gray-400">아직 참여한 학생이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {members.map((m) => (
                  <li key={m.id} className="py-3 flex items-center gap-3">
                    {m.student?.avatar_url ? (
                      <img
                        src={m.student.avatar_url}
                        alt={m.student.name}
                        className="h-8 w-8 rounded-full"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-500">
                        {m.student?.name?.charAt(0)}
                      </div>
                    )}
                    <div>
                      <span className="text-sm text-gray-900">{m.student?.name}</span>
                      <span className="block text-xs text-gray-400">{m.student?.email}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* 삭제 확인 모달 */}

    {showDeleteConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-2">클래스룸 삭제</h2>
          <p className="text-sm text-gray-600 mb-6">
            <span className="font-medium text-gray-900">{classroom.name}</span>을(를) 삭제하면 모든 챕터와 멤버 데이터가 함께 삭제됩니다. 계속하시겠습니까?
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50 cursor-pointer"
            >
              {deleting ? '삭제 중...' : '삭제'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default ClassroomDetail;

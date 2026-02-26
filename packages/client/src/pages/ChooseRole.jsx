import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { GraduationCap, School } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const ChooseRole = () => {
  const { isAuthenticated, isLoading, profile, updateRole } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-gray-500">로딩 중...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (profile?.role) {
    return <Navigate to={`/${profile.role}/classrooms`} replace />;
  }

  const handleSelectRole = async (role) => {
    setSaving(true);
    const updated = await updateRole(role);
    setSaving(false);
    if (updated) {
      navigate(`/${role}/classrooms`, { replace: true });
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-4xl w-full">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-12">
          역할을 선택하고 시작하세요
        </h1>

        <div className="grid md:grid-cols-2 gap-8">
          <button
            onClick={() => handleSelectRole('teacher')}
            disabled={saving}
            className="group bg-white p-8 rounded-2xl shadow-sm border-2 border-transparent hover:border-blue-500 transition-all duration-200 hover:shadow-md text-left cursor-pointer disabled:opacity-50"
          >
            <div className="flex flex-col items-center text-center">
              <div className="p-4 bg-blue-50 rounded-full mb-6 group-hover:bg-blue-100 transition-colors">
                <School className="h-12 w-12 text-blue-600" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">저는 선생님입니다</h2>
              <p className="text-gray-500">
                클래스룸을 만들고, 학생을 관리하며, 인터랙티브 학습 자료를 게시하세요.
              </p>
            </div>
          </button>

          <button
            onClick={() => handleSelectRole('student')}
            disabled={saving}
            className="group bg-white p-8 rounded-2xl shadow-sm border-2 border-transparent hover:border-green-500 transition-all duration-200 hover:shadow-md text-left cursor-pointer disabled:opacity-50"
          >
            <div className="flex flex-col items-center text-center">
              <div className="p-4 bg-green-50 rounded-full mb-6 group-hover:bg-green-100 transition-colors">
                <GraduationCap className="h-12 w-12 text-green-600" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">저는 학생입니다</h2>
              <p className="text-gray-500">
                클래스룸에 참여하고, 학습 자료를 열람하고, 진도를 확인하세요.
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChooseRole;

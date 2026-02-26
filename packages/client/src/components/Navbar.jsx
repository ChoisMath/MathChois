import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, LogOut, Menu, Shield, Pencil, Check, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Navbar = ({ onToggleSidebar }) => {
  const { profile, isAuthenticated, signOut, updateName } = useAuth();
  const navigate = useNavigate();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [saving, setSaving] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const startEditName = () => {
    setNameValue(profile?.name || '');
    setEditingName(true);
  };

  const handleSaveName = async () => {
    if (!nameValue.trim()) return;
    setSaving(true);
    try {
      await updateName(nameValue.trim());
      setEditingName(false);
    } catch {
      alert('이름 변경에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-2">
            {onToggleSidebar && (
              <button
                onClick={onToggleSidebar}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
                aria-label="메뉴 열기"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
            <Link to="/" className="flex-shrink-0 flex items-center gap-2">
              <BookOpen className="h-8 w-8 text-blue-600" />
              <span className="text-xl font-bold text-gray-900">ChoisClass</span>
            </Link>
          </div>
          <div className="flex items-center">
            {isAuthenticated && (
              <div className="flex items-center gap-3">
                {profile?.isAdmin && (
                  <Link
                    to="/admin"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors"
                  >
                    <Shield className="h-4 w-4" />
                    <span className="hidden sm:inline">관리자 패널</span>
                  </Link>
                )}
                {profile?.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.name}
                    className="h-8 w-8 rounded-full"
                    referrerPolicy="no-referrer"
                  />
                ) : profile && (
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-medium text-blue-700">
                    {(profile.name || '?')[0]}
                  </div>
                )}

                {/* 이름 표시/편집 */}
                <div className="hidden sm:flex items-center gap-1">
                  {editingName ? (
                    <>
                      <input
                        type="text"
                        value={nameValue}
                        onChange={e => setNameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveName();
                          if (e.key === 'Escape') setEditingName(false);
                        }}
                        className="text-sm border border-blue-300 rounded px-2 py-0.5 w-24 focus:ring-blue-500 focus:border-blue-500"
                        autoFocus
                        disabled={saving}
                      />
                      <button
                        onClick={handleSaveName}
                        disabled={saving}
                        className="p-0.5 text-green-600 hover:bg-green-50 rounded cursor-pointer"
                        title="저장"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingName(false)}
                        className="p-0.5 text-gray-400 hover:bg-gray-100 rounded cursor-pointer"
                        title="취소"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <div className="group flex items-center gap-1">
                      <span className="text-sm font-medium text-gray-700">
                        {profile?.name}
                      </span>
                      {profile?.authMethod === 'email' && (
                        <button
                          onClick={startEditName}
                          className="p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                          title="이름 변경"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleLogout}
                  title="로그아웃"
                  className="flex items-center justify-center p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

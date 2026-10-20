import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Menu, Shield, Pencil, Check, X } from 'lucide-react';
import '@fontsource/ibm-plex-sans-kr/400.css';
import '@fontsource/ibm-plex-sans-kr/500.css';
import '@fontsource/ibm-plex-sans-kr/700.css';
import { useAuth } from '../contexts/AuthContext';
import BrandMark from './shell/BrandMark';
import './shell/shell.css';

const ROLE_LABEL = { teacher: '선생님', student: '학생' };

const Navbar = ({ onToggleSidebar, sidebarOpen = false }) => {
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
    <nav className="shell-top">
      {/* 전폭 네비게이션 — 햄버거가 항상 화면 왼쪽 끝에 붙는다 (가운데 정렬 max-w 없음) */}
      <div className="shell-top-inner">
        <div className="shell-top-l">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="shell-iconbtn"
              aria-label={sidebarOpen ? '메뉴 닫기' : '메뉴 열기'}
              aria-expanded={sidebarOpen}
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <Link to="/" className="shell-brand">
            <BrandMark className="h-7 w-7" onDark />
            <span>ChoisClass</span>
          </Link>
        </div>
        <div className="shell-top-r">
          {isAuthenticated && (
            <>
              {profile?.isAdmin && (
                <Link to="/admin" className="shell-admin" aria-label="관리자 패널">
                  <Shield className="h-4 w-4" />
                  <span className="shell-admin-text">관리자 패널</span>
                </Link>
              )}
              {profile?.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  className="shell-avatar"
                  referrerPolicy="no-referrer"
                />
              ) : profile && (
                <div className="shell-avatar" aria-hidden="true">
                  {(profile.name || '?')[0]}
                </div>
              )}

              {/* 이름 표시/편집 */}
              <div className="shell-who">
                {editingName ? (
                  <div className="shell-who-edit">
                    <input
                      type="text"
                      value={nameValue}
                      onChange={e => setNameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveName();
                        if (e.key === 'Escape') setEditingName(false);
                      }}
                      className="shell-name-input"
                      aria-label="이름"
                      autoFocus
                      disabled={saving}
                    />
                    <button
                      onClick={handleSaveName}
                      disabled={saving}
                      className="shell-minibtn"
                      title="저장"
                      aria-label="저장"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setEditingName(false)}
                      className="shell-minibtn"
                      title="취소"
                      aria-label="취소"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="shell-who-text">
                      <span className="shell-who-name">{profile?.name}</span>
                      {ROLE_LABEL[profile?.role] && (
                        <span className="shell-who-role">{ROLE_LABEL[profile.role]}</span>
                      )}
                    </div>
                    {profile?.authMethod === 'email' && (
                      <button
                        onClick={startEditName}
                        className="shell-minibtn shell-pencil"
                        title="이름 변경"
                        aria-label="이름 변경"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>

              <button
                onClick={handleLogout}
                title="로그아웃"
                aria-label="로그아웃"
                className="shell-iconbtn"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

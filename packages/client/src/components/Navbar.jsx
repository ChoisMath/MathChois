import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, LogOut, Menu } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Navbar = ({ onToggleSidebar }) => {
  const { profile, isAuthenticated, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/');
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
              <span className="text-xl font-bold text-gray-900">ClassChois</span>
            </Link>
          </div>
          <div className="flex items-center">
            {isAuthenticated && (
              <div className="flex items-center gap-3">
                {profile?.avatar_url && (
                  <img
                    src={profile.avatar_url}
                    alt={profile.name}
                    className="h-8 w-8 rounded-full"
                    referrerPolicy="no-referrer"
                  />
                )}
                <span className="text-sm font-medium text-gray-700 hidden sm:block">
                  {profile?.name}
                </span>
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

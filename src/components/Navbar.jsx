import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Navbar = () => {
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
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-0 flex items-center gap-2">
              <BookOpen className="h-8 w-8 text-blue-600" />
              <span className="text-xl font-bold text-gray-900">MathChois</span>
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
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">로그아웃</span>
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

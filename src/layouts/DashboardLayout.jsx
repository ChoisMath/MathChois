import { Outlet, Link, useLocation } from 'react-router-dom';
import { Users } from 'lucide-react';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';

const DashboardLayout = () => {
  const location = useLocation();
  const { profile } = useAuth();
  const isTeacher = profile?.role === 'teacher';

  const teacherLinks = [
    { name: '클래스룸', path: '/teacher/classrooms', icon: Users },
  ];

  const studentLinks = [
    { name: '클래스룸', path: '/student/classrooms', icon: Users },
  ];

  const links = isTeacher ? teacherLinks : studentLinks;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />
      <div className="flex flex-1">
        <aside className="w-64 bg-white shadow-sm hidden md:block">
          <div className="p-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {isTeacher ? '교사 워크스페이스' : '학생 워크스페이스'}
            </h2>
            <nav className="mt-6 space-y-1">
              {links.map((link) => {
                const Icon = link.icon;
                const isActive = link.path === '/teacher/classrooms' || link.path === '/student/classrooms'
                  ? location.pathname.startsWith(link.path)
                  : location.pathname === link.path;
                return (
                  <Link
                    key={link.name}
                    to={link.path}
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className={`mr-3 h-5 w-5 ${isActive ? 'text-blue-500' : 'text-gray-400'}`} />
                    {link.name}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;

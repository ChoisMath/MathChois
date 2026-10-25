import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, History } from 'lucide-react';
import IconButton from '../common/IconButton';

const ClassroomGroupSettings = lazy(() => import('../whiteboard/ClassroomGroupSettings'));

/* ─── 학생 탭: 모둠 설정(교사) + 참여 학생 목록 ─── */
export default function StudentsTab({ classroomId, members, isTeacher }) {
  const navigate = useNavigate();

  return (
    <div>
      {isTeacher && members.length > 0 && (
        <Suspense fallback={<p className="text-gray-400 text-sm mb-4">모둠 설정 로딩 중...</p>}>
          <ClassroomGroupSettings classroomId={classroomId} members={members} />
        </Suspense>
      )}
      {members.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl h-40 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
          <Users className="h-8 w-8" />
          <span>아직 참여한 학생이 없습니다.</span>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex items-center gap-3">
              {m.student?.avatarUrl ? (
                <img src={m.student.avatarUrl} alt={m.student.name}
                  className="h-9 w-9 rounded-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="h-9 w-9 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-500 font-medium">
                  {m.student?.name?.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{m.student?.name}</p>
                <p className="text-xs text-gray-400 truncate">{m.student?.email}</p>
              </div>
              {isTeacher && (
                <IconButton
                  icon={History}
                  label="코칭 기록"
                  onClick={() => navigate(
                    `/teacher/classrooms/${classroomId}/students/${m.studentId}/coaching-history`,
                    { state: { studentName: m.student?.name } },
                  )}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

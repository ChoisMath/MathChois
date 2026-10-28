import { lazy, Suspense } from 'react';
import { Users } from 'lucide-react';
import StudentInvitesCard from './StudentInvitesCard';
import StudentsTable from './StudentsTable';

const ClassroomGroupSettings = lazy(() => import('../whiteboard/ClassroomGroupSettings'));

/* ─── 학생 탭: 사전 등록(교사) + 모둠 보드(교사) + 학생 표 ─── */
export default function StudentsTab({ classroomId, members, isTeacher, onMembersChanged }) {
  return (
    <div>
      {isTeacher && (
        <StudentInvitesCard classroomId={classroomId} onMembersChanged={onMembersChanged} />
      )}
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
        <StudentsTable classroomId={classroomId} members={members} isTeacher={isTeacher} />
      )}
    </div>
  );
}

import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import CoachingHistoryView from '../../components/coaching/CoachingHistoryView';
import { getStudentHistory } from '../../lib/coaching';

export default function StudentCoachingHistory() {
  const { classroomId, studentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const studentName = location.state?.studentName;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} aria-label="뒤로"
          className="min-h-11 min-w-11 flex items-center justify-center border rounded-md"><ArrowLeft size={18} /></button>
        <h1 className="text-xl font-bold whitespace-nowrap">{studentName ? `${studentName}님의 코칭 기록` : '학생 코칭 기록'}</h1>
      </div>
      <CoachingHistoryView
        fetchHistory={(p) => getStudentHistory(classroomId, studentId, p)}
        showTeacherNotes
      />
    </div>
  );
}

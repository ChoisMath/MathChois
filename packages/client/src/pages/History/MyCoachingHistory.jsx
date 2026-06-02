import CoachingHistoryView from '../../components/coaching/CoachingHistoryView';
import { getMyHistory } from '../../lib/coaching';

export default function MyCoachingHistory() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold whitespace-nowrap">내 풀이 기록</h1>
      <CoachingHistoryView fetchHistory={getMyHistory} />
    </div>
  );
}

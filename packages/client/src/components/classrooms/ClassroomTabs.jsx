import { CLASSROOM_TABS } from '../../lib/classroomTabs';

const BADGE = 'ml-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full leading-none';

/** 학급 상세 탭 막대. badges: { [tabKey]: 숫자 } — 0 이면 표시하지 않는다. */
export default function ClassroomTabs({ active, onSelect, isTeacher, badges = {} }) {
  return (
    <div className="flex border-b border-gray-200 mb-5 overflow-x-auto whitespace-nowrap">
      {CLASSROOM_TABS.filter((item) => isTeacher || !item.teacherOnly).map((item) => {
        const TabIcon = item.Icon;
        const badge = badges[item.key] ?? 0;
        return (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 min-h-11 shrink-0 text-sm font-medium -mb-px border-b-2 transition-colors cursor-pointer ${
              active === item.key
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <TabIcon className="h-4 w-4" />
            {item.label}
            {badge > 0 && (
              <span className={BADGE} title={item.key === 'videos' ? `새 댓글 ${badge}개` : undefined}>
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

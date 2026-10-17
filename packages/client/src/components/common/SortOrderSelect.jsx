import { ArrowUpDown } from 'lucide-react';
import { SORT_ORDERS } from '../../lib/sortOrder';

/**
 * 정렬 순서 선택(최신순 / 등록순 / 교사 지정순). 학급 상세 [챕터]·[영상] 탭 공용.
 */
export default function SortOrderSelect({ value, onChange, className = '' }) {
  return (
    <label className={`inline-flex items-center gap-1.5 text-sm text-gray-600 ${className}`}>
      <ArrowUpDown className="h-4 w-4 text-gray-400" aria-hidden="true" />
      <span className="sr-only">정렬</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="정렬 순서"
        className="min-h-9 px-2 py-1 border border-gray-300 rounded-md bg-white text-sm text-gray-700 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
      >
        {SORT_ORDERS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

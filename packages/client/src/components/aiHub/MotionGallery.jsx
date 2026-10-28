import { useSearchParams } from 'react-router-dom';
import { groupFilter } from '../../lib/aiHub/motionNav';
import FilterPicker from './FilterPicker';
import MotionCard from './MotionCard';
import './aiHubMotion.css';

export default function MotionGallery({ items }) {
  // URL 이 유일한 진실 공급원 — 상세에서 뒤로 와도 분류가 남는다.
  const [params, setParams] = useSearchParams();
  const { present, group, shown } = groupFilter(items, params.get('g'));
  const choose = (g) => setParams(g ? { g } : {}, { replace: true });
  const options = [null, ...present].map((g) => ({
    value: g,
    label: g ?? '전체',
    count: g ? items.filter((m) => m.group === g).length : items.length,
  }));
  return (
    <>
      <FilterPicker label="분류로 거르기" testId="motion-chips" value={group} onChange={choose} options={options} />
      <ul data-testid="motion-grid" className="ai-motion-grid">
        {shown.map((m) => (
          <li key={m.id}>
            <MotionCard item={m} />
          </li>
        ))}
      </ul>
    </>
  );
}

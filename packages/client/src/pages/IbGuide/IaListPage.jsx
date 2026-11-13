import { Link } from 'react-router-dom';
import { IA_DOCS } from '@mathchois/shared';
import { useIbGuideData } from '../../hooks/useIbGuideData';
import { IA_DOC_LABELS } from '../../lib/ibGuide/labels';

export default function IaListPage() {
  const { examples, status } = useIbGuideData();

  if (status !== 'ready') return <p className="ib-guide-empty" role="status">불러오는 중...</p>;
  if (examples.length === 0) return <p className="ib-guide-empty">아직 올라온 예시가 없어요</p>;

  return (
    <ul className="ib-guide-grid">
      {examples.map((ex) => (
        <li key={ex.id}>
          <Link to={`/ib/ia/${ex.id}`} className="ib-guide-card">
            <span className="ib-guide-card-no">예시 {ex.no}</span>
            {ex.title && <span className="ib-guide-card-title">{ex.title}</span>}
            {ex.note && <span className="ib-guide-card-note" title={ex.note}>{ex.note}</span>}
            <span className="ib-guide-badges">
              {IA_DOCS.filter((d) => ex.docs?.[d]).map((d) => (
                <span key={d} className="ib-guide-badge">{IA_DOC_LABELS[d]} {ex.docs[d].pages}쪽</span>
              ))}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

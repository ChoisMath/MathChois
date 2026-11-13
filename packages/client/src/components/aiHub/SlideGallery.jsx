import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SLIDE_FAMILIES } from '@mathchois/shared';
import { setHashId, useHashId } from '../../lib/aiHub/slideHash';
import { arrange, opensOutsideFilter, parseQuery, toSearch } from '../../lib/aiHub/slideOrder';
import FilterPicker from './FilterPicker';
import SlideCard from './SlideCard';
import SlideSortMenu from './SlideSortMenu';
import SlideViewer from './SlideViewer';
import './aiHubMotion.css';
import './aiHubSlide.css';

const VIEWS = [{ key: 'cover', label: '표지' }, { key: 'body', label: '본문' }];

/**
 * 슬라이드 갤러리 — 거르기·정렬·보기는 주소(?f= ?s= ?v=), 상세 창은 해시(#id)가 진실 공급원이다.
 * items: GET /api/ai/slide 의 항목(images·thumbs·coverCard·bodyCard·prompt 포함).
 */
export default function SlideGallery({ items }) {
  const present = SLIDE_FAMILIES.filter((f) => items.some((i) => i.family === f.key));
  const [params, setParams] = useSearchParams();
  const query = parseQuery(params, present.map((f) => f.key));
  const shown = arrange(items, query);
  const hashId = useHashId();
  // 상세 창 한 번(열기~닫기) 동안의 상태. 순서 범위는 열 때 한 번만 정해야 넘기다 거르기 안 스타일에 닿아도 전체 순서를 잃지 않는다.
  const [session, setSession] = useState(null);
  if (hashId && !session) setSession({ isAll: opensOutsideFilter(items, query, hashId), id: hashId, k: 0 });
  if (!hashId && session) setSession(null);

  const order = session?.isAll ? arrange(items, { ...query, family: null }) : shown;
  const styleIndex = order.findIndex((s) => s.id === hashId);
  const pos = styleIndex < 0 ? null : { style: styleIndex, slide: session?.id === hashId ? session.k : 0 };

  // 거르기·정렬·보기는 뒤로 가기 기록을 쌓지 않는다.
  const update = (patch) => {
    setParams(new URLSearchParams(toSearch({ ...query, ...patch }).slice(1)), { replace: true });
  };
  const open = (id, k = 0) => {
    setSession((prev) => ({ isAll: prev?.isAll ?? false, id, k }));
    setHashId(id);
  };
  const labelOf = (key) => SLIDE_FAMILIES.find((f) => f.key === key)?.label ?? key;
  const countOf = (key) => (key ? items.filter((i) => i.family === key).length : items.length);

  return (
    <div data-testid="slide-gallery">
      <div className="ai-slide-bar">
        <FilterPicker
          label="분류로 거르기"
          testId="slide-chips"
          value={query.family}
          onChange={(family) => update({ family })}
          options={[null, ...present].map((f) => ({ value: f?.key ?? null, label: f?.label ?? '전체', count: countOf(f?.key ?? null) }))}
        />
        <div className="ai-slide-tools">
          <SlideSortMenu value={query.sort} onChange={(sort) => update({ sort })} />
          <div role="group" aria-label="목록에 보여 줄 장" data-testid="slide-view" className="ai-slide-view">
            {VIEWS.map((v) => (
              <button key={v.key} type="button" aria-pressed={query.view === v.key} onClick={() => update({ view: v.key })} className="ai-slide-view-btn">
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p role="status" className="sr-only">{`${shown.length}개 스타일`}</p>
      <ol data-testid="slide-grid" className="ai-slide-grid">
        {shown.map((s) => (
          <li key={s.id}>
            <SlideCard item={s} view={query.view} familyLabel={labelOf(s.family)} onOpen={() => open(s.id)} />
          </li>
        ))}
      </ol>
      {pos ? (
        <SlideViewer
          list={order}
          pos={pos}
          onMove={(next) => {
            const id = order[next.style]?.id;
            if (id) open(id, next.slide);
          }}
          onClose={() => setHashId(null)}
          familyLabel={labelOf}
        />
      ) : null}
    </div>
  );
}

import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Sparkles } from 'lucide-react';
import { creditLine } from '@mathchois/shared';
import Navbar from '../../components/Navbar';
import { useAuth } from '../../contexts/AuthContext';
import { useAiHubData } from '../../hooks/useAiHubData';
import './AiHubLayout.css';

// 탭별 라벨·소개 — 소개 문장은 me.chois.pro 허브의 ai-tabs.ts intro.ko 와 같다.
const TABS = [
  {
    id: 'motion',
    label: '모션',
    href: '/ai/motion',
    intro: '기초 바이브코딩부터 에이전틱 AI까지 — HyperFrames 로 직접 만든 10초 인트로.',
  },
  {
    id: 'slide',
    label: '슬라이드',
    href: '/ai/slide',
    intro: 'NotebookLM·이미지 생성 AI로 수업 자료와 학교 행사 슬라이드를 만들 때 쓰는 스타일 프롬프트 모음입니다. 예시 슬라이드는 모두 학교 상황으로 새로 만들었습니다.',
  },
  {
    id: 'brand',
    label: '브랜드',
    href: '/ai/brand',
    intro: '브랜드 290곳의 디자인 시스템(색·글꼴·컴포넌트)을 웹페이지 예시와 함께 보고, AI에 줄 디자인 가이드를 복사할 수 있습니다.',
  },
];

/**
 * 화면을 가득 채우는 자식(브랜드 iframe)을 위해 두 CSS 변수를 .ai-hub 에 둔다.
 *   --ai-head-h  main 위쪽에 쌓인 높이 전부(Navbar(제목·탭 포함) + 소개 머리글)
 *   --ai-foot-h  푸터 높이
 * 머리글은 모바일에서 소개가 접히고 펼쳐지며 높이가 바뀌므로 ResizeObserver 로 따라간다.
 */
function useChromeHeights(rootRef, mainRef, footRef) {
  useEffect(() => {
    const root = rootRef.current;
    const main = mainRef.current;
    const foot = footRef.current;
    if (!root || !main || !foot) return undefined;
    const measure = () => {
      root.style.setProperty('--ai-head-h', `${Math.round(main.getBoundingClientRect().top + window.scrollY)}px`);
      root.style.setProperty('--ai-foot-h', `${Math.round(foot.offsetHeight)}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    Array.from(root.children).forEach((el) => { if (el !== main) ro.observe(el); });
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [rootRef, mainRef, footRef]);
}

export default function AiHubLayout() {
  const { profile } = useAuth();
  const { from } = useAiHubData();
  const { pathname } = useLocation();
  const [introOpen, setIntroOpen] = useState(false);
  const rootRef = useRef(null);
  const mainRef = useRef(null);
  const footRef = useRef(null);
  useChromeHeights(rootRef, mainRef, footRef);

  const tab = TABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`)) ?? TABS[0];
  const backTo = from ?? `/${profile?.role ?? 'student'}/classrooms`;

  return (
    <div className="ai-hub" ref={rootRef}>
      {/* 제목·탭 칩은 상단 바의 가운데 슬롯(로고와 같은 줄)에 — 머리글이 낮아져 본문이 넓어진다 */}
      <Navbar>
        <h1 className="ai-hub-title">
          <Sparkles aria-hidden="true" className="ai-hub-title-icon" />
          AI활용
        </h1>
        <div className="ai-hub-tabs" role="group" aria-label="AI활용 분류">
          {TABS.map((t) => (
            <NavLink key={t.id} to={t.href} className="ai-hub-tab">
              {t.label}
            </NavLink>
          ))}
        </div>
      </Navbar>

      {/* 머리글: 탭 소개 한 줄 + 같은 줄 오른쪽 끝의 [학급으로] */}
      <header className="ai-hub-head">
        <div className="ai-hub-head-inner">
          <div className="ai-hub-intro">
            <button
              type="button"
              className="ai-hub-intro-toggle"
              aria-expanded={introOpen}
              aria-controls="ai-hub-intro-text"
              onClick={() => setIntroOpen((v) => !v)}
            >
              {introOpen ? '소개 접기' : '소개 펼치기'}
              <ChevronDown aria-hidden="true" className={`h-4 w-4 ai-hub-chevron${introOpen ? ' is-open' : ''}`} />
            </button>
            <p id="ai-hub-intro-text" className={`ai-hub-intro-text${introOpen ? ' is-open' : ''}`}>
              {tab.intro}
            </p>
          </div>
          <Link to={backTo} className="ai-hub-back">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            학급으로
          </Link>
        </div>
      </header>

      {/* 화면(lazy)을 받는 동안에도 머리글·탭·푸터는 그대로 두고 이 자리만 로더로 바꾼다 */}
      <main ref={mainRef} className={`ai-hub-main${tab.id === 'brand' ? ' ai-hub-main--fill' : ''}`}>
        <Suspense fallback={<p className="ai-hub-loading" role="status">불러오는 중...</p>}>
          <Outlet />
        </Suspense>
      </main>

      <footer ref={footRef} className="ai-hub-foot">{creditLine(tab.id)}</footer>
    </div>
  );
}

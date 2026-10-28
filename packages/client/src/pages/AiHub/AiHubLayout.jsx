import { useState } from 'react';
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

export default function AiHubLayout() {
  const { profile } = useAuth();
  const { from } = useAiHubData();
  const { pathname } = useLocation();
  const [introOpen, setIntroOpen] = useState(false);

  const tab = TABS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`)) ?? TABS[0];
  const backTo = from ?? `/${profile?.role ?? 'student'}/classrooms`;

  return (
    <div className="ai-hub">
      <Navbar />
      <header className="ai-hub-head">
        <div className="ai-hub-head-inner">
          <div className="ai-hub-title-row">
            <h1 className="ai-hub-title">
              <Sparkles aria-hidden="true" className="ai-hub-title-icon" />
              AI활용
            </h1>
            <Link to={backTo} className="ai-hub-back">
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              학급으로
            </Link>
          </div>

          <nav className="ai-hub-tabs" aria-label="AI활용 분류">
            {TABS.map((t) => (
              <NavLink key={t.id} to={t.href} className="ai-hub-tab">
                {t.label}
              </NavLink>
            ))}
          </nav>

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
        </div>
      </header>

      <main className="ai-hub-main">
        <Outlet />
      </main>

      <footer className="ai-hub-foot">{creditLine(tab.id)}</footer>
    </div>
  );
}

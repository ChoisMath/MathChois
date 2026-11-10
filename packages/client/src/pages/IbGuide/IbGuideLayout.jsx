import { Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { ArrowLeft, GraduationCap } from 'lucide-react';
import Navbar from '../../components/Navbar';
import { useAuth } from '../../contexts/AuthContext';
import { useIbGuideData } from '../../hooks/useIbGuideData';
import './IbGuide.css';

/** /ib/* 틀 — 상단 바(제목·탭), 머리글(소개 + 학급으로), 본문. AI활용 허브와 같은 모양이다. */
export default function IbGuideLayout() {
  const { profile } = useAuth();
  const { from } = useIbGuideData();
  const backTo = from ?? `/${profile?.role ?? 'student'}/classrooms`;

  return (
    <div className="ib-guide">
      <Navbar>
        <h1 className="ib-guide-title">
          <GraduationCap aria-hidden="true" className="ib-guide-title-icon" />
          IB교육과정 안내
        </h1>
        <div className="ib-guide-tabs" role="group" aria-label="IB 안내 분류">
          <NavLink to="/ib/ia" className="ib-guide-tab">IA작성예시</NavLink>
        </div>
      </Navbar>

      <header className="ib-guide-head">
        <div className="ib-guide-head-inner">
          <p className="ib-guide-intro">
            IB 수학 내부평가(IA) 보고서 예시입니다. 학생 보고서, 채점자 주석본, 기준별 채점 코멘트를 함께 볼 수 있습니다.
          </p>
          <Link to={backTo} className="ib-guide-back">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            학급으로
          </Link>
        </div>
      </header>

      <main className="ib-guide-main">
        <Suspense fallback={<p className="ib-guide-loading" role="status">불러오는 중...</p>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}

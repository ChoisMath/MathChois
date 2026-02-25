import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const PrivacyPolicy = () => {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link to="/" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 mb-8 text-sm">
        <ArrowLeft className="w-4 h-4" />
        홈으로 돌아가기
      </Link>

      <h1 className="text-3xl font-bold text-gray-900 mb-2">개인정보처리방침</h1>
      <p className="text-sm text-gray-500 mb-8">시행일: 2026년 2월 26일</p>

      <div className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">1. 개인정보의 수집 항목 및 방법</h2>
          <p>ChoisClass(이하 "서비스")는 Google OAuth 2.0을 통한 로그인 시 다음 정보를 수집합니다.</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>필수 항목:</strong> 이름, 이메일 주소, Google 프로필 사진 URL</li>
            <li><strong>자동 수집 항목:</strong> 서비스 이용 기록(로그인 시각, 학습 활동 기록)</li>
          </ul>
          <p className="mt-2">서비스는 Google OAuth의 기본 범위(email, profile, openid)만 요청하며, Google 드라이브·연락처 등 민감한 데이터에는 접근하지 않습니다.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">2. 개인정보의 수집 및 이용 목적</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>회원 식별 및 로그인 인증</li>
            <li>교사·학생 역할 구분 및 클래스룸 운영</li>
            <li>학습자료 제공 및 필기 데이터 저장</li>
            <li>서비스 개선 및 오류 대응</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">3. 개인정보의 보유 및 이용 기간</h2>
          <p>회원 탈퇴 시 또는 수집 목적 달성 시 지체 없이 파기합니다. 단, 관련 법령에 의해 보존이 필요한 경우 해당 기간 동안 보관합니다.</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>서비스 이용 기록: 회원 탈퇴 시까지</li>
            <li>학습 필기 데이터: 회원 탈퇴 시까지</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">4. 개인정보의 제3자 제공</h2>
          <p>서비스는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 단, 다음의 경우는 예외입니다.</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>이용자가 사전에 동의한 경우</li>
            <li>법률에 특별한 규정이 있는 경우</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">5. 개인정보의 처리 위탁</h2>
          <p>서비스는 원활한 운영을 위해 다음과 같이 개인정보 처리를 위탁합니다.</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>Railway (호스팅):</strong> 서버 및 데이터베이스 운영</li>
            <li><strong>Google (인증):</strong> OAuth 2.0 로그인 처리</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">6. 이용자의 권리</h2>
          <p>이용자는 언제든지 다음의 권리를 행사할 수 있습니다.</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>개인정보 열람, 정정, 삭제 요청</li>
            <li>개인정보 처리 정지 요청</li>
            <li>회원 탈퇴 요청</li>
          </ul>
          <p className="mt-2">위 권리 행사는 아래 연락처를 통해 요청하실 수 있습니다.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">7. 개인정보의 안전성 확보 조치</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>비밀번호를 직접 저장하지 않으며, Google OAuth 토큰 기반 인증을 사용합니다.</li>
            <li>모든 통신은 HTTPS(TLS)를 통해 암호화됩니다.</li>
            <li>JWT(JSON Web Token) 기반 세션 관리로 서버 측 세션 탈취 위험을 최소화합니다.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">8. 쿠키 사용</h2>
          <p>서비스는 인증 토큰 저장 목적으로 브라우저 로컬 스토리지를 사용하며, 별도의 추적용 쿠키(제3자 쿠키)는 사용하지 않습니다.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">9. 개인정보 보호책임자</h2>
          <ul className="list-none space-y-1">
            <li><strong>담당자:</strong> ChoisClass 운영팀</li>
            <li><strong>이메일:</strong> complete860127@gmail.com</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">10. 방침 변경</h2>
          <p>본 개인정보처리방침이 변경될 경우, 서비스 내 공지를 통해 안내합니다.</p>
        </section>
      </div>
    </div>
  );
};

export default PrivacyPolicy;

import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const TermsOfService = () => {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link to="/" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 mb-8 text-sm">
        <ArrowLeft className="w-4 h-4" />
        홈으로 돌아가기
      </Link>

      <h1 className="text-3xl font-bold text-gray-900 mb-2">서비스 이용약관</h1>
      <p className="text-sm text-gray-500 mb-8">시행일: 2026년 2월 26일</p>

      <div className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">제1조 (목적)</h2>
          <p>본 약관은 ClassChois(이하 "서비스")의 이용과 관련하여 서비스 운영자와 이용자 간의 권리, 의무 및 책임 사항을 규정함을 목적으로 합니다.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">제2조 (서비스의 내용)</h2>
          <p>서비스는 교사와 학생을 위한 수학 학습 플랫폼으로, 다음 기능을 제공합니다.</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>교사: 클래스룸 생성·관리, 학습자료(챕터·페이지) 업로드, 학생 필기 모니터링, 게시판·과제 관리</li>
            <li>학생: 클래스룸 참여, 학습자료 열람, 필기(Excalidraw 기반) 작성 및 저장, 과제 제출</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">제3조 (회원 가입 및 계정)</h2>
          <ol className="list-decimal pl-6 space-y-1">
            <li>서비스는 Google OAuth 2.0을 통한 로그인만 지원합니다.</li>
            <li>최초 로그인 시 교사 또는 학생 역할을 선택해야 하며, 선택한 역할은 서비스 이용의 기본 구분이 됩니다.</li>
            <li>이용자는 하나의 Google 계정으로 하나의 서비스 계정만 생성할 수 있습니다.</li>
            <li>타인의 계정을 도용하거나 부정하게 사용하는 행위는 금지됩니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">제4조 (이용자의 의무)</h2>
          <p>이용자는 다음 행위를 하여서는 안 됩니다.</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>서비스의 안정적 운영을 방해하는 행위</li>
            <li>다른 이용자의 개인정보를 수집하거나 부정하게 이용하는 행위</li>
            <li>저작권 등 타인의 지식재산권을 침해하는 콘텐츠 업로드</li>
            <li>불법적이거나 부적절한 콘텐츠 게시</li>
            <li>서비스를 학습 목적 외의 상업적 용도로 사용하는 행위</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">제5조 (서비스의 제공 및 변경)</h2>
          <ol className="list-decimal pl-6 space-y-1">
            <li>서비스는 교육 목적으로 무료 제공됩니다.</li>
            <li>운영자는 서비스의 내용을 변경하거나 중단할 수 있으며, 이 경우 사전에 공지합니다.</li>
            <li>서비스는 시스템 점검, 장비 교체 등의 사유로 일시 중단될 수 있습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">제6조 (콘텐츠의 권리)</h2>
          <ol className="list-decimal pl-6 space-y-1">
            <li>교사가 업로드한 학습자료의 저작권은 해당 교사에게 있습니다.</li>
            <li>학생이 작성한 필기 데이터의 권리는 해당 학생에게 있습니다.</li>
            <li>운영자는 서비스 운영 목적으로만 콘텐츠를 저장·전송하며, 이를 외부에 공개하거나 상업적으로 이용하지 않습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">제7조 (면책 조항)</h2>
          <ol className="list-decimal pl-6 space-y-1">
            <li>운영자는 천재지변, 시스템 장애 등 불가항력으로 인한 서비스 중단에 대해 책임지지 않습니다.</li>
            <li>운영자는 이용자가 서비스를 통해 기대하는 학습 효과를 보장하지 않습니다.</li>
            <li>이용자 간의 분쟁에 대해 운영자는 개입하지 않으며 책임지지 않습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">제8조 (회원 탈퇴 및 이용 제한)</h2>
          <ol className="list-decimal pl-6 space-y-1">
            <li>이용자는 언제든지 회원 탈퇴를 요청할 수 있으며, 운영자는 지체 없이 처리합니다.</li>
            <li>운영자는 본 약관을 위반한 이용자의 서비스 이용을 제한하거나 계정을 삭제할 수 있습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">제9조 (약관의 변경)</h2>
          <p>본 약관이 변경될 경우, 서비스 내 공지를 통해 변경 사항을 안내합니다. 변경된 약관에 동의하지 않는 이용자는 회원 탈퇴를 요청할 수 있습니다.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">제10조 (연락처)</h2>
          <p>서비스 이용에 관한 문의는 아래로 연락해 주시기 바랍니다.</p>
          <ul className="list-none mt-2 space-y-1">
            <li><strong>서비스명:</strong> ClassChois</li>
            <li><strong>이메일:</strong> complete860127@gmail.com</li>
          </ul>
        </section>
      </div>
    </div>
  );
};

export default TermsOfService;

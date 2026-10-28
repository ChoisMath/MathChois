import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, History, RotateCcw } from 'lucide-react';
import IconButton from '../common/IconButton';
import { formatYmd } from '../../lib/formatDate';
import { resetStudentClassroomQuota } from '../../lib/coaching';

const FOLD_KEY = 'students-table:collapsed';
const readCollapsed = () => { try { return localStorage.getItem(FOLD_KEY) === '1'; } catch { return false; } };
const writeCollapsed = (v) => { try { localStorage.setItem(FOLD_KEY, v ? '1' : '0'); } catch { /* 저장 못 해도 동작엔 지장 없음 */ } };

function Avatar({ student }) {
  if (student?.avatarUrl) {
    return <img src={student.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />;
  }
  return (
    <span className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-[11px] text-gray-500 font-medium shrink-0" aria-hidden="true">
      {student?.name?.charAt(0)}
    </span>
  );
}

/**
 * 학생 표 — 접었다 펼 수 있다. 교사에게는 행 끝에 코칭 기록·AI 풀이 초기화 버튼.
 * 초기화는 이 학급 모든 페이지의 AI 풀이 횟수를 리셋한다(기록은 보존).
 */
export default function StudentsTable({ classroomId, members, isTeacher }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null); // { studentId, kind: 'ok'|'error', text }

  const toggle = () => setCollapsed((v) => { writeCollapsed(!v); return !v; });

  const handleReset = async (m) => {
    const name = m.student?.name ?? '이';
    if (!window.confirm(`${name} 학생의 이 학급 AI 풀이 횟수를 모두 초기화할까요? 풀이 기록은 지워지지 않습니다.`)) return;
    setBusyId(m.studentId);
    setNotice(null);
    try {
      const r = await resetStudentClassroomQuota(classroomId, m.studentId);
      setNotice({ studentId: m.studentId, kind: 'ok', text: `초기화됨 · 페이지 ${r?.resetPages ?? 0}개` });
      setTimeout(() => setNotice((n) => (n?.studentId === m.studentId && n.kind === 'ok' ? null : n)), 5000);
    } catch (err) {
      setNotice({ studentId: m.studentId, kind: 'error', text: err.message ?? '초기화하지 못했습니다. 다시 시도해 주세요.' });
    }
    setBusyId(null);
  };

  const cols = isTeacher ? 5 : 2;

  return (
    <section aria-label="학생 목록">
      <button type="button" className="fold-head" aria-expanded={!collapsed} aria-controls="students-table" onClick={toggle}>
        <ChevronDown className="h-4 w-4 chev" aria-hidden="true" />
        <span>학생 {members.length}명</span>
      </button>
      {!collapsed && (
        <div className="ledger-wrap" id="students-table">
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">이름</th>
                <th scope="col" className="hidden sm:table-cell">아이디</th>
                {isTeacher && <th scope="col" className="tight">참여일</th>}
                {isTeacher && <th scope="col" className="act"><span className="sr-only">코칭 기록</span></th>}
                {isTeacher && <th scope="col" className="act">초기화</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const n = notice?.studentId === m.studentId ? notice : null;
                return [
                  <tr key={m.id}>
                    <td>
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar student={m.student} />
                        <div className="min-w-0">
                          <div className="font-medium truncate">{m.student?.name}</div>
                          <div className="sm:hidden text-xs text-gray-500 truncate">{m.student?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell text-gray-600 truncate max-w-64">{m.student?.email}</td>
                    {isTeacher && <td className="tight num"><time dateTime={m.joinedAt}>{formatYmd(m.joinedAt)}</time></td>}
                    {isTeacher && (
                      <td className="act">
                        <IconButton
                          icon={History} label="코칭 기록" size="sm"
                          onClick={() => navigate(
                            `/teacher/classrooms/${classroomId}/students/${m.studentId}/coaching-history`,
                            { state: { studentName: m.student?.name } },
                          )}
                        />
                      </td>
                    )}
                    {isTeacher && (
                      <td className="act">
                        <IconButton
                          icon={RotateCcw} label={`${m.student?.name ?? ''} AI 풀이 초기화`} variant="danger" size="sm"
                          busy={busyId === m.studentId} busyLabel="초기화 중..."
                          onClick={() => handleReset(m)}
                        />
                      </td>
                    )}
                  </tr>,
                  n && (
                    <tr key={`${m.id}-notice`} className="ledger-detail">
                      <td colSpan={cols} className={`text-sm ${n.kind === 'error' ? 'text-red-700' : 'text-emerald-700'}`} role="status">
                        {n.text}
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

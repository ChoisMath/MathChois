import { useCallback, useEffect, useState } from 'react';
import { UserPlus, X, MailCheck } from 'lucide-react';
import { parseEmailList, EMAIL_LIST_MAX } from '@mathchois/shared';
import { api } from '../../lib/api';
import { summarizeInviteResult } from '../../lib/invites';
import IconButton from '../common/IconButton';

/**
 * 학생 사전 등록(교사 전용). 이메일을 미리 올려 두면 그 학생은 가입하는 순간 코드 없이 이 학급에 들어온다.
 * 이미 가입한 학생은 바로 구성원이 된다.
 */
export default function StudentInvitesCard({ classroomId, onMembersChanged }) {
  const [invites, setInvites] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const rows = await api.get(`/api/classrooms/${classroomId}/invites`);
      setInvites(rows || []);
    } catch {
      // 목록 실패는 조용히 — 등록은 그대로 시도할 수 있다
    }
  }, [classroomId]);

  useEffect(() => { load(); }, [load]);

  const parsed = parseEmailList(text);
  const canSubmit = parsed.valid.length > 0 && !parsed.tooMany && !busy;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.post(`/api/classrooms/${classroomId}/invites`, { emails: parsed.valid });
      setMessage(summarizeInviteResult({ ...result, invalid: parsed.invalid }));
      setText('');
      await load();
      if (result.joined?.length && onMembersChanged) await onMembersChanged();
    } catch (err) {
      setError(err.message || '등록에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (invite) => {
    setRemoving(invite.id);
    setError('');
    try {
      await api.delete(`/api/classrooms/${classroomId}/invites/${invite.id}`);
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
    } catch (err) {
      setError(err.message || '삭제에 실패했습니다.');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4" aria-labelledby="student-invites-title">
      <div className="flex items-start gap-3 mb-3">
        <div className="p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0"><UserPlus className="h-5 w-5" aria-hidden="true" /></div>
        <div className="min-w-0">
          <h3 id="student-invites-title" className="text-sm font-semibold text-gray-900">학생 사전 등록</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            학생의 Google 계정(이메일)을 미리 올려 두면, 그 학생은 가입하는 순간 참여 코드 없이 이 학급에 들어옵니다.
            이미 가입한 학생은 바로 참여합니다.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <label htmlFor="student-invite-emails" className="sr-only">학생 이메일 목록</label>
        <textarea
          id="student-invite-emails"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder={'student1@gmail.com, student2@gmail.com\n줄바꿈·쉼표·공백으로 여러 명을 한 번에'}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
        />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-gray-500">
            {parsed.valid.length > 0 && `${parsed.valid.length}명`}
            {parsed.invalid.length > 0 && (
              <span className="text-amber-600"> · 형식 오류 {parsed.invalid.length}개: {parsed.invalid.slice(0, 3).join(', ')}{parsed.invalid.length > 3 ? ' …' : ''}</span>
            )}
            {parsed.tooMany && <span className="text-red-600"> · 한 번에 {EMAIL_LIST_MAX}명까지</span>}
          </p>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer transition-colors"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {busy ? '등록 중...' : '등록'}
          </button>
        </div>
        {message && <p className="text-sm text-green-700" role="status">{message}</p>}
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      </form>

      {invites.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
            <MailCheck className="h-3.5 w-3.5" aria-hidden="true" /> 가입 대기 {invites.length}명
          </h4>
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <span className="text-sm text-gray-800 truncate">{inv.email}</span>
                <IconButton
                  icon={X}
                  label={`${inv.email} 대기 명단에서 삭제`}
                  variant="danger"
                  size="sm"
                  busy={removing === inv.id}
                  busyLabel="삭제 중"
                  onClick={() => handleRemove(inv)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, UserPlus, Trash2, Mail } from 'lucide-react';
import { parseEmailList, EMAIL_LIST_MAX } from '@mathchois/shared';
import { api } from '../../lib/api';
import { summarizeAllowedTeachersResult } from '../../lib/invites';
import { useAuth } from '../../contexts/AuthContext';
import IconButton from '../common/IconButton';

/**
 * 관리자 패널 [교사 등록] — 여기 등록된 이메일만 교사로 로그인할 수 있다.
 * 목록에서 빼면 그 계정은 다음 로그인/토큰 갱신(최대 15분) 때 학생이 된다.
 */
export default function AllowedTeachersTab() {
  const { profile: me } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/admin/allowed-teachers');
      setRows(data || []);
    } catch (err) {
      setError(err.message || '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

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
      const result = await api.post('/api/admin/allowed-teachers', { emails: parsed.valid });
      setMessage(summarizeAllowedTeachersResult({ ...result, invalid: parsed.invalid }));
      setText('');
      await load();
    } catch (err) {
      setError(err.message || '등록에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (row) => {
    const who = row.profile?.name ? `${row.profile.name} (${row.email})` : row.email;
    if (!confirm(`${who} 을(를) 교사 목록에서 뺄까요?\n이 계정은 다음 로그인부터 학생으로 들어옵니다. 만든 학급과 자료는 남습니다.`)) return;
    setRemoving(row.id);
    setError('');
    try {
      await api.delete(`/api/admin/allowed-teachers/${row.id}`);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      setError(err.message || '삭제에 실패했습니다.');
    } finally {
      setRemoving(null);
    }
  };

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.email.includes(q) || r.profile?.name?.toLowerCase().includes(q);
  });
  const signedUp = rows.filter((r) => r.profile).length;

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4" aria-labelledby="allowed-teachers-add">
        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 rounded-lg bg-amber-50 text-amber-600 shrink-0"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></div>
          <div>
            <h2 id="allowed-teachers-add" className="text-sm font-semibold text-gray-900">교사 이메일 등록</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              여기 등록된 Google 계정(이메일)만 교사로 로그인할 수 있습니다. 그 외 모든 계정은 학생으로 들어옵니다.
              이미 가입한 계정을 등록하면 바로 교사가 됩니다.
            </p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-2">
          <label htmlFor="allowed-teacher-emails" className="sr-only">교사 이메일 목록</label>
          <textarea
            id="allowed-teacher-emails"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={'teacher1@gmail.com, teacher2@school.kr\n줄바꿈·쉼표·공백으로 여러 명을 한 번에'}
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
              {busy ? '등록 중...' : '교사로 등록'}
            </button>
          </div>
          {message && <p className="text-sm text-green-700" role="status">{message}</p>}
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        </form>
      </section>

      <section aria-labelledby="allowed-teachers-list">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 id="allowed-teachers-list" className="text-sm font-semibold text-gray-900">
            등록된 교사 {rows.length}명 <span className="text-gray-400 font-normal">· 가입 완료 {signedUp}명</span>
          </h2>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이메일·이름 검색"
            aria-label="등록된 교사 검색"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-56 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {loading ? (
          <p className="text-gray-500 py-8 text-center">로딩 중...</p>
        ) : filtered.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 rounded-xl h-32 flex items-center justify-center text-gray-400 text-sm">
            {rows.length === 0 ? '등록된 교사가 없습니다. 위에서 이메일을 등록하세요.' : '검색 결과가 없습니다.'}
          </div>
        ) : (
          <ul className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
            {filtered.map((r) => {
              const isMe = me?.email && me.email.toLowerCase() === r.email;
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  {r.profile?.avatarUrl ? (
                    <img src={r.profile.avatarUrl} alt="" className="h-8 w-8 rounded-full shrink-0" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <Mail className="h-4 w-4 text-gray-400" aria-hidden="true" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">
                      {r.profile?.name ? <><span className="font-medium">{r.profile.name}</span> <span className="text-gray-500">{r.email}</span></> : r.email}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {r.profile
                        ? `가입 완료 · ${r.profile.role === 'teacher' ? '교사' : '학생(다음 로그인에 교사)'}${r.profile.isAdmin ? ' · 관리자' : ''}`
                        : '아직 가입하지 않음'}
                      {r.note ? ` · ${r.note}` : ''}
                    </p>
                  </div>
                  <IconButton
                    icon={Trash2}
                    label={isMe ? '자기 자신은 뺄 수 없음' : `${r.email} 교사 목록에서 삭제`}
                    variant="danger"
                    size="sm"
                    disabled={isMe}
                    busy={removing === r.id}
                    busyLabel="삭제 중"
                    onClick={() => handleRemove(r)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

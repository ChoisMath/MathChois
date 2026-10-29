import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Volume2, VolumeX, X } from 'lucide-react';
import { DEF } from '@mathchois/shared';
import IconButton from '../../components/common/IconButton';
import PromptPane from '../../components/aiHub/editor/PromptPane';
import RowsTable from '../../components/aiHub/editor/RowsTable';
import OriginalEditor from '../../components/aiHub/editor/OriginalEditor';
import EditedNote from '../../components/aiHub/editor/EditedNote';
import { useAiHubData } from '../../hooks/useAiHubData';
import { neighbors } from '../../lib/aiHub/motionNav';
import { loadStore, saveStore } from '../../lib/aiHub/editorStore';
import './MotionEditorPage.css';

const TABS = [['prompt', '프롬프트'], ['shots', '장면표'], ['cues', '소리 큐']];
const DISCARD_CONFIRM = '저장하지 않은 원본 편집 내용이 있어요. 버리고 나갈까요?';

const storage = () => {
  try { return window.localStorage; } catch { return null; }
};

/** 키를 편집기가 가로채면 안 되는 자리(입력 중) */
const typing = (t) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement
  || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);

/**
 * 모션 프롬프트 편집기 `/ai/motion/:id/edit` — 오빠두 상세 창(#msl-d) 구성. 전체 화면(어두운 바탕), 허브 레이아웃 밖.
 * 머리(닫기·이전/다음·n / N·분류 › 이름·소리·원본 편집, 관리자에게는 그 밑에 웹에서 고친 원본 띠) / 왼쪽 영상·정보 /
 * 오른쪽 탭(프롬프트·장면표·소리 큐) 또는 원본 편집.
 * 교사·관리자만 — 학생은 상세로 돌려보낸다(열람 API 는 학생도 되므로 이 검사가 없으면 편집기가 그대로 열린다).
 */
export default function MotionEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { access, motion, status, reload } = useAiHubData();
  const [store, setStore] = useState(() => loadStore(storage()));
  const [tab, setTab] = useState('prompt');
  const [editing, setEditing] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false); // 원본 편집에 저장하지 않은 글이 있나
  const video = useRef(null);
  const tabRefs = useRef({});

  const update = useCallback((next) => {
    setStore(next);
    saveStore(storage(), next);
  }, []);

  const hit = access?.canEdit ? neighbors(motion, id) : null;
  const item = hit?.item ?? null;
  const prevHref = hit?.prev ? `/ai/motion/${hit.prev.id}/edit` : null;
  const nextHref = hit?.next ? `/ai/motion/${hit.next.id}/edit` : null;
  const closeHref = `/ai/motion/${id}`;

  // 소리 토글 → 영상 muted. 영상 자체 컨트롤로 소리를 켜고 끄면 onVolumeChange 가 토글을 되돌린다
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.muted = !store.sound;
    // 소리를 켠 채 다른 편으로 오면 자동재생이 막힐 수 있다 — 막히면 멈춘 채로 두고(사용자가 재생) 설정은 그대로
    if (!v.muted && v.paused) v.play().catch(() => {});
  }, [store.sound, item?.video]);
  const setSound = (on) => {
    update({ ...store, sound: on });
    const v = video.current;
    if (v && on && v.paused) v.play().catch(() => {});
  };

  // 원본 편집 초안이 남아 있으면 탭 닫기·새로 고침도 한 번 묻는다
  const guarding = editing && draftDirty;
  useEffect(() => {
    if (!guarding) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [guarding]);

  useEffect(() => {
    const onKey = (e) => {
      if (editing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || typing(e.target)) return;
      const onVideo = e.target instanceof HTMLVideoElement;
      if (e.key === 'Escape') navigate(closeHref);
      else if (e.key === 'ArrowLeft' && prevHref && !onVideo) navigate(prevHref, { replace: true });
      else if (e.key === 'ArrowRight' && nextHref && !onVideo) navigate(nextHref, { replace: true });
      else if (e.key === '1' || e.key === '2' || e.key === '3') setTab(TABS[Number(e.key) - 1][0]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, navigate, closeHref, prevHref, nextHref]);

  if (!access?.canEdit) return <Navigate to={`/ai/motion/${id}`} replace />;
  // 저장 뒤 reload() 동안에도 보던 편은 그대로 둔다(원본 편집 창이 사라지지 않게)
  if (!item) {
    return (
      <div className="ai-ed ai-ed--center">
        {status !== 'ready' ? (
          <p role="status">불러오는 중...</p>
        ) : (
          <div data-testid="motion-missing">
            <p>찾을 수 없는 예시예요</p>
            <p><Link to="/ai/motion" className="ai-btn">모션 목록으로</Link></p>
          </div>
        )}
      </div>
    );
  }

  const no = String(item.no).padStart(2, '0');
  const prompt = item.prompt;

  // 탭 줄 안의 ←/→ 는 탭 이동(창 전체의 이전/다음 스타일로 가지 않게 여기서 멈춘다)
  const onTabKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    e.stopPropagation();
    const i = TABS.findIndex(([k]) => k === tab);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[n][0]);
    tabRefs.current[TABS[n][0]]?.focus();
  };

  /* 원본 편집 초안을 버리는 동작(닫기·이전/다음·편집 끄기) 앞에서 묻는다. 저장한 그대로면 묻지 않는다.
     App 이 데이터 라우터(createBrowserRouter)가 아니라 useBlocker 를 못 쓰므로 머리 단추에서 직접 막는다. */
  const okToLeave = () => !guarding || window.confirm(DISCARD_CONFIRM);
  const guardLink = (e) => { if (!okToLeave()) e.preventDefault(); };
  const toggleEditing = () => {
    if (editing && !okToLeave()) return;
    if (editing) setDraftDirty(false);
    setEditing(!editing);
  };

  const noPrompt = (
    <p role="alert" className="ai-alert">프롬프트 데이터가 없습니다 — <code>npm run ai:push</code> 를 실행하세요</p>
  );

  return (
    <section className="ai-ed" aria-label={`${no} ${item.name} 프롬프트 편집`}>
      <header className="ai-ed-top">
        <IconButton icon={X} label="닫기" as={Link} to={closeHref} onClick={guardLink} />
        <IconButton icon={ChevronLeft} label="이전 스타일" as={Link} to={prevHref ?? '#'} replace disabled={!prevHref} onClick={guardLink} />
        <IconButton icon={ChevronRight} label="다음 스타일" as={Link} to={nextHref ?? '#'} replace disabled={!nextHref} onClick={guardLink} />
        <span className="ai-ed-pos" data-testid="editor-pos">{hit.index + 1} / {motion.length}</span>
        <h1 className="ai-ed-crumb"><span>{item.group}</span><span aria-hidden="true"> › </span><b>{item.name}</b></h1>
        {item.video ? (
          <button type="button" className={`ai-btn ai-snd${store.sound ? ' is-on' : ''}`} aria-pressed={store.sound} onClick={() => setSound(!store.sound)}>
            {store.sound ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
            {/* 이름은 늘 「소리 켜기」 — 켜짐/꺼짐은 aria-pressed 가 말한다(이름까지 바꾸면 「소리 끄기, 눌림」으로 읽힌다) */}
            <span className="ai-snd-l">소리 켜기</span>
          </button>
        ) : null}
        {access.canEditOriginal ? (
          <button
            type="button"
            role="switch"
            aria-checked={editing}
            className={`ai-switch${editing ? ' is-on' : ''}`}
            data-testid="original-switch"
            onClick={toggleEditing}
          >
            <span className="ai-switch-track" aria-hidden="true"><span className="ai-switch-thumb" /></span>
            원본 편집
          </button>
        ) : null}
      </header>
      {/* 웹에서 고친 오빠두 원본 — 원본 편집을 켜지 않아도 머리 밑에 보인다(관리자) */}
      {access.canEditOriginal && item.source === 'oppadu' && prompt?.editedAt ? <EditedNote id={item.id} reload={reload} /> : null}

      <div className="ai-ed-body">
        <div className="ai-ed-main">
          <div className="ai-ed-vid">
            {item.video ? (
              <video
                ref={video}
                key={item.video}
                src={item.video}
                poster={item.poster ?? undefined}
                muted
                autoPlay
                loop
                playsInline
                controls
                data-testid="editor-video"
                onVolumeChange={(e) => { if (e.currentTarget.muted === store.sound) update({ ...store, sound: !e.currentTarget.muted }); }}
              />
            ) : (
              <p className="ai-ed-pending">아직 렌더하지 않은 스타일입니다</p>
            )}
          </div>
          <div className="ai-ed-info">
            <p className="ai-ed-meta">
              <b>{no}</b>
              <span>{item.kindLabel ? `${item.kindLabel} · ${item.group}` : item.group}</span>
            </p>
            <h2 className="ai-ed-title">{item.name}</h2>
            <p className="ai-ed-en" lang="en">{item.en}</p>
            <dl className="ai-ed-facts">
              <div><dt>쓰임</dt><dd>{item.use}</dd></div>
              <div><dt>컨셉</dt><dd>{item.concept}</dd></div>
            </dl>
          </div>
        </div>

        <div className="ai-ed-side">
          {editing ? (
            <OriginalEditor key={item.id} id={item.id} prompt={prompt} reload={reload} onDirtyChange={setDraftDirty} />
          ) : (
            <>
              <div className="ai-tabs" role="tablist" aria-label="보기" onKeyDown={onTabKey}>
                {TABS.map(([k, name]) => (
                  <button
                    key={k}
                    ref={(el) => { tabRefs.current[k] = el; }}
                    type="button"
                    role="tab"
                    id={`ai-t-${k}`}
                    aria-selected={tab === k}
                    aria-controls={tab === k ? `ai-p-${k}` : undefined}
                    tabIndex={tab === k ? 0 : -1}
                    className="ai-tab"
                    onClick={() => setTab(k)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="ai-ptab" id={`ai-p-${tab}`} role="tabpanel" aria-labelledby={`ai-t-${tab}`}>
                {!prompt ? noPrompt
                  : tab === 'prompt' ? <PromptPane key={item.id} item={item} prompt={prompt} store={store} update={update} />
                  : tab === 'shots' ? (
                    <RowsTable testId="shots-table" rows={prompt.shots} head={['시간(초)', '장면', '왜 이렇게']} note={`${prompt.shots.length}개 장면 · ${item.secs ?? DEF.len}초`} />
                  ) : (
                    <RowsTable testId="cues-table" rows={prompt.cues} head={['시각(초)', '소리', '화면 이벤트']} note={`${prompt.cues.length}개 큐`} />
                  )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

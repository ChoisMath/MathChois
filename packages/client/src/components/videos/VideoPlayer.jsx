import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Settings, Maximize, Minimize, SkipBack, SkipForward, Check, Sun,
  Captions, CaptionsOff,
} from 'lucide-react';
import {
  SEEK_STEPS, PLAYBACK_RATES, VOLUME_STEP,
  BRIGHTNESS_MIN, BRIGHTNESS_MAX, BRIGHTNESS_DEFAULT,
  loadSettings, saveSettings, stepRate, formatRate, formatTime, clamp,
  loadResumePosition, saveResumePosition, isTypingTarget,
  decideGestureAxis, verticalGestureKind, dragToLevel, SUBTITLE_SIZES,
  pickFullscreenMethod, isIphoneUserAgent, fullscreenElementOf, DRAG_START_PX,
} from '../../lib/videoPlayer';
import useVideoSubtitles from '../../hooks/useVideoSubtitles';
import SubtitleOverlay from './SubtitleOverlay';

const SUBTITLE_SIZE_LABELS = { sm: '작게', md: '보통', lg: '크게' };

/** onProgress 최소 호출 간격(ms) — 서버 분당 요청 제한 보호 */
const PROGRESS_REPORT_INTERVAL_MS = 10000;

/**
 * 자체 영상 플레이어 (native <video> + 커스텀 컨트롤).
 *
 * props
 * - src, poster, title
 * - storageKey: 이어보기 위치 저장 키(없으면 저장 안 함)
 * - autoPlay
 * - hotkeys: window 키보드 단축키 활성(기본 true). 입력창 포커스 중엔 자동 무시.
 * - initialPosition: 서버 시청 기록 등에서 온 이어보기 위치(초). > 0 이면 localStorage 위치보다 우선.
 * - onProgress(positionSec, durationSec, { keepalive }): 시청 위치 보고 — 재생 중 최대 10초마다 + 일시정지/종료/언마운트 시,
 *   그리고 탭 숨김·페이지 이탈(visibilitychange/pagehide) 시 `keepalive: true` 로(요청이 이탈 중에도 완료되도록).
 * - fill: true 면 16:9 고정 대신 부모를 꽉 채운다(영상 2분할 패널처럼 세로로 긴 영역). 영상은 object-contain.
 * - fullscreenTargetRef: 전체화면으로 올릴 요소(기본은 플레이어 자신). 2분할 화면은 분할 루트를 넘겨
 *   "영상은 반쪽을 채우고 나머지 반쪽은 필기창" 전체화면을 만든다.
 * - onPseudoFullscreenChange(bool): 외부 대상인데 Fullscreen API 가 없는 환경(iPhone Safari)에서
 *   호출측이 CSS 로 전체화면을 흉내 내도록 알린다. 외부 대상이 없으면 플레이어가 스스로 창을 채운다(fixed inset-0).
 * - ref: { getCurrentTime(), seekTo(sec), pause(), toggleFullscreen(), exitPseudoFullscreen() }
 *
 * 전체화면 방식(lib/videoPlayer.js `pickFullscreenMethod`): 요소 전체화면 API(표준·webkit 접두사) → CSS 폴백 →
 * iPhone 만 기본 플레이어(webkitEnterFullscreen). iPad 는 API 가 없어도 기본 플레이어로 넘기지 않는다 —
 * 그러면 아래 제스처가 전부 사라지기 때문.
 *
 * 단축키: ←/→ 설정된 초만큼 이동, ↑/↓ 볼륨, Space/K 재생·정지, M 음소거, F 전체화면,
 *        , / . 배속 내림/올림, 0~9 해당 % 위치, C 자막. ⚙ 설정: 이동 시간(10/20/30/60초)·배속(0.7~2.5×)·자막.
 * 자막: 영상자료 라이브러리 src 면 등록된 자막을 직접 조회해 오버레이로 그린다(useVideoSubtitles).
 * 제스처(터치·펜): 탭 재생·정지, 더블탭 좌/우 절반 = 뒤로/앞으로, 바로 드래그 —
 *        좌우 = 시간 이동(스크럽), 상하 = 화면 왼쪽 절반에서 밝기 / 오른쪽 절반에서 볼륨. 마우스는 클릭·더블클릭만.
 */
export default function VideoPlayer({
  src, poster, title, storageKey, autoPlay = false, hotkeys = true, initialPosition = 0, onProgress,
  fill = false, fullscreenTargetRef, onPseudoFullscreenChange, ref,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const flashTimerRef = useRef(null);
  const lastSaveRef = useRef(0);
  const lastReportRef = useRef(0);
  // 마지막으로 관측한 위치/길이. 언마운트 시 React 가 videoRef 를 먼저 떼어내므로(ref 는 null) 스냅샷으로 보고한다.
  const snapshotRef = useRef({ time: 0, duration: 0, touched: false });
  const onProgressRef = useRef(onProgress); // 이벤트 핸들러/언마운트 정리가 최신 콜백을 읽기 위한 미러
  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);

  const [settings, setSettings] = useState(() => loadSettings());
  const settingsRef = useRef(settings); // 키 핸들러가 최신 설정을 동기적으로 읽기 위한 미러
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false); // Fullscreen API 없는 환경의 CSS 폴백 상태
  const onPseudoFullscreenChangeRef = useRef(onPseudoFullscreenChange);
  useEffect(() => { onPseudoFullscreenChangeRef.current = onPseudoFullscreenChange; }, [onPseudoFullscreenChange]);
  /** 전체화면 대상 — 외부에서 지정하지 않으면 플레이어 컨테이너 */
  const fullscreenTarget = useCallback(() => fullscreenTargetRef?.current ?? containerRef.current, [fullscreenTargetRef]);
  const [flash, setFlash] = useState(null);
  const [error, setError] = useState('');

  /* ── 설정 적용/저장 ── */
  const updateSettings = useCallback((patch) => {
    const next = saveSettings({ ...settingsRef.current, ...patch });
    settingsRef.current = next;
    setSettings(next);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = settings.playbackRate;
    v.volume = settings.volume;
    v.muted = settings.muted;
  }, [settings]);

  /** 화면 밝기(CSS filter: brightness). 기기 밝기가 아니라 영상만 어둡게/밝게 — 이 플레이어 안에서만 유지(저장 안 함). */
  const [brightness, setBrightness] = useState(BRIGHTNESS_DEFAULT);
  const brightnessRef = useRef(brightness);
  useEffect(() => { brightnessRef.current = brightness; }, [brightness]);

  /* ── 자막 ── */
  const { tracks: subtitleTracks, track: subtitleTrack, cues: subtitleCues } = useVideoSubtitles(src, {
    enabled: settings.subtitlesOn, lang: settings.subtitleLang,
  });
  const hasSubs = subtitleTracks.length > 0;

  /* ── 화면 피드백 오버레이 ── */
  const showFlash = useCallback((text) => {
    setFlash(text);
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlash(null), 900);
  }, []);

  /* ── 컨트롤 자동 숨김 ── */
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setControlsVisible(false);
    }, 2500);
  }, []);

  useEffect(() => () => {
    clearTimeout(hideTimerRef.current);
    clearTimeout(flashTimerRef.current);
  }, []);

  /* ── 기본 조작 ── */
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      showFlash('▶');
    } else {
      v.pause();
      showFlash('❚❚');
    }
    revealControls();
  }, [revealControls, showFlash]);

  const seekBy = useCallback((delta) => {
    const v = videoRef.current;
    if (!v) return;
    const d = Number.isFinite(v.duration) ? v.duration : Infinity;
    v.currentTime = clamp(v.currentTime + delta, 0, d);
    setCurrentTime(v.currentTime);
    showFlash(`${delta > 0 ? '+' : '−'}${Math.abs(delta)}초`);
    revealControls();
  }, [revealControls, showFlash]);

  const seekTo = useCallback((sec) => {
    const v = videoRef.current;
    if (!v) return;
    const d = Number.isFinite(v.duration) ? v.duration : Infinity;
    v.currentTime = clamp(sec, 0, d);
    setCurrentTime(v.currentTime);
    revealControls();
  }, [revealControls]);

  const changeVolume = useCallback((delta) => {
    const prev = settingsRef.current;
    const volume = clamp(Math.round((prev.volume + delta) * 100) / 100, 0, 1);
    updateSettings({ volume, muted: volume === 0 });
    showFlash(`볼륨 ${Math.round(volume * 100)}%`);
    revealControls();
  }, [revealControls, showFlash, updateSettings]);

  const toggleMute = useCallback(() => {
    const prev = settingsRef.current;
    const muted = !prev.muted;
    updateSettings({ muted });
    showFlash(muted ? '음소거' : `볼륨 ${Math.round(prev.volume * 100)}%`);
    revealControls();
  }, [revealControls, showFlash, updateSettings]);

  const toggleSubtitles = useCallback(() => {
    const on = !settingsRef.current.subtitlesOn;
    updateSettings({ subtitlesOn: on });
    showFlash(on ? '자막 켜짐' : '자막 꺼짐');
    revealControls();
  }, [revealControls, showFlash, updateSettings]);

  const changeRate = useCallback((rate) => {
    updateSettings({ playbackRate: rate });
    showFlash(formatRate(rate));
    revealControls();
  }, [revealControls, showFlash, updateSettings]);

  /* 전체화면 방식은 lib/videoPlayer.js `pickFullscreenMethod` 가 고른다.
     · 요소 전체화면 API(표준 또는 webkit 접두사) — 우리 컨트롤·제스처가 그대로 전체화면에 올라간다.
       (iPadOS 는 전체화면 중 시스템이 "아래로 쓸어 내리면 종료" 제스처를 함께 돌려, 빠른 아래 드래그는 터치가
       취소(pointercancel)되고 전체화면이 닫힌다 — 페이지에서 막을 수 없다. 느린 드래그·좌우·위쪽은 그대로다.)
     · CSS 폴백(pseudo) — API 가 없는 환경에서 플레이어(또는 외부 대상)를 fixed inset-0 로 창에 채운다.
     · iPhone 기본 플레이어(webkitEnterFullscreen) — 요소 전체화면이 없는 iPhone 에서만. 웹 제스처가 전혀 없다. */
  const toggleFullscreen = useCallback(() => {
    const el = fullscreenTarget();
    const v = videoRef.current;
    if (!el) return;
    const current = fullscreenElementOf(document);
    if (current) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else document.webkitExitFullscreen?.();
      revealControls();
      return;
    }
    const method = pickFullscreenMethod({
      hasRequest: typeof el.requestFullscreen === 'function',
      hasWebkitRequest: typeof el.webkitRequestFullscreen === 'function',
      hasVideoNative: typeof v?.webkitEnterFullscreen === 'function',
      hasExternalTarget: !!fullscreenTargetRef,
      isIphone: isIphoneUserAgent(navigator.userAgent),
    });
    if (method === 'api') {
      el.requestFullscreen().catch(() => {});
    } else if (method === 'webkit') {
      try { el.webkitRequestFullscreen(); } catch { /* ignore */ }
    } else if (method === 'pseudo') {
      // 외부 대상(2분할 루트)이면 호출측이 CSS 로 전체화면을 흉내 내고, 아니면 플레이어 컨테이너가 스스로 창을 채운다.
      // 영상만 전체가 되는 webkitEnterFullscreen 은 분할·제스처 의미가 없으므로 쓰지 않는다.
      setPseudoFullscreen((p) => {
        const next = !p;
        if (fullscreenTargetRef) onPseudoFullscreenChangeRef.current?.(next);
        return next;
      });
    } else if (method === 'native') {
      v.webkitEnterFullscreen(); // iPhone Safari
    }
    revealControls();
  }, [revealControls, fullscreenTarget, fullscreenTargetRef]);

  useEffect(() => {
    const onChange = () => {
      const current = fullscreenElementOf(document);
      setFullscreen(!!current && current === fullscreenTarget());
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, [fullscreenTarget]);

  /* 플레이어 자신의 CSS 폴백 전체화면: Esc 로 닫는다(외부 대상이면 호출측이 처리). */
  const ownPseudoFullscreen = pseudoFullscreen && !fullscreenTargetRef;
  useEffect(() => {
    if (!ownPseudoFullscreen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setPseudoFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ownPseudoFullscreen]);

  /* 플레이어 자신이 전체화면(요소 API 또는 CSS 폴백)인 동안 문서 스크롤·바운스를 잠근다.
     iPad(WebKit)는 요소 전체화면에서도 뒤의 문서가 길면 드래그로 웹뷰 전체를 옆·위로 끌어(rubber-band) 터치를 취소해
     버려(pointercancel) 드래그 제스처가 끊긴다 — 학급 영상 시청 화면처럼 긴 페이지에서 그랬고, 100dvh 인 2분할
     화면은 끌 거리가 없어 멀쩡했다. 루트에 touch-action:none + overscroll-behavior:none(<video> 는 항상 none).
     2분할(외부 대상)은 필기창 목록 스크롤이 필요하므로 잠그지 않는다. */
  const lockPage = !fullscreenTargetRef && (fullscreen || pseudoFullscreen);
  const lockPageRef = useRef(false);
  useEffect(() => {
    lockPageRef.current = lockPage;
    if (!lockPage) return undefined;
    const root = document.documentElement;
    const prev = { overflow: root.style.overflow, overscrollBehavior: root.style.overscrollBehavior, touchAction: root.style.touchAction };
    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    root.style.touchAction = 'none';
    return () => {
      root.style.overflow = prev.overflow;
      root.style.overscrollBehavior = prev.overscrollBehavior;
      root.style.touchAction = prev.touchAction;
    };
  }, [lockPage]);

  /* 외부에서 CSS 폴백 전체화면을 닫은 경우(Esc 등) 상태 동기화 */
  const exitPseudoFullscreen = useCallback(() => {
    setPseudoFullscreen(false);
    if (fullscreenTargetRef) onPseudoFullscreenChangeRef.current?.(false);
  }, [fullscreenTargetRef]);

  /* ── 외부 제어 (댓글 시각 첨부/이동) ── */
  useImperativeHandle(ref, () => ({
    getCurrentTime: () => videoRef.current?.currentTime ?? 0,
    seekTo: (sec) => { seekTo(sec); videoRef.current?.play().catch(() => {}); },
    pause: () => videoRef.current?.pause(),
    toggleFullscreen,
    exitPseudoFullscreen,
  }), [seekTo, toggleFullscreen, exitPseudoFullscreen]);

  /* ── 키보드 단축키 (window) ── */
  useEffect(() => {
    if (!hotkeys) return undefined;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const v = videoRef.current;
      if (!v) return;
      const step = settings.seekStep;
      switch (e.key) {
        case 'ArrowRight': e.preventDefault(); seekBy(step); break;
        case 'ArrowLeft': e.preventDefault(); seekBy(-step); break;
        case 'ArrowUp': e.preventDefault(); changeVolume(VOLUME_STEP); break;
        case 'ArrowDown': e.preventDefault(); changeVolume(-VOLUME_STEP); break;
        case ' ': case 'k': case 'K': e.preventDefault(); togglePlay(); break;
        case 'm': case 'M': e.preventDefault(); toggleMute(); break;
        case 'f': case 'F': e.preventDefault(); toggleFullscreen(); break;
        case 'c': case 'C': if (hasSubs) { e.preventDefault(); toggleSubtitles(); } break;
        case ',': e.preventDefault(); changeRate(stepRate(settings.playbackRate, -1)); break;
        case '.': e.preventDefault(); changeRate(stepRate(settings.playbackRate, +1)); break;
        case 'Escape': setShowSettings(false); break;
        default:
          if (/^[0-9]$/.test(e.key) && Number.isFinite(v.duration)) {
            e.preventDefault();
            seekTo((v.duration * Number(e.key)) / 10);
            showFlash(`${Number(e.key) * 10}%`);
          }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkeys, settings.seekStep, settings.playbackRate, seekBy, changeVolume, togglePlay, toggleMute, toggleFullscreen, changeRate, seekTo, showFlash, hasSubs, toggleSubtitles]);

  /* iPhone 기본 전체화면(webkitEnterFullscreen)은 웹 오버레이를 보여 주지 못하므로, 그동안만 같은 VTT 의 <track> 을 켠다.
     그 밖에는 항상 꺼 둔다 — Safari 는 OS 접근성의 "자막" 설정이 켜져 있으면 트랙을 스스로 켜서 오버레이와 이중으로 보인다. */
  useEffect(() => {
    const v = videoRef.current;
    const list = v?.textTracks;
    if (!v || !list || !hasSubs) return undefined;
    let nativeFullscreen = false;
    const setModes = (showing) => {
      for (const t of Array.from(list)) {
        const mode = showing && t.language === subtitleTrack?.lang ? 'showing' : 'disabled';
        if (t.mode !== mode) t.mode = mode; // 같은 값을 다시 넣으면 change 이벤트가 반복된다
      }
    };
    const keepOff = () => { if (!nativeFullscreen) setModes(false); };
    const onBegin = () => { nativeFullscreen = true; setModes(settingsRef.current.subtitlesOn); };
    const onEnd = () => { nativeFullscreen = false; setModes(false); };
    keepOff();
    list.addEventListener('change', keepOff);
    list.addEventListener('addtrack', keepOff);
    v.addEventListener('webkitbeginfullscreen', onBegin);
    v.addEventListener('webkitendfullscreen', onEnd);
    return () => {
      list.removeEventListener('change', keepOff);
      list.removeEventListener('addtrack', keepOff);
      v.removeEventListener('webkitbeginfullscreen', onBegin);
      v.removeEventListener('webkitendfullscreen', onEnd);
    };
  }, [hasSubs, subtitleTrack]);

  /* ── 시청 위치 보고 (서버 저장 등 — 호출 빈도 제한) ── */
  const reportProgress = useCallback((force = false, opts = undefined) => {
    const cb = onProgressRef.current;
    if (!cb) return;
    const v = videoRef.current;
    if (v) {
      snapshotRef.current = {
        time: v.currentTime || 0,
        duration: Number.isFinite(v.duration) ? v.duration : snapshotRef.current.duration,
        touched: true,
      };
    }
    const snap = snapshotRef.current;
    if (!snap.touched) return; // 아직 재생/메타데이터가 없으면 보고할 것이 없다
    const now = Date.now();
    if (!force && now - lastReportRef.current < PROGRESS_REPORT_INTERVAL_MS) return;
    lastReportRef.current = now;
    cb(Math.floor(snap.time), Math.floor(snap.duration || 0), opts);
  }, []);

  /* 탭 숨김/페이지 이탈(앱 전환·창 닫기·새로고침) 시 마지막 위치를 keepalive 로 보고 */
  useEffect(() => {
    const onHide = () => reportProgress(true, { keepalive: true });
    const onVisibility = () => { if (document.visibilityState === 'hidden') onHide(); };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reportProgress]);

  /* ── 탭/클릭: 한 번 = 재생·정지, 두 번 = 오른쪽 절반 앞으로 / 왼쪽 절반 뒤로 (설정된 초) ──
     전체화면(특히 태블릿·휴대폰)에서 더블탭이 전체화면을 해제하지 않도록 더블클릭=전체화면은 제거했다.
     마우스는 첫 클릭을 즉시 반영하고 더블클릭이면 원래 재생 상태로 되돌린 뒤 이동한다(YouTube 데스크톱과 동일).
     터치/펜은 두 번째 탭을 기다렸다가(350ms) 단일 탭이면 재생·정지한다. */
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef(null);
  const pausedByClickRef = useRef(false);
  useEffect(() => () => clearTimeout(tapTimerRef.current), []);

  /* ── 드래그 제스처(바로 시작) ──
     손가락·펜을 대고 DRAG_START_PX 이상 움직이면 그 자리에서 제스처가 시작되고, 첫 이동 방향으로 종류를 정한다
     (`decideGestureAxis`). 그보다 작게 움직인 터치는 탭이다. 마우스는 클릭·더블클릭만 한다.
     · 좌우 = 스크럽(시간 이동): delta = sign · (|dx| / 폭)^1.6 · 영상 길이 → 짧은 드래그는 몇 초(미세),
       화면 끝까지 끌면 영상 끝까지(장거리). 스크럽 중에는 일시정지하고 미리보기 위치를 보여 주며, 떼면 복귀한다.
     · 상하 = 누른 위치가 화면 왼쪽 절반이면 밝기, 오른쪽 절반이면 볼륨(`verticalGestureKind`).
       위로 끌면 커지고 화면 높이만큼 끌면 전체 범위가 바뀐다(`dragToLevel`). 재생은 건드리지 않는다.
     <video> 는 `touch-action: none` 이라 브라우저가 끌기를 먼저 가져가지 않는다(페이지 스크롤은 영상 밖에서).
     non-passive touchmove 리스너의 preventDefault 는 그 보강이다. */
  const SCRUB_EXP = 1.6;
  const pressRef = useRef(null);      // { id, x, y, active }
  const scrubRef = useRef(null);      // { startTime, width, wasPlaying, lastApply }
  const levelRef = useRef(null);      // { kind: 'volume'|'brightness', start, height, value }
  // 오버레이용: { kind: 'scrub', target, delta } | { kind: 'volume'|'brightness', value }
  const [gesture, setGesture] = useState(null);

  // 제스처 중(그리고 플레이어 전체화면 중)에는 터치 스크롤을 막는다(React 의 onTouchMove 는 passive 라 preventDefault 가 안 먹음).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const block = (e) => { if ((pressRef.current?.active || lockPageRef.current) && e.cancelable) e.preventDefault(); };
    v.addEventListener('touchmove', block, { passive: false });
    return () => v.removeEventListener('touchmove', block);
  }, []);

  const onVideoPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    if (e.pointerType === 'mouse') return; // 마우스는 클릭·더블클릭만
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
    pressRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false };
  };

  const startScrub = (v, target) => {
    scrubRef.current = {
      startTime: v.currentTime,
      width: target.getBoundingClientRect().width || 1,
      wasPlaying: !v.paused,
      lastApply: 0,
    };
    v.pause();
    setGesture({ kind: 'scrub', target: v.currentTime, delta: 0 });
  };

  const startLevel = (press, target) => {
    const rect = target.getBoundingClientRect();
    const kind = verticalGestureKind(press.x, rect.left, rect.width);
    const s = settingsRef.current;
    const start = kind === 'volume' ? (s.muted ? 0 : s.volume) : brightnessRef.current;
    levelRef.current = { kind, start, height: rect.height || 1 };
    setGesture({ kind, value: start });
  };

  const applyLevel = (dy) => {
    const lv = levelRef.current;
    if (!lv) return lv;
    if (lv.kind === 'volume') {
      const volume = dragToLevel(lv.start, dy, lv.height, 0, 1);
      if (volume !== settingsRef.current.volume || settingsRef.current.muted !== (volume === 0)) {
        updateSettings({ volume, muted: volume === 0 });
      }
      lv.value = volume;
      setGesture({ kind: 'volume', value: volume });
      return lv;
    }
    const value = dragToLevel(lv.start, dy, lv.height, BRIGHTNESS_MIN, BRIGHTNESS_MAX);
    lv.value = value;
    setBrightness(value);
    setGesture({ kind: 'brightness', value });
    return lv;
  };

  const scrubTarget = (v, sc, dx) => {
    const ratio = Math.min(1, Math.abs(dx) / sc.width);
    return clamp(sc.startTime + Math.sign(dx) * Math.pow(ratio, SCRUB_EXP) * v.duration, 0, v.duration);
  };

  const onVideoPointerMove = (e) => {
    const v = videoRef.current;
    const press = pressRef.current;
    if (!v || !press || press.id !== e.pointerId) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (!press.active) {
      // 아직 탭일 수 있음: 시작 거리를 넘는 첫 이동으로 제스처 종류를 정한다
      const axis = decideGestureAxis(dx, dy, DRAG_START_PX);
      if (!axis) return;
      press.active = true;
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      lastTapRef.current = 0;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      setControlsVisible(true);
      if (axis === 'x') startScrub(v, e.currentTarget);
      else startLevel(press, e.currentTarget);
    }
    const sc = scrubRef.current;
    if (sc) {
      const target = scrubTarget(v, sc, dx);
      const now = Date.now();
      if (now - sc.lastApply > 80) {
        sc.lastApply = now;
        v.currentTime = target;
        setCurrentTime(target);
      }
      setGesture({ kind: 'scrub', target, delta: target - sc.startTime });
      return;
    }
    applyLevel(dy);
  };

  /** 드래그 제스처 종료. 제스처가 시작됐었으면 true(탭으로 처리하지 않는다). */
  const finishGesture = (e) => {
    const v = videoRef.current;
    const press = pressRef.current;
    if (press && press.id === e.pointerId) pressRef.current = null;
    if (!press?.active || !v) return false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    const sc = scrubRef.current;
    const lv = levelRef.current;
    // pointercancel(브라우저가 제스처를 가져감)은 좌표가 비어 올 수 있어 마지막 적용값으로 마무리한다.
    const cancelled = e.type === 'pointercancel';
    if (lv && !cancelled) applyLevel(e.clientY - press.y); // levelRef 가 살아 있을 때 마지막 위치를 반영
    scrubRef.current = null;
    levelRef.current = null;
    setGesture(null);
    if (sc) {
      const target = cancelled ? v.currentTime : scrubTarget(v, sc, e.clientX - press.x);
      v.currentTime = target;
      setCurrentTime(target);
      if (sc.wasPlaying) v.play().catch(() => {});
      const d = target - sc.startTime;
      showFlash(`${formatTime(target)} (${d >= 0 ? '+' : '−'}${formatTime(Math.abs(d))})`);
    } else if (lv) {
      const value = lv.value ?? lv.start;
      showFlash(`${lv.kind === 'volume' ? '볼륨' : '밝기'} ${Math.round(value * 100)}%`);
    }
    revealControls();
    return true;
  };

  const onVideoPointerUp = (e) => {
    if (finishGesture(e)) return; // 드래그 제스처로 끝났으면 탭으로 처리하지 않는다
    if (e.button != null && e.button !== 0) return;
    const v = videoRef.current;
    if (!v) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const forward = e.clientX - rect.left > rect.width / 2;
    const now = Date.now();
    const isMouse = e.pointerType === 'mouse';

    if (now - lastTapRef.current < 350) {
      // 두 번째 탭 → 이동
      lastTapRef.current = 0;
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      if (isMouse && pausedByClickRef.current) v.play().catch(() => {});
      pausedByClickRef.current = false;
      seekBy(forward ? settingsRef.current.seekStep : -settingsRef.current.seekStep);
      return;
    }

    lastTapRef.current = now;
    if (isMouse) {
      pausedByClickRef.current = !v.paused; // 이 클릭이 정지시키는지 기억
      togglePlay();
    } else {
      revealControls();
      tapTimerRef.current = setTimeout(() => {
        tapTimerRef.current = null;
        togglePlay();
      }, 350);
    }
  };

  /* ── <video> 이벤트 ── */
  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration || 0);
    setError('');
    snapshotRef.current = { ...snapshotRef.current, duration: Number.isFinite(v.duration) ? v.duration : 0 };
    v.playbackRate = settings.playbackRate;
    v.volume = settings.volume;
    v.muted = settings.muted;
    const serverPos = Number(initialPosition) || 0;
    const resume = serverPos > 0 ? serverPos : loadResumePosition(storageKey);
    if (resume > 0 && resume < (v.duration || Infinity) - 5) {
      v.currentTime = resume;
      showFlash(`${formatTime(resume)} 부터 이어보기`);
    }
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    snapshotRef.current = { time: v.currentTime || 0, duration: Number.isFinite(v.duration) ? v.duration : 0, touched: true };
    const now = Date.now();
    if (storageKey && now - lastSaveRef.current > 5000) {
      lastSaveRef.current = now;
      saveResumePosition(storageKey, v.currentTime, v.duration);
    }
    if (!v.paused) reportProgress(false);
  };

  const onBuffered = () => {
    const v = videoRef.current;
    if (!v || !v.buffered.length || !v.duration) return;
    setBuffered(v.buffered.end(v.buffered.length - 1) / v.duration);
  };

  const persistPosition = () => {
    const v = videoRef.current;
    if (v && storageKey) saveResumePosition(storageKey, v.currentTime, v.duration);
    reportProgress(true);
  };

  useEffect(() => () => {
    const v = videoRef.current;
    if (v && storageKey) saveResumePosition(storageKey, v.currentTime, v.duration);
  }, [storageKey]);

  // 언마운트(화면 이탈) 시 마지막 위치 보고
  useEffect(() => () => { reportProgress(true); }, [reportProgress]);

  const progressPct = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`w-full bg-black overflow-hidden select-none outline-none group touch-manipulation ${
        ownPseudoFullscreen ? 'fixed inset-0 z-[80] h-full' : `relative ${fill ? 'h-full' : 'aspect-video rounded-lg'}`}`}
      style={{
        WebkitTouchCallout: 'none',
        containerType: 'inline-size', /* 자막 글자 크기(cqw) 기준 */
        // 홈 화면 앱(standalone)처럼 viewport-fit=cover 인 화면에서 컨트롤이 홈 인디케이터·노치 밑에 깔리지 않게
        ...(ownPseudoFullscreen ? {
          paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)',
        } : null),
      }}
      tabIndex={0}
      onMouseMove={revealControls}
      onTouchStart={revealControls}
      onMouseLeave={() => { if (playing) setControlsVisible(false); }}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster || undefined}
        className={`w-full h-full ${(fill || ownPseudoFullscreen) ? 'object-contain' : ''}`}
        style={{
          WebkitTouchCallout: 'none',
          // 드래그 제스처가 바로 시작되도록 브라우저가 끌기를 가져가지 않게 한다(페이지 스크롤은 영상 밖에서)
          touchAction: 'none',
          filter: brightness !== BRIGHTNESS_DEFAULT ? `brightness(${brightness})` : undefined,
        }}
        playsInline
        autoPlay={autoPlay}
        preload="metadata"
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={onVideoPointerDown}
        onPointerMove={onVideoPointerMove}
        onPointerUp={onVideoPointerUp}
        onPointerCancel={finishGesture}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onProgress={onBuffered}
        onPlay={() => { setPlaying(true); revealControls(); }}
        onPause={() => { setPlaying(false); setControlsVisible(true); persistPosition(); }}
        onEnded={() => { setPlaying(false); setControlsVisible(true); persistPosition(); }}
        onError={() => setError('영상을 불러올 수 없습니다. 파일이 삭제되었거나 브라우저가 지원하지 않는 형식입니다.')}
      >
        {/* 평소엔 꺼진 상태(default 없음) — iPhone 기본 전체화면에서만 켠다. 일반 화면은 SubtitleOverlay 가 그린다. */}
        {subtitleTracks.map((t) => (
          <track key={t.id} kind="subtitles" src={t.url} srcLang={t.lang} label={t.label} />
        ))}
      </video>

      {hasSubs && settings.subtitlesOn && !error && (
        <SubtitleOverlay cues={subtitleCues} time={currentTime} size={settings.subtitleSize} raised={controlsVisible} />
      )}

      {/* 드래그 제스처 오버레이 */}
      {gesture?.kind === 'scrub' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span className="px-4 py-2 rounded-full bg-black/70 text-white text-xl font-semibold tabular-nums">
            {formatTime(gesture.target)}
            <span className={`ml-2 text-base ${gesture.delta >= 0 ? 'text-green-300' : 'text-orange-300'}`}>
              {gesture.delta >= 0 ? '+' : '−'}{formatTime(Math.abs(gesture.delta))}
            </span>
          </span>
          <span className="px-2 py-0.5 rounded bg-black/50 text-white/80 text-[11px]">좌우로 드래그하여 이동 · 짧게 끌면 미세 이동</span>
        </div>
      )}
      {(gesture?.kind === 'volume' || gesture?.kind === 'brightness') && (() => {
        const isVol = gesture.kind === 'volume';
        const min = isVol ? 0 : BRIGHTNESS_MIN;
        const max = isVol ? 1 : BRIGHTNESS_MAX;
        const pct = Math.round(((gesture.value - min) / (max - min)) * 100);
        const Icon = isVol ? (gesture.value === 0 ? VolumeX : Volume2) : Sun;
        return (
          <div className={`pointer-events-none absolute inset-y-0 ${isVol ? 'right-0' : 'left-0'} w-1/2 flex items-center justify-center`}>
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-black/70 text-white">
              <Icon className="h-6 w-6 shrink-0" />
              <div className="flex flex-col gap-1.5 min-w-[7rem]">
                <span className="text-sm font-semibold tabular-nums">
                  {isVol ? '볼륨' : '밝기'} {Math.round(gesture.value * 100)}%
                </span>
                <div className="h-1.5 w-full rounded-full bg-white/25 overflow-hidden">
                  <div className="h-full rounded-full bg-white" style={{ width: `${clamp(pct, 0, 100)}%` }} />
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 중앙 피드백 */}
      {flash && !gesture && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="px-4 py-2 rounded-full bg-black/60 text-white text-lg font-semibold">{flash}</span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white text-sm p-4 text-center">
          {error}
        </div>
      )}

      {/* 컨트롤 바 */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8 transition-opacity ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 탐색 바 */}
        <div className="relative h-5 flex items-center">
          <div className="absolute inset-x-0 h-1 rounded bg-white/30">
            <div className="absolute inset-y-0 left-0 rounded bg-white/50" style={{ width: `${buffered * 100}%` }} />
            <div className="absolute inset-y-0 left-0 rounded bg-blue-500" style={{ width: `${progressPct}%` }} />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={(e) => seekTo(Number(e.target.value))}
            aria-label="재생 위치"
            className="absolute inset-x-0 w-full h-5 appearance-none bg-transparent cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500
              [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:border-0"
          />
        </div>

        <div className="flex items-center gap-1 text-white">
          <button onClick={togglePlay} className="p-2 rounded hover:bg-white/15" aria-label={playing ? '일시정지' : '재생'}>
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <button onClick={() => seekBy(-settings.seekStep)} className="p-2 rounded hover:bg-white/15 flex items-center gap-0.5"
            aria-label={`${settings.seekStep}초 뒤로`} title={`${settings.seekStep}초 뒤로 (←)`}>
            <SkipBack className="h-4 w-4" /><span className="text-[10px]">{settings.seekStep}</span>
          </button>
          <button onClick={() => seekBy(settings.seekStep)} className="p-2 rounded hover:bg-white/15 flex items-center gap-0.5"
            aria-label={`${settings.seekStep}초 앞으로`} title={`${settings.seekStep}초 앞으로 (→)`}>
            <span className="text-[10px]">{settings.seekStep}</span><SkipForward className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-1 ml-1">
            <button onClick={toggleMute} className="p-2 rounded hover:bg-white/15" aria-label="음소거" title="음소거 (M)">
              {settings.muted || settings.volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <input
              type="range" min={0} max={1} step={0.05}
              value={settings.muted ? 0 : settings.volume}
              onChange={(e) => updateSettings({ volume: Number(e.target.value), muted: Number(e.target.value) === 0 })}
              aria-label="볼륨"
              className="w-20 accent-blue-500 hidden sm:block"
            />
          </div>

          <span className="text-xs tabular-nums ml-2 whitespace-nowrap">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex-1" />

          {hasSubs && (
            <button onClick={toggleSubtitles}
              className={`p-2 rounded hover:bg-white/15 ${settings.subtitlesOn ? 'bg-white/20' : ''}`}
              aria-label="자막" aria-pressed={settings.subtitlesOn} title="자막 (C)">
              {settings.subtitlesOn ? <Captions className="h-5 w-5" /> : <CaptionsOff className="h-5 w-5" />}
            </button>
          )}
          <button
            onClick={() => setShowSettings((v) => !v)}
            className={`px-2 py-1 rounded text-xs font-semibold hover:bg-white/15 ${showSettings ? 'bg-white/20' : ''}`}
            title="재생속도 / 이동 시간 설정"
          >
            {formatRate(settings.playbackRate)}
          </button>
          <button onClick={() => setShowSettings((v) => !v)} className={`p-2 rounded hover:bg-white/15 ${showSettings ? 'bg-white/20' : ''}`}
            aria-label="설정" title="설정">
            <Settings className="h-5 w-5" />
          </button>
          <button onClick={toggleFullscreen} className="p-2 rounded hover:bg-white/15" aria-label="전체화면" title="전체화면 (F)">
            {(fullscreen || pseudoFullscreen) ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </div>

        {/* 설정 패널 */}
        {showSettings && (
          <div className="absolute right-3 bottom-14 w-64 rounded-lg bg-gray-900/95 text-white shadow-xl p-3 text-sm space-y-3">
            <div>
              <p className="text-xs text-gray-300 mb-1.5">방향키(←/→) 이동 시간</p>
              <div className="grid grid-cols-4 gap-1">
                {SEEK_STEPS.map((s) => (
                  <button key={s} onClick={() => { updateSettings({ seekStep: s }); showFlash(`이동 ${s}초`); }}
                    className={`py-1.5 rounded text-xs font-medium ${settings.seekStep === s ? 'bg-blue-600' : 'bg-white/10 hover:bg-white/20'}`}>
                    {s}초
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-300 mb-1.5">재생속도</p>
              <div className="grid grid-cols-4 gap-1">
                {PLAYBACK_RATES.map((r) => (
                  <button key={r} onClick={() => changeRate(r)}
                    className={`py-1.5 rounded text-xs font-medium flex items-center justify-center gap-0.5 ${
                      settings.playbackRate === r ? 'bg-blue-600' : 'bg-white/10 hover:bg-white/20'}`}>
                    {settings.playbackRate === r && <Check className="h-3 w-3" />}{formatRate(r)}
                  </button>
                ))}
              </div>
            </div>
            {hasSubs && (
              <div>
                <p className="text-xs text-gray-300 mb-1.5">자막</p>
                <div className="grid grid-cols-4 gap-1">
                  <button onClick={() => { updateSettings({ subtitlesOn: false }); showFlash('자막 꺼짐'); }}
                    className={`py-1.5 rounded text-xs font-medium ${!settings.subtitlesOn ? 'bg-blue-600' : 'bg-white/10 hover:bg-white/20'}`}>
                    끄기
                  </button>
                  {subtitleTracks.map((t) => {
                    const active = settings.subtitlesOn && subtitleTrack?.lang === t.lang;
                    return (
                      <button key={t.id} onClick={() => { updateSettings({ subtitlesOn: true, subtitleLang: t.lang }); showFlash(`자막 ${t.label}`); }}
                        className={`py-1.5 rounded text-xs font-medium ${active ? 'bg-blue-600' : 'bg-white/10 hover:bg-white/20'}`}>
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-300 mt-2 mb-1.5">자막 글자 크기</p>
                <div className="grid grid-cols-3 gap-1">
                  {SUBTITLE_SIZES.map((sz) => (
                    <button key={sz} onClick={() => updateSettings({ subtitleSize: sz })}
                      className={`py-1.5 rounded text-xs font-medium ${settings.subtitleSize === sz ? 'bg-blue-600' : 'bg-white/10 hover:bg-white/20'}`}>
                      {SUBTITLE_SIZE_LABELS[sz]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="text-[11px] text-gray-400 leading-snug">
              Space 재생/정지 · ↑↓ 볼륨 · ←→ 이동 · M 음소거 · F 전체화면 · , . 배속{hasSubs ? ' · C 자막' : ''}
            </p>
          </div>
        )}
      </div>

      {title && !playing && controlsVisible && (
        <div className="pointer-events-none absolute top-0 inset-x-0 px-3 py-2 bg-gradient-to-b from-black/70 to-transparent text-white text-sm font-medium truncate">
          {title}
        </div>
      )}
    </div>
  );
}

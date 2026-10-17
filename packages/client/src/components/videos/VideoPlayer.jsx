import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Settings, Maximize, Minimize, SkipBack, SkipForward, Check,
} from 'lucide-react';
import {
  SEEK_STEPS, PLAYBACK_RATES, VOLUME_STEP,
  loadSettings, saveSettings, stepRate, formatRate, formatTime, clamp,
  loadResumePosition, saveResumePosition, isTypingTarget,
} from '../../lib/videoPlayer';

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
 * - onProgress(positionSec, durationSec): 시청 위치 보고 — 재생 중 최대 10초마다 + 일시정지/종료/언마운트 시.
 * - ref: { getCurrentTime(), seekTo(sec), pause() }
 *
 * 단축키: ←/→ 설정된 초만큼 이동, ↑/↓ 볼륨, Space/K 재생·정지, M 음소거, F 전체화면,
 *        , / . 배속 내림/올림, 0~9 해당 % 위치. ⚙ 설정: 이동 시간(10/20/30/60초)·배속(0.7~2.5×).
 */
export default function VideoPlayer({
  src, poster, title, storageKey, autoPlay = false, hotkeys = true, initialPosition = 0, onProgress, ref,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const flashTimerRef = useRef(null);
  const lastSaveRef = useRef(0);
  const lastReportRef = useRef(0);
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

  const changeRate = useCallback((rate) => {
    updateSettings({ playbackRate: rate });
    showFlash(formatRate(rate));
    revealControls();
  }, [revealControls, showFlash, updateSettings]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    const v = videoRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if (v?.webkitEnterFullscreen) {
      v.webkitEnterFullscreen(); // iOS Safari
    }
    revealControls();
  }, [revealControls]);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  /* ── 외부 제어 (댓글 시각 첨부/이동) ── */
  useImperativeHandle(ref, () => ({
    getCurrentTime: () => videoRef.current?.currentTime ?? 0,
    seekTo: (sec) => { seekTo(sec); videoRef.current?.play().catch(() => {}); },
    pause: () => videoRef.current?.pause(),
  }), [seekTo]);

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
  }, [hotkeys, settings.seekStep, settings.playbackRate, seekBy, changeVolume, togglePlay, toggleMute, toggleFullscreen, changeRate, seekTo, showFlash]);

  /* ── 시청 위치 보고 (서버 저장 등 — 호출 빈도 제한) ── */
  const reportProgress = useCallback((force = false) => {
    const cb = onProgressRef.current;
    const v = videoRef.current;
    if (!cb || !v) return;
    const now = Date.now();
    if (!force && now - lastReportRef.current < PROGRESS_REPORT_INTERVAL_MS) return;
    lastReportRef.current = now;
    const dur = Number.isFinite(v.duration) ? Math.floor(v.duration) : 0;
    cb(Math.floor(v.currentTime || 0), dur);
  }, []);

  /* ── <video> 이벤트 ── */
  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration || 0);
    setError('');
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
      className="relative w-full aspect-video bg-black rounded-lg overflow-hidden select-none outline-none group"
      tabIndex={0}
      onMouseMove={revealControls}
      onTouchStart={revealControls}
      onMouseLeave={() => { if (playing) setControlsVisible(false); }}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster || undefined}
        className="w-full h-full"
        playsInline
        autoPlay={autoPlay}
        preload="metadata"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onProgress={onBuffered}
        onPlay={() => { setPlaying(true); revealControls(); }}
        onPause={() => { setPlaying(false); setControlsVisible(true); persistPosition(); }}
        onEnded={() => { setPlaying(false); setControlsVisible(true); persistPosition(); }}
        onError={() => setError('영상을 불러올 수 없습니다. 파일이 삭제되었거나 브라우저가 지원하지 않는 형식입니다.')}
      />

      {/* 중앙 피드백 */}
      {flash && (
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
            {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
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
            <p className="text-[11px] text-gray-400 leading-snug">
              Space 재생/정지 · ↑↓ 볼륨 · ←→ 이동 · M 음소거 · F 전체화면 · , . 배속
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

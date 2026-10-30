// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import VideoPlayer from './VideoPlayer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* 전체화면 단추가 환경별로 올바른 방식을 고르는지 — 라이브러리 URL 이 아니라 자막 조회(네트워크)는 일어나지 않는다. */
const SRC = 'https://example.test/sample.mp4';

function mount(props = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(createElement(VideoPlayer, { src: SRC, hotkeys: false, ...props })); });
  const fsButton = host.querySelector('button[aria-label="전체화면"]');
  const container = host.firstElementChild;
  return { host, root, fsButton, container, unmount: () => { act(() => { root.unmount(); }); host.remove(); } };
}

let savedRequest;
let savedWebkitRequest;
beforeEach(() => {
  savedRequest = Element.prototype.requestFullscreen;
  savedWebkitRequest = Element.prototype.webkitRequestFullscreen;
  delete Element.prototype.requestFullscreen;
  delete Element.prototype.webkitRequestFullscreen;
  delete HTMLVideoElement.prototype.webkitEnterFullscreen;
});
afterEach(() => {
  if (savedRequest) Element.prototype.requestFullscreen = savedRequest; else delete Element.prototype.requestFullscreen;
  if (savedWebkitRequest) Element.prototype.webkitRequestFullscreen = savedWebkitRequest; else delete Element.prototype.webkitRequestFullscreen;
  delete HTMLVideoElement.prototype.webkitEnterFullscreen;
  vi.restoreAllMocks();
});

const setUA = (ua) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
const IPAD_INAPP = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';

describe('VideoPlayer fullscreen button', () => {
  it('iPad without the element API: fills the window with the custom player instead of the native player', () => {
    setUA(IPAD_INAPP);
    const native = vi.fn();
    HTMLVideoElement.prototype.webkitEnterFullscreen = native;
    const m = mount();
    expect(m.container.className).toContain('relative');
    act(() => { m.fsButton.click(); });
    expect(native).not.toHaveBeenCalled();
    expect(m.container.className).toContain('fixed');
    expect(m.container.className).toContain('inset-0');
    expect(m.container.className).not.toContain('aspect-video');
    expect(m.host.querySelector('video').className).toContain('object-contain');
    // 전체화면 중에는 브라우저가 페이지를 끌지 못하게 잠근다(iPad rubber-band → pointercancel 방지)
    expect(m.host.querySelector('video').style.touchAction).toBe('none');
    expect(document.documentElement.style.touchAction).toBe('none');
    expect(document.documentElement.style.overscrollBehavior).toBe('none');
    expect(document.documentElement.style.overflow).toBe('hidden');
    // 제스처 핸들러가 붙은 <video> 는 그대로 — 길게 누름 제스처가 전체화면에서도 산다
    expect(m.host.querySelector('video')).toBeTruthy();
    // 같은 단추로 종료, Esc 로도 종료
    act(() => { m.fsButton.click(); });
    expect(m.container.className).toContain('relative');
    expect(m.host.querySelector('video').style.touchAction).toBe('none');
    expect(document.documentElement.style.touchAction).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
    act(() => { m.fsButton.click(); });
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(m.container.className).toContain('relative');
    expect(document.documentElement.style.touchAction).toBe('');
    m.unmount();
  });

  it('iPhone without the element API: still uses the native player', () => {
    setUA(IPHONE);
    const native = vi.fn();
    HTMLVideoElement.prototype.webkitEnterFullscreen = native;
    const m = mount();
    act(() => { m.fsButton.click(); });
    expect(native).toHaveBeenCalledTimes(1);
    expect(m.container.className).toContain('relative');
    m.unmount();
  });

  it('standard API: requests element fullscreen on the player container', () => {
    setUA(IPAD_INAPP);
    const req = vi.fn(() => Promise.resolve());
    Element.prototype.requestFullscreen = req;
    const native = vi.fn();
    HTMLVideoElement.prototype.webkitEnterFullscreen = native;
    const m = mount();
    act(() => { m.fsButton.click(); });
    expect(req).toHaveBeenCalledTimes(1);
    expect(req.mock.instances[0]).toBe(m.container);
    expect(native).not.toHaveBeenCalled();
    expect(m.container.className).toContain('relative');
    m.unmount();
  });

  it('webkit-prefixed API only (older iPadOS): uses it and tracks webkitfullscreenchange', () => {
    setUA(IPAD_INAPP);
    const req = vi.fn();
    Element.prototype.webkitRequestFullscreen = req;
    const m = mount();
    act(() => { m.fsButton.click(); });
    expect(req).toHaveBeenCalledTimes(1);
    expect(req.mock.instances[0]).toBe(m.container);
    // 브라우저가 전체화면에 들어갔다고 알리면 단추가 "종료" 상태가 된다
    Object.defineProperty(document, 'webkitFullscreenElement', { configurable: true, get: () => m.container });
    act(() => { document.dispatchEvent(new Event('webkitfullscreenchange')); });
    expect(m.fsButton.querySelector('svg')?.getAttribute('class') || '').toContain('lucide-minimize');
    // 요소 전체화면 중에도 같은 잠금
    expect(m.host.querySelector('video').style.touchAction).toBe('none');
    expect(document.documentElement.style.touchAction).toBe('none');
    delete document.webkitFullscreenElement;
    act(() => { document.dispatchEvent(new Event('webkitfullscreenchange')); });
    expect(document.documentElement.style.touchAction).toBe('');
    expect(m.host.querySelector('video').style.touchAction).toBe('none');
    m.unmount();
  });

  it('external target without the API (2분할): asks the caller to fake fullscreen, does not touch its own box', () => {
    setUA(IPAD_INAPP);
    const target = document.createElement('div');
    const onPseudo = vi.fn();
    const m = mount({ fullscreenTargetRef: { current: target }, onPseudoFullscreenChange: onPseudo });
    act(() => { m.fsButton.click(); });
    expect(onPseudo).toHaveBeenCalledWith(true);
    expect(m.container.className).toContain('relative');
    expect(m.container.className).not.toContain('fixed');
    // 2분할은 필기창 목록을 스크롤해야 하므로 페이지를 잠그지 않는다
    expect(document.documentElement.style.touchAction).toBe('');
    expect(m.host.querySelector('video').style.touchAction).toBe('none');
    m.unmount();
  });
});

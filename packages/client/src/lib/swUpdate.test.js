import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupSwAutoUpdate } from './swUpdate.js';

function makeEnv({ controller = null } = {}) {
  const registration = { update: vi.fn().mockResolvedValue(undefined) };
  const serviceWorker = Object.assign(new EventTarget(), {
    controller,
    register: vi.fn().mockResolvedValue(registration),
  });
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const intervalCallbacks = [];
  const win = {
    setInterval: vi.fn((cb) => { intervalCallbacks.push(cb); return 1; }),
    location: { reload: vi.fn() },
  };
  return { registration, serviceWorker, doc, win, intervalCallbacks };
}

describe('setupSwAutoUpdate', () => {
  let env;
  beforeEach(() => {
    env = makeEnv({ controller: {} });
  });

  it('sw.js 를 HTTP 캐시 우회(updateViaCache none)로 등록한다', async () => {
    await setupSwAutoUpdate(env);
    expect(env.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
  });

  it('주기 타이머가 registration.update() 를 호출한다', async () => {
    await setupSwAutoUpdate(env);
    expect(env.win.setInterval).toHaveBeenCalled();
    env.intervalCallbacks.forEach((cb) => cb());
    expect(env.registration.update).toHaveBeenCalled();
  });

  it('화면 복귀(visible) 시 업데이트를 체크한다', async () => {
    await setupSwAutoUpdate(env);
    env.doc.visibilityState = 'visible';
    env.doc.dispatchEvent(new Event('visibilitychange'));
    expect(env.registration.update).toHaveBeenCalled();
  });

  it('백그라운드 상태에서 새 SW가 제어권을 잡으면 즉시 리로드한다', async () => {
    await setupSwAutoUpdate(env);
    env.doc.visibilityState = 'hidden';
    env.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(env.win.location.reload).toHaveBeenCalledTimes(1);
  });

  it('화면이 보이는 동안엔 리로드를 보류하고 백그라운드 전환 시 적용한다', async () => {
    await setupSwAutoUpdate(env);
    env.doc.visibilityState = 'visible';
    env.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(env.win.location.reload).not.toHaveBeenCalled();

    env.doc.visibilityState = 'hidden';
    env.doc.dispatchEvent(new Event('visibilitychange'));
    expect(env.win.location.reload).toHaveBeenCalledTimes(1);
  });

  it('리로드는 한 번만 실행된다', async () => {
    await setupSwAutoUpdate(env);
    env.doc.visibilityState = 'hidden';
    env.serviceWorker.dispatchEvent(new Event('controllerchange'));
    env.serviceWorker.dispatchEvent(new Event('controllerchange'));
    env.doc.dispatchEvent(new Event('visibilitychange'));
    expect(env.win.location.reload).toHaveBeenCalledTimes(1);
  });

  it('최초 설치(기존 controller 없음)의 controllerchange 로는 리로드하지 않는다', async () => {
    env = makeEnv({ controller: null });
    await setupSwAutoUpdate(env);
    env.doc.visibilityState = 'hidden';
    env.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(env.win.location.reload).not.toHaveBeenCalled();

    // 같은 세션에서 그다음 배포가 오면 리로드한다
    env.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(env.win.location.reload).toHaveBeenCalledTimes(1);
  });

  it('register 실패 시 조용히 넘어간다', async () => {
    env.serviceWorker.register = vi.fn().mockRejectedValue(new Error('blocked'));
    await expect(setupSwAutoUpdate(env)).resolves.toBeNull();
  });
});

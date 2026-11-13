import { api } from '../api';

/**
 * 워터마크가 찍힌 IA 쪽 하나를 받아 ImageBitmap 으로 돌려준다. 실패하면 ApiError(status) 를 던진다.
 * Blob 은 곧바로 createImageBitmap 으로만 넘긴다 — object URL·FileReader·<img>·캐시를 거치지 않아야
 * 브라우저 개발자 도구의 이미지 목록이나 "다른 이름으로 저장" 으로 쪽 파일을 꺼낼 길이 없다.
 */
export async function fetchPageBitmap(exId, doc, n, { signal } = {}) {
  const blob = await api.blob(
    `/api/ib/ia/${encodeURIComponent(exId)}/${encodeURIComponent(doc)}/pages/${n}`,
    { signal },
  );
  return createImageBitmap(blob);
}

/** 취소(AbortController)로 끝난 실패인지 — 오류 화면을 띄우지 않는다 */
export function isAbort(err) {
  return err?.name === 'AbortError';
}

const abortError = () => new DOMException('Aborted', 'AbortError');

/**
 * 쪽 받기 줄 — 동시에 max 개까지만 받고, 기다리는 것 중 priority(n) 가 가장 작은 쪽부터 꺼낸다.
 * run(n, task) → { promise, cancel }. task(signal) 은 signal 을 지켜야 한다.
 * cancel() 은 기다리던 일이면 줄에서 빼고, 받는 중이면 abort 한다(둘 다 promise 는 AbortError 로 끝난다).
 * 한 렌더에서 여러 쪽이 한꺼번에 줄을 서므로, 꺼내기는 마이크로태스크로 미뤄 모두 선 뒤에 우선순위를 본다.
 */
export function createFetchQueue({ max = 3, priority = (n) => n } = {}) {
  const pending = [];
  let running = 0;
  let scheduled = false;

  function pump() {
    scheduled = false;
    while (running < max && pending.length) {
      let best = 0;
      for (let i = 1; i < pending.length; i++) {
        if (priority(pending[i].n) < priority(pending[best].n)) best = i;
      }
      const job = pending.splice(best, 1)[0];
      job.started = true;
      running++;
      Promise.resolve()
        .then(() => job.task(job.ctrl.signal))
        .then(job.resolve, job.reject)
        .finally(() => { running--; schedule(); });
    }
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(pump);
  }

  return {
    run(n, task) {
      const job = { n, task, ctrl: new AbortController(), started: false };
      const promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
      pending.push(job);
      schedule();
      return {
        promise,
        cancel() {
          if (job.started) { job.ctrl.abort(); return; }
          const i = pending.indexOf(job);
          if (i >= 0) { pending.splice(i, 1); job.reject(abortError()); }
        },
      };
    },
  };
}

import { it, expect, vi } from 'vitest';

vi.mock('../api', () => ({ api: {} }));
const { createFetchQueue, isAbort } = await import('./pageFetch');

const tick = () => new Promise((r) => setTimeout(r, 0));

function deferredTask(log) {
  const ends = {};
  const task = (n) => (signal) => new Promise((resolve, reject) => {
    log.push(n);
    ends[n] = resolve;
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
  return { task, ends };
}

it('runs at most `max` at once, nearest priority first', async () => {
  const log = [];
  const { task, ends } = deferredTask(log);
  const q = createFetchQueue({ max: 3, priority: (n) => Math.abs(n - 5) });
  const handles = [1, 2, 3, 4, 5, 6, 7].map((n) => q.run(n, task(n)));
  await tick();
  expect(log).toEqual([5, 4, 6]);
  ends[5]();
  await handles[4].promise;
  await tick();
  expect(log).toEqual([5, 4, 6, 3]);
});

it('cancel removes a waiting job and aborts a running one', async () => {
  const log = [];
  const { task } = deferredTask(log);
  const q = createFetchQueue({ max: 1 });
  const a = q.run(1, task(1));
  const b = q.run(2, task(2));
  await tick();
  b.cancel();
  a.cancel();
  await expect(a.promise).rejects.toSatisfy(isAbort);
  await expect(b.promise).rejects.toSatisfy(isAbort);
  await tick();
  expect(log).toEqual([1]);
});

import { useSyncExternalStore } from 'react';

const EVENT = 'slide-hash-change';

/** '#24' → '24'. 잘못된 % 이스케이프는 던지지 않고 '' (상세 창을 열지 않음). */
export function readHashId(hash) {
  try {
    return decodeURIComponent(hash.replace(/^#/, ''));
  } catch {
    return '';
  }
}

function subscribe(onChange) {
  window.addEventListener('hashchange', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/** 해시가 상세 창의 유일한 진실 공급원이다. */
export function useHashId() {
  return useSyncExternalStore(subscribe, () => readHashId(window.location.hash), () => '');
}

/**
 * 상세 창 안에서 스타일을 넘길 때 뒤로 가기 기록이 쌓이지 않게 replaceState 를 쓴다.
 * replaceState 는 hashchange 를 내지 않아 직접 알린다. React Router 가 history.state(idx·key)를 쓰므로 그대로 넘겨 보존한다.
 */
export function setHashId(id) {
  const url = id ? `#${encodeURIComponent(id)}` : `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(window.history.state, '', url);
  window.dispatchEvent(new Event(EVENT));
}

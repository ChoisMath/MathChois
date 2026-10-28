import { useCallback, useEffect, useRef, useState } from 'react';
import { writeClipboard } from '../lib/aiHub/clipboard';

export const COPY_FAILED = '복사하지 못했어요 — 글을 직접 선택해 복사하세요';

/**
 * 복사 단추의 표시 상태. copy(text, key) 가 성공하면 copied === key 가 1.5초, 실패하면 failed 가 3초 true.
 * copy 는 성공 여부(boolean)를 돌려준다. key 는 단추가 여럿일 때(영문/국문) 어느 쪽을 눌렀는지 구분하는 값이다.
 */
export function useCopyFeedback() {
  const [copied, setCopied] = useState(null);
  const [failed, setFailed] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async (text, key = true) => {
    const ok = await writeClipboard(text);
    clearTimeout(timer.current);
    setCopied(ok ? key : null);
    setFailed(!ok);
    timer.current = setTimeout(() => {
      setCopied(null);
      setFailed(false);
    }, ok ? 1500 : 3000);
    return ok;
  }, []);

  return { copied, failed, copy };
}

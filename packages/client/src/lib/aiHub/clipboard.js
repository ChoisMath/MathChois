/**
 * 클립보드에 쓴다. 성공하면 true, 못 썼으면 false.
 * 권한 팝업을 막았거나 http 환경이면 Clipboard API 가 거부되므로 숨은 textarea + execCommand('copy') 로 대신하고,
 * 그것도 실패하면(또는 어디서든 던지면) false — 호출한 쪽이 '복사됨' 대신 안내를 보여 준다.
 */
export async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 아래 폴백으로
  }
  let ta = null;
  try {
    ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    return document.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    ta?.remove();
  }
}

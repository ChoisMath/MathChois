/** 클립보드에 쓴다. 권한 팝업을 막았거나 http 환경이면 Clipboard API 가 거부되므로 숨은 textarea 로 대신한다. */
export async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

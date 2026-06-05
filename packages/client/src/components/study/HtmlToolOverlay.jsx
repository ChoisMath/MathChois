import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { toolUrl } from '../../lib/toolUrl';
import ExcalidrawErrorBoundary from '../ExcalidrawErrorBoundary';
import {
  ALWAYS_HIDE_CSS, TOUCH_CSS, PANEL_HIDE_CSS, EXCALIDRAW_UI_OPTIONS,
} from '../../lib/excalidrawUtils';
import { overlayPointerEvents, iframePointerEvents } from '../../lib/htmlOverlay';

/* HTML 도구 iframe 위에 투명 Excalidraw 오버레이를 겹친다.
   drawing=false → 오버레이 click-through(도구 조작), drawing=true → 오버레이가 입력 장악(도구 정지).
   배경 element 없음. 뷰포트 고정은 호출 뷰어의 onChange 복원 로직이 담당한다. */
function HtmlToolOverlay({
  htmlUrl,
  drawing,
  containerRef,
  excalidrawAPI,
  onChange,
  initialElements = [],
  showPanel = false,
}) {
  return (
    <div className="relative w-full h-full bg-white">
      <iframe
        src={toolUrl(htmlUrl)}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
        title="HTML 도구"
        className="absolute inset-0 w-full h-full border-0"
        style={{ pointerEvents: iframePointerEvents(drawing) }}
      />
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ pointerEvents: overlayPointerEvents(drawing), background: 'transparent', touchAction: 'none' }}
      >
        <style>{ALWAYS_HIDE_CSS}{TOUCH_CSS}{(drawing && showPanel) ? '' : PANEL_HIDE_CSS}</style>
        <ExcalidrawErrorBoundary key={htmlUrl}>
          <Excalidraw
            excalidrawAPI={excalidrawAPI}
            viewModeEnabled={!drawing}
            initialData={{
              elements: initialElements,
              appState: { viewBackgroundColor: 'transparent', scrollX: 0, scrollY: 0 },
            }}
            onChange={onChange}
            UIOptions={EXCALIDRAW_UI_OPTIONS}
          />
        </ExcalidrawErrorBoundary>
      </div>
    </div>
  );
}

export default HtmlToolOverlay;

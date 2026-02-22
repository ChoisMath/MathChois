import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * 특정 DOM 요소를 캡처하여 A4 크기의 단일 페이지 PDF로 다운로드합니다.
 * @param {HTMLElement} element 캡처할 DOM 요소
 * @param {string} filename 저장할 파일명
 */
export const downloadElementAsA4Pdf = async (element, filename) => {
  if (!element) return;

  try {
    // html2canvas로 요소를 캔버스로 변환
    const canvas = await html2canvas(element, {
      scale: 2, // 해상도 향상
      useCORS: true, // 외부 이미지 로드 시 필요
      allowTaint: true,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/png');

    // A4 캔버스 크기 (세로)
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const a4WidthStr = pdf.internal.pageSize.getWidth();
    const a4HeightStr = pdf.internal.pageSize.getHeight();
    const a4Width = typeof a4WidthStr === 'number' ? a4WidthStr : parseFloat(a4WidthStr);
    const a4Height = typeof a4HeightStr === 'number' ? a4HeightStr : parseFloat(a4HeightStr);

    // 이미지 비율 유지하면서 전체 페이지에 맞게 꽉 채우기
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    // A4 크기에 맞게 스케일 조정 (세로 기준 꽉 차도록)
    const ratio = Math.min(a4Width / canvasWidth, a4Height / canvasHeight);
    
    const imgWidth = canvasWidth * ratio;
    const imgHeight = canvasHeight * ratio;

    // 중앙 정렬
    const marginX = (a4Width - imgWidth) / 2;
    const marginY = (a4Height - imgHeight) / 2;

    pdf.addImage(imgData, 'PNG', marginX, Math.max(0, marginY), imgWidth, imgHeight);
    pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
  } catch (error) {
    console.error('PDF 생성 중 오류 발생:', error);
    alert('PDF 생성 중 오류가 발생했습니다.');
  }
};

/**
 * 제공된 excalidraw 데이터를 기반으로 백그라운드에서 임시로 이미지를 생성하여 PDF로 내보냅니다.
 * @param {Array<Object>} elements excalidraw 엘리먼트 배열
 * @param {import('@excalidraw/excalidraw').AppState} appState 
 * @param {Object} files 
 * @param {string} filename 
 */
export const downloadExcalidrawAsPdf = async (exportToBlob, elements, appState, files, filename) => {
    if (!elements || elements.length === 0) {
        alert("선택된 내용이 없습니다.");
        return;
    }

    try {
        const blob = await exportToBlob({
            elements,
            appState: {
                ...appState,
                exportBackground: true,
                exportWithDarkMode: false,
                exportPadding: 20, // 약간의 여백 추가
            },
            files,
            mimeType: "image/png",
        });

        // Blob을 Data URL로 변환
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const a4Width = pdf.internal.pageSize.getWidth();
        const a4Height = pdf.internal.pageSize.getHeight();

        // 임시 이미지 객체를 만들어 원본 비율 계산
        const img = new Image();
        img.src = dataUrl;
        
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        const imgRatio = Math.min(a4Width / img.width, a4Height / img.height);
        const finalWidth = img.width * imgRatio;
        const finalHeight = img.height * imgRatio;
        
        const marginX = (a4Width - finalWidth) / 2;
        const marginY = (a4Height - finalHeight) / 2;

        pdf.addImage(dataUrl, 'PNG', marginX, marginY, finalWidth, finalHeight);
        pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
        
    } catch (err) {
        console.error("Excalidraw PDF 내보내기 실패", err);
        alert("PDF 다운로드 중 오류가 발생했습니다.");
    }
}

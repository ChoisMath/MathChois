import { useState } from 'react';
import { exportToBlob } from '@excalidraw/excalidraw';
import { jsPDF } from 'jspdf';
import { fetchAsDataUrl, getImageNaturalSize, createBgElement, BG_FILE_ID } from './excalidrawUtils';

// A4 @ 150 DPI = 1240 × 1754 px. 긴 쪽 기준으로 해상도 제한.
const PDF_MAX_DIMENSION = 1754;
const PDF_JPEG_QUALITY = 0.85;
const PDF_MARGIN_TOP = 10;   // mm
const PDF_MARGIN_SIDE = 10;  // mm (좌우 각각)

/**
 * Creates a hidden Excalidraw-like PDF from element arrays
 * It fetches the background image and correctly positions the objects.
 */
export const downloadElementsAsPdf = async (elements, files, bgImageUrl, filename, bgPosition = null) => {
    try {
        let finalElements = [...elements];
        let finalFiles = { ...files };

        // 1. 백그라운드 이미지가 있으면 로드해서 제일 뒤(첫번째)에 넣는다.
        if (bgImageUrl) {
            const { dataUrl, mimeType } = await fetchAsDataUrl(bgImageUrl);
            const { w: iW, h: iH } = await getImageNaturalSize(dataUrl);

            const bgW = bgPosition ? bgPosition.width : iW;
            const bgH = bgPosition ? bgPosition.height : iH;
            const bgX = bgPosition ? bgPosition.x : 0;
            const bgY = bgPosition ? bgPosition.y : 0;

            finalFiles[BG_FILE_ID] = { id: BG_FILE_ID, dataURL: dataUrl, mimeType, created: Date.now() };
            const bgEl = createBgElement(bgX, bgY, bgW, bgH);
            
            // Background must be at the very bottom
            finalElements = [bgEl, ...finalElements];
        }

        // Wait to ensure exportToBlob is loaded if not already
        const blob = await exportToBlob({
            elements: finalElements,
            appState: {
                viewBackgroundColor: '#ffffff',
                exportBackground: true,
                exportWithDarkMode: false,
                exportPadding: 0,
            },
            files: finalFiles,
            maxWidthOrHeight: PDF_MAX_DIMENSION,
            mimeType: "image/jpeg",
            quality: PDF_JPEG_QUALITY,
        });

        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        // 2. jsPDF 생성 (A4 비율 맞춤)
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const a4Width = pdf.internal.pageSize.getWidth();
        const a4Height = pdf.internal.pageSize.getHeight();

        const img = new Image();
        img.src = dataUrl;
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });

        const usableWidth = a4Width - PDF_MARGIN_SIDE * 2;
        const usableHeight = a4Height - PDF_MARGIN_TOP;
        const imgRatio = Math.min(usableWidth / img.width, usableHeight / img.height);
        const finalWidth = img.width * imgRatio;
        const finalHeight = img.height * imgRatio;

        const marginX = (a4Width - finalWidth) / 2;
        const marginY = PDF_MARGIN_TOP;

        pdf.addImage(dataUrl, 'JPEG', marginX, marginY, finalWidth, finalHeight);
        pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);

        return true;
    } catch (err) {
        console.error('PDF 내보내기 오류:', err);
        return false;
    }
};

/**
 * 훅 형태로 제공되는 PDF 다운로드 유틸
 */
export function usePdfDownloader() {
    const [isDownloading, setIsDownloading] = useState(false);

    const downloadPage = async (pageTitle, elements, files, bgUrl, bgPosition = null) => {
        setIsDownloading(true);
        try {
            await downloadElementsAsPdf(elements, files, bgUrl, pageTitle, bgPosition);
        } catch (e) {
            console.error(e);
            alert('다운로드 중 오류가 발생했습니다.');
        } finally {
            setIsDownloading(false);
        }
    };

    const downloadMultiplePages = async (docTitle, pageDataList) => {
        setIsDownloading(true);
        try {
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const a4Width = pdf.internal.pageSize.getWidth();
            const a4Height = pdf.internal.pageSize.getHeight();

            for (let i = 0; i < pageDataList.length; i++) {
                const { elements, files, bgUrl, bgPosition } = pageDataList[i];
                
                let finalElements = [...(elements || [])];
                let finalFiles = { ...(files || {}) };

                if (bgUrl) {
                    const { dataUrl, mimeType } = await fetchAsDataUrl(bgUrl);
                    const { w: iW, h: iH } = await getImageNaturalSize(dataUrl);
                    finalFiles[BG_FILE_ID] = { id: BG_FILE_ID, dataURL: dataUrl, mimeType, created: Date.now() };
                    
                    const bgW = bgPosition ? bgPosition.width : iW;
                    const bgH = bgPosition ? bgPosition.height : iH;
                    const bgX = bgPosition ? bgPosition.x : 0;
                    const bgY = bgPosition ? bgPosition.y : 0;

                    const bgEl = createBgElement(bgX, bgY, bgW, bgH);
                    finalElements = [bgEl, ...finalElements];
                }

                if (finalElements.length === 0) {
                    if (i < pageDataList.length - 1) pdf.addPage();
                    continue;
                }

                const blob = await exportToBlob({
                    elements: finalElements,
                    appState: { viewBackgroundColor: '#ffffff', exportBackground: true, exportWithDarkMode: false, exportPadding: 0 },
                    files: finalFiles,
                    maxWidthOrHeight: PDF_MAX_DIMENSION,
                    mimeType: "image/jpeg",
                    quality: PDF_JPEG_QUALITY,
                });

                const dataUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });

                const img = new Image();
                img.src = dataUrl;
                await new Promise((resolve) => { img.onload = resolve; });

                const usableWidth = a4Width - PDF_MARGIN_SIDE * 2;
                const usableHeight = a4Height - PDF_MARGIN_TOP;
                const imgRatio = Math.min(usableWidth / img.width, usableHeight / img.height);
                const finalWidth = img.width * imgRatio;
                const finalHeight = img.height * imgRatio;

                const marginX = (a4Width - finalWidth) / 2;
                const marginY = PDF_MARGIN_TOP;

                pdf.addImage(dataUrl, 'JPEG', marginX, marginY, finalWidth, finalHeight);

                if (i < pageDataList.length - 1) {
                    pdf.addPage();
                }
            }
            
            pdf.save(docTitle.endsWith('.pdf') ? docTitle : `${docTitle}.pdf`);
        } catch (e) {
            console.error(e);
            alert('여러 페이지 다운로드 중 오류가 발생했습니다.');
        } finally {
            setIsDownloading(false);
        }
    }

    return { isDownloading, downloadPage, downloadMultiplePages };
}

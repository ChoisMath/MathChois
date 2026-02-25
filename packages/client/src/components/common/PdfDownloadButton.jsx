import React, { useState, useRef, useEffect } from 'react';
import { Download, Loader, ChevronDown, FileText, Files } from 'lucide-react';

export function PdfDownloadButton({ 
    onClick, // For single page download
    onDownloadAll, // Optional: For downloading all pages
    isDownloading, 
    className="" 
}) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSingleDownload = () => {
        setIsOpen(false);
        if (onClick) onClick();
    };

    const handleAllDownload = () => {
        setIsOpen(false);
        if (onDownloadAll) onDownloadAll();
    };

    if (!onDownloadAll) {
        return (
            <button
                onClick={onClick}
                disabled={isDownloading}
                title="통합 PDF 다운로드"
                className={`flex items-center justify-center p-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md transition-colors disabled:opacity-50 ${className}`}
            >
                {isDownloading ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            </button>
        );
    }

    return (
        <div className="relative inline-block text-left" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={isDownloading}
                title="통합 PDF 다운로드"
                className={`flex items-center justify-center p-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md transition-colors disabled:opacity-50 ${className}`}
            >
                {isDownloading ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <ChevronDown className="w-3.5 h-3.5 opacity-70 ml-1" />
            </button>

            {isOpen && !isDownloading && (
                <div className="absolute right-0 mt-1 w-36 bg-white rounded-md shadow-lg border border-gray-100 z-50 py-1 flex flex-col">
                    <button
                        className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors cursor-pointer"
                        onClick={handleSingleDownload}
                        title="현재 페이지만"
                    >
                        <FileText className="w-4 h-4 mr-2 shrink-0" />
                        <span className="truncate">현재 페이지만</span>
                    </button>
                    <button
                        className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors cursor-pointer"
                        onClick={handleAllDownload}
                        title="모든 페이지"
                    >
                        <Files className="w-4 h-4 mr-2 shrink-0" />
                        <span className="truncate">모든 페이지</span>
                    </button>
                </div>
            )}
        </div>
    );
}

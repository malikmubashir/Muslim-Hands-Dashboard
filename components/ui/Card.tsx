import React, { useState } from 'react';
import { Download, Loader } from 'lucide-react';
import html2canvas from 'html2canvas';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  title?: string;
  lang: string;
}

export const Card: React.FC<CardProps> = ({ children, className = "", id, title }) => {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!id) return;
    
    setDownloading(true);
    const element = document.getElementById(id);
    if (element) {
      try {
        const originalOverflow = document.body.style.overflow;
        
        const canvas = await html2canvas(element, {
          backgroundColor: '#ffffff',
          scale: 2, 
          useCORS: true 
        });

        document.body.style.overflow = originalOverflow;
        
        const link = document.createElement('a');
        link.download = `${title ? title.replace(/[^a-zA-Z0-9_]/g, '_') : 'Chart'}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.9);
        link.click();
      } catch (error) {
        console.error("Export failed", error);
        alert("Export failed.");
      }
    }
    setDownloading(false);
  };

  return (
    <div id={id} className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6 relative group ${className}`}>
      {id && (
        <button 
          onClick={handleDownload}
          disabled={downloading}
          className="absolute top-4 right-4 p-2 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-blue-600 rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 z-10"
          title="Download JPG"
        >
          {downloading ? <Loader size={18} className="animate-spin" /> : <Download size={18} />}
        </button>
      )}
      {children}
    </div>
  );
};
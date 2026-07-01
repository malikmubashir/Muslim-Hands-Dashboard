import React, { useRef, useCallback, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Download, FileImage, FileText, Loader2 } from 'lucide-react';
import { useT } from './i18n';

// Sanitize a string into a safe file-name fragment.
const slug = (s: string) =>
  (s || 'export')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'export';

async function snapshot(node: HTMLElement): Promise<HTMLCanvasElement> {
  // Temporarily force a white background so exported PNG/PDF aren't transparent.
  const prevBg = node.style.backgroundColor;
  node.style.backgroundColor = '#ffffff';
  try {
    return await html2canvas(node, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
    });
  } finally {
    node.style.backgroundColor = prevBg;
  }
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

interface ExportButtonsProps {
  /** Ref to the DOM node to capture (usually the chart Card). */
  targetRef: React.RefObject<HTMLElement>;
  /** File-name base, e.g. "tableau-de-bord-themes" or "<theme>-villes". */
  name: string;
}

/** Small PNG / PDF export buttons for a chart Card header. */
export const ExportButtons: React.FC<ExportButtonsProps> = ({ targetRef, name }) => {
  const { t } = useT();
  const [busy, setBusy] = useState<null | 'png' | 'pdf'>(null);
  const base = slug(name);

  const exportPng = useCallback(async () => {
    const node = targetRef.current;
    if (!node || busy) return;
    setBusy('png');
    try {
      const canvas = await snapshot(node);
      downloadDataUrl(canvas.toDataURL('image/png'), `${base}.png`);
    } catch (e) {
      console.error('PNG export failed', e);
    } finally {
      setBusy(null);
    }
  }, [targetRef, base, busy]);

  const exportPdf = useCallback(async () => {
    const node = targetRef.current;
    if (!node || busy) return;
    setBusy('pdf');
    try {
      const canvas = await snapshot(node);
      const img = canvas.toDataURL('image/png');
      const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
      const pdf = new jsPDF({ orientation, unit: 'px', format: [canvas.width, canvas.height] });
      pdf.addImage(img, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${base}.pdf`);
    } catch (e) {
      console.error('PDF export failed', e);
    } finally {
      setBusy(null);
    }
  }, [targetRef, base, busy]);

  const btn =
    'inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-emerald-700 ' +
    'border border-gray-200 hover:border-emerald-300 rounded-md px-2 py-1 transition-colors disabled:opacity-50';

  return (
    <div className="flex items-center gap-1.5 shrink-0" data-html2canvas-ignore="true">
      <button type="button" onClick={exportPng} disabled={!!busy} className={btn} title={t('exp.png')}>
        {busy === 'png' ? <Loader2 size={13} className="animate-spin" /> : <FileImage size={13} />}
        PNG
      </button>
      <button type="button" onClick={exportPdf} disabled={!!busy} className={btn} title={t('exp.pdf')}>
        {busy === 'pdf' ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
        PDF
      </button>
    </div>
  );
};

/**
 * A chart Card with an export-ready ref and a header that hosts the title and
 * PNG/PDF buttons. Use as the standard wrapper for every chart so each one is
 * individually exportable.
 */
export const ChartCard: React.FC<{
  title: string;
  sub?: string;
  /** File-name base for exports. Defaults to the title. */
  exportName?: string;
  /** Optional extra header content (rendered before the export buttons). */
  headerExtra?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ title, sub, exportName, headerExtra, className = '', children }) => {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className={`bg-white rounded-xl shadow-sm border border-gray-100 p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide flex items-center gap-2">
            <Download size={0} className="hidden" />
            {title}
          </h3>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className="flex items-center gap-2">
          {headerExtra}
          <ExportButtons targetRef={ref} name={exportName || title} />
        </div>
      </div>
      {children}
    </div>
  );
};

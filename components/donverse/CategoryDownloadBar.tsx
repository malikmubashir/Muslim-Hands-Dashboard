import React from 'react';
import { Download } from 'lucide-react';

// A discoverable row of one-click "download these donors" chips, one per
// category of a chart (stipulation, payment, destination…). Sits under the
// chart inside a ChartCard. Marked html2canvas-ignore so it never appears in
// the PNG/PDF chart exports.
export const CategoryDownloadBar: React.FC<{
  label: string;
  items: { name: string }[];
  onPick: (name: string) => void;
  max?: number;
}> = ({ label, items, onPick, max = 16 }) => {
  if (!items || !items.length) return null;
  const shown = items.slice(0, max);
  return (
    <div className="mt-4 border-t border-gray-100 pt-3" data-html2canvas-ignore="true">
      <p className="text-[11px] font-medium text-gray-500 mb-2 flex items-center gap-1.5">
        <Download size={12} /> {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((it) => (
          <button
            key={it.name}
            type="button"
            onClick={() => onPick(it.name)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1C8099] bg-[#28B8D8]/10 hover:text-white hover:bg-[#28B8D8] border border-[#28B8D8]/30 hover:border-[#28B8D8] rounded-full px-2.5 py-1 transition-colors"
            title={`Télécharger les donateurs : ${it.name} (période en cours)`}
          >
            {it.name}
          </button>
        ))}
      </div>
    </div>
  );
};

import React, { useCallback, useState } from 'react';
import { X, UploadCloud, Loader2, AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
import { aggregateDonverse } from '../../lib/aggregateDonverse';
import { uploadDataset } from '../../services/donverseClient';

interface Props {
  onClose: () => void;
  onUpdated: () => void; // reload dataset + toast
}

// ---- Signature-column detection (mirrors scripts/aggregate-donverse.ts) ----
const has = (set: Set<string>, ...cols: string[]) => cols.every((c) => set.has(c));
const hasAny = (set: Set<string>, ...cols: string[]) => cols.some((c) => set.has(c));
const isTransactions = (h: Set<string>) =>
  has(h, 'Donation Amount (Base)', 'Fund Dimension 2', 'Postal Code');
const isDonors = (h: Set<string>) =>
  has(h, 'Total Donation Amount', 'Maximum Donation Date') && hasAny(h, 'RGPD POST IN', 'Reference');

type Role = 'tx' | 'donor' | 'unknown';

/** Read just the header row to classify a workbook (cheap, no full parse). */
function classify(wb: XLSX.WorkBook): Role {
  const headers = new Set<string>();
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sn], {
      header: 1, defval: null, raw: true,
    });
    if (rows && rows[0]) for (const c of rows[0] as any[]) if (c != null) headers.add(String(c).trim());
  }
  if (isTransactions(headers)) return 'tx';
  if (isDonors(headers)) return 'donor';
  return 'unknown';
}

/** Parse the most relevant sheet of a workbook to row objects. */
function rowsOf(wb: XLSX.WorkBook, hint: string): any[] {
  const sn = wb.SheetNames.find((s) => s.toLowerCase().includes(hint.toLowerCase())) || wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: null, raw: true });
}

const UpdateDataModal: React.FC<Props> = ({ onClose, onUpdated }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const list = e.target.files ? Array.from(e.target.files) : [];
    setFiles(list);
  };

  const process = useCallback(async () => {
    setError(null);
    if (files.length < 2) {
      setError('Sélectionnez les DEUX fichiers Excel (transactions + donateurs).');
      return;
    }
    setBusy(true);
    try {
      // 1) Read both files as ArrayBuffers and parse headers to assign roles.
      setPhase('Lecture des fichiers…');
      let txWb: XLSX.WorkBook | null = null;
      let donorWb: XLSX.WorkBook | null = null;
      for (const f of files) {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { cellDates: true, dense: true });
        const role = classify(wb);
        if (role === 'tx' && !txWb) txWb = wb;
        else if (role === 'donor' && !donorWb) donorWb = wb;
      }
      if (!txWb || !donorWb) {
        throw new Error(
          'Impossible d’identifier les deux fichiers. Vérifiez qu’il s’agit bien des exports N3O ' +
          '(transactions: colonnes « Donation Amount (Base) », « Fund Dimension 2 », « Postal Code » ; ' +
          'donateurs: « Total Donation Amount », « Maximum Donation Date »).'
        );
      }

      // 2) Full parse to row objects (the heavy step for ~160k rows).
      setPhase('Traitement en cours… (cela peut prendre quelques secondes)');
      // Yield to the browser so the spinner can paint before the blocking parse.
      await new Promise((r) => setTimeout(r, 50));
      const txRows = rowsOf(txWb, 'dashboard');
      const donorRows = rowsOf(donorWb, 'donateurs');

      // 3) Aggregate + anonymize entirely in the browser. PII never leaves here.
      setPhase('Anonymisation des données…');
      const data = aggregateDonverse(txRows, donorRows, {
        sources: files.map((f) => f.name),
        generatedAt: new Date().toISOString(),
      });

      // 4) Upload ONLY the anonymized aggregate.
      setPhase('Envoi des données anonymisées…');
      await uploadDataset(data);

      setDone(true);
      setTimeout(() => onUpdated(), 600);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
      setPhase('');
    }
  }, [files, onUpdated]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Mettre à jour les données</h2>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-40"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {!done && (
            <>
              <p className="text-sm text-gray-600">
                Sélectionnez les deux exports N3O (transactions et donateurs). Les fichiers sont
                automatiquement reconnus, quel que soit leur nom.
              </p>

              <label className="block border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-emerald-400 transition-colors">
                <UploadCloud size={28} className="mx-auto text-emerald-600 mb-2" />
                <span className="text-sm font-medium text-gray-700">
                  Cliquez pour choisir les fichiers (.xlsx)
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  multiple
                  className="hidden"
                  disabled={busy}
                  onChange={onPick}
                />
              </label>

              {files.length > 0 && (
                <ul className="text-xs text-gray-600 space-y-1">
                  {files.map((f) => (
                    <li key={f.name} className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-500" />
                      {f.name} · {(f.size / 1_000_000).toFixed(1)} Mo
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-xs text-emerald-800">
                <ShieldCheck size={16} className="mt-0.5 shrink-0" />
                <span>
                  Les données personnelles restent dans votre navigateur et ne sont pas envoyées.
                  Seules les statistiques anonymisées sont enregistrées.
                </span>
              </div>

              {busy && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 size={16} className="animate-spin" />
                  {phase || 'Traitement en cours…'}
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </>
          )}

          {done && (
            <div className="flex flex-col items-center text-center py-6">
              <CheckCircle2 size={40} className="text-emerald-500 mb-3" />
              <p className="text-sm font-medium text-gray-800">Données mises à jour.</p>
            </div>
          )}
        </div>

        {!done && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
            <button
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-40"
            >
              Annuler
            </button>
            <button
              onClick={process}
              disabled={busy || files.length < 2}
              className="px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-2"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              {busy ? 'Traitement…' : 'Importer & publier'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UpdateDataModal;

import React, { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard, Map as MapIcon, Users, Loader2, AlertTriangle,
  RefreshCw, CheckCircle2, LucideIcon,
} from 'lucide-react';
import { DonverseData, DonverseView } from './types';
import { OverviewView } from './OverviewView';
import { FranceMapView } from './FranceMapView';
import { DonorsView } from './DonorsView';
import UpdateDataModal from './UpdateDataModal';
import { loadDataset, LoadedDataset } from '../../services/donverseClient';

const TABS: { key: DonverseView; label: string; icon: LucideIcon }[] = [
  { key: 'overview', label: 'Tableau de bord', icon: LayoutDashboard },
  { key: 'map', label: 'Carte de France', icon: MapIcon },
  { key: 'donors', label: 'Donateurs', icon: Users },
];

const DonverseApp: React.FC = () => {
  const [data, setData] = useState<DonverseData | null>(null);
  const [meta, setMeta] = useState<{ source: LoadedDataset['source']; lastUpdated: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<DonverseView>('overview');
  const [showUpdate, setShowUpdate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    loadDataset()
      .then((res) => {
        setData(res.data);
        setMeta({ source: res.source, lastUpdated: res.lastUpdated });
      })
      .catch((e: any) => {
        setError(String(e?.message || e));
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onUpdated = useCallback(() => {
    setShowUpdate(false);
    setToast('Données mises à jour.');
    load();
    setTimeout(() => setToast(null), 3500);
  }, [load]);

  // Friendly data-source label.
  const dataLabel = (() => {
    if (!meta) return 'Données 2025 · anonymisées';
    const d = meta.lastUpdated ? new Date(meta.lastUpdated) : null;
    const when = d && !isNaN(d.getTime()) ? d.toLocaleDateString('fr-FR') : '';
    if (meta.source === 'uploaded') return `Données : mises à jour le ${when}`;
    return `Données de référence (2025)${when ? ' · ' + when : ''}`;
  })();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header
        className="text-white shadow"
        style={{ backgroundImage: 'linear-gradient(to right, #28B8D8, #1C8099)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/brand/mhf-mark-white.png"
              alt="Muslim Hands France"
              className="h-10 w-10"
            />
            <div>
              <h1 className="text-xl font-bold leading-tight tracking-tight text-white">MH DONVERSE</h1>
              <p className="text-white/80 text-sm">Console de Pilotage — Muslim Hands France</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs font-medium text-white bg-white/20 rounded-full px-3 py-1">
              {dataLabel}
            </span>
            <button
              onClick={() => setShowUpdate(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-white/20 hover:bg-white/30 rounded-full px-3 py-1.5 transition-colors"
            >
              <RefreshCw size={14} />
              Mettre à jour
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex gap-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = view === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setView(t.key)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    active
                      ? 'border-white text-white'
                      : 'border-transparent text-white/75 hover:text-white hover:border-white/40'
                  }`}
                >
                  <Icon size={16} />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">
            <AlertTriangle size={20} />
            <span>Impossible de charger les données : {error}</span>
          </div>
        )}

        {!error && !data && (
          <div className="flex items-center justify-center gap-3 text-gray-500 py-32">
            <Loader2 size={22} className="animate-spin" />
            Chargement des données…
          </div>
        )}

        {data && (
          <>
            {view === 'overview' && <OverviewView data={data} />}
            {view === 'map' && <FranceMapView data={data} />}
            {view === 'donors' && <DonorsView data={data} />}
          </>
        )}
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 pb-8 flex items-center gap-4 text-xs text-gray-400">
        <img src="/brand/mhf-logo.png" className="h-8" alt="Muslim Hands France" />
        {data && (
          <p>
            Source : {data.meta.sources.join(', ')} · Généré le{' '}
            {new Date(data.meta.generatedAt).toLocaleDateString('fr-FR')} · Devise {data.meta.currency}
          </p>
        )}
      </footer>

      {showUpdate && (
        <UpdateDataModal onClose={() => setShowUpdate(false)} onUpdated={onUpdated} />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-emerald-600 text-white text-sm font-medium rounded-full px-4 py-2 shadow-lg">
          <CheckCircle2 size={16} />
          {toast}
        </div>
      )}
    </div>
  );
};

export default DonverseApp;

import React, { useEffect, useState } from 'react';
import { LayoutDashboard, Map as MapIcon, Users, Heart, Loader2, AlertTriangle, LucideIcon } from 'lucide-react';
import { DonverseData, DonverseView } from './types';
import { OverviewView } from './OverviewView';
import { FranceMapView } from './FranceMapView';
import { DonorsView } from './DonorsView';

const TABS: { key: DonverseView; label: string; icon: LucideIcon }[] = [
  { key: 'overview', label: 'Tableau de bord', icon: LayoutDashboard },
  { key: 'map', label: 'Carte de France', icon: MapIcon },
  { key: 'donors', label: 'Donateurs', icon: Users },
];

const DonverseApp: React.FC = () => {
  const [data, setData] = useState<DonverseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<DonverseView>('overview');

  useEffect(() => {
    let cancelled = false;
    fetch('data/donverse.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: DonverseData) => { if (!cancelled) setData(json); })
      .catch((e) => { if (!cancelled) setError(String(e?.message || e)); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-emerald-800 to-emerald-600 text-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-white/15 flex items-center justify-center">
              <Heart size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight tracking-tight">MH DONVERSE</h1>
              <p className="text-emerald-100 text-sm">Console de Pilotage — Muslim Hands France</p>
            </div>
          </div>
          <span className="self-start sm:self-auto text-xs font-medium bg-white/15 rounded-full px-3 py-1">
            Données 2025 · anonymisées
          </span>
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
                      : 'border-transparent text-emerald-100 hover:text-white hover:border-white/40'
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

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 pb-8 text-xs text-gray-400">
        {data && (
          <p>
            Source : {data.meta.sources.join(', ')} · Généré le{' '}
            {new Date(data.meta.generatedAt).toLocaleDateString('fr-FR')} · Devise {data.meta.currency}
          </p>
        )}
      </footer>
    </div>
  );
};

export default DonverseApp;

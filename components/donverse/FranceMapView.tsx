import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, RotateCcw } from 'lucide-react';
import { DonverseData } from './types';
import { DonCard, SectionTitle } from './DonCard';
import { fmtEur, fmtEur2, fmtNum } from './format';
import {
  Granularity, MetricKey, METRICS, AreaRow,
  buildAreaIndex, metricValue, quantileBreaks, colorFor,
  GREEN_RAMP, NO_DATA, DOM,
} from './mapMetrics';

const fmtMetric = (v: number, m: MetricKey): string =>
  m === 'amount' ? fmtEur(v) : m === 'avg' ? fmtEur2(v) : fmtNum(v);

export const FranceMapView: React.FC<{ data: DonverseData }> = ({ data }) => {
  const [gran, setGran] = useState<Granularity>('dept');
  const [metric, setMetric] = useState<MetricKey>('amount');
  const [geo, setGeo] = useState<Record<Granularity, any>>({ dept: null, region: null });
  const [hovered, setHovered] = useState<AreaRow | null>(null);
  const [selected, setSelected] = useState<AreaRow | null>(null);

  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);

  // Consolidated area index for the current granularity.
  const areaIndex = useMemo(() => buildAreaIndex(data, gran), [data, gran]);

  // Quantile breaks over the metric values present on the map (excludes DOM with no polygon implicitly via index keys, but keeps all areas).
  const breaks = useMemo(() => {
    const vals = Array.from(areaIndex.values()).map((r) => metricValue(r, metric));
    return quantileBreaks(vals, 5);
  }, [areaIndex, metric]);

  // Resolve a geojson feature -> area key. Depts use properties.code, regions use properties.nom.
  const featureKey = (f: any): string =>
    gran === 'dept' ? String(f.properties.code) : String(f.properties.nom);
  const featureName = (f: any): string => String(f.properties.nom);

  // ---- Load geojson on demand ----
  useEffect(() => {
    if (geo[gran]) return;
    const file = gran === 'dept' ? 'geo/departements.geojson' : 'geo/regions.geojson';
    let cancelled = false;
    fetch(file)
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setGeo((prev) => ({ ...prev, [gran]: json })); })
      .catch((e) => console.error('geojson load failed', e));
    return () => { cancelled = true; };
  }, [gran, geo]);

  // ---- Init map once (guard against StrictMode double-init) ----
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = L.map(containerRef.current, {
      center: [46.6, 2.5],
      zoom: 6,
      scrollWheelZoom: true,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap, © CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; layerRef.current = null; };
  }, []);

  // ---- (Re)build the choropleth layer when geo / granularity / metric change ----
  useEffect(() => {
    const map = mapRef.current;
    const json = geo[gran];
    if (!map || !json) return;

    if (layerRef.current) { layerRef.current.remove(); layerRef.current = null; }

    const styleFeature = (f: any): L.PathOptions => {
      const row = areaIndex.get(featureKey(f));
      const v = metricValue(row, metric);
      return {
        fillColor: colorFor(v, breaks),
        fillOpacity: v > 0 ? 0.85 : 0.4,
        color: '#ffffff',
        weight: 1,
      };
    };

    const layer = L.geoJSON(json, {
      style: styleFeature,
      onEachFeature: (f, lyr) => {
        const key = featureKey(f);
        const name = featureName(f);
        const row = areaIndex.get(key) || { key, name, amount: 0, count: 0, avg: 0, donors: 0, active: 0, ltv: 0 };
        const display: AreaRow = { ...row, name };
        const v = metricValue(display, metric);
        lyr.bindTooltip(
          `<strong>${name}</strong><br/>${METRICS.find((mm) => mm.key === metric)!.label} : ${fmtMetric(v, metric)}`,
          { sticky: true }
        );
        lyr.on({
          mouseover: (e) => {
            (e.target as L.Path).setStyle({ weight: 2.5, color: '#0b5a0b', fillOpacity: 0.95 });
            (e.target as any).bringToFront?.();
            setHovered(display);
          },
          mouseout: (e) => {
            layer.resetStyle(e.target as L.Path);
            setHovered(null);
          },
          click: () => setSelected(display),
        });
      },
    });
    layer.addTo(map);
    layerRef.current = layer;
  }, [geo, gran, metric, areaIndex, breaks]);

  // ---- Top 10 ranking for the current metric (polygon areas only: exclude DOM codes) ----
  const domCodes = new Set(DOM.map((d) => d.code));
  const top10 = useMemo(() => {
    const rows = Array.from(areaIndex.values())
      .filter((r) => (gran === 'dept' ? !domCodes.has(r.key) : true))
      .map((r) => ({ row: r, v: metricValue(r, metric) }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 10);
    return rows;
  }, [areaIndex, metric, gran]);

  // Legend ranges from quantile breaks.
  const legendRows = useMemo(() => {
    const edges = [0, ...breaks];
    return GREEN_RAMP.map((color, i) => {
      const lo = edges[i];
      const hi = i < breaks.length ? breaks[i] : Infinity;
      const label = hi === Infinity
        ? `≥ ${fmtMetric(lo, metric)}`
        : `${fmtMetric(lo, metric)} – ${fmtMetric(hi, metric)}`;
      return { color, label };
    });
  }, [breaks, metric]);

  const detail = selected || hovered;
  const domRows = useMemo(() => {
    const idxDept = buildAreaIndex(data, 'dept');
    return DOM.map((d) => ({ ...d, row: idxDept.get(d.code) }));
  }, [data]);

  const metricLabel = METRICS.find((m) => m.key === metric)!.label;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          {(['dept', 'region'] as Granularity[]).map((g) => (
            <button
              key={g}
              onClick={() => { setGran(g); setSelected(null); }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                gran === g ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {g === 'dept' ? 'Départements' : 'Régions'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Indicateur :</span>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricKey)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </div>

        {selected && (
          <button
            onClick={() => setSelected(null)}
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-emerald-700 px-3 py-1.5 rounded-lg border border-gray-200 bg-white"
          >
            <RotateCcw size={14} /> Réinitialiser
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Map + legend */}
        <div className="lg:col-span-2 space-y-4">
          <DonCard className="p-0 overflow-hidden">
            <div ref={containerRef} className="h-[600px] w-full rounded-xl" />
          </DonCard>

          {/* Legend */}
          <DonCard>
            <SectionTitle sub={metricLabel}>Légende</SectionTitle>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {legendRows.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="inline-block w-4 h-4 rounded" style={{ background: r.color }} />
                  {r.label}
                </div>
              ))}
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="inline-block w-4 h-4 rounded" style={{ background: NO_DATA }} />
                Aucune donnée
              </div>
            </div>
          </DonCard>
        </div>

        {/* Side column */}
        <div className="space-y-4">
          {/* Detail panel */}
          <DonCard>
            <div className="flex items-center gap-2 mb-3">
              <MapPin size={16} className="text-emerald-600" />
              <h3 className="text-sm font-semibold text-gray-800">
                {detail ? `Détail : ${detail.name}` : 'Survolez ou cliquez une zone'}
              </h3>
            </div>
            {detail ? (
              <dl className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                <div><dt className="text-gray-400 text-xs">Montant</dt><dd className="font-semibold text-gray-900">{fmtEur(detail.amount)}</dd></div>
                <div><dt className="text-gray-400 text-xs">Nb dons</dt><dd className="font-semibold text-gray-900">{fmtNum(detail.count)}</dd></div>
                <div><dt className="text-gray-400 text-xs">Don moyen</dt><dd className="font-semibold text-gray-900">{fmtEur2(detail.avg)}</dd></div>
                <div><dt className="text-gray-400 text-xs">Donateurs</dt><dd className="font-semibold text-gray-900">{fmtNum(detail.donors)}</dd></div>
                <div><dt className="text-gray-400 text-xs">Actifs</dt><dd className="font-semibold text-gray-900">{fmtNum(detail.active)}</dd></div>
                <div><dt className="text-gray-400 text-xs">LTV</dt><dd className="font-semibold text-gray-900">{fmtEur(detail.ltv)}</dd></div>
              </dl>
            ) : (
              <p className="text-sm text-gray-400">Les chiffres clés de la zone s'afficheront ici.</p>
            )}
          </DonCard>

          {/* Top 10 ranking */}
          <DonCard>
            <SectionTitle sub={metricLabel}>
              {gran === 'dept' ? 'Top 10 départements' : 'Top 10 régions'}
            </SectionTitle>
            <ol className="space-y-1.5">
              {top10.map((x, i) => (
                <li key={x.row.key} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-5 text-xs text-gray-400 tabular-nums">{i + 1}.</span>
                    <span className="truncate text-gray-700">{x.row.name}</span>
                  </span>
                  <span className="font-semibold text-gray-900 tabular-nums">{fmtMetric(x.v, metric)}</span>
                </li>
              ))}
            </ol>
          </DonCard>

          {/* DOM note */}
          <DonCard>
            <SectionTitle sub="Hors carte métropolitaine (pas de polygone)">DOM</SectionTitle>
            <ul className="space-y-1.5">
              {domRows.map((d) => (
                <li key={d.code} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{d.name}</span>
                  <span className="font-semibold text-gray-900 tabular-nums">
                    {fmtMetric(metricValue(d.row, metric), metric)}
                  </span>
                </li>
              ))}
            </ul>
          </DonCard>
        </div>
      </div>
    </div>
  );
};

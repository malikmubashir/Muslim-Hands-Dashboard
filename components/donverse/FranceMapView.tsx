import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
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

// Turquoise intensity gradient for the postcode heat layer (matches brand).
const HEAT_GRADIENT: Record<number, string> = {
  0.2: '#C8F1F8',
  0.5: '#6FD9E9',
  0.8: '#28B8D8',
  1.0: '#15677A',
};

// Per-postcode value for the active metric.
const postcodeWeight = (
  metric: MetricKey,
  tx: { value: number; count: number } | undefined,
  dn: { count: number; active: number } | undefined,
): number => {
  switch (metric) {
    case 'amount': return tx?.value ?? 0;
    case 'count': return tx?.count ?? 0;
    case 'avg': return tx && tx.count ? tx.value / tx.count : 0;
    case 'donors': return dn?.count ?? 0;
    case 'active': return dn?.active ?? 0;
  }
};

export const FranceMapView: React.FC<{ data: DonverseData }> = ({ data }) => {
  const [gran, setGran] = useState<Granularity>('dept');
  const [metric, setMetric] = useState<MetricKey>('amount');
  const [geo, setGeo] = useState<Record<Granularity, any>>({ dept: null, region: null, postcode: null });
  const [hovered, setHovered] = useState<AreaRow | null>(null);
  const [selected, setSelected] = useState<AreaRow | null>(null);
  // Lazily-loaded postcode -> [lat, lng] centroid map.
  const [centroids, setCentroids] = useState<Record<string, [number, number]> | null>(null);

  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);
  const heatLayerRef = useRef<L.HeatLayer | null>(null);
  const fittedRef = useRef<Granularity | null>(null);

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

  // ---- Load geojson on demand (dept/region only; postcode uses centroids) ----
  useEffect(() => {
    if (gran === 'postcode' || geo[gran]) return;
    const file = gran === 'dept' ? 'geo/departements.geojson' : 'geo/regions.geojson';
    let cancelled = false;
    fetch(file)
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setGeo((prev) => ({ ...prev, [gran]: json })); })
      .catch((e) => console.error('geojson load failed', e));
    return () => { cancelled = true; };
  }, [gran, geo]);

  // ---- Lazily load postcode centroids once when entering postcode mode ----
  useEffect(() => {
    if (gran !== 'postcode' || centroids) return;
    let cancelled = false;
    fetch('geo/postcodes-fr.json')
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setCentroids(json as Record<string, [number, number]>); })
      .catch((e) => console.error('postcode centroids load failed', e));
    return () => { cancelled = true; };
  }, [gran, centroids]);

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
    // The container often lacks its final size on first paint (tab layout / fonts),
    // which makes Leaflet fall back to a world view. Recompute once laid out.
    setTimeout(() => map.invalidateSize(), 0);
    setTimeout(() => map.invalidateSize(), 250);
    return () => { map.remove(); mapRef.current = null; layerRef.current = null; };
  }, []);

  // ---- (Re)build the choropleth layer when geo / granularity / metric change ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // In postcode (heatmap) mode there is no choropleth — tear it down if present.
    if (gran === 'postcode') {
      if (layerRef.current) { layerRef.current.remove(); layerRef.current = null; }
      return;
    }

    const json = geo[gran];
    if (!json) return;

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
            (e.target as L.Path).setStyle({ weight: 2.5, color: '#15677A', fillOpacity: 0.95 });
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
    // Ensure correct sizing, then frame metropolitan France once per granularity
    // (don't re-fit on every metric change — that would yank the user's zoom).
    map.invalidateSize();
    if (fittedRef.current !== gran) {
      // Deterministic France view (a fitBounds/size race could mis-frame on
      // first paint). Re-assert once the container has its final size.
      map.setView([46.6, 2.4], 6);
      fittedRef.current = gran;
      setTimeout(() => { map.invalidateSize(); map.setView([46.6, 2.4], 6); }, 250);
    }
  }, [geo, gran, metric, areaIndex, breaks]);

  // ---- Postcode source rows: merge tx + donors keyed by postcode ----
  const postcodeRows = useMemo(() => {
    const txMap = new Map<string, { value: number; count: number }>();
    for (const t of data.tx.byPostcode ?? []) txMap.set(t.postcode, { value: t.value, count: t.count });
    const dnMap = new Map<string, { count: number; active: number; ltv: number }>();
    for (const d of data.donors.byPostcode ?? []) dnMap.set(d.postcode, { count: d.count, active: d.active, ltv: d.ltv });
    const keys = new Set<string>([...txMap.keys(), ...dnMap.keys()]);
    return Array.from(keys).map((postcode) => {
      const tx = txMap.get(postcode);
      const dn = dnMap.get(postcode);
      return { postcode, tx, dn, weight: postcodeWeight(metric, tx, dn) };
    });
  }, [data, metric]);

  // ---- Heat points [lat, lng, weight] for postcodes that have a centroid ----
  const heatPoints = useMemo(() => {
    if (!centroids) return [] as L.HeatLatLngTuple[];
    const pts: L.HeatLatLngTuple[] = [];
    for (const r of postcodeRows) {
      if (r.weight <= 0) continue;
      const c = centroids[r.postcode];
      if (!c) continue;
      pts.push([c[0], c[1], r.weight]);
    }
    return pts;
  }, [postcodeRows, centroids]);

  // ---- (Re)build the heat layer in postcode mode ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Leaving postcode mode: drop the heat layer.
    if (gran !== 'postcode') {
      if (heatLayerRef.current) { heatLayerRef.current.remove(); heatLayerRef.current = null; }
      return;
    }

    // Remove any prior heat layer before rebuilding (metric change / point change).
    if (heatLayerRef.current) { heatLayerRef.current.remove(); heatLayerRef.current = null; }
    if (heatPoints.length === 0) return;

    const maxWeight = heatPoints.reduce((m, p) => Math.max(m, p[2] ?? 0), 0) || 1;
    const heat = L.heatLayer(heatPoints, {
      max: maxWeight,
      radius: 22,
      blur: 18,
      minOpacity: 0.25,
      gradient: HEAT_GRADIENT,
    });
    heat.addTo(map);
    heatLayerRef.current = heat;

    map.invalidateSize();
    if (fittedRef.current !== 'postcode') {
      map.setView([46.6, 2.3], 6);
      fittedRef.current = 'postcode';
    }
  }, [gran, heatPoints]);

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

  // Top 10 postcodes for the current metric (postcode mode).
  const top10Postcodes = useMemo(() => {
    return postcodeRows
      .filter((r) => r.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10);
  }, [postcodeRows]);

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
          {(['region', 'dept', 'postcode'] as Granularity[]).map((g) => (
            <button
              key={g}
              onClick={() => { setGran(g); setSelected(null); setHovered(null); }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                gran === g ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {g === 'dept' ? 'Départements' : g === 'region' ? 'Régions' : 'Code postal (carte de chaleur)'}
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
            {gran === 'postcode' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-xs text-gray-600">
                  <span>faible</span>
                  <span
                    className="inline-block h-3 flex-1 rounded"
                    style={{ background: 'linear-gradient(to right, #C8F1F8, #6FD9E9, #28B8D8, #15677A)' }}
                  />
                  <span>élevé</span>
                </div>
                <p className="text-xs text-gray-500">
                  Carte de chaleur par code postal · les zones de moins de{' '}
                  {data.meta.suppressMinDonors ?? 5} donateurs sont masquées.
                </p>
              </div>
            ) : (
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
            )}
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
              {gran === 'dept' ? 'Top 10 départements' : gran === 'region' ? 'Top 10 régions' : 'Top 10 codes postaux'}
            </SectionTitle>
            <ol className="space-y-1.5">
              {gran === 'postcode'
                ? top10Postcodes.map((x, i) => (
                    <li key={x.postcode} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-5 text-xs text-gray-400 tabular-nums">{i + 1}.</span>
                        <span className="truncate text-gray-700">{x.postcode}</span>
                      </span>
                      <span className="font-semibold text-gray-900 tabular-nums">{fmtMetric(x.weight, metric)}</span>
                    </li>
                  ))
                : top10.map((x, i) => (
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

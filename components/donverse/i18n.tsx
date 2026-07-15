// Lightweight FR/EN internationalisation for the dashboard UI.
//
// SCOPE: this translates the interface chrome only (labels, titles, buttons,
// hints, messages). It deliberately does NOT translate data VALUES that come
// from the N3O export (fund/cause names, stipulations, destinations, regions,
// cities, activity/tier/consent labels) — those are the CRM's own strings and
// are used as filter keys for the donor downloads, so translating them would
// break the exports.
//
// Usage: wrap the app in <LangProvider>, then `const { t, lang, setLang } =
// useT()`. `t('some.key')` returns the string for the current language,
// falling back to French, then to the key itself.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Lang = 'fr' | 'en';
const STORAGE_KEY = 'mh_lang';

type Dict = Record<string, string>;

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const LangCtx = createContext<Ctx | null>(null);

const FR: Dict = {
  // nav / header
  'nav.dashboard': 'Tableau de bord',
  'nav.map': 'Carte de France',
  'nav.donors': 'Donateurs',
  'header.subtitle': 'Console de pilotage des collectes',
  'header.update': 'Mettre à jour',
  'header.dataRef': 'Données de référence (2025)',
  'header.dataUpdated': 'Données : mises à jour le',
  // gate
  'gate.subtitle': 'Console de pilotage — accès équipe',
  'gate.password': 'Mot de passe de l’équipe',
  'gate.enter': 'Accéder',
  'gate.sessionNote': 'Le mot de passe est conservé uniquement pour cette session.',
  'gate.wrong': 'Mot de passe incorrect.',
  'gate.checking': 'Vérification…',
  // common
  'common.download': 'Télécharger',
  'common.downloadDonors': 'Télécharger les donateurs',
  'common.loading': 'Chargement des données…',
  'common.loadError': 'Impossible de charger les données :',
  // date bar
  'date.period': 'Période',
  'date.from': 'Du',
  'date.to': 'Au',
  'date.all': 'Toute la période',
  'date.y2025': '2025',
  'date.last3m': '3 derniers mois',
  // overview KPIs
  'kpi.totalRaised': 'Total collecté',
  'kpi.numDonations': 'Nombre de dons',
  'kpi.avgGift': 'Don moyen',
  'kpi.donors': 'Donateurs',
  'kpi.zakatShare': 'Part Zakat',
  'kpi.paShare': 'Part prélèvements (PA)',
  'kpi.topCause': 'Top cause',
  'kpi.topDest': 'Top destination',
  'kpi.hint.distinctPeriod': 'distincts sur la période',
  'kpi.hint.havingGiven': 'ayant donné',
  'kpi.hint.totalBase': 'base totale',
  // overview sections
  'ov.causes': 'Causes / Thèmes',
  'ov.causesHint': 'Cliquez une cause pour explorer le détail, ou « Télécharger » pour exporter ses donateurs (période en cours).',
  'ov.stipTitle': 'Répartition par stipulation',
  'ov.stipSub': 'Sadaqa / Zakat / …',
  'ov.clickSlice': 'Cliquez une part pour télécharger ses donateurs',
  'ov.clickBar': 'Cliquez une barre pour télécharger ses donateurs',
  'ov.payTitle': 'Moyens de paiement',
  'ov.paySub': 'Le prélèvement automatique (PA) est mis en évidence',
  'ov.payClickSub': 'Cliquez une barre pour télécharger ses donateurs · PA mis en évidence',
  'ov.evoTitle': 'Évolution mensuelle',
  'ov.evoSub': 'Montant collecté par mois',
  'ov.destTitle': 'Top destinations',
  'ov.destSub': 'Top 8 par montant collecté',
  'ov.destClickSub': 'Cliquez une barre pour télécharger ses donateurs (top 8)',
  'ov.dlByStip': 'Télécharger les donateurs par stipulation',
  'ov.dlByPay': 'Télécharger les donateurs par moyen de paiement',
  'ov.dlByDest': 'Télécharger les donateurs par destination',
  'ov.monthLabel': 'Mois',
  // theme detail
  'td.allCauses': 'Toutes les causes',
  'td.dlThisCause': 'Télécharger les donateurs de cette cause',
  'td.period': 'Période',
  'td.pctOfTotal': '% du total collecté',
  'td.bestMonth': 'Meilleur mois',
  'td.stipulation': 'Stipulation',
  'td.destinations': 'Destinations',
  'td.destSub': 'Top 10 par montant collecté',
  'td.cities': 'Top 10 villes',
  'td.citiesSub': 'Là où le plus a été collecté (estimation top 30/mois)',
  'td.depts': 'Top 10 départements',
  'td.deptsSub': 'Par montant collecté',
  'td.dlByCity': 'Télécharger les donateurs par ville',
  'td.dlByDept': 'Télécharger les donateurs par département',
  'td.noData': 'Aucune donnée pour cette cause sur la période sélectionnée.',
};

Object.assign(FR, {
  // map
  'map.regions': 'Régions',
  'map.departments': 'Départements',
  'map.postcode': 'Code postal (carte de chaleur)',
  'map.indicator': 'Indicateur :',
  'map.choroplethNote': 'Choroplèthe filtré par la période sélectionnée',
  'map.hoverZone': 'Survolez ou cliquez une zone',
  'map.zoneHint': 'Les chiffres clés de la zone s’afficheront ici.',
  'map.detail': 'Détail',
  'map.amount': 'Montant',
  'map.numDonations': 'Nb dons',
  'map.avgGift': 'Don moyen',
  'map.donors': 'Donateurs',
  'map.active': 'Actifs',
  'map.ltv': 'LTV',
  'map.amountCollected': 'Montant collecté',
  'map.search': 'Recherche',
  'map.postcodeLabel': 'Code postal',
  'map.cityLabel': 'Ville',
  'map.fullYearStats': 'Statistiques sur l’année complète.',
  'map.periodStats': 'Statistiques sur la période sélectionnée.',
  'map.periodStatsNoLoc': 'Statistiques sur la période sélectionnée · localisation indisponible.',
  'map.top10depts': 'Top 10 départements',
  'map.top10regions': 'Top 10 régions',
  'map.top10postcodes': 'Top 10 codes postaux',
  'map.top10cities': 'Top 10 villes',
  'map.top10citiesSub': 'Montant collecté · période sélectionnée',
  'map.noData': 'Aucune donnée',
  'map.search.btn': 'Rechercher',
  'map.search.placeholder': 'Code postal ou ville (ex. 75011 ou Marseille)',
  'map.search.hint': 'Code postal : année complète · Ville : période sélectionnée.',
  'map.legend': 'Légende',
  'map.heatFullYear': 'Carte de chaleur sur l’année complète (non filtrée par la période).',
  'map.noCityPeriod': 'Aucune ville sur la période sélectionnée.',
  'map.noCityData': 'Aucune donnée pour cette ville sur la période.',
  'map.noPcData': 'Aucune donnée pour ce code postal (moins de 5 donateurs, ou code absent des dons).',
  'map.metric.amount': 'Montant collecté',
  'map.metric.count': 'Nombre de dons',
  'map.metric.avg': 'Don moyen',
  'map.metric.donors': 'Donateurs',
  'map.metric.active': 'Donateurs actifs',
  'map.reset': 'Réinitialiser',
  'map.low': 'faible',
  'map.high': 'élevé',
  'map.pcHeatPre': 'Carte de chaleur par code postal · les zones de moins de',
  'map.pcHeatPost': 'donateurs sont masquées.',
  // donors
  'dn.donorsPeriod': 'Donateurs sur la période',
  'dn.baseSuffix': 'en base au total',
  'dn.wholeBase': 'Toute la base',
  'dn.newDonors': 'Nouveaux donateurs',
  'dn.ofPeriodDonors': 'des donateurs de la période',
  'dn.returningDonors': 'Donateurs fidèles',
  'dn.returningHint': 'donateurs déjà connus',
  'dn.avgPerDonor': 'Montant moyen / donateur',
  'dn.avgGift': 'don moyen',
  'dn.needRecords': 'Chargement des données…',
  'dn.consentPeriod': 'Parmi les donateurs de la période',
  'dn.pctOptIn': '% Opt-In (RGPD)',
  'dn.consentRate': 'Taux de consentement',
  'dn.paTitle': 'Dynamique PA — mensuel',
  'dn.paSub': 'Prélèvement automatique : nouveaux / arrêtés par mois · ligne violette : total PA actifs cumulés (axe droit)',
  'dn.paActive': 'PA actifs',
  'dn.paStopped': 'PA arrêtés',
  'dn.paStarted': 'Nouveaux PA',
  'dn.paStoppedLegend': 'PA arrêtés',
  'dn.paNet': 'Solde net',
  'dn.paCumul': 'PA actifs (cumul)',
  'dn.genreTitle': 'Répartition Femme / Homme / Couple',
  'dn.genreSub': 'Basé sur la civilité (Title)',
  'dn.dlByGenre': 'Télécharger les donateurs par genre',
  'dn.activityTitle': 'Activité des donateurs',
  'dn.activitySub': 'Actif / Inactif / Oublié',
  'dn.tierTitle': 'Paliers de générosité',
  'dn.tierSub': 'Kind / Engaged / Generous / Major',
  'dn.typeTitle': 'Type de donateur',
  'dn.typeSub': 'Individual / Organization',
  'dn.consentTitle': 'Consentement',
  'dn.consentSub': 'RGPD — Opt-In mis en évidence',
  'dn.regionsTitle': 'Top 10 régions',
  'dn.regionsSub': 'Par nombre de donateurs',
  'dn.dlByActivity': 'Télécharger les donateurs par activité',
  'dn.dlByTier': 'Télécharger les donateurs par palier',
  'dn.dlByType': 'Télécharger les donateurs par type',
  'dn.dlByConsent': 'Télécharger les donateurs par consentement (courrier)',
  'dn.snapshotNote': 'KPIs filtrés par la période sélectionnée. Graphiques et téléchargements couvrent toute la base.',
  // toasts
  'toast.preparing': 'Préparation du téléchargement…',
  'toast.preparingContacts': 'Préparation des données de contact…',
  'toast.noContacts': 'Aucune donnée de contact disponible. Mettez à jour les données.',
  'toast.downloaded': 'donateurs téléchargés (Excel).',
  'toast.noneSelection': 'Aucun donateur pour cette sélection.',
  'toast.failed': 'Échec du téléchargement.',
  'toast.dataUpdated': 'Données mises à jour.',
  // export buttons
  'exp.png': 'Télécharger en PNG',
  'exp.pdf': 'Télécharger en PDF',
  // footer
  'foot.source': 'Source',
  'foot.generatedOn': 'Généré le',
  'foot.currency': 'Devise',
  // legacy
  'legacy.notice': 'Ce jeu de données ne contient pas le cube (mois × thème) requis pour le filtre par période et l’exploration par cause. Mettez à jour les données pour activer ces fonctionnalités.',
  // update-data modal
  'modal.title': 'Mettre à jour les données',
  'modal.close': 'Fermer',
  'modal.intro': 'Sélectionnez les deux exports N3O (transactions et donateurs). Les fichiers sont automatiquement reconnus, quel que soit leur nom.',
  'modal.pick': 'Cliquez pour choisir les fichiers (.xlsx)',
  'modal.privacy': 'Les données personnelles restent dans votre navigateur et ne sont pas envoyées. Seules les statistiques anonymisées sont enregistrées.',
  'modal.processing': 'Traitement en cours…',
  'modal.cancel': 'Annuler',
  'modal.import': 'Importer & publier',
  'modal.done': 'Données mises à jour.',
  'modal.needTwo': 'Sélectionnez les DEUX fichiers Excel (transactions + donateurs).',
  'modal.cantId': 'Impossible d’identifier les deux fichiers. Vérifiez qu’il s’agit bien des exports N3O (transactions: colonnes « Donation Amount (Base) », « Fund Dimension 2 », « Postal Code » ; donateurs: « Total Donation Amount », « Maximum Donation Date »).',
  'modal.phase.reading': 'Lecture des fichiers…',
  'modal.phase.processing': 'Traitement en cours… (cela peut prendre quelques secondes)',
  'modal.phase.anon': 'Anonymisation des données…',
  'modal.phase.upload': 'Envoi des données anonymisées…',
  'modal.phase.encrypt': 'Chiffrement et enregistrement de l’extraction…',
  'modal.mo': 'Mo',
});

const EN: Dict = {
  'nav.dashboard': 'Dashboard',
  'nav.map': 'France Map',
  'nav.donors': 'Donors',
  'header.subtitle': 'Fundraising control console',
  'header.update': 'Update data',
  'header.dataRef': 'Reference data (2025)',
  'header.dataUpdated': 'Data: updated on',
  'gate.subtitle': 'Fundraising control console — team access',
  'gate.password': 'Team password',
  'gate.enter': 'Enter',
  'gate.sessionNote': 'The password is kept for this browser session only.',
  'gate.wrong': 'Incorrect password.',
  'gate.checking': 'Checking…',
  'common.download': 'Download',
  'common.downloadDonors': 'Download donors',
  'common.loading': 'Loading data…',
  'common.loadError': 'Unable to load data:',
  'date.period': 'Period',
  'date.from': 'From',
  'date.to': 'To',
  'date.all': 'All time',
  'date.y2025': '2025',
  'date.last3m': 'Last 3 months',
  'kpi.totalRaised': 'Total raised',
  'kpi.numDonations': 'Number of donations',
  'kpi.avgGift': 'Average gift',
  'kpi.donors': 'Donors',
  'kpi.zakatShare': 'Zakat share',
  'kpi.paShare': 'Direct debit share (PA)',
  'kpi.topCause': 'Top cause',
  'kpi.topDest': 'Top destination',
  'kpi.hint.distinctPeriod': 'distinct in the period',
  'kpi.hint.havingGiven': 'who gave',
  'kpi.hint.totalBase': 'total base',
  'ov.causes': 'Causes / Themes',
  'ov.causesHint': 'Click a cause to explore the detail, or “Download” to export its donors (current period).',
  'ov.stipTitle': 'Breakdown by stipulation',
  'ov.stipSub': 'Sadaqa / Zakat / …',
  'ov.clickSlice': 'Click a slice to download its donors',
  'ov.clickBar': 'Click a bar to download its donors',
  'ov.payTitle': 'Payment methods',
  'ov.paySub': 'Direct debit (PA) is highlighted',
  'ov.payClickSub': 'Click a bar to download its donors · direct debit highlighted',
  'ov.evoTitle': 'Monthly trend',
  'ov.evoSub': 'Amount raised per month',
  'ov.destTitle': 'Top destinations',
  'ov.destSub': 'Top 8 by amount raised',
  'ov.destClickSub': 'Click a bar to download its donors (top 8)',
  'ov.dlByStip': 'Download donors by stipulation',
  'ov.dlByPay': 'Download donors by payment method',
  'ov.dlByDest': 'Download donors by destination',
  'ov.monthLabel': 'Month',
  'td.allCauses': 'All causes',
  'td.dlThisCause': 'Download this cause’s donors',
  'td.period': 'Period',
  'td.pctOfTotal': '% of total raised',
  'td.bestMonth': 'Best month',
  'td.stipulation': 'Stipulation',
  'td.destinations': 'Destinations',
  'td.destSub': 'Top 10 by amount raised',
  'td.cities': 'Top 10 cities',
  'td.citiesSub': 'Where the most was raised (top 30/month estimate)',
  'td.depts': 'Top 10 departments',
  'td.deptsSub': 'By amount raised',
  'td.dlByCity': 'Download donors by city',
  'td.dlByDept': 'Download donors by department',
  'td.noData': 'No data for this cause in the selected period.',
  'map.regions': 'Regions',
  'map.departments': 'Departments',
  'map.postcode': 'Postal code (heatmap)',
  'map.indicator': 'Indicator:',
  'map.choroplethNote': 'Choropleth filtered by the selected period',
  'map.hoverZone': 'Hover or click a zone',
  'map.zoneHint': 'The zone’s key figures will appear here.',
  'map.detail': 'Detail',
  'map.amount': 'Amount',
  'map.numDonations': 'No. of donations',
  'map.avgGift': 'Average gift',
  'map.donors': 'Donors',
  'map.active': 'Active',
  'map.ltv': 'LTV',
  'map.amountCollected': 'Amount raised',
  'map.search': 'Search',
  'map.postcodeLabel': 'Postal code',
  'map.cityLabel': 'City',
  'map.fullYearStats': 'Statistics for the full year.',
  'map.periodStats': 'Statistics for the selected period.',
  'map.periodStatsNoLoc': 'Statistics for the selected period · location unavailable.',
  'map.top10depts': 'Top 10 departments',
  'map.top10regions': 'Top 10 regions',
  'map.top10postcodes': 'Top 10 postal codes',
  'map.top10cities': 'Top 10 cities',
  'map.top10citiesSub': 'Amount raised · selected period',
  'map.noData': 'No data',
  'map.search.btn': 'Search',
  'map.search.placeholder': 'Postal code or city (e.g. 75011 or Marseille)',
  'map.search.hint': 'Postal code: full year · City: selected period.',
  'map.legend': 'Legend',
  'map.heatFullYear': 'Heatmap over the full year (not filtered by the period).',
  'map.noCityPeriod': 'No city in the selected period.',
  'map.noCityData': 'No data for this city in the period.',
  'map.noPcData': 'No data for this postal code (fewer than 5 donors, or code absent from donations).',
  'map.metric.amount': 'Amount raised',
  'map.metric.count': 'Number of donations',
  'map.metric.avg': 'Average gift',
  'map.metric.donors': 'Donors',
  'map.metric.active': 'Active donors',
  'map.reset': 'Reset',
  'map.low': 'low',
  'map.high': 'high',
  'map.pcHeatPre': 'Postcode heatmap · areas with fewer than',
  'map.pcHeatPost': 'donors are hidden.',
  'dn.donorsPeriod': 'Donors in period',
  'dn.baseSuffix': 'in total base',
  'dn.wholeBase': 'Whole base',
  'dn.newDonors': 'New donors',
  'dn.ofPeriodDonors': 'of period donors',
  'dn.returningDonors': 'Returning donors',
  'dn.returningHint': 'previously known donors',
  'dn.avgPerDonor': 'Avg amount / donor',
  'dn.avgGift': 'avg gift',
  'dn.needRecords': 'Loading records…',
  'dn.consentPeriod': 'Among period donors',
  'dn.pctOptIn': '% Opt-In (GDPR)',
  'dn.consentRate': 'Consent rate',
  'dn.paTitle': 'Direct debit dynamics — monthly',
  'dn.paSub': 'Direct debit (PA): new / stopped per month · purple line: cumulative active PA (right axis)',
  'dn.paActive': 'Active PA',
  'dn.paStopped': 'Stopped PA',
  'dn.paStarted': 'New PA',
  'dn.paStoppedLegend': 'Stopped PA',
  'dn.paNet': 'Net balance',
  'dn.paCumul': 'Active PA (cumulative)',
  'dn.genreTitle': 'Female / Male / Couple split',
  'dn.genreSub': 'Based on civility (Title)',
  'dn.dlByGenre': 'Download donors by gender',
  'dn.activityTitle': 'Donor activity',
  'dn.activitySub': 'Active / Inactive / Lapsed',
  'dn.tierTitle': 'Generosity tiers',
  'dn.tierSub': 'Kind / Engaged / Generous / Major',
  'dn.typeTitle': 'Donor type',
  'dn.typeSub': 'Individual / Organization',
  'dn.consentTitle': 'Consent',
  'dn.consentSub': 'GDPR — Opt-In highlighted',
  'dn.regionsTitle': 'Top 10 regions',
  'dn.regionsSub': 'By number of donors',
  'dn.dlByActivity': 'Download donors by activity',
  'dn.dlByTier': 'Download donors by tier',
  'dn.dlByType': 'Download donors by type',
  'dn.dlByConsent': 'Download donors by consent (post)',
  'dn.snapshotNote': 'KPIs follow the selected date range. Charts and downloads cover the whole base.',
  'toast.preparing': 'Preparing download…',
  'toast.preparingContacts': 'Preparing contact data…',
  'toast.noContacts': 'No contact data available. Update the data.',
  'toast.downloaded': 'donors downloaded (Excel).',
  'toast.noneSelection': 'No donor for this selection.',
  'toast.failed': 'Download failed.',
  'toast.dataUpdated': 'Data updated.',
  'exp.png': 'Download as PNG',
  'exp.pdf': 'Download as PDF',
  'foot.source': 'Source',
  'foot.generatedOn': 'Generated on',
  'foot.currency': 'Currency',
  'legacy.notice': 'This dataset does not contain the (month × theme) cube required for the period filter and cause drill-down. Update the data to enable these features.',
  'modal.title': 'Update data',
  'modal.close': 'Close',
  'modal.intro': 'Select the two N3O exports (transactions and donors). The files are detected automatically, whatever their name.',
  'modal.pick': 'Click to choose the files (.xlsx)',
  'modal.privacy': 'Personal data stays in your browser and is not sent. Only anonymised statistics are stored.',
  'modal.processing': 'Processing…',
  'modal.cancel': 'Cancel',
  'modal.import': 'Import & publish',
  'modal.done': 'Data updated.',
  'modal.needTwo': 'Select BOTH Excel files (transactions + donors).',
  'modal.cantId': 'Could not identify the two files. Check that these are the N3O exports (transactions: columns “Donation Amount (Base)”, “Fund Dimension 2”, “Postal Code”; donors: “Total Donation Amount”, “Maximum Donation Date”).',
  'modal.phase.reading': 'Reading files…',
  'modal.phase.processing': 'Processing… (this may take a few seconds)',
  'modal.phase.anon': 'Anonymising data…',
  'modal.phase.upload': 'Uploading anonymised data…',
  'modal.phase.encrypt': 'Encrypting and saving the extraction…',
  'modal.mo': 'MB',
};

const DICTS: Record<Lang, Dict> = { fr: FR, en: EN };

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'fr') return v;
  } catch { /* ignore */ }
  return 'fr';
}

export const LangProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { document.documentElement.lang = lang; } catch { /* ignore */ }
  }, [lang]);

  const t = useCallback(
    (key: string) => DICTS[lang][key] ?? FR[key] ?? key,
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
};

export function useT(): Ctx {
  const ctx = useContext(LangCtx);
  // Safe fallback if used outside a provider (returns French, no toggle).
  if (!ctx) return { lang: 'fr', setLang: () => {}, t: (k: string) => FR[k] ?? k };
  return ctx;
}

/** Header FR/EN toggle button. Shows the language it will switch TO. */
export const LangToggle: React.FC = () => {
  const { lang, setLang } = useT();
  const next: Lang = lang === 'fr' ? 'en' : 'fr';
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/20 hover:bg-white/30 rounded-full px-3 py-1.5 transition-colors"
      title={lang === 'fr' ? 'Switch to English' : 'Passer en français'}
      aria-label={lang === 'fr' ? 'Switch to English' : 'Passer en français'}
    >
      {next.toUpperCase()}
    </button>
  );
};

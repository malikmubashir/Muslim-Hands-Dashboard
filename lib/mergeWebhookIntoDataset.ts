/**
 * Merge processed N3O webhook donation events into the rendered dataset
 * (DonverseData — what /api/data serves and the dashboard displays).
 *
 * Scope (v1, honest about limits):
 *   UPDATED : meta totals/dates, tx.byMonth, tx.byTheme, tx.byDestination,
 *             tx.byStipulation, tx.byPayment, cube (day × theme cells with
 *             stip/pay/dest breakdowns), days/months/themes/dailyDonations.
 *   NOT     : geographic aggregates (byDept/byRegion/postcode/city — the
 *             donation webhook payload carries no address data) and all
 *             donors.* aggregates (donor list has no webhook equivalent).
 *             Those advance on the next xlsx refresh, which also serves as
 *             periodic reconciliation for refunds/corrections.
 *
 * Only donation.created events are merged; donation.updated is skipped to
 * avoid double counting (reconciled by the periodic xlsx refresh).
 */

import type { DonverseData, CubeCell } from '../components/donverse/types';
import { ProcessedEvent } from './webhookProcessor.js';

export interface DatasetMergeResult {
  merged: number;   // donations applied
  skipped: number;  // events ignored (wrong type, bad date, no items)
  amount: number;   // total € applied
}

interface NamedRow { name: string; value: number; count: number; }

const bumpNamed = (arr: NamedRow[], name: string, amount: number): void => {
  let row = arr.find((r) => r.name === name);
  if (!row) { row = { name, value: 0, count: 0 }; arr.push(row); }
  row.value += amount;
  row.count += 1;
};

/** Increment a positional cube tuple ([name, value, count, ...]) by name. */
const bumpTuple = (arr: any[], name: string, amount: number, extra?: any[]): void => {
  let e = arr.find((x) => x[0] === name);
  if (!e) { e = [name, 0, 0, ...(extra ?? [])]; arr.push(e); }
  e[1] += amount;
  e[2] += 1;
};

export const mergeDonationsIntoDataset = (
  data: DonverseData,
  events: ProcessedEvent[]
): DatasetMergeResult => {
  let merged = 0;
  let skipped = 0;
  let amountTotal = 0;

  for (const ev of events) {
    if (ev.event_type !== 'donation.created' || !ev.transformed_data) { skipped++; continue; }
    const d = ev.transformed_data;
    const date: string = String(d.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped++; continue; }
    const items: any[] = Array.isArray(d.items) ? d.items : [];
    if (items.length === 0) { skipped++; continue; }

    const month = date.slice(0, 7);
    const amount = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);

    // ---- meta ----
    data.meta.txRows += items.length;
    data.meta.txTotalBase += amount;
    if (data.meta.txDonationCount != null) data.meta.txDonationCount += 1;
    if (!data.meta.dateMax || date > data.meta.dateMax) data.meta.dateMax = date;
    if (!data.meta.dateMin || date < data.meta.dateMin) data.meta.dateMin = date;
    if (month > data.meta.monthMax) data.meta.monthMax = month;

    // ---- timeline ----
    let mrow = data.tx.byMonth.find((r) => r.month === month);
    if (!mrow) {
      mrow = { month, amount: 0, count: 0 };
      data.tx.byMonth.push(mrow);
      data.tx.byMonth.sort((a, b) => a.month.localeCompare(b.month));
    }
    mrow.amount += amount;
    mrow.count += items.length;

    if (data.days && !data.days.includes(date)) { data.days.push(date); data.days.sort(); }
    if (data.months && !data.months.includes(month)) { data.months.push(month); data.months.sort(); }
    if (data.dailyDonations) data.dailyDonations[date] = (data.dailyDonations[date] || 0) + 1;

    // ---- per-allocation breakdowns ----
    const pay = String(d.payment_method || '').trim();
    for (const it of items) {
      const amt = Number(it.amount) || 0;
      const theme = (String(it.theme || '').trim()) || 'Autre';
      const dest = String(it.destination || '').trim();
      const stip = String(it.stipulation || '').trim();

      bumpNamed(data.tx.byTheme, theme, amt);
      if (dest) bumpNamed(data.tx.byDestination, dest, amt);
      if (stip) bumpNamed(data.tx.byStipulation, stip, amt);
      if (pay) {
        let p = data.tx.byPayment.find((r) => r.name === pay);
        if (!p) { p = { name: pay, value: 0, count: 0, isPA: false }; data.tx.byPayment.push(p); }
        p.value += amt;
        p.count += 1;
      }
      if (data.themes && !data.themes.includes(theme)) data.themes.push(theme);

      // ---- cube (day × theme) — powers date-range filtering + drill-down ----
      if (data.cube) {
        let cell = data.cube.find((c) => c.d === date && c.t === theme);
        if (!cell) {
          cell = { d: date, t: theme, v: 0, c: 0, stip: [], pay: [], dest: [], city: [], dept: [] } as CubeCell;
          data.cube.push(cell);
        }
        cell.v += amt;
        cell.c += 1;
        if (stip) bumpTuple(cell.stip as any[], stip, amt);
        if (pay) bumpTuple(cell.pay as any[], pay, amt, [0]); // isPA unknown → 0
        if (dest) bumpTuple(cell.dest as any[], dest, amt);
        // city/dept unknown from webhook payload — geographic views lag until
        // the next xlsx refresh (documented limitation).
      }
    }

    merged++;
    amountTotal += amount;
  }

  return { merged, skipped, amount: amountTotal };
};

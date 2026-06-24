import React from 'react';

export const CustomTooltip = ({ active, payload, label, lang }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const name = data.name || data.label || label;
    const value = data.value !== undefined ? data.value : data.amount;
    const count = data.count;

    const locale = lang === 'en' ? 'en-US' : 'fr-FR';
    let amountLabel = 'Montant:';
    let countLabel = 'Nombre:';

    if (lang === 'en') {
      amountLabel = 'Amount:';
      countLabel = 'Count:';
    } else if (lang === 'ur') {
      amountLabel = 'رقم:';
      countLabel = 'تعداد:';
    }

    return (
      <div className="bg-white p-3 border border-gray-200 shadow-xl rounded-lg z-50">
        <p className={`font-bold text-gray-800 mb-2 border-b border-gray-100 pb-1 ${lang === 'ur' ? 'font-urdu text-right' : ''}`}>{name}</p>
        <div className="space-y-1">
          <p className="text-sm text-green-700 font-semibold flex justify-between gap-4">
            <span className={lang === 'ur' ? 'font-urdu' : ''}>{amountLabel}</span>
            <span>{new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(value)}</span>
          </p>
          {count !== undefined && (
            <p className="text-sm text-gray-600 flex justify-between gap-4">
              <span className={lang === 'ur' ? 'font-urdu' : ''}>{countLabel}</span>
              <span className="font-medium">{count}</span>
            </p>
          )}
        </div>
      </div>
    );
  }
  return null;
};

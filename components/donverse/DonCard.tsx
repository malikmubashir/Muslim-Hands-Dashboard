import React from 'react';

// Lightweight white card used across DONVERSE views.
export const DonCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-5 ${className}`}>
    {children}
  </div>
);

export const SectionTitle: React.FC<{ children: React.ReactNode; sub?: string }> = ({ children, sub }) => (
  <div className="mb-4">
    <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">{children}</h3>
    {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
  </div>
);

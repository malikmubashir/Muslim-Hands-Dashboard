import React, { useState } from 'react';
import { Lock, Loader2, AlertTriangle } from 'lucide-react';
import { checkPassword, setStoredPassword } from '../../services/donverseClient';

interface Props {
  onUnlock: () => void;
}

/**
 * Shared-password screen. Shown when no valid password is in sessionStorage.
 * On submit, validates against /api/auth; on success stores the password for
 * the session and calls onUnlock(); on failure shows a French error.
 *
 * Brand: Muslim Hands France turquoise (#28B8D8 → #1C8099).
 */
const PasswordGate: React.FC<Props> = ({ onUnlock }) => {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await checkPassword(pw);
      if (ok) {
        setStoredPassword(pw);
        onUnlock();
      } else {
        setError('Mot de passe incorrect.');
      }
    } catch {
      setError('Impossible de vérifier le mot de passe. Réessayez.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundImage: 'linear-gradient(to bottom right, #28B8D8, #1C8099)' }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8"
      >
        <div className="flex flex-col items-center text-center mb-6">
          <img
            src="/brand/mhf-mark.png"
            alt="Muslim Hands France"
            className="h-14 w-14 mb-3"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/brand/mhf-mark-white.png'; }}
          />
          <h1 className="text-lg font-bold text-gray-900">Muslim Hands France</h1>
          <p className="text-sm text-gray-500">Console de pilotage — accès équipe</p>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Mot de passe de l’équipe
        </label>
        <div className="relative">
          <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="password"
            autoFocus
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': '#28B8D8' } as React.CSSProperties}
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm mt-3">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !pw}
          className="mt-5 w-full text-white font-medium rounded-lg py-2.5 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#1C8099' }}
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {busy ? 'Vérification…' : 'Accéder'}
        </button>

        <p className="text-xs text-gray-400 mt-4 text-center">
          Le mot de passe est conservé uniquement pour cette session.
        </p>
      </form>
    </div>
  );
};

export default PasswordGate;

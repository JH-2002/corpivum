'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useStoredValue } from '@/lib/browser-store';
import { parseStoredPeriod, type Period } from '@/lib/period';

const PERIOD_STORAGE_KEY = 'hm.period';

interface ShellContextValue {
  period: Period;
  setPeriod: (period: Period) => void;
  quickLogOpen: boolean;
  openQuickLog: () => void;
  closeQuickLog: () => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

/** Estado global do shell: período selecionado (persistido na sessão, §10) e registro rápido. */
export function ShellProvider({ children }: { children: ReactNode }) {
  const [rawPeriod, setRawPeriod] = useStoredValue('session', PERIOD_STORAGE_KEY);
  const [quickLogOpen, setQuickLogOpen] = useState(false);

  const period = useMemo(() => parseStoredPeriod(rawPeriod), [rawPeriod]);
  const setPeriod = useCallback(
    (next: Period) => setRawPeriod(JSON.stringify(next)),
    [setRawPeriod],
  );
  const openQuickLog = useCallback(() => setQuickLogOpen(true), []);
  const closeQuickLog = useCallback(() => setQuickLogOpen(false), []);

  const value = useMemo(
    () => ({ period, setPeriod, quickLogOpen, openQuickLog, closeQuickLog }),
    [period, setPeriod, quickLogOpen, openQuickLog, closeQuickLog],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  const context = useContext(ShellContext);
  if (!context) throw new Error('useShell precisa estar dentro de <ShellProvider>');
  return context;
}

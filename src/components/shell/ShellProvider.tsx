'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { setPeriodAction } from '@/app/period-actions';
import type { Period } from '@/lib/period';

interface ShellContextValue {
  period: Period;
  /** Hoje no fuso da pessoa, calculado no servidor (mesma referência dos dados). */
  today: string;
  setPeriod: (period: Period) => void;
  /** Período mudou e os dados estão sendo recarregados no servidor. */
  periodPending: boolean;
  quickLogOpen: boolean;
  openQuickLog: () => void;
  closeQuickLog: () => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

/**
 * Estado global do shell: período selecionado (§10) e registro rápido. O período vive num cookie de
 * sessão lido pelo servidor (ADR-0021): ao mudar, grava o cookie e recarrega os Server Components.
 */
export function ShellProvider({
  children,
  initialPeriod,
  today,
}: {
  children: ReactNode;
  initialPeriod: Period;
  today: string;
}) {
  const router = useRouter();
  const [period, setLocalPeriod] = useState<Period>(initialPeriod);
  const [periodPending, startTransition] = useTransition();
  const [quickLogOpen, setQuickLogOpen] = useState(false);

  const setPeriod = useCallback(
    (next: Period) => {
      setLocalPeriod(next);
      startTransition(async () => {
        await setPeriodAction(JSON.stringify(next));
        router.refresh();
      });
    },
    [router],
  );
  const openQuickLog = useCallback(() => setQuickLogOpen(true), []);
  const closeQuickLog = useCallback(() => setQuickLogOpen(false), []);

  const value = useMemo(
    () => ({
      period,
      today,
      setPeriod,
      periodPending,
      quickLogOpen,
      openQuickLog,
      closeQuickLog,
    }),
    [period, today, setPeriod, periodPending, quickLogOpen, openQuickLog, closeQuickLog],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  const context = useContext(ShellContext);
  if (!context) throw new Error('useShell precisa estar dentro de <ShellProvider>');
  return context;
}

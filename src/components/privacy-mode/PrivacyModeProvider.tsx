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
import { setPrivacyModeAction } from '@/app/privacy-mode-actions';

interface PrivacyModeContextValue {
  /** Estado pedido pela pessoa (muda na hora; a tela recarrega do servidor em seguida). */
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
  /** Gravando o cookie e recarregando os Server Components. */
  pending: boolean;
}

const PrivacyModeContext = createContext<PrivacyModeContextValue | null>(null);

/**
 * Modo privacidade (ADR-0035). O valor inicial vem do cookie lido no servidor; ao mudar, grava o cookie e
 * recarrega os Server Components, que passam a omitir (ou mostrar) os valores do corpo no HTML.
 */
export function PrivacyModeProvider({
  initialHidden,
  children,
}: {
  initialHidden: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [hidden, setLocal] = useState(initialHidden);
  const [pending, startTransition] = useTransition();
  const setHidden = useCallback(
    (next: boolean) => {
      setLocal(next);
      startTransition(async () => {
        await setPrivacyModeAction(next);
        router.refresh();
      });
    },
    [router],
  );
  const value = useMemo(() => ({ hidden, setHidden, pending }), [hidden, setHidden, pending]);
  return <PrivacyModeContext.Provider value={value}>{children}</PrivacyModeContext.Provider>;
}

export function usePrivacyMode(): PrivacyModeContextValue {
  const context = useContext(PrivacyModeContext);
  if (!context) throw new Error('usePrivacyMode precisa estar dentro de <PrivacyModeProvider>');
  return context;
}

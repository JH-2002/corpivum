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
  scope = 'shell',
  children,
}: {
  initialHidden: boolean;
  /** `presentation`: dentro do deck (não encerra a apresentação ao mudar). */
  scope?: 'shell' | 'presentation';
  children: ReactNode;
}) {
  const router = useRouter();
  const [hidden, setLocal] = useState(initialHidden);
  // O servidor manda o estado do cookie a cada recarga: se mudou (outra aba, falha), o indicador acompanha.
  const [serverHidden, setServerHidden] = useState(initialHidden);
  if (serverHidden !== initialHidden) {
    setServerHidden(initialHidden);
    setLocal(initialHidden);
  }
  const [pending, startTransition] = useTransition();
  const setHidden = useCallback(
    (next: boolean) => {
      const previous = hidden;
      setLocal(next);
      startTransition(async () => {
        try {
          await setPrivacyModeAction(next, scope);
        } catch {
          // Sem gravar o cookie, o servidor segue no estado anterior: o botão e a faixa também.
          setLocal(previous);
        }
        router.refresh();
      });
    },
    [hidden, router, scope],
  );
  const value = useMemo(() => ({ hidden, setHidden, pending }), [hidden, setHidden, pending]);
  return <PrivacyModeContext.Provider value={value}>{children}</PrivacyModeContext.Provider>;
}

/** Modo privacidade pedido agora, ou `false` fora de um provedor (ex.: testes de componente). */
export function usePrivacyHiddenNow(): boolean {
  return useContext(PrivacyModeContext)?.hidden ?? false;
}

export function usePrivacyMode(): PrivacyModeContextValue {
  const context = useContext(PrivacyModeContext);
  if (!context) throw new Error('usePrivacyMode precisa estar dentro de <PrivacyModeProvider>');
  return context;
}

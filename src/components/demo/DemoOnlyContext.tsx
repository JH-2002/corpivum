'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Modo só demo (ADR-0043) para os componentes de cliente da demonstração: sem convites para criar conta e sem
 * links para o app completo, que não existe nesse modo. Fora do layout da demo vale `false`.
 */
const DemoOnlyContext = createContext(false);

export function DemoOnlyProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <DemoOnlyContext value={value}>{children}</DemoOnlyContext>;
}

export function useDemoOnly(): boolean {
  return useContext(DemoOnlyContext);
}

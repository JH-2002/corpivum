'use client';

import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { useShell } from './ShellProvider';

/** Botão que abre o seletor de registro rápido a partir de qualquer página. */
export function OpenQuickLogButton({ children }: { children: ReactNode }) {
  const { openQuickLog } = useShell();
  return (
    <Button onClick={openQuickLog} aria-haspopup="dialog">
      <Plus className="size-4" aria-hidden="true" />
      {children}
    </Button>
  );
}

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label'
> {
  /** Nome acessível obrigatório: o botão só tem ícone. */
  label: string;
  children: ReactNode;
}

/** Botão só com ícone, 44×44px (§35), com nome acessível obrigatório. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className, type = 'button', children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-md text-fg transition-colors hover:bg-surface-muted',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover',
  secondary: 'border border-border-strong bg-surface text-fg hover:bg-surface-muted',
  ghost: 'text-fg hover:bg-surface-muted',
};

/** Classes compartilhadas por botões e links com aparência de botão. Alvo mínimo de 44px (§35). */
export function buttonClasses(variant: ButtonVariant = 'primary', className?: string): string {
  return cn(
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold',
    'transition-colors disabled:cursor-not-allowed disabled:opacity-60',
    VARIANTS[variant],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />;
}

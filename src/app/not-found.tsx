import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { buttonClasses } from '@/components/ui/Button';
import { isDemoOnly } from '@/lib/demo-mode';

export default function NotFound() {
  const t = useTranslations('pages.notFound');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <p className="text-fg-muted">{t('description')}</p>
      {/* Modo só demo (ADR-0043): o app completo não existe; o caminho de volta é a demonstração. */}
      <Link href={isDemoOnly() ? '/demo' : '/inicio'} className={buttonClasses('primary')}>
        {t('back')}
      </Link>
    </main>
  );
}

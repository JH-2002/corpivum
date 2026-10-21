import { PRODUCT_NAME } from '../src/config/product';

/** Rotas do app shell (§9 + Central de Privacidade + Mais), com o título esperado no <h1>. */
export const ROUTES = [
  { path: '/inicio', title: 'Início' },
  { path: '/sono', title: 'Sono' },
  { path: '/habitos', title: 'Hábitos' },
  { path: '/corpo', title: 'Corpo' },
  { path: '/alimentacao', title: 'Alimentação' },
  { path: '/atividade', title: 'Atividade' },
  { path: '/metas', title: 'Metas' },
  { path: '/timeline', title: 'Timeline' },
  { path: '/twin', title: 'Health Twin' },
  { path: '/relatorios', title: 'Relatórios' },
  { path: '/configuracoes', title: 'Configurações' },
  { path: '/configuracoes/seguranca', title: 'Configurações' },
  { path: '/privacidade', title: 'Central de Privacidade' },
  { path: '/mais', title: 'Mais' },
] as const;

/** Demo público sem login (LEG-X02), com o título esperado no <h1>. */
export const DEMO_ROUTES = [
  { path: '/demo', title: 'Início' },
  { path: '/demo/sono', title: 'Sono' },
  { path: '/demo/habitos', title: 'Hábitos' },
  { path: '/demo/corpo', title: 'Corpo' },
  { path: '/demo/alimentacao', title: 'Alimentação' },
  { path: '/demo/atividade', title: 'Atividade' },
  { path: '/demo/metas', title: 'Metas' },
  { path: '/demo/timeline', title: 'Timeline' },
  { path: '/demo/twin', title: 'Health Twin' },
] as const;

export const VIEWPORTS = [
  { width: 320, height: 640 },
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

/**
 * Como o teste chega à página: `app` (pessoa do setup, com dados sintéticos), `public` e `demo` (sem sessão),
 * `age-ok` (passou pela data de nascimento), `onboarding` (e-mail confirmado, onboarding no início),
 * `data-choice` (no passo 5), `update` (texto de consentimento novo a rever), `mfa` (2º fator pendente) e
 * `redirect` (não tem tela própria). `demo-only`: só existe no servidor do modo só demo (ADR-0043), coberto por
 * `e2e/demo-only`.
 */
export type PageAccess =
  | 'app'
  | 'public'
  | 'demo'
  | 'age-ok'
  | 'onboarding'
  | 'data-choice'
  | 'update'
  | 'mfa'
  | 'redirect'
  | 'demo-only';

export interface PageEntry {
  /** Pasta da página em `src/app`, sem `/page.tsx` (`''` para a raiz). */
  file: string;
  path: string;
  access: PageAccess;
  /** `<h1>` esperado; sem ele, basta um título visível (telas cujo `<h1>` é visualmente oculto). */
  title?: string;
}

/**
 * Inventário de TODAS as páginas do App Router (LEG-X01, 7d). O axe roda em cada uma nos temas claro e escuro
 * (`a11y.spec.ts`), e `tests/content/page-inventory.test.ts` falha se uma `page.tsx` nova ficar fora daqui.
 */
export const PAGES: readonly PageEntry[] = [
  { file: '', path: '/', access: 'redirect' },
  ...ROUTES.map((r) => ({
    file: `(app)${r.path}`,
    path: r.path,
    access: 'app' as const,
    title: r.title,
  })),
  { file: '(presentation)/apresentacao', path: '/apresentacao', access: 'app' },
  ...DEMO_ROUTES.map((r) => ({
    file: r.path === '/demo' ? 'demo/(shell)' : `demo/(shell)${r.path.slice('/demo'.length)}`,
    path: r.path,
    access: 'demo' as const,
    title: r.title,
  })),
  { file: 'demo/apresentacao', path: '/demo/apresentacao', access: 'demo' },
  {
    file: 'demo/(shell)/sobre',
    path: '/demo/sobre',
    access: 'demo-only',
    title: 'Sobre esta demonstração',
  },
  { file: '(auth)/entrar', path: '/entrar', access: 'public', title: 'Entrar' },
  { file: '(auth)/entrar/verificacao', path: '/entrar/verificacao', access: 'mfa' },
  {
    file: '(auth)/cadastro',
    path: '/cadastro',
    access: 'public',
    title: `Boas-vindas ao ${PRODUCT_NAME}`,
  },
  { file: '(auth)/cadastro/conta', path: '/cadastro/conta', access: 'age-ok' },
  {
    file: '(auth)/cadastro/confira-o-email',
    path: '/cadastro/confira-o-email',
    access: 'public',
    title: 'Confira seu e-mail',
  },
  { file: '(auth)/cadastro/indisponivel', path: '/cadastro/indisponivel', access: 'public' },
  { file: '(auth)/recuperar-senha', path: '/recuperar-senha', access: 'public' },
  { file: '(auth)/redefinir-senha', path: '/redefinir-senha', access: 'public' },
  { file: '(auth)/verificar-email', path: '/verificar-email', access: 'public' },
  {
    file: '(auth)/conta-encerrada',
    path: '/conta-encerrada',
    access: 'public',
    title: 'Conta encerrada',
  },
  {
    file: '(auth)/conta-excluida',
    path: '/conta-excluida',
    access: 'public',
    title: 'Conta excluída',
  },
  {
    file: 'legal/politica-de-privacidade',
    path: '/legal/politica-de-privacidade',
    access: 'public',
    title: 'Política de Privacidade',
  },
  { file: 'legal/termos', path: '/legal/termos', access: 'public', title: 'Termos de Uso' },
  {
    file: 'legal/subprocessadores',
    path: '/legal/subprocessadores',
    access: 'public',
    title: 'Subprocessadores',
  },
  {
    file: 'legal/encarregado',
    path: '/legal/encarregado',
    access: 'public',
    title: 'Encarregado e contato',
  },
  {
    file: '(onboarding)/boas-vindas/seguranca',
    path: '/boas-vindas/seguranca',
    access: 'onboarding',
    title: 'Proteja sua conta',
  },
  {
    file: '(onboarding)/boas-vindas/consentimentos',
    path: '/boas-vindas/consentimentos',
    access: 'onboarding',
    title: 'Suas escolhas de privacidade',
  },
  {
    file: '(onboarding)/boas-vindas/encerrar-conta',
    path: '/boas-vindas/encerrar-conta',
    access: 'onboarding',
    title: 'Excluir ou encerrar a conta',
  },
  { file: '(onboarding)/boas-vindas/dados', path: '/boas-vindas/dados', access: 'data-choice' },
  {
    file: '(onboarding)/boas-vindas/atualizacao',
    path: '/boas-vindas/atualizacao',
    access: 'update',
  },
];

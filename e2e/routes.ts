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
  { path: '/ia', title: 'HealthMind AI' },
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

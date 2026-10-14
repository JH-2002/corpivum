# HealthMind 360 — Especificação de produto (PRODUCT_SPEC)

> Versão reconstruída a partir do pacote v3. Numeração de seções compatível com
> `docs/SPEC_ADDENDUM.md` e `docs/LEGAL_REQUIREMENTS.md`, que têm precedência sobre este documento.
> Fórmulas, textos de saúde e fluxos de risco dependem de revisão clínica antes do lançamento.
> **ADR-0027 (reorientação):** o produto foca no desenvolvimento corporal. Humor e energia, diário, cérebro 3D,
> indicadores neuroquímicos e medicamentos foram removidos; as seções correspondentes ficam marcadas.
> **ADR-0030:** sem assistente de IA (HealthMind AI) e sem recomendações automáticas; §27 e §28 ficam marcadas.

---

## Parte I — Produto

### §1 Visão e objetivos
HealthMind 360 é uma plataforma web pessoal de acompanhamento do desenvolvimento corporal, com foco em
bem-estar. A pessoa registra peso e medidas, sono, hábitos, alimentação e atividade física, define metas próprias,
e o app transforma esses registros em uma visão integrada: um dashboard do estado atual, um "Health Digital
Twin" do corpo em 3D, uma linha do tempo pessoal, resumos por regras e relatórios. O app não prescreve
dieta nem treino (LEG-M08) e trata imagem corporal e alimentação com guardrails próprios (LEG-M04, M06, M07).

Objetivos:
1. Tornar visível a relação entre rotina e evolução do corpo (ex.: sono, atividade e medidas no tempo).
2. Facilitar o registro diário em poucos segundos.
3. Explicar sempre de onde vem cada número exibido.
4. Respeitar a privacidade como característica central do produto, não como opção escondida.

### §2 Público e personas
Adultos (18+) no Brasil, em pt-BR.
- **Organizada(o):** quer ver tendências de sono, hábitos e medidas num só lugar.
- **Em mudança de rotina:** começou a treinar ou a mudar alimentação e quer acompanhar evolução.
- **Curiosa(o) por dados:** gosta de gráficos, correlações e visualizações.
O produto não é desenhado nem divulgado para crianças ou adolescentes.

### §3 Princípios de produto
1. Bem-estar, não medicina: o app descreve padrões, não diagnostica.
2. Transparência: todo dado tem origem e nível de confiabilidade visíveis (§39).
3. Registro rápido: qualquer registro diário em até 3 toques/cliques a partir do dashboard.
4. Sem culpa: linguagem neutra, sem punição por dias sem registro e sem juízo sobre o corpo (LEG-M06).
5. Privacidade por padrão: o mínimo de dados, nada enviado a terceiros para análise (sem IA, ADR-0030).
6. Acessível e leve: funciona em celular modesto e com teclado/leitor de tela.

### §4 Escopo do MVP
Dentro: conta e onboarding, dashboard, peso/medidas, sono, hábitos, alimentação (registro simples), atividade
física, metas, timeline, corpo 3D, resumos por regras, relatórios, Central de Privacidade, modo demo.
Fora do MVP: integrações com wearables e apps de saúde, cobrança, app nativo, compartilhamento com
profissionais, comunidade/social, planos de dieta ou de treino (LEG-M08).
Removidos (ADR-0027): humor e energia, diário, cérebro 3D, indicadores neuroquímicos, medicamentos.
Removidos (ADR-0030): assistente de IA (HealthMind AI) e recomendações automáticas.

---

## Parte II — Interface

### §5 Identidade visual
Visual calmo, limpo e confiável, com toque tecnológico nas áreas 3D. Fundo claro com modo escuro completo.
Evitar estética hospitalar (branco frio, cruz vermelha) e estética infantil ou de jogo.
Ícones lineares consistentes. Ilustrações abstratas, nunca imagens anatômicas realistas ou chocantes.

### §6 Design tokens
- **Cores funcionais:** primária (azul-petróleo), secundária (verde-água), neutros em 10 tons, e cores por
  domínio (sono = índigo, atividade = verde, alimentação = laranja, corpo = azul). Estados: sucesso, aviso, erro, informação.
- Contraste mínimo AA em todos os pares texto/fundo, nos dois temas.
- **Tipografia:** uma família sans-serif legível, escala de 6 tamanhos, números tabulares em gráficos e cards.
- **Espaçamento:** escala de 4px. Raios de borda e sombras em 3 níveis.
- Tokens definidos uma vez (CSS variables + Tailwind) e usados em todo o app.

### §7 Layout e navegação
- Desktop: sidebar fixa à esquerda, header no topo, conteúdo em grid responsivo.
- Tablet: sidebar recolhível.
- Mobile: bottom navigation com 5 itens (Início, Registrar, Twin, Timeline, Mais).
- Botão "Registrar" sempre acessível, abrindo um seletor rápido do tipo de registro.

### §8 Header
Título da página, seletor de período global (§10), atalho para registro rápido, notificações, menu da conta
(perfil, configurações, Central de Privacidade, sair).

### §9 Sidebar
Itens: Início, Corpo, Sono, Hábitos, Alimentação, Atividade, Metas, Timeline, Health Twin, Relatórios, Configurações. Item ativo com indicação visual além da cor.

### §10 Seletor de período global
Opções: 7 dias, 30 dias, 90 dias, 12 meses, personalizado. A escolha vale para dashboard, gráficos, twin e
relatórios, e persiste na sessão. Exibe sempre o intervalo de datas em texto.

### §11 Dashboard "Seu estado atual"
1. Saudação e resumo em uma frase, gerado por regras (não por IA), por exemplo: "Seu sono médio subiu nesta
   semana."
2. Índice de Bem-Estar (§14) com tendência.
3. Cards por domínio (§12).
4. Gráfico principal combinado: sono × atividade no período.
5. Hábitos do dia com check rápido.
6. Próximos lembretes (hábitos, registro).
7. Atalho para o Health Twin.
Sem dados: estado vazio acolhedor com convite para o primeiro registro, sem gráficos vazios (§34).

### §12 Cards de indicadores
Cada card mostra valor atual, variação no período, mini-gráfico, selo de confiabilidade (§39) e link para o
módulo. Ao passar o mouse ou tocar, abre detalhe com a origem do dado.

### §13 Gráficos e interações
Biblioteca: Recharts. Tooltips com data, valor, unidade e selo. Zoom por período, alternância de séries e
legenda clicável. Toda informação de cor tem equivalente textual ou por padrão de linha. Tabela alternativa
acessível para cada gráfico.

### §14 Índice de Bem-Estar (Health Score)
Indicador de 0 a 100 que resume a regularidade dos registros e hábitos. **Não é avaliação de saúde.**
- Componentes (v2, ADR-0027): regularidade do sono, cumprimento de hábitos, atividade física em relação à meta
  da própria pessoa, constância de registro. Peso e medidas nunca entram no Índice.
- Pesos iniciais configuráveis em módulo próprio, versionado (`score_version`) e documentado.
- Componentes sem dados suficientes ficam fora do cálculo e o card mostra "dados parciais".
- Tooltip "como é calculado" e botão "pedir revisão" (LEG-D08).

---

## Parte III — Health Digital Twin

### §15 Corpo 3D
Modelo humano paramétrico neutro, sem traços realistas, ajustado por medidas informadas (altura, peso,
circunferências). Vistas frente, costas e lado; rotação por arrasto; reset. Regiões com tooltip (ex.: cintura:
medida atual, variação, data do registro). Slider temporal percorre o histórico de medidas.

### §16 Comparação Antes × Agora
Dois modelos lado a lado com rotação sincronizada, escolhendo duas datas. Diferenças exibidas em números e
setas, não só em formato. Modo privacidade oculta valores (§44/§45).

### §17 Estado neurocomportamental (cérebro 3D)
**Removido (ADR-0027).** Fora do escopo desde a reorientação para o desenvolvimento corporal.

### §18 Indicadores neuroquímicos educacionais
**Removido (ADR-0027).** Fora do escopo desde a reorientação para o desenvolvimento corporal.

---

## Parte IV — Módulos de dados

### §19 Diário
**Removido (ADR-0027).** Fora do escopo desde a reorientação para o desenvolvimento corporal.

### §20 Sono
Registro de horário de deitar e acordar, qualidade (1–5), despertares e notas. Métricas: duração, regularidade,
média do período, consistência de horário. Gráficos de duração e de horário (barras flutuantes).

### §21 Humor e energia
**Removido (ADR-0027).** Fora do escopo desde a reorientação para o desenvolvimento corporal.

### §22 Hábitos
Criar hábitos com frequência (diária, dias específicos, X vezes por semana). Check diário, histórico em
calendário e sequência (streak) **desativável**, sem mensagens punitivas.

### §23 Peso e medidas
Peso, altura, circunferências (cintura, quadril, braço, coxa, peito) e % de gordura se a pessoa souber
(selo INFORMADO). IMC calculado (ESTIMADO) com texto neutro, sem faixa nem classificação na interface (LEG-M06);
o IMC serve aos guardrails de metas (LEG-M04). Gráficos de evolução e alimentação do corpo 3D.

### §24 Medicamentos
**Removido (ADR-0027).** Fora do escopo desde a reorientação para o desenvolvimento corporal.

### §25 Alimentação
Registro simples por refeição: descrição, horário, categoria e percepção (fome, saciedade, satisfação).
Água consumida. Estimativa calórica opcional, desligada por padrão. Sem metas restritivas, sem rótulo de comida
"boa" ou "ruim" e sem plano alimentar (LEG-M04, M07, M08).

### §26 Atividade física e progressão
Registro de atividades (tipo, duração, intensidade percebida, distância opcional) e de treinos de força
(exercício, séries, repetições, carga). Progressão por exercício em gráfico. Resumo semanal de minutos ativos. O app registra o que a pessoa fez; não
prescreve treino (LEG-M08).

---

## Parte V — Resumos e saídas

### §27 HealthMind AI
**Removido (ADR-0030).** O produto não tem assistente de IA nem envia dados a modelo de linguagem.

### §28 Recomendações
**Removido (ADR-0030).** O app não gera sugestões automáticas. Os resumos por regras (§11.1, ADR-0025) descrevem o
período, sem propor ações.

### §29 Relatórios
Semanal, mensal e anual. Conteúdo: resumo por domínio, gráficos principais, metas, destaques. Exportação em
PDF, CSV e JSON. Rodapé: "Material de autoacompanhamento, não é laudo nem avaliação clínica."

### §30 Metas
Metas por domínio (sono, atividade, hábitos, peso, registro) com valor-alvo, prazo e barra de progresso.
Metas de peso com limites de segurança (`src/modules/guardrails`, LEG-M04). Tom neutro ao revisar metas não
atingidas.

### §31 Timeline pessoal
Linha do tempo única com todos os registros, filtrável por domínio e período, agrupada por dia. Marcos
automáticos (meta atingida, novo hábito, mudança de medida).

### §32 Correlações e insights
Cálculo de associações simples entre séries (ex.: dias com mais sono × minutos ativos no dia seguinte), com tamanho da
amostra visível e linguagem de associação ("nos seus registros, X costuma aparecer junto com Y"), nunca de causa.
Só exibido com amostra mínima configurável.

### §33 Notificações e lembretes
Lembretes de hábitos e registro diário por e-mail e push, processados no servidor. Configuráveis
por tipo e horário silencioso. Sem notificações insistentes.

---

## Parte VI — Qualidade

### §34 Estados de interface
Toda tela trata: carregando (skeleton), vazio (convite acolhedor), erro (mensagem e tentar novamente), sem dados
no período, dados parciais (aviso e cálculo com o que existe).

### §35 Acessibilidade
WCAG 2.2 AA. Navegação completa por teclado, foco visível, rótulos ARIA, alternativa textual para gráficos e 3D,
`prefers-reduced-motion`, cor nunca como único canal, alvos de toque ≥ 44px.

### §36 Segurança e LGPD
Substituído integralmente por `docs/LEGAL_REQUIREMENTS.md`.

### §37 Arquitetura
Next.js (App Router), React, TypeScript strict, Tailwind, React Three Fiber + Drei, Recharts, Node.js,
PostgreSQL, Prisma, Auth.js, Zod. Módulos por domínio em `src/modules/<dominio>`. Adaptadores trocáveis:
KmsProvider, StorageProvider, MailProvider, JobQueue, AgeSignalProvider, WearableProvider.
Jobs em fila para lembretes, relatórios e exportações. Hospedagem no Brasil.

### §38 Banco de dados
Entidades principais: User, Profile, SleepEntry, Habit, HabitCheck, BodyMeasurement, MealEntry, WaterEntry,
ActivityEntry, StrengthSet, Goal, Report, WellbeingScore, Notification. (MoodEntry, JournalEntry, Medication* e
BrainIndicator removidos, ADR-0027; Recommendation, AiConversation e AiMessage, ADR-0030.)
Todas com id, user_id, created_at, updated_at. Campos sensíveis criptografados.

### §39 Níveis de confiabilidade
Todo dado exibido tem um selo:
- **MEDIDO:** veio de dispositivo/integração (futuro).
- **INFORMADO:** a pessoa registrou.
- **ESTIMADO:** cálculo direto a partir de dados informados (ex.: IMC).
- **INFERIDO:** padrão ou associação calculada (ex.: correlações).
(O selo RECOMENDADO saiu com as recomendações, ADR-0030.)
Cada selo tem tooltip explicando o significado.

### §40 Demonstração
Usuário fictício com 90 dias de dados sintéticos coerentes, para apresentar o produto sem dados reais.

### §41 Performance
Dashboard interativo em menos de 2,5 s em 4G num celular intermediário. 3D carregado sob demanda. Gráficos com
dados agregados no servidor para períodos longos.

### §42 Responsividade
Layouts testados de 320px a 1920px. Gráficos e 3D com versões simplificadas em telas pequenas.

### §43 Textos e internacionalização
Todas as strings em arquivos i18n (pt-BR), tom acolhedor, direto e sem jargão. Glossário de termos proibidos
mantido junto ao teste automatizado.

### §44 Comparação de períodos
Comparar dois períodos lado a lado em qualquer módulo (ex.: este mês × mês anterior), com diferenças em números
e percentuais.

### §45 Modo apresentação
Tela cheia, navegação por setas entre dashboard, twin, timeline e relatórios, para mostrar o projeto
(portfólio, banca, demonstração). Usa dados de demo por padrão.

### §46 Personalização e configurações
Tema (claro/escuro/sistema), unidades, primeiro dia da semana, domínios visíveis no dashboard, lembretes,
streaks ligados/desligados, perfil, segurança da conta.

### §47 Onboarding
Fluxo curto de boas-vindas, criação de conta e escolha entre demo e dados próprios. Detalhado na §52 do adendo.

### §48 Alertas de risco e segurança do usuário
Quando um guardrail de imagem corporal ou alimentação disparar (LEG-M04, M06, M07), por exemplo numa meta de
peso ou de calorias bloqueada, o app interrompe o fluxo normal e exibe orientação acolhedora para buscar
profissional de saúde, com CVV 188 (apoio emocional, 24h) e SAMU 192 (emergência), sem continuar dando
conselhos. A tela de corpo mostra a orientação de forma fixa, e há acesso permanente "Precisa de ajuda?" no menu
de ajuda. Não há detecção de risco em texto livre (sem chat, ADR-0030).
Textos revisados por profissional habilitado antes do lançamento.

### §49 Testes e qualidade
Vitest para unidades e integração, Playwright para e2e, axe para acessibilidade, teste de isolamento entre
usuários, teste de strings proibidas, testes dos guardrails.

### §50 Roadmap futuro
Integrações com wearables e plataformas de saúde (com novo consentimento), app mobile, compartilhamento
controlado com profissional escolhido pela pessoa.

### §51 Entrega e critérios de aceite
Repositório com README, instruções de execução local, seed de demo, CI verde, documentação de arquitetura,
fórmulas documentadas, e cada módulo atendendo à Definition of Done do `CLAUDE.md`.

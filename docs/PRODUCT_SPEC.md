# HealthMind 360 — Especificação de produto (PRODUCT_SPEC)

> Versão reconstruída a partir do pacote v3. Numeração de seções compatível com
> `docs/SPEC_ADDENDUM.md` e `docs/LEGAL_REQUIREMENTS.md`, que têm precedência sobre este documento.
> Fórmulas, textos de saúde e fluxos de risco dependem de revisão clínica antes do lançamento.

---

## Parte I — Produto

### §1 Visão e objetivos
HealthMind 360 é uma plataforma web pessoal de acompanhamento de bem-estar. A pessoa registra sono, humor,
energia, hábitos, diário, peso e medidas, alimentação, atividade física e medicamentos que já usa, e o app
transforma esses registros em uma visão integrada: um dashboard do estado atual, um "Health Digital Twin" em 3D,
uma linha do tempo pessoal, relatórios e um assistente de IA opcional.

Objetivos:
1. Tornar visível a relação entre hábitos e bem-estar (ex.: sono → humor → atividade).
2. Facilitar o registro diário em poucos segundos.
3. Explicar sempre de onde vem cada número exibido.
4. Respeitar a privacidade como característica central do produto, não como opção escondida.

### §2 Público e personas
Adultos (18+) no Brasil, em pt-BR.
- **Organizada(o):** quer ver tendências de sono, humor e hábitos num só lugar.
- **Em mudança de rotina:** começou a treinar ou a mudar alimentação e quer acompanhar evolução.
- **Curiosa(o) por dados:** gosta de gráficos, correlações e visualizações.
O produto não é desenhado nem divulgado para crianças ou adolescentes.

### §3 Princípios de produto
1. Bem-estar, não medicina: o app descreve padrões, não diagnostica.
2. Transparência: todo dado tem origem e nível de confiabilidade visíveis (§39).
3. Registro rápido: qualquer registro diário em até 3 toques/cliques a partir do dashboard.
4. Sem culpa: linguagem neutra, sem punição por dias sem registro.
5. Privacidade por padrão: o mínimo de dados, IA desligada até a pessoa ativar.
6. Acessível e leve: funciona em celular modesto e com teclado/leitor de tela.

### §4 Escopo do MVP
Dentro: conta e onboarding, dashboard, sono, humor/energia, hábitos, diário, peso/medidas, alimentação
(registro simples), atividade física, medicamentos (registro e lembrete), metas, timeline, corpo 3D,
cérebro 3D educacional, IA opcional, recomendações, relatórios, Central de Privacidade, modo demo.
Fora do MVP: integrações com wearables e apps de saúde, cobrança, app nativo, compartilhamento com
profissionais, comunidade/social, busca textual no diário.

---

## Parte II — Interface

### §5 Identidade visual
Visual calmo, limpo e confiável, com toque tecnológico nas áreas 3D. Fundo claro com modo escuro completo.
Evitar estética hospitalar (branco frio, cruz vermelha) e estética infantil ou de jogo.
Ícones lineares consistentes. Ilustrações abstratas, nunca imagens anatômicas realistas ou chocantes.

### §6 Design tokens
- **Cores funcionais:** primária (azul-petróleo), secundária (verde-água), neutros em 10 tons, e cores por
  domínio (sono = índigo, humor = âmbar, atividade = verde, alimentação = laranja, corpo = azul,
  diário = violeta, medicamentos = cinza-azulado). Estados: sucesso, aviso, erro, informação.
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
Itens: Início, Sono, Humor e energia, Hábitos, Diário, Corpo, Alimentação, Atividade, Medicamentos, Metas,
Timeline, Health Twin, HealthMind AI, Relatórios, Configurações. Item ativo com indicação visual além da cor.

### §10 Seletor de período global
Opções: 7 dias, 30 dias, 90 dias, 12 meses, personalizado. A escolha vale para dashboard, gráficos, twin e
relatórios, e persiste na sessão. Exibe sempre o intervalo de datas em texto.

### §11 Dashboard "Seu estado atual"
1. Saudação e resumo em uma frase, gerado por regras (não por IA), por exemplo: "Seu sono médio subiu nesta
   semana."
2. Índice de Bem-Estar (§14) com tendência.
3. Cards por domínio (§12).
4. Gráfico principal combinado: sono × humor × atividade no período.
5. Hábitos do dia com check rápido.
6. Próximos lembretes (medicamentos, hábitos).
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
- Componentes iniciais: regularidade do sono, humor/energia autorrelatados, cumprimento de hábitos, atividade
  física em relação à meta da própria pessoa, constância de registro.
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
Visualização **educacional** de um cérebro estilizado com regiões clicáveis. O painel lateral mostra: nome da
região, função geral em linguagem acessível, quais dados da pessoa se relacionam a esse tema (ex.: sono,
humor), os dados usados e o nível de confiança. Avisos fixos: modelo aproximado; estimativa a partir de
autorrelato, não é medição cerebral.

### §18 Indicadores neuroquímicos educacionais
Conteúdo educativo sobre como hábitos (sono, atividade, luz solar, rotina) são associados, na literatura geral,
a sistemas como sono/vigília e humor. O app nunca afirma nível de neurotransmissor, liberação de substância nem
estado cerebral da pessoa. Selo sempre INFERIDO ou educacional, com aviso fixo: não é medição laboratorial.

---

## Parte IV — Módulos de dados

### §19 Diário
Entrada de texto livre com data, humor do dia (escala), tags e prompts opcionais de reflexão. Edição e exclusão
a qualquer momento. Conteúdo criptografado. Visualização em lista e calendário. A IA só lê trechos que a pessoa
escolher, com consentimento de IA ativo.

### §20 Sono
Registro de horário de deitar e acordar, qualidade (1–5), despertares e notas. Métricas: duração, regularidade,
média do período, consistência de horário. Gráficos de duração e de horário (barras flutuantes).

### §21 Humor e energia
Registro rápido em escalas (humor 1–5, energia 1–5, estresse 1–5) com emoções opcionais por etiqueta e nota
curta. Gráfico de tendência e distribuição por dia da semana.

### §22 Hábitos
Criar hábitos com frequência (diária, dias específicos, X vezes por semana). Check diário, histórico em
calendário e sequência (streak) **desativável**, sem mensagens punitivas.

### §23 Peso e medidas
Peso, altura, circunferências (cintura, quadril, braço, coxa, peito) e % de gordura se a pessoa souber
(selo INFORMADO). IMC calculado (ESTIMADO) com texto neutro. Gráficos de evolução e alimentação do corpo 3D.

### §24 Medicamentos
Registro de medicamentos que a pessoa já usa conforme orientação de quem prescreveu: nome, como ela descreve a
dose, horários, início/fim, notas. Lembretes e marcação "tomei / não tomei". Sem sugestão de dose, sem
verificação de interações, sem alteração automática. Aviso fixo: "Siga a orientação do seu prescritor."

### §25 Alimentação
Registro simples por refeição: descrição, horário, categoria e percepção (fome, saciedade, satisfação).
Água consumida. Estimativa calórica opcional, desligada por padrão. Sem metas restritivas (LEG-M04).

### §26 Atividade física e progressão
Registro de atividades (tipo, duração, intensidade percebida, distância opcional) e de treinos de força
(exercício, séries, repetições, carga). Progressão por exercício em gráfico. Resumo semanal de minutos ativos.

---

## Parte V — Inteligência e saídas

### §27 HealthMind AI
Chat opcional que conversa sobre os próprios dados da pessoa: resume períodos, aponta associações, sugere
reflexões. Desligado até a pessoa ativar o consentimento específico. Mostra antes "o que a IA verá", cita os
dados usados em cada resposta e rotula "Gerado por IA". Não diagnostica, não fala de doses, não faz afirmações
neuroquímicas. Em sinais de risco, interrompe e orienta (§48).

### §28 Recomendações
Cartões de sugestão gerados por regras (e opcionalmente refinados por IA), cada um com: Motivo (dados que
levaram à sugestão), Ação, Dificuldade, Tempo estimado, Objetivo relacionado. A pessoa pode aceitar, adiar,
dispensar ou pedir revisão. Temas permitidos: sono, rotina, hábitos, movimento, hidratação, pausas, registro.

### §29 Relatórios
Semanal, mensal e anual. Conteúdo: resumo por domínio, gráficos principais, metas, destaques. Exportação em
PDF, CSV e JSON. Rodapé: "Material de autoacompanhamento, não é laudo nem avaliação clínica."

### §30 Metas
Metas por domínio (sono, atividade, hábitos, peso, registro) com valor-alvo, prazo e barra de progresso.
Metas de peso com limites de segurança. Tom neutro ao revisar metas não atingidas.

### §31 Timeline pessoal
Linha do tempo única com todos os registros, filtrável por domínio e período, agrupada por dia. Marcos
automáticos (meta atingida, novo hábito, mudança de medida).

### §32 Correlações e insights
Cálculo de associações simples entre séries (ex.: dias com mais sono × humor do dia seguinte), com tamanho da
amostra visível e linguagem de associação ("nos seus registros, X costuma aparecer junto com Y"), nunca de causa.
Só exibido com amostra mínima configurável.

### §33 Notificações e lembretes
Lembretes de medicamentos, hábitos e registro diário por e-mail e push, processados no servidor. Configuráveis
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
LlmProvider, KmsProvider, StorageProvider, MailProvider, JobQueue, AgeSignalProvider, WearableProvider.
Jobs em fila para lembretes, relatórios e exportações. Hospedagem no Brasil.

### §38 Banco de dados
Entidades principais: User, Profile, SleepEntry, MoodEntry, Habit, HabitCheck, JournalEntry, BodyMeasurement,
MealEntry, WaterEntry, ActivityEntry, StrengthSet, Medication, MedicationSchedule, MedicationLog, Goal,
Recommendation, AiConversation, AiMessage, Report, WellbeingScore, BrainIndicator, Notification.
Todas com id, user_id, created_at, updated_at. Campos sensíveis criptografados.

### §39 Níveis de confiabilidade
Todo dado exibido tem um selo:
- **MEDIDO:** veio de dispositivo/integração (futuro).
- **INFORMADO:** a pessoa registrou.
- **ESTIMADO:** cálculo direto a partir de dados informados (ex.: IMC).
- **INFERIDO:** padrão ou associação calculada (ex.: correlações, indicadores do cérebro 3D).
- **RECOMENDADO:** sugestão do sistema.
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
Quando o diário, o humor ou o chat indicarem sofrimento intenso ou risco, o app interrompe o fluxo normal e exibe
orientação acolhedora com CVV 188 (apoio emocional, 24h) e SAMU 192 (emergência), sem continuar dando conselhos.
Textos revisados por profissional habilitado antes do lançamento.

### §49 Testes e qualidade
Vitest para unidades e integração, Playwright para e2e, axe para acessibilidade, teste de isolamento entre
usuários, teste de strings proibidas, suíte adversarial da IA.

### §50 Roadmap futuro
Integrações com wearables e plataformas de saúde (com novo consentimento), app mobile, compartilhamento
controlado com profissional escolhido pela pessoa, busca no diário com criptografia adequada.

### §51 Entrega e critérios de aceite
Repositório com README, instruções de execução local, seed de demo, CI verde, documentação de arquitetura,
fórmulas documentadas, e cada módulo atendendo à Definition of Done do `CLAUDE.md`.

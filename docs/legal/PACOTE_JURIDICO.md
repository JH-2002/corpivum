# Pacote para o jurídico — questões em aberto do HealthMind 360

> **RASCUNHO.** `LEGAL-REVIEW` · Versão 1 (fim da Fase 7, ADR-0041) · LEG-G01 a G05.
> Consolida as questões abertas de `docs/legal/OPEN_ISSUES.md` (a lista viva, com o histórico e os achados
> técnicos) num roteiro por tema. Cada tema traz a pergunta, as opções, o que já está implementado e o impacto de
> cada resposta no produto. Ao responder, registre a decisão, a data e quem decidiu em OPEN_ISSUES ("Resolvidas")
> e, se mudar o produto, num ADR em `docs/DECISIONS.md`.

## Como ler

- **O produto, em uma frase:** app web de bem-estar e autoacompanhamento do desenvolvimento corporal para adultos
  no Brasil. A pessoa registra peso e medidas, sono, hábitos, alimentação, atividade física e metas; o app mostra
  gráficos, resumos por regras fixas e um modelo 3D do corpo. **Sem IA, sem recomendações automáticas, sem
  diagnóstico, sem prescrição** (`docs/INTENDED_USE.md`).
- **Dados:** dado de bem-estar é tratado como dado pessoal sensível (art. 11), só com consentimento específico. O
  app não pede nome, documento, foto nem localização. Tudo roda e fica no Brasil, salvo e-mail e monitoramento de
  erros (tema 8).
- **Documentos de apoio:** ROPA (`docs/privacy/ROPA.md`, operações T1 a T14), RIPD (`docs/privacy/RIPD.md`),
  prazos (`docs/privacy/RETENTION.md`), fornecedores (`docs/privacy/SUBPROCESSORS.md`), textos públicos em
  `/legal/*` (Política v2, Termos v2, encarregado, subprocessadores) e placeholders (`docs/legal/PLACEHOLDERS.md`).
- **Textos:** todo texto público é RASCUNHO. Política, Termos e consentimentos são versionados com hash; mudar um
  texto publicado gera versão nova (substancial: pede nova escolha; não substancial: aviso e registro de ciência).
- **Prioridade:** 🔴 bloqueia o lançamento · 🟠 precisa de resposta antes do beta aberto · 🟢 pode esperar a
  primeira revisão depois do lançamento.

## Resumo

| # | Tema | Itens (OPEN_ISSUES) | Prioridade | Revisão clínica junto? |
|---|---|---|---|---|
| 1 | Enquadramento regulatório (ANVISA) | OI-07 | 🔴 | Sim |
| 2 | Controlador, encarregado e foro | OI-06, OI-12 | 🔴 | Não |
| 3 | Bases legais e consentimento | OI-01, OI-16, OI-32, PR4-M3, OI-37 | 🔴 | Não |
| 4 | Textos públicos, versões e avisos | OI-08, OI-30, OI-36 | 🔴 | Parcial |
| 5 | Retenção e registros de acesso | OI-04, OI-06, OI-14 b, OI-17, PR1b-M2 | 🔴 | Não |
| 6 | Direitos do titular | OI-18, OI-20, OI-31, OI-33, OI-34, PR2-N1 | 🟠 | Não |
| 7 | Menores de idade | OI-02 | 🔴 | Não |
| 8 | Fornecedores e transferência internacional | OI-03, OI-11, OI-27 | 🔴 | Não |
| 9 | Incidentes | OI-05 | 🟠 | Não |
| 10 | Imagem corporal, alimentação e profissões regulamentadas | OI-09, OI-10, OI-13, OI-21, OI-22, OI-23, OI-24, OI-25 | 🔴 | **Sim** |

---

## 1. Enquadramento regulatório (ANVISA) — OI-07 🔴

**Pergunta.** O HealthMind 360, como descrito em `docs/INTENDED_USE.md`, fica fora da RDC ANVISA nº 657/2022
(software como dispositivo médico)? Há algum recurso que aproxime o produto de monitoramento de condição de saúde,
em especial as metas de peso e de calorias e os limites de segurança (guardrails)?

**Opções.**
- (a) Fora do escopo da RDC, como produto de bem-estar: segue como está.
- (b) Fora do escopo, desde que algum recurso mude ou saia (ex.: meta de calorias, aviso de ritmo de perda).
- (c) Dentro do escopo: exige regularização antes do lançamento.

**Implementado hoje.** Sem diagnóstico, tratamento, monitoramento de doença, doses, prescrição de dieta ou treino,
IA ou recomendações. Metas definidas pela pessoa, com limites de segurança que **bloqueiam** metas de perda que
levem a IMC abaixo de 18,5, ritmo acima de 1% do peso por semana e meta de calorias abaixo de 1.500 kcal/dia, com
orientação a buscar profissional e apoio (CVV 188, SAMU 192). Teste automatizado bloqueia alegações clínicas nos
textos. Medicamentos, humor, diário e cérebro 3D foram removidos (ADR-0027, ADR-0030).

**Impacto.** (a) nada muda. (b) remoção ou mudança do recurso indicado; se mexer no tratamento de dados, nova versão
do consentimento de saúde e da Política. (c) o lançamento para; o produto precisaria de processo regulatório
próprio, fora do escopo atual.

## 2. Controlador, encarregado e foro — OI-06, OI-12 🔴

**Pergunta.** Quem é o controlador (pessoa física ou jurídica)? Quem é o encarregado e qual o canal público? Qual
o foro dos Termos?

**Opções.** Controlador pessoa física ou pessoa jurídica (a escolha decide se o art. 15 do Marco Civil se aplica,
tema 5). Encarregado interno ou serviço externo.

**Implementado hoje.** Os textos usam `{{CONTROLADOR}}`, `{{ENCARREGADO}}`, `{{CONTATO_ENCARREGADO}}` e `{{FORO}}`
(catálogo em `docs/legal/PLACEHOLDERS.md`). Página pública `/legal/encarregado`. O encarregado atende pedidos com
um papel de banco próprio, com rastro e limites (tema 6).

**Impacto.** Preencher os placeholders muda o texto da Política, dos Termos e do consentimento de saúde: é versão
nova. A identidade do controlador é informação essencial para o consentimento (arts. 8º e 9º). **Recomendação:**
preencher antes do beta (CHECKLIST 1.8), para que nenhum titular real veja os placeholders e a versão nova não
precise de aviso a ninguém.

## 3. Bases legais e consentimento — OI-01, OI-16, OI-32, PR4-M3, OI-37 🔴

### 3.1 Consentimento para os dados de bem-estar (OI-01)
**Pergunta.** O consentimento específico e destacado (art. 11, I) é a base adequada para os dados de bem-estar?

**Implementado hoje.** Consentimento por finalidade, nunca pré-marcado, com texto versionado e hash; sem ele a pessoa
usa a conta e a Central de Privacidade, mas não registra nem vê dados de bem-estar. A revogação vale na operação
seguinte, conferida também no banco (RLS).

**Impacto.** Se outra base for indicada, o fluxo do onboarding e os textos mudam (nova versão, ADR).

### 3.2 Texto do consentimento de saúde (PR4-M3)
**Pergunta.** O texto atual (v2) cita "peso e medidas, sono, hábitos, alimentação e atividade física". Ele precisa
citar também **metas e lembretes por e-mail (só com um link)**? Se precisar, a mudança é substancial (pede nova
escolha de todos) ou não?

**Opções.** (a) Não precisa. (b) Precisa, não substancial (aviso e ciência). (c) Precisa, substancial
(reconsentimento: quem não escolher de novo deixa de ter os dados tratados).

**Impacto.** (b) texto v3 e aviso, pouco esforço. (c) texto v3 com reconsentimento: o app já suporta, mas parte das
pessoas fica sem acesso aos dados até escolher.

### 3.3 Prazo entre revogar e eliminar (OI-16)
**Pergunta.** Manter os dados por 30 dias após a revogação (sem exibir nem processar, com eliminação cancelada se a
pessoa autorizar de novo) é compatível com os arts. 8º, §5º, e 16? E quem autorizou a v1 do consentimento e nunca
voltou para escolher de novo: os dados ficam guardados sem prazo (sem tratamento). Deve haver prazo com aviso?

**Opções.** (a) Manter 30 dias. (b) Prazo menor ou eliminação imediata. (c) Para a pendência da v1: eliminar após
N dias com aviso por e-mail.

**Implementado hoje.** 30 dias, escritos no texto versionado (mudar o prazo = versão nova). Pendência da v1 sem prazo.

**Impacto.** (b) nova versão do consentimento e ajuste de configuração. (c) job novo, com o mesmo modelo do aviso das
contas sem onboarding (tema 5).

### 3.4 Portabilidade depois de revogar (OI-32)
**Pergunta.** Na carência de 30 dias, a pessoa pode baixar a cópia completa (inclusive os dados de bem-estar), com base
no atendimento ao titular (art. 18, V) e não no consentimento. Isso basta? O prazo de eliminação deve se estender se
houver exportação em curso?

**Implementado hoje.** Sim, só a exportação completa nesse período, por caminho restrito, com AuditLog.

**Impacto.** Se não bastar: a cópia passa a ser oferecida só antes da revogação (o aviso de revogação já oferece).

### 3.5 Finalidades opcionais sem uso (OI-37, novo)
**Pergunta.** O app oferece dois consentimentos opcionais — **novidades por e-mail** e **métricas de uso ligadas à
conta** — mas hoje não envia novidades nem coleta métricas. Pode continuar oferecendo (e registrando a escolha) de
algo que ainda não acontece?

**Opções.** (a) Manter, porque o texto diz o que acontecerá. (b) Esconder as duas finalidades até existirem.
(c) Manter com uma frase dizendo que ainda não está em uso (versão nova dos dois textos).

**Impacto.** (b) as escolhas já registradas continuam como prova; a oferta sai do onboarding e da Central até haver
uso, ADR e textos. (c) versão não substancial dos dois textos.

## 4. Textos públicos, versões e avisos — OI-08, OI-30, OI-36 🔴

### 4.1 Textos finais (OI-08)
**Pergunta.** Revisar e aprovar a Política de Privacidade v2, os Termos de Uso v2, os três consentimentos e os textos
da Central de Privacidade. A Política v2 já lista as categorias de dados (art. 9º), os prazos, os cookies e os
direitos.

**Implementado hoje.** Rascunhos publicados em `/legal/*` com o rótulo "RASCUNHO — revisão jurídica obrigatória".
Textos em `messages/pt-BR.json` (`legal.*`, `consent.purposes.*`, `privacyCenter.*`); versões anteriores
arquivadas em `legal/archive/` com o hash conferido por teste.

A seção 3 da Política v2 ("Para que usamos e com qual base legal") traz as bases **propostas** no ROPA, inclusive
para cópias de segurança, registros técnicos, cookies necessários e a exclusão das contas sem onboarding (legítimo
interesse e execução do contrato): confirmar cada uma.

**Impacto.** Cada ajuste vira versão nova; retirar o rótulo de rascunho depende desta aprovação.

### 4.2 Versões não substanciais com aviso e ciência (OI-30)
**Pergunta.** Termos v2 (saiu a seção "Sugestões do app") e Política v2 (só descreve melhor o tratamento que já
existia, inclusive o prazo de 30 dias das contas sem onboarding) foram publicados como versões **não substanciais**:
quem aceitou a v1 não aceita de novo; vê um aviso único dentro do app e o clique em "Entendi" fica registrado.
(a) As mudanças dispensam novo aceite (CDC; Marco Civil, art. 7º, XI)? (b) O aviso dentro do app basta, ou é preciso
também e-mail? (c) O registro do clique é prova suficiente? (d) O texto do aviso está adequado? (e) A Política v1 dizia "quando
houver mudança importante, avisaremos e pediremos sua confirmação"; a v2 mantém essa promessa e acrescenta que
mudanças que só descrevem melhor o tratamento têm aviso e registro de ciência. Esse acréscimo, feito pela própria via
não substancial, é aceitável?

**Opções.** Para cada uma: confirmar, ou indicar novo aceite / e-mail / outro registro.

**Implementado hoje.** Aviso único em todas as telas até o "Entendi", sem bloquear o uso; prova em
`policy_acceptances` (tipo "ciência") e AuditLog. Contas novas aceitam a versão vigente no onboarding.

**Impacto.** Novo aceite: basta publicar a mesma versão como substancial (o mecanismo existe). E-mail: um envio único
pelo provedor de e-mail (tema 8), sem conteúdo de saúde.

### 4.3 Cookies e preferências (OI-36)
**Pergunta.** O app usa só cookies necessários (sessão, aparelho conhecido, verificação de idade) e cookies de sessão
de preferências pedidas pela própria pessoa (período, modo privacidade, modo apresentação), sem identificador; tema,
aparência do modelo 3D e tour da demonstração ficam só no navegador. A descrição da Política v2 (seção 9) basta, sem
banner nem consentimento? Os textos do modo privacidade (`privacyMode.*`, "ocultos em todas as telas") prometem o
que o app faz?

**Impacto.** Se exigir banner: componente novo, sem mudar o tratamento. Ajuste de texto: nova versão da Política.

## 5. Retenção e registros de acesso — OI-04, OI-06, OI-14 b, OI-17, PR1b-M2 🔴

**Perguntas.**
1. **Provas de consentimento e de pedidos (OI-04):** quanto tempo guardar? Hoje 5 anos depois do fim de cada registro,
   com dados mínimos (sem e-mail nem conteúdo).
2. **Registros de acesso (OI-06, OI-17):** o art. 15 do Marco Civil se aplica (depende do controlador, tema 2)? Se
   sim: IP sem porta e data/hora no login e a cada 5 minutos de uso, por 180 dias, atendem? A porta de origem é
   exigível (CGNAT)? Qual o procedimento para fornecer mediante ordem judicial? Se não se aplica: reduzir ao mínimo
   de segurança.
3. **Registros de acesso de quem se declarou menor (PR1b-M2):** ficam pelo prazo do Marco Civil ou são apagados no
   encerramento?
4. **Folga técnica de 1 dia (OI-14 b):** sessões e tokens vencidos ficam 1 dia antes de sair, para investigar abuso.
   Aceitável?
5. **Contas sem onboarding (ROPA T14):** conta com e-mail confirmado que não conclui o cadastro recebe aviso no 23º
   dia e sai 30 dias após o cadastro (7 após o aviso). O prazo e a base (execução de contrato em formação ou
   legítimo interesse) estão adequados? Está escrito na Política v2.
6. **Backups (ROPA T12):** cópias cifradas por até 30 dias, com reaplicação das exclusões e revogações ao restaurar.
   Base e prazo adequados? No pior caso, um dado revogado sobrevive até 60 dias numa cópia (30 de carência + 30 de
   backup).

**Implementado hoje.** Todos os prazos são configuráveis com limites conferidos no ambiente, no início dos jobs e na
CI (`RETENTION.md`); a Política v2 usa `{{RETENCAO_ACESSO}}`, `{{RETENCAO_PROVA}}` e `{{PRAZO_BACKUP}}`.

**Impacto.** Mudar um prazo: configuração e, se estiver no texto, versão nova da Política. Apagar os registros de
acesso do menor: ajuste no encerramento (uma função do banco). Mudar o prazo das contas sem onboarding: migração
(o prazo está nas funções do banco) e versão nova da Política.

## 6. Direitos do titular — OI-18, OI-20, OI-31, OI-33, OI-34, PR2-N1 🟠

| Questão | Implementado hoje | Opções e impacto |
|---|---|---|
| **Revisão do Índice de Bem-Estar (OI-18):** o Índice é "decisão unicamente automatizada que afete interesses" (art. 20)? Qual o conteúdo mínimo da resposta? | Pedido com protocolo e prazo de 15 dias; o encarregado atende pelo script. O Índice resume só os registros da própria pessoa (regularidade do sono, hábitos e constância de registro; nunca peso ou medidas), sem classificação nem referência populacional (`docs/WELLBEING_SCORE.md`) | Se não for art. 20: manter como canal de dúvida. Se for: roteiro de resposta no runbook (sem código) |
| **Correção sem histórico (OI-20):** LEG-D02 pede "todo dado editável, com histórico". O app corrige e apaga sem guardar versões anteriores (minimização) | Correção na tela de cada registro; a Central diz onde | Se histórico for exigível: versões anteriores guardadas, exportadas e eliminadas junto (esforço alto) |
| **Anonimização (OI-31):** sem uso estatístico dos dados, o pedido de anonimização é respondido com a explicação e a oferta de exclusão. Atende o art. 18, IV, e o art. 12? | Pedido aberto na Central; comprovante explica e leva à exclusão | Se não atender: definir o que seria anonimizar aqui (esforço médio) |
| **Exclusão imediata (OI-33):** a conta e os dados saem em minutos, sem prazo de arrependimento; antes, a Central oferece baixar a cópia. Adequado (CDC, art. 18, VI)? O e-mail de aviso e os textos estão bons? Pedidos abertos saem como "recusados" (perderam o objeto): a prova precisa de motivo próprio? | Implementado, com reautenticação e frase de confirmação | Prazo de arrependimento: mudança grande (estado intermediário, purga adiada, textos novos) |
| **Atendimento manual (OI-34):** quem pode ter a credencial e como é guardada; exigir uma segunda pessoa para exclusões pedidas fora do app (duplo controle)? Respostas-modelo do runbook | Um papel de banco por pessoa, nome gravado no AuditLog, teto de 30 leituras de contato por hora, alerta acima de 20 ações por hora, registro de pedido recebido fora do app | Duplo controle: função de aprovação por segundo papel (esforço médio) |
| **Edição pela própria pessoa sem AuditLog (PR2-N1):** LEG-S06 cobre acessos e exclusões feitos pelo sistema ou por terceiros, não a edição dos próprios registros. Leitura correta? | Edições da própria pessoa não geram AuditLog | Se exigir: AuditLog por edição, só com IDs (esforço baixo; também ajudaria a restauração, RIPD R16) |

## 7. Menores de idade — OI-02 🔴

**Pergunta.** Autodeclaração da data de nascimento com bloqueio de menores (sem guardar a data) basta frente ao ECA
Digital (Lei 15.211/2025) e à fiscalização da ANPD? Confirmar vigência e obrigações na data do lançamento.

**Implementado hoje.** Menor não cria conta e nada dele é gravado (teste); quem descobre ser menor depois encerra a conta
na hora (Central ou onboarding), ficando só provas mínimas sem e-mail. Linguagem não dirigida a menores.

**Opções e impacto.** (a) Basta. (b) Exige verificação de idade mais forte: o adaptador `AgeSignalProvider` já existe
para isso; depende de fornecedor (novo subprocessador, ROPA e RIPD).

## 8. Fornecedores e transferência internacional — OI-03, OI-11 🔴

**Perguntas.**
1. E-mail transacional e monitoramento de erros provavelmente ficam fora do Brasil, **sem conteúdo de saúde**. Qual
   mecanismo do art. 33 usar (ex.: cláusulas-padrão da ANPD)? Não pode ser o consentimento do titular: essa finalidade
   foi retirada do produto (ADR-0030).
2. O fato de um lembrete existir (e-mail identificado, horário) pode indicar rotina de saúde: exige base própria
   quando enviado por provedor fora do Brasil?
3. Conteúdo mínimo dos DPAs com hospedagem, banco, storage, KMS, e-mail e erros.

**Implementado hoje.** Regiões declaradas em `infra/regions.json` e conferidas na CI; nenhum serviço fora do Brasil
entra sem linha em SUBPROCESSORS. E-mails só com link, tipo de aviso e datas. Relatório de erro sem mensagem nem dado
de usuário. Fornecedores ainda não escolhidos (`{{HOSPEDAGEM}}`, `{{EMAIL}}` etc.).

4. **Lembretes por push (OI-27, adiado):** se entrarem, o serviço de push é um subprocessador novo, possivelmente
   fora do Brasil. A pergunta 2 vale também para ele.
5. A seção 5 da Política v2 diz que banco, armazenamento, filas e servidor ficam no Brasil e remete a
   Subprocessadores para o resto; com o mecanismo do art. 33 definido, ela pode precisar citar a transferência.

**Impacto.** Se o lembrete exigir base própria: opção de lembrete só no app (sem e-mail) ou provedor de e-mail no
Brasil. A escolha dos fornecedores atualiza SUBPROCESSORS, a página pública e a Política (se mudar o que ela diz).

## 9. Incidentes — OI-05 🟠

**Pergunta.** Prazo vigente e conteúdo da comunicação de incidente à ANPD e aos titulares; textos-modelo
(`{{PRAZO_ANPD}}`, `{{MODELO_COMUNICACAO}}`). Um intervalo de dados perdido numa restauração (exclusões ou revogações
que voltariam) deve ser tratado como incidente comunicável?

**Implementado hoje.** Runbook `docs/runbooks/INCIDENT.md` com contenção, investigação só por metadados e
recuperação; o intervalo perdido é registrado como incidente (`BACKUP_RESTORE.md`, parte 5).

**Impacto.** Só documentos.

## 10. Imagem corporal, alimentação e profissões regulamentadas — OI-09, OI-10, OI-21, OI-22, OI-23, OI-24, OI-25 🔴 (com revisão clínica)

Este tema precisa de advogado(a) **e** de profissionais de saúde (nutrição, educação física, psicologia).

| Questão | Implementado hoje | Impacto |
|---|---|---|
| **Avisos obrigatórios (OI-09)** e **glossário de termos proibidos (OI-10)** | Avisos `disclaimer.*`; teste bloqueia alegações clínicas e termos de imagem corporal e alimentação em todos os textos | Ajuste de texto; o glossário é uma lista no código |
| **Resumos e guias dos gráficos (OI-21):** o "o que fazer com isso" pode ser lido como orientação de saúde? | Resumos por regras fixas, comparando só com a própria pessoa, sem propor ações | Ajuste de texto |
| **Modelo 3D do corpo (OI-22, OI-24):** pode ser lido como avaliação corporal ou comparação com um corpo padrão? Rótulos "feminino"/"masculino", forma base, limites do desenho | Forma só pelas medidas informadas (o peso não muda a forma), sem IMC, cor neutra, aviso fixo, escolha só no navegador | Ajuste de texto ou de desenho; em último caso, retirar o 3D |
| **Limites de segurança e textos (OI-23):** IMC mínimo 18,5 na meta, perda de até 1% por semana, piso de 1.500 kcal/dia (sem dado de sexo); só metas de perda são limitadas; meta de calorias só com a estimativa ligada; onde mostrar CVV 188 / SAMU 192; limite entre registrar e prescrever | Implementado no servidor e no banco, com testes; apoio fixo na tela de corpo, quando um limite dispara e no menu de ajuda | Mudar um limiar: migração (está no banco) e testes; retirar a meta de calorias: remoção de recurso |
| **Quem aprova os textos (OI-13):** hoje a revisão dos avisos depende do teste de textos e do checklist de PR | CODEOWNERS só com o desenvolvimento | Incluir revisor jurídico e clínico e exigir aprovação (CHECKLIST 1.7) |
| **Medidas novas (OI-25):** se antebraço e panturrilha entrarem, o consentimento atual ("peso e medidas") cobre? | Adiado pelo produto | Se não cobrir: versão nova do consentimento |

---

## O que muda no app com cada resposta (resumo para o produto)

- **Só texto (versão nova com aviso):** temas 2, 3.2 (b), 3.5 (c), 4, 5 (prazos no texto), 10 (textos).
- **Configuração:** prazos do tema 5 que não estão no texto.
- **Código pequeno:** 3.5 (b), 5.3, PR2-N1, e-mail do aviso (4.2 b).
- **Código médio:** 3.3 (c), duplo controle (OI-34), anonimização (OI-31), verificação de idade (tema 7).
- **Código grande ou retirada de recurso:** 1 (c), histórico de correções (OI-20), prazo de arrependimento (OI-33),
  retirada do 3D (tema 10).

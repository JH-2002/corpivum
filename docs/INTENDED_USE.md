# Declaração de finalidade pretendida — HealthMind 360

> **RASCUNHO — revisão jurídica obrigatória.** `LEGAL-REVIEW`: avaliar o enquadramento frente à
> RDC ANVISA nº 657/2022 (software como dispositivo médico) antes do lançamento (LEG-M01, LEG-G05).
> Versão: 0.2 (reorientação, ADR-0027) · Controlador: `{{CONTROLADOR}}` · Encarregado: `{{ENCARREGADO}}`

## 1. Finalidade
O HealthMind 360 é uma plataforma web de **bem-estar e autoacompanhamento do desenvolvimento corporal** para
adultos (18+) no Brasil. A pessoa registra informações sobre o próprio corpo e a própria rotina — peso e
medidas, sono, hábitos, alimentação e atividade física — define metas próprias, e o app organiza esses
registros em resumos, gráficos, linha do tempo, um modelo 3D do corpo e, se ela ativar, conversas com um
assistente de IA.

## 2. O que o produto faz
- Guarda e organiza registros **informados pela própria pessoa**.
- Mostra médias, tendências e associações simples entre os registros, sempre com a origem do dado
  (MEDIDO, INFORMADO, ESTIMADO, INFERIDO, RECOMENDADO, DEMO).
- Envia lembretes que a pessoa configurou (hábitos, registro).
- Acompanha metas definidas pela pessoa, dentro de limites de segurança (LEG-M04).
- Sugere ações gerais de rotina (sono, hábitos, movimento, hidratação, pausas), com o motivo visível.
- Oferece conteúdo educativo, identificado como tal.

## 3. O que o produto não faz
- **Não diagnostica** doenças, transtornos ou condições.
- **Não trata** e não recomenda tratamento.
- **Não monitora doenças** nem acompanha condições clínicas.
- **Não prescreve dieta, plano alimentar nem treino.** Essas atividades são de profissionais habilitados
  (nutricionista, profissional de educação física). O app registra o que a pessoa informa (LEG-M08).
- **Não avalia nem julga o corpo:** sem "corpo ideal", sem classificação por IMC na interface, sem comparação
  com outras pessoas (LEG-M06). O modelo 3D usa só as medidas informadas.
- **Não incentiva restrição:** sem meta que leve a IMC abaixo de 18,5, sem déficit agressivo, sem jejum
  prolongado (LEG-M04, M07).
- **Não sugere, calcula nem ajusta doses** e não registra medicamentos.
- **Não mede** atividade cerebral, níveis de neurotransmissores ou qualquer parâmetro laboratorial.
- **Não substitui** profissional de saúde, consulta, exame ou atendimento de emergência.
- Não é destinado a crianças ou adolescentes.

## 4. Usuários e ambiente de uso
- Adultos (18+), uso pessoal, em navegador (desktop e celular).
- Sem uso por profissionais de saúde para decisão clínica. Sem integração com prontuário.
- Integrações com dispositivos (wearables) estão fora do MVP; ativá-las exige nova finalidade,
  consentimento e revisão do RIPD (LEG-X04).

## 5. Situações de risco
Quando o chat indicar sofrimento intenso, ou quando um guardrail de imagem corporal ou alimentação disparar
(ex.: meta de peso abaixo do limite, ritmo de perda acima do limite), o app interrompe o fluxo normal e orienta
a buscar profissional de saúde e apoio: **CVV 188** (apoio emocional, 24h, gratuito) e **SAMU 192**
(emergência). Há acesso permanente "Precisa de ajuda?" no menu de ajuda. O app não faz avaliação de risco
clínico (LEG-I07, LEG-M04, §48). `LEGAL-REVIEW` e revisão clínica dos textos.

## 6. Como esta declaração é aplicada no produto
- Avisos obrigatórios no namespace i18n `disclaimer.*`, exibidos nas telas pertinentes.
- Teste automatizado que bloqueia alegações clínicas na interface (LEG-M03).
- Camada de saída da IA que bloqueia diagnóstico, dose, afirmações neuroquímicas e prescrição de dieta ou
  treino (LEG-I04, LEG-M08).
- Guardrails de imagem corporal, alimentação, metas e recomendações (LEG-M04, M06, M07), em módulo próprio
  com testes.

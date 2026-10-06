# Declaração de finalidade pretendida — HealthMind 360

> **RASCUNHO — revisão jurídica obrigatória.** `LEGAL-REVIEW`: avaliar o enquadramento frente à
> RDC ANVISA nº 657/2022 (software como dispositivo médico) antes do lançamento (LEG-M01, LEG-G05).
> Versão: 0.1 (Fase 0) · Controlador: `{{CONTROLADOR}}` · Encarregado: `{{ENCARREGADO}}`

## 1. Finalidade
O HealthMind 360 é uma plataforma web de **bem-estar e autoacompanhamento** para adultos (18+) no Brasil.
A pessoa registra informações sobre a própria rotina — sono, humor, energia, hábitos, diário, peso e
medidas, alimentação, atividade física e medicamentos que já usa — e o app organiza esses registros em
resumos, gráficos, linha do tempo, visualizações e, se ela ativar, conversas com um assistente de IA.

## 2. O que o produto faz
- Guarda e organiza registros **informados pela própria pessoa**.
- Mostra médias, tendências e associações simples entre os registros, sempre com a origem do dado
  (MEDIDO, INFORMADO, ESTIMADO, INFERIDO, RECOMENDADO, DEMO).
- Envia lembretes que a pessoa configurou (hábitos, registro, medicamentos já prescritos).
- Sugere ações gerais de rotina (sono, hábitos, movimento, hidratação, pausas), com o motivo visível.
- Oferece conteúdo educativo, identificado como tal.

## 3. O que o produto não faz
- **Não diagnostica** doenças, transtornos ou condições.
- **Não trata** e não recomenda tratamento.
- **Não monitora doenças** nem acompanha condições clínicas.
- **Não sugere, calcula nem ajusta doses**; não verifica interações entre medicamentos; não altera nada
  automaticamente. Aviso fixo: "Siga a orientação do seu prescritor." (LEG-M02)
- **Não mede** atividade cerebral, níveis de neurotransmissores ou qualquer parâmetro laboratorial.
  O cérebro 3D e os indicadores "neuroquímicos" são educacionais (LEG-M05).
- **Não substitui** profissional de saúde, consulta, exame ou atendimento de emergência.
- Não é destinado a crianças ou adolescentes.

## 4. Usuários e ambiente de uso
- Adultos (18+), uso pessoal, em navegador (desktop e celular).
- Sem uso por profissionais de saúde para decisão clínica. Sem integração com prontuário.
- Integrações com dispositivos (wearables) estão fora do MVP; ativá-las exige nova finalidade,
  consentimento e revisão do RIPD (LEG-X04).

## 5. Situações de risco
Quando o diário, o humor registrado ou o chat indicarem sofrimento intenso, o app interrompe o fluxo normal
e orienta a buscar apoio: **CVV 188** (apoio emocional, 24h, gratuito) e **SAMU 192** (emergência). O app não
faz avaliação de risco clínico (LEG-I07, §48). `LEGAL-REVIEW` e revisão clínica dos textos.

## 6. Como esta declaração é aplicada no produto
- Avisos obrigatórios no namespace i18n `disclaimer.*`, exibidos nas telas pertinentes.
- Teste automatizado que bloqueia alegações clínicas na interface (LEG-M03).
- Camada de saída da IA que bloqueia diagnóstico, dose e afirmações neuroquímicas (LEG-I04).
- Guardrails de metas e recomendações (LEG-M04).

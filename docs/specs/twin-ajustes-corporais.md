# Twin — ajustes nos modelos corporais (v1)

Status: aprovado pelo produto para planejamento. Vale para a branch `fase-3b-corpo-holograma`.

## 0. Regras do projeto que prevalecem sobre esta especificação

Em caso de conflito entre este documento e as regras abaixo, valem as regras abaixo
(e, acima delas, `docs/LEGAL_REQUIREMENTS.md`).

1. **Substitui pedidos anteriores.** Esta especificação substitui os pedidos anteriores sobre
   cintura, busto e medidas do modelo masculino. Os valores de referência são os da seção 4.
2. **Só dois modelos:** feminino e masculino. A variante neutra foi removida. Não há modelo
   padrão assumido: na primeira visita ao twin, a pessoa escolhe qual modelo prefere ver
   ("só muda a aparência; fica salvo neste navegador"); até escolher, aparece o corpo em código.
   A escolha nunca vai ao servidor.
3. **Relação cintura/quadril não é exibida.** Ela é calculada só internamente, para calibração e
   testes. Nunca aparece na interface, assim como o IMC (LEG-M06). Onde esta especificação fala em
   "valores derivados exibidos", leia "valores derivados usados internamente".
4. **Sem controles livres de forma.** O corpo é moldado apenas pelas medidas registradas pela
   pessoa (peito, braço, cintura, quadril, coxa e altura). Parâmetros que ninguém mede (largura de
   ombro, profundidade do tórax, projeção do busto, glúteos, profundidade abdominal) ficam fixos
   por modelo e servem só para calibração. A interface não ganha sliders para esculpir o corpo.
5. **Medidas novas são decisão do produto.** Antebraço e panturrilha só entram como medidas
   opcionais novas (com migração no banco) se o produto aprovar. Proponha e aguarde.
6. **Regras que continuam valendo:** LEG-M06 (imagem corporal), LEG-M07 (alimentação) e LEG-M08
   (sem prescrição de dieta ou treino); forma nunca guiada pelo peso; superfície lisa, sem mamilos
   e sem detalhe genital; rosto de manequim; estilo de holograma; modelos do MakeHuman/MPFB2 (CC0)
   registrados em `docs/ASSETS.md`; orçamento de tamanho no CI.
7. **Valores de referência não são padrão de saúde nem de beleza.** Nenhum texto da interface pode
   apresentá-los como "ideal", "normal" ou meta.

---

## ESPECIFICAÇÃO TÉCNICA: AJUSTES NOS MODELOS CORPORAIS 3D MASCULINO E FEMININO

### 1. OBJETIVO

Realizar uma revisão dos modelos corporais 3D masculino e feminino existentes no sistema, corrigindo suas proporções, aprimorando a representação anatômica e garantindo que as medidas antropométricas inseridas pelo usuário sejam refletidas corretamente na geometria dos avatares.

As alterações devem preservar a estrutura atual do sistema sempre que possível, evitando reconstruções desnecessárias. O objetivo é melhorar a fidelidade visual, a personalização corporal e a precisão das medidas calculadas.

### 2. MEDIDAS ATUAIS

Os modelos apresentam atualmente os seguintes valores:

| Medida | Feminino | Masculino | Neutro antigo |
|---|---:|---:|---:|
| Peito | 84,6 cm | 84,4 cm | 84,2 cm |
| Braço | 21,7 cm | 26,5 cm | 26,5 cm |
| Cintura | 62,9 cm | 70,2 cm | 69,3 cm |
| Quadril | 97,8 cm | 93,7 cm | 93,8 cm |
| Coxa | 53,4 cm | 53,5 cm | 53,1 cm |
| Relação cintura/quadril | 0,64 | 0,75 | 0,74 |

Observação: considerar as medidas em centímetros, exceto a relação cintura/quadril, que é adimensional. Confirmar os protocolos de medição antes de utilizá-las como referências definitivas.

### 3. DIAGNÓSTICO DOS MODELOS ATUAIS

Foram identificados os seguintes pontos que precisam ser avaliados e corrigidos:

- Os modelos masculino e feminino apresentam circunferências de peito praticamente idênticas, limitando a diferenciação das proporções do tórax.
- A medida do braço feminino é consideravelmente inferior à do masculino. Essa diferença não deve ser eliminada automaticamente, mas é necessário verificar se os valores correspondem ao formato visual pretendido.
- A cintura feminina apresenta uma relação acentuada com o quadril. Essa proporção pode continuar disponível como uma variação corporal, mas não deve ser obrigatória para o modelo feminino.
- O quadril masculino precisa permitir uma amplitude maior de personalização.
- As circunferências das coxas são praticamente idênticas nos três modelos, limitando a representação de diferentes volumes musculares e corporais.
- O modelo neutro antigo é muito semelhante ao masculino em várias medidas. Avaliar sua finalidade e evitar manter um modelo redundante caso não exista necessidade funcional para ele.

Importante: esses pontos representam oportunidades de melhoria, não comprovações de erros anatômicos. A validação definitiva depende da estatura de referência, do protocolo de medição e da geometria utilizada.

### 4. NOVOS VALORES DE REFERÊNCIA PROPOSTOS

Utilizar os seguintes valores como configuração inicial para testes e calibração visual:

| Medida | Modelo feminino | Modelo masculino |
|---|---:|---:|
| Peito | 86 cm | 96 cm |
| Braço | 25 cm | 31 cm |
| Cintura | 68 cm | 80 cm |
| Quadril | 96 cm | 98 cm |
| Coxa | 54 cm | 57 cm |
| Relação cintura/quadril | 0,71 | 0,82 |

Esses valores são parâmetros preliminares de prototipagem, não padrões universais de beleza, saúde ou composição corporal. Devem ser ajustados conforme a estatura, o biotipo e a finalidade do sistema.

A relação cintura/quadril deve ser calculada automaticamente a partir das circunferências:

Relação cintura/quadril = circunferência da cintura / circunferência do quadril.

Não armazenar valores incompatíveis com as medidas apresentadas ao usuário. A relação deve ser recalculada sempre que a cintura ou o quadril forem alterados.

### 5. ALTERAÇÕES NO MODELO FEMININO

#### 5.1. Tórax e busto

- Criar parâmetros independentes para circunferência do peito, largura torácica, profundidade do tórax e projeção do busto.
- Evitar que uma alteração na circunferência do peito modifique indiscriminadamente toda a região superior.
- Preservar transições anatômicas naturais entre tórax, ombros, axilas e abdômen.

#### 5.2. Cintura e abdômen

- Reduzir a dependência de uma cintura excessivamente estreita como formato padrão.
- Permitir variações graduais na circunferência e na profundidade abdominal.
- Preservar a continuidade entre costelas, cintura e pelve.
- Garantir que a alteração da cintura não deforme a coluna ou os membros superiores.

#### 5.3. Quadril e pelve

- Criar controles específicos para largura, profundidade e circunferência do quadril.
- Ajustar a geometria para refletir a medida informada pelo usuário.
- Preservar uma transição natural entre cintura, quadril, glúteos e coxas.
- Permitir diferentes formatos corporais sem impor uma proporção única.

#### 5.4. Braços e coxas

- Permitir o ajuste independente das circunferências dos braços, antebraços e coxas.
- Evitar aumentar os membros por meio de escalas globais que deformem articulações.
- Garantir que as alterações de volume mantenham transições suaves nos cotovelos, joelhos e demais articulações.

#### 5.5. Ombros

- Implementar um parâmetro próprio para largura dos ombros.
- Não deduzir automaticamente a largura dos ombros apenas a partir da circunferência do peito.
- Preservar a proporção entre ombros, tórax e cintura.

### 6. ALTERAÇÕES NO MODELO MASCULINO

#### 6.1. Peitoral e tórax

- Ampliar a capacidade de personalização da largura, profundidade e circunferência do tórax.
- Criar controles independentes para a região peitoral e para a largura dos ombros.
- Evitar que o aumento da circunferência do peito expanda desproporcionalmente as costas, os braços ou o pescoço.

#### 6.2. Ombros e braços

- Permitir diferentes larguras de ombros e volumes musculares.
- Ajustar independentemente braço e antebraço.
- Preservar proporções anatômicas nas regiões de cotovelos, punhos e axilas.
- Possibilitar a representação de corpos magros, intermediários e musculosos.

#### 6.3. Cintura e abdômen

- Separar a circunferência abdominal da profundidade do abdômen.
- Permitir diferentes formatos de cintura sem alterar a escala global do tronco.
- Garantir transições naturais entre tórax, cintura e quadril.
- Evitar que a redução da cintura provoque deformações nas costelas ou na coluna.

#### 6.4. Quadril e glúteos

- Ampliar a faixa de personalização da circunferência e da largura do quadril.
- Permitir diferentes volumes de glúteos e proporções entre quadril e cintura.
- Evitar utilizar um quadril estreito como característica obrigatória do modelo masculino.

#### 6.5. Coxas e pernas

- Aumentar a capacidade de representar diferentes volumes musculares nas coxas.
- Permitir ajustes independentes das circunferências das coxas e panturrilhas.
- Preservar o formato dos joelhos e as transições entre os segmentos das pernas.
- Evitar que o aumento da coxa modifique indevidamente a largura do quadril ou o comprimento dos membros.

### 7. REQUISITOS TÉCNICOS COMPARTILHADOS

Implementar os seguintes requisitos nos dois modelos:

1. Padronizar todas as medidas em centímetros.
2. Definir claramente os pontos anatômicos utilizados em cada medição.
3. Criar parâmetros independentes para peito, busto, ombros, cintura, abdômen, quadril, braços e coxas.
4. Garantir que as alterações nas medidas produzam modificações localizadas na malha 3D.
5. Evitar escalas globais como solução principal para alterar circunferências.
6. Preservar a continuidade da geometria e a aparência natural da superfície.
7. Recalcular automaticamente os indicadores derivados, incluindo a relação cintura/quadril.
8. Garantir que os valores apresentados na interface correspondam às medidas efetivamente representadas pelo avatar.
9. Preservar as funcionalidades atuais, incluindo rotação do modelo, atualização das medidas e comparação corporal, quando existentes.
10. Manter compatibilidade com os componentes e as tecnologias já utilizados no projeto.

### 8. VALIDAÇÃO DAS MEDIDAS NA GEOMETRIA 3D

Não considerar uma medida corretamente implementada apenas porque seu valor foi inserido em uma variável.

As circunferências devem ser verificadas na geometria real do modelo.

Para isso:

- Definir planos ou pontos anatômicos de referência para cada circunferência.
- Calcular ou validar a circunferência da malha na região correspondente.
- Ajustar os parâmetros geométricos até que a medida calculada se aproxime da medida configurada.
- Evitar que a alteração de uma medida gere divergências importantes nas demais.
- Considerar uma tolerância numérica adequada à resolução da malha e ao método de cálculo utilizado.

A altura, a largura e a profundidade do modelo não devem ser confundidas com circunferências corporais. Uma alteração visual de largura, isoladamente, não garante que a circunferência resultante esteja correta.

### 9. TESTES OBRIGATÓRIOS

Executar os seguintes testes antes de considerar os modelos finalizados:

- Verificar se as medidas de referência são reproduzidas corretamente.
- Testar valores baixos, intermediários e altos para cada parâmetro.
- Alterar a cintura e verificar se o tórax e os membros permanecem coerentes.
- Alterar o peito e verificar se os ombros e os braços não sofrem deformações indevidas.
- Alterar o quadril e verificar a continuidade com glúteos e coxas.
- Alterar o braço e verificar se a circunferência muda sem deformar cotovelos e punhos.
- Testar as vistas frontal, lateral e posterior.
- Testar diferentes estaturas e proporções corporais.
- Confirmar a atualização automática dos valores derivados.
- Verificar se a interface continua responsiva após as alterações.

### 10. CRITÉRIOS DE ACEITAÇÃO

As alterações serão consideradas satisfatórias quando:

- Os modelos apresentarem proporções visualmente coerentes.
- Os parâmetros permitirem representar diferentes corpos sem exigir a criação de um avatar para cada variação.
- As circunferências calculadas corresponderem aos valores exibidos dentro da tolerância definida.
- As modificações localizadas não provocarem deformações anatômicas evidentes.
- Os valores derivados forem atualizados automaticamente.
- As funcionalidades existentes continuarem operacionais.
- O sistema não tratar os valores de referência como padrões clínicos universais.

### 11. ORDEM RECOMENDADA DE IMPLEMENTAÇÃO

Executar as alterações na seguinte sequência:

1. Inspecionar a implementação atual dos modelos e identificar como as medidas são convertidas em geometria.
2. Padronizar os protocolos de medição.
3. Atualizar os valores de referência para testes.
4. Implementar os parâmetros independentes de cada região corporal.
5. Ajustar a deformação da malha para preservar a anatomia.
6. Implementar a validação das circunferências.
7. Testar diferentes combinações de medidas.
8. Corrigir eventuais deformações e inconsistências.
9. Validar a interface e as funcionalidades existentes.
10. Documentar os parâmetros disponíveis e seus intervalos suportados.

### 12. INSTRUÇÃO FINAL PARA A IA DE DESENVOLVIMENTO

Analise a implementação atual antes de modificar o código. Identifique a tecnologia utilizada, a estrutura da malha 3D, a lógica responsável pelas medidas e os componentes que controlam a aparência dos modelos.

Implemente as alterações descritas neste documento de forma compatível com a arquitetura existente. Evite reescrever componentes que já funcionam corretamente.

Não se limite a alterar os números exibidos na interface: faça com que as medidas correspondam à geometria efetiva dos avatares.

Se alguma alteração depender de informações que não estão disponíveis no código atual, identifique a limitação antes de implementar uma solução aproximada.

Ao concluir, apresente um resumo dos arquivos modificados, das mudanças implementadas, dos testes realizados e das limitações que permanecerem.

O resultado esperado é um sistema de modelagem corporal 3D com avatares masculino e feminino personalizáveis, proporções anatômicas coerentes, medidas consistentes e capacidade de representar variações corporais individuais.
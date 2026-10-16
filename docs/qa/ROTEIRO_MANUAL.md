# Roteiro de teste manual — leitor de tela (NVDA) e celular

Fase 7d (ADR-0036 D7, ADR-0039; LEG-X01). Os testes automáticos já conferem o axe em todas as páginas, o teclado
nos fluxos principais, o tamanho das telas e o tempo de carga. O que só uma pessoa consegue avaliar fica aqui:
**se o que o leitor de tela fala faz sentido** e **se o app é confortável no celular de verdade**.

Leve uns 60 a 90 minutos no computador e 30 no celular. Não precisa fazer tudo de uma vez.

> **Use só dados inventados.** E-mail como `ana@exemplo.test`, peso e sono inventados. Nunca seus dados reais
> (regra 6 do projeto). Faça o teste numa **janela anônima** (no computador e no celular) ou num perfil de
> convidado, para o navegador não oferecer seu e-mail real no preenchimento automático, e responda **"Nunca"**
> quando ele perguntar se quer salvar a senha.

---

## 1. Preparação (uma vez só)

### 1.1 Subir o app no computador

No terminal, dentro da pasta do projeto:

```
pnpm db:up
pnpm mail:up
pnpm dev -H localhost
```

- O app abre em **http://localhost:3000**. O `-H localhost` deixa o app só no seu computador (sem ele, outros
  aparelhos da rede Wi-Fi conseguem abrir o app enquanto ele roda).
- Os e-mails do app (confirmação de cadastro) aparecem em **http://localhost:8025** (Mailpit).

### 1.2 Instalar e conhecer o NVDA

1. Baixe em **nvaccess.org** e instale. Abra o NVDA (ele fala ao iniciar).
2. Use o **Google Chrome** ou o **Firefox** para o teste.
3. A tecla do NVDA é o **Insert** (ou **Caps Lock**, se você escolher na instalação).

Teclas que vamos usar:

| Tecla | O que faz |
|---|---|
| **Tab** / **Shift+Tab** | Vai para o próximo / anterior item clicável (link, botão, campo) |
| **Enter** | Ativa um link ou botão; envia um formulário |
| **Espaço** | Marca uma caixa de seleção; ativa um botão |
| **Esc** | Fecha uma janela (diálogo) |
| **H** / **Shift+H** | Próximo / anterior título da página |
| **1** | Próximo título de nível 1 (o título principal) |
| **D** | Próxima região (cabeçalho, navegação, conteúdo principal, rodapé) |
| **F** | Próximo campo de formulário |
| **B** | Próximo botão |
| **Insert+F7** | Lista de links, títulos e regiões da página |
| **Insert+Espaço** | Alterna entre "modo de navegação" e "modo de foco" (ao digitar num campo o NVDA muda sozinho) |
| **Ctrl** | Faz o NVDA parar de falar |

> O NVDA não fala exatamente igual em todo computador. Nas colunas "o que devo ouvir", vale o **sentido**:
> se o texto e o tipo do elemento ("botão", "título", "caixa de seleção") estão lá, está certo.

### 1.3 Preparar o celular (Android)

O app usa cookies seguros, que só funcionam em `https` ou em `localhost`. Por isso o celular acessa o app do
computador pelo cabo USB:

1. No Android: **Configurações > Sobre o telefone**, toque 7 vezes em "Número da versão" para liberar as
   "Opções do desenvolvedor". Em **Opções do desenvolvedor**, ligue a **Depuração USB**.
2. Ligue o celular no computador pelo cabo e aceite a pergunta de depuração na tela do celular.
3. No Chrome do computador, abra `chrome://inspect/#devices`, clique em **Port forwarding**, adicione
   `3000` → `localhost:3000`, marque **Enable port forwarding** e clique em **Done**.
4. No Chrome do celular, abra **http://localhost:3000**.

iPhone: o Safari não tem esse atalho, e abrir pelo endereço do computador na rede Wi-Fi não funciona (os
cookies seguros são recusados). Se só tiver iPhone, marque a parte C como "não testado" e me avise: preparo um
caminho com `https` local.

---

## 2. Parte A — computador com NVDA

Cada passo tem um código (A1, A2...). Marque o resultado na tabela da seção 4.

### A1. Pessoa com menos de 18 anos não cria conta

1. Abra uma **janela anônima nova** (**Ctrl+Shift+N**), só para este passo, e nela **http://localhost:3000/cadastro**. Aperte **1**.
   - **Ouvir:** "Boas-vindas ao HealthMind 360, título nível 1".
2. Aperte **F** até chegar à data de nascimento. Digite a data de nascimento de alguém com 16 anos
   (ex.: o dia de hoje, com o ano de 16 anos atrás).
   - **Ouvir:** "Data de nascimento", e o campo anuncia dia, mês e ano enquanto você digita.
3. Aperte **Tab** até "Continuar" e **Enter**.
   - **Ouvir:** "Não é possível criar uma conta, título nível 1".
   - **Ver/ouvir:** texto dizendo que nada do que foi digitado foi guardado e o CVV 188.
   - **Problema se:** aparecer um formulário de e-mail ou qualquer coisa que peça dados.
4. Feche essa janela anônima. O A2 começa em outra janela anônima nova (o bloqueio de idade fica só na
   janela fechada).

### A2. Cadastro de adulto

1. Em **/cadastro**, digite uma data de nascimento de adulto (ex.: 20/05/1990) e **Continuar**.
   - **Ouvir:** "Seus dados de acesso, título nível 1".
2. Com **Tab**, preencha e-mail inventado, senha e "Confirme a senha". Aperte **Enter** em "Criar conta".
   - **Ouvir:** cada campo pelo nome ("E-mail, editar", "Senha, editar protegido").
   - **Ouvir depois de enviar:** "Confira seu e-mail".
3. Envie de novo com as senhas diferentes (volte ao passo 1 com outro e-mail).
   - **Ouvir:** a mensagem de erro logo depois de enviar, sem precisar procurar (é um "alerta").
   - **Problema se:** o erro só aparecer na tela e o NVDA ficar em silêncio.

### A3. Confirmar e-mail, entrar e fazer as escolhas de privacidade

1. Abra **http://localhost:8025**, abra a mensagem e copie o link de confirmação para o navegador.
   Aperte **B** até "Confirmar e-mail" e **Enter**.
   - **Ouvir:** "E-mail confirmado. Você já pode entrar."
2. Em **/entrar**, aperte **Tab** a partir do topo.
   - **Ouvir primeiro:** "Pular para o conteúdo, link". Depois e-mail, senha, botão "Entrar".
3. Entre com a senha **errada** primeiro.
   - **Ouvir:** "E-mail ou senha incorretos..." logo depois de enviar.
   - **Ver:** o e-mail continua preenchido; só a senha precisa ser digitada de novo.
4. Entre com a senha certa.
   - **Ouvir:** "Proteja sua conta, título nível 1". **Tab** até "Continuar" e **Enter**.
5. Na tela "Suas escolhas de privacidade", aperte **F** várias vezes.
   - **Ouvir:** cada caixa como "caixa de seleção, não marcada" (todas começam desmarcadas).
   - **Ouvir:** os grupos com nome ("Termos e Política de Privacidade (obrigatórios...)",
     "Autorizações por finalidade (opcionais)").
6. Marque com **Espaço**: "Dados de bem-estar", os Termos e a Política. **Enter** em
   "Salvar escolhas e continuar".
   - **Ouvir:** "Como você quer começar?, título nível 1". Ative "Começar com meus dados".
   - **Ouvir:** "Início, título nível 1".

### A4. Orientar-se na tela inicial

1. Aperte **D** algumas vezes.
   - **Ouvir:** as regiões: cabeçalho ("banner"), "Navegação principal", conteúdo principal ("main") e rodapé.
2. Aperte **H** várias vezes.
   - **Ouvir:** títulos que dão para entender a página sem ver (ex.: o título de cada cartão e gráfico).
3. Aperte **Insert+F7** e olhe a lista de links.
   - **Problema se:** houver link com nome vazio, repetido sem contexto ("clique aqui") ou só um ícone.
4. Volte ao topo (**Ctrl+Home**), aperte **Tab** e **Enter** em "Pular para o conteúdo".
   - **Ouvir:** o NVDA vai direto ao conteúdo principal, sem passar pelo menu.

### A5. Registro rápido de sono

1. Aperte **B** até o botão "Registrar" do topo e **Enter**.
   - **Ouvir:** "O que você quer registrar?, diálogo" e a descrição.
2. Aperte **Tab** algumas vezes.
   - **Ouvir:** só as opções do diálogo (Sono, Hábito, Peso e medidas...). O foco não sai do diálogo.
3. Aperte **Esc**.
   - **Ouvir:** o foco volta ao botão "Registrar".
4. Abra de novo, vá até "Sono" e **Enter**.
   - **Ouvir:** o NVDA já está no campo **"Deitei em"** (melhoria da 7d: antes o foco voltava ao topo).
5. Digite a data e a hora (dia, mês, ano, hora, minuto; o campo pula sozinho entre as partes). Aperte **Tab**
   até "Acordei em" e preencha. **Tab** até "Salvar registro" e **Enter**.
   - **Ouvir:** "Registro salvo."
   - **Ver:** ao passar pelo botão de calendário dentro do campo de data, um contorno de foco aparece nele.

### A6. Gráficos

1. Na tela **Sono** (menu "Sono"), aperte **H** até o título de um gráfico.
   - **Ouvir:** um resumo do período em frases no topo da tela (não só números soltos).
2. Aperte **B** nos botões da legenda abaixo do gráfico.
   - **Ouvir:** o nome da série e se está ligada ("pressionado" / "não pressionado").
3. Ative "Mostrar tabela" (ou o nome parecido) com **Enter**.
   - **Ouvir:** uma tabela com cabeçalhos de data e valores; com **Ctrl+Alt+setas** você anda pelas células.
   - **Problema se:** o NVDA ler o desenho do gráfico em vez da tabela.

### A7. Meta bloqueada pelo cuidado com o corpo

1. Em **Corpo**, registre peso **60** e altura **175** (valores inventados).
2. Em **Metas**, escolha "Peso" em "O que acompanhar", alvo **50**, um prazo qualquer, e **Enter**.
   - **Ouvir, logo depois de enviar:** "O app não acompanha esta meta" e a orientação de procurar profissional,
     com **CVV 188** e **SAMU 192** (melhoria da 7d: o aviso agora é anunciado e recebe o foco).
   - **Problema se:** o NVDA ficar em silêncio, ou se aparecer algum número sugerindo outro alvo.
3. Crie uma meta de peso **64**.
   - **Ouvir:** "Registro salvo." Não deve haver comemoração nem barra de progresso de peso.

### A8. Modo privacidade

1. Aperte **B** até "Modo privacidade".
   - **Ouvir:** "Modo privacidade, botão de alternância, não pressionado" (ou parecido).
2. Aperte **Enter**.
   - **Ouvir:** "pressionado" e o aviso "Modo privacidade ativo."
3. Vá até **Corpo** e ouça a página.
   - **Ouvir:** "oculto" / "Valores ocultos" no lugar dos números de peso e medidas.
4. Desligue com **Espaço** no mesmo botão.

### A9. Central de Privacidade: autorizar e revogar

1. Abra o menu da conta (**B** até "Menu da conta", **Enter**) e vá à "Central de Privacidade".
   - **Ouvir:** "Central de Privacidade, título nível 1".
2. Ache "Autorizar: Comunicações sobre novidades" e **Enter**. Depois "Revogar: Comunicações sobre novidades".
   - **Ouvir:** o botão muda de nome (de "Autorizar" para "Revogar" e de volta).
3. Ache "Revogar: Dados de bem-estar" e siga a confirmação.
   - **Ouvir:** o aviso com a **data** em que os dados serão eliminados se você não autorizar de novo.
   - Autorize de novo antes de continuar.

### A10. Exportar os dados

1. Na Central, ache a parte de exportação e ative "Gerar arquivo".
   - **Ouvir:** "Pedido recebido..." anunciado sem você precisar procurar.
2. Recarregue a página (**F5**) depois de alguns segundos e ache o link "Baixar ...".
   - **Ouvir:** o nome do link diz o que vai ser baixado.
3. Ao terminar, apague o arquivo baixado da pasta **Downloads**.

### A11. Tema escuro, zoom e foco

1. Em **Configurações**, escolha o tema **escuro**.
   - **Ver:** todos os textos legíveis; nada some no fundo escuro.
2. Ande com **Tab** por umas 20 paradas em telas diferentes.
   - **Ver:** em **todo** item focado há um contorno bem visível, no claro e no escuro.
3. Aperte **Ctrl** e **+** até **400%** de zoom na tela Início.
   - **Ver:** o conteúdo reorganiza em uma coluna e não precisa rolar para o lado (só para baixo).
   - Volte com **Ctrl+0**.

### A12. Excluir a conta

1. Na Central, ache "Excluir minha conta" e **Enter**.
   - **Ouvir:** "Excluir a conta agora?, diálogo", a lista do que acontece e os campos.
2. Aperte **Tab** várias vezes: o foco fica dentro do diálogo. Aperte **Esc**.
   - **Ouvir:** o foco volta ao botão "Excluir minha conta".
3. Abra de novo, preencha a senha e a frase pedida, e confirme.
   - **Ouvir:** "Conta excluída, título nível 1".
4. Tente entrar com a mesma conta.
   - **Ouvir:** "E-mail ou senha incorretos..." (a conta não existe mais).

---

## 3. Parte C — celular

Use o Chrome do celular (seção 1.3). Faça na vertical e depois deite o celular (horizontal) nos passos C2 e C3.

### C1. Demo sem conta

1. Abra **http://localhost:3000/demo**.
   - **Ver:** selo **DEMO** visível; botão "Criar conta"; navegação na parte de baixo da tela.
   - **Ver:** nada sai da tela para o lado; não é preciso rolar na horizontal.
2. Toque em cada item da navegação de baixo.
   - **Ver:** os botões são fáceis de acertar com o dedo (sem tocar no vizinho por engano).
3. Abra **Twin** (Health Twin).
   - **Ver:** o modelo 3D aparece em alguns segundos, ou uma versão sem 3D com explicação. A tela não trava.

### C2. Conta no celular

1. Crie outra conta inventada pelo celular (ou entre numa existente). A confirmação de e-mail você faz pelo
   Mailpit no computador.
   - **Ver:** o teclado do celular certo em cada campo (e-mail com "@", data com seletor de data).
   - **Ver:** o botão de enviar não fica escondido atrás do teclado.
2. Na tela **Início**, conte quanto tempo até conseguir tocar em algo e ter resposta.
   - **Ver:** menos de uns 3 segundos.
3. Toque no **+ Registrar** da navegação de baixo, escolha **Sono**.
   - **Ver:** o formulário aparece já com o campo "Deitei em" em destaque.
4. Registre um sono e salve. **Ver:** "Registro salvo."

### C3. Telas com mais conteúdo

1. Visite **Sono**, **Corpo**, **Metas**, **Relatórios** e **Central de Privacidade**.
   - **Ver:** nenhuma rolagem para o lado; gráficos inteiros na largura da tela; tabelas roláveis só dentro
     da própria caixa.
2. Ligue o **Modo privacidade** pelo topo.
   - **Ver:** os números de peso e medidas somem nas telas.

### C4. Leitor de tela do celular (opcional)

1. Ligue o **TalkBack** (Configurações > Acessibilidade > TalkBack).
2. Deslize o dedo para a direita para ir item por item na tela Início. Dê dois toques para ativar.
   - **Ouvir:** os mesmos nomes do NVDA (botões, títulos, "Registrar").
3. Abra o registro rápido e escolha Sono.
   - **Ouvir:** o TalkBack vai para "Deitei em".
4. Desligue o TalkBack ao terminar (o atalho de volume também desliga).

### C5. Ao terminar (não pule)

1. No Chrome do computador, em `chrome://inspect/#devices` > **Port forwarding**, desmarque **Enable port
   forwarding**.
2. No celular, em **Opções do desenvolvedor**, desligue a **Depuração USB** (deixada ligada, ela facilita o acesso
   ao celular por quem pegar o aparelho com um cabo).
3. Feche as janelas anônimas. No terminal, pare o app com **Ctrl+C**.

---

## 4. Tabela para marcar

Copie esta tabela num arquivo seu ou imprima. Marque **OK** ou **Problema** com um **X**. Em "Observação", diga
o que aconteceu de diferente.

| Passo | O que testa | OK | Problema | Observação |
|---|---|:-:|:-:|---|
| A1 | Menor de 18 não cria conta | | | |
| A2 | Cadastro de adulto e erros anunciados | | | |
| A3 | Confirmar e-mail, entrar, escolhas de privacidade | | | |
| A4 | Regiões, títulos, links e "Pular para o conteúdo" | | | |
| A5 | Registro rápido de sono (foco no primeiro campo) | | | |
| A6 | Gráficos: resumo, legenda e tabela | | | |
| A7 | Meta bloqueada anunciada com apoio (188/192) | | | |
| A8 | Modo privacidade (pressionado / oculto) | | | |
| A9 | Autorizar e revogar na Central | | | |
| A10 | Exportação | | | |
| A11 | Tema escuro, foco visível e zoom 400% | | | |
| A12 | Excluir a conta | | | |
| C1 | Demo no celular e Twin | | | |
| C2 | Conta, registro e tempo de resposta no celular | | | |
| C3 | Telas sem rolagem lateral e modo privacidade | | | |
| C4 | TalkBack (opcional) | | | |
| C5 | Redirecionamento e Depuração USB desligados | | | |

Celular usado (modelo e versão do Android): ____________________

Versão do NVDA e navegador: ____________________

---

## 5. Como me contar um problema

Para cada "Problema", anote:

1. **Código do passo** (ex.: A7).
2. **Em que tela** você estava (o endereço no navegador ajuda).
3. **O que você ouviu ou viu**, com as palavras do NVDA se lembrar.
4. **O que esperava** (está escrito no passo).
5. Se puder, uma captura de tela — **sem dados reais** nela.

Os problemas viram itens em `docs/legal/OPEN_ISSUES.md` (acessibilidade, LEG-X01) e são corrigidos antes do
lançamento.

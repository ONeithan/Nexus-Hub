# Nexus Hub - Seu Painel de Finanças Pessoais no Obsidian

Nexus Hub transforma seu cofre do Obsidian em um poderoso centro de controle financeiro completo. Acompanhe suas despesas, gerencie orçamentos, planeje seus objetivos e obtenha insights profundos sobre sua vida financeira, tudo sem sair do seu aplicativo de anotações favorito.

## ✨ Funcionalidades Principais

- **📊 Dashboard Interativo:** Tenha uma visão geral clara de sua renda mensal, despesas, pagamentos pendentes e saldo projetado.
- **💸 Gestão de Transações:** Adicione facilmente transações únicas, recorrentes ou parceladas. Nosso sistema de sugestão inteligente até ajuda a categorizar seus gastos.
- **💳 Controle de Cartão de Crédito:** Cadastre seus cartões de crédito, acompanhe compras parceladas e nunca perca de vista a data de vencimento e o valor total da sua fatura.
- **🎯 Definição de Metas:** Crie e acompanhe metas de economia (como uma viagem) ou de quitação de dívidas. Observe seu progresso e mantenha-se motivado.
- **💰 Orçamento Simplificado:** Defina orçamentos mensais para diferentes categorias e acompanhe visualmente seus gastos para se manter no alvo.
- **🚨 Reserva de Emergência:** Construa e gerencie sua rede de segurança financeira com recursos dedicados de contribuição e retirada.
- **📈 Relatórios Detalhados:** Analise seus gastos por categoria, visualize seu fluxo de caixa e observe a evolução do seu patrimônio líquido ao longo do tempo com gráficos bonitos e interativos.
- **🔮 Projeções Futuras:** Veja uma projeção de 30 dias do seu saldo com base nos próximos pagamentos recorrentes.
- **🏆 Gamificação:** Mantenha-se engajado com suas finanças ganhando pontos de Nexus Score e desbloqueando conquistas por bons hábitos financeiros.

## 🚀 Novidades da Versão 1.0.0

- **✨ Novo Recurso: Salário Quinzenal:** Agora você pode configurar sua renda como mensal ou quinzenal desde o primeiro uso do plugin, garantindo que o Nexus Hub se adapte perfeitamente ao seu fluxo de recebimentos.
- **🎨 Melhoria Visual no Dashboard de Relatórios:** O painel de relatórios foi redesenhado com um tema profissional mais moderno e uma grade dinâmica, tornando a análise de dados mais clara e agradável.
- **🐞 Correção de Bugs Críticos:** Foram resolvidos diversos erros de compilação que impediam a correta inicialização e funcionamento do plugin em diversas situações.
- **🔧 Simplificação do Código:** O sistema interno de tradução foi removido, tornando o código mais limpo, eficiente e fácil de manter.

## Como Começar

### Instalação

Assim que o plugin for lançado na loja da comunidade, você poderá instalá-lo diretamente pelo Obsidian. Por enquanto, a instalação manual é necessária:

1.  Baixe os arquivos `main.js`, `styles.css` e `manifest.json` da página de Releases mais recente.
2.  Crie uma nova pasta chamada `nexus-hub` dentro do diretório `.obsidian/plugins/` do seu cofre do Obsidian.
3.  Copie os arquivos baixados para a pasta `nexus-hub`.
4.  Recarregue o Obsidian e ative o plugin Nexus Hub em suas configurações.

### Primeira Configuração

Uma vez instalado, o Nexus Hub irá recebê-lo com um rápido processo de onboarding para configurar seu nome e sua renda (mensal ou quinzenal). Depois disso, você está pronto para explorar!

## 👨‍💻 Para Desenvolvedores

Se você deseja contribuir para o desenvolvimento do Nexus Hub, veja como configurar seu ambiente.

### Pré-requisitos

-   [Node.js](https://nodejs.org/) (versão 16 ou superior)
-   [npm](https://www.npmjs.com/)

### Compilando o Plugin

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/ONeithan/nexus-hub.git
    cd nexus-hub
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Compile para produção:**
    Este comando compila o código TypeScript e cria os arquivos finais `main.js` e `styles.css` na raiz do projeto.
    ```bash
    npm run build
    ```

4.  **Inicie o modo de desenvolvimento:**
    Este comando ficará observando por mudanças no diretório `src` e recompilará o plugin automaticamente.
    ```bash
    npm run dev
    ```

### Fazendo o Deploy para o seu Cofre

O projeto inclui um script útil para copiar automaticamente os arquivos compilados para o seu cofre local do Obsidian para testes rápidos.

1.  **Configure o destino:**
    Abra o arquivo `deploy.ps1` e altere a variável `$destinationDir` para apontar para a pasta `nexus-hub` dentro do diretório de plugins do seu cofre.

2.  **Execute o script de deploy:**
    Este comando irá compilar o plugin e copiar os arquivos necessários (`main.js`, `styles.css`, `manifest.json`) para o diretório de destino.
    ```bash
    npm run deploy
    ```

## 🤝 Contribuições

Contribuições, issues e solicitações de funcionalidades são bem-vindas! Sinta-se à vontade para verificar a página de issues.

## 📜 Licença

Este projeto está licenciado sob a Licença MIT. Veja o arquivo [LICENSE](LICENSE) para o texto completo.

---

*Construído com ❤️ para a comunidade Obsidian por ONeithan.*

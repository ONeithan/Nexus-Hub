import { moment, ItemView, WorkspaceLeaf, Notice, setIcon, App } from "obsidian";

import NexusHubPlugin from "../main";
import { ReportGenerator } from "../services/report-generator"; 
import { AddTransactionModal, GoalsModal, EmergencyFundModal, AccountDetailModal, ManageCreditCardsModal, EditUserModal, ExtraIncomeModal, CardBillDetailModal, ManageBudgetsModal, NexusScoreHistoryModal, AchievementsModal, ResetConfirmationModal, ManageCategoriesModal, EditTransactionModal } from "../components/modals";
import { ConfirmationModal } from "../helpers/ui-helpers";
import { formatAsCurrency, calculateCardBill } from "../helpers/helpers";
import { eventManager } from '../helpers/EventManager';
import { Transaction, CreditCard } from "./settings";

export const NEXUS_HUB_VIEW_TYPE = "nexus-hub-view";

// Adiciona uma interface para evitar o uso de 'any' ao acessar as configurações
interface AppWithSettings extends App {
    setting: {
        open: () => void;
        openTabById: (id: string) => void;
    };
}

export class NexusHubView extends ItemView {
    plugin: NexusHubPlugin;
    // Elementos do dashboard para atualização em tempo real
    private generator: ReportGenerator;
    private receitaValueEl: HTMLElement;
    private despesasValueEl: HTMLElement;
    private welcomeEl: HTMLElement;
    private nexusScoreEl: HTMLElement;
    private saldoValueEl: HTMLElement;
    private monthlySurplusEl: HTMLElement;
    private baseIncomeEl: HTMLElement;
    private extraIncomeEl: HTMLElement;
    private totalIncomeHeaderEl: HTMLElement;
    private accountViewMode: 'pending' | 'paid' = 'pending';
    private budgetContainer: HTMLElement;
    private alertsContainer: HTMLElement;
    private currentMonth: moment.Moment = moment();

    constructor(leaf: WorkspaceLeaf, plugin: NexusHubPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.generator = new ReportGenerator(this.plugin.settings);
    }

    getViewType() {
        return NEXUS_HUB_VIEW_TYPE;
    }

    getDisplayText() {
        return "Nexus Hub";
    }

    getIcon() {
        return "piggy-bank";
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.containerEl.addClass('nexus-hub-view');

        // Adiciona o botão de engrenagem na barra de ações da view
        this.addAction(
            'settings', // nome do ícone
            'Abrir configurações', // texto do tooltip
            () => {
            (this.app as AppWithSettings).setting.open();
            (this.app as AppWithSettings).setting.openTabById(this.plugin.manifest.id);
            }
        );
    
        const gridContainer = contentEl.createDiv({ cls: 'nexus-hub-grid-container' });
    
        // --- AREA 1: CABEÇALHO ---
        const headerEl = gridContainer.createDiv({ cls: 'grid-area grid-header' });
        const headerContainer = headerEl.createDiv({ cls: 'header-container' });
        this.welcomeEl = headerContainer.createEl('h1');

        // Wrapper para os botões de ação do cabeçalho
        const headerActions = headerContainer.createDiv({ cls: 'header-actions' });

        const editBtn: HTMLSpanElement = headerActions.createEl('span', { cls: 'clickable-icon' });
        editBtn.setAttr('title', 'Editar informações do usuário');
        editBtn.addEventListener('click', () => {
            new EditUserModal(this.app, this.plugin).open();
        });
        setIcon(editBtn, 'pencil');

        this.nexusScoreEl = headerEl.createDiv({ cls: 'nexus-score is-clickable' });
        this.nexusScoreEl.setAttr('title', 'Clique para ver seu histórico de pontuação.');
        this.nexusScoreEl.addEventListener('click', () => {
            new NexusScoreHistoryModal(this.app, this.plugin).open();
        });

        const incomeSummaryHeader = headerEl.createDiv({ cls: 'income-summary-header' });

        const baseIncomeContainer = incomeSummaryHeader.createDiv({cls: 'income-summary-item'});
        baseIncomeContainer.createDiv({cls: 'income-summary-label', text: 'Salário'});
        this.baseIncomeEl = baseIncomeContainer.createDiv({cls: 'income-summary-value'});
        
        const extraIncomeContainer = incomeSummaryHeader.createDiv({cls: 'income-summary-item'});
        extraIncomeContainer.createDiv({cls: 'income-summary-label', text: 'Extras'});
        this.extraIncomeEl = extraIncomeContainer.createDiv({cls: 'income-summary-value'});

        const totalIncomeContainer = incomeSummaryHeader.createDiv({cls: 'income-summary-item'});
        totalIncomeContainer.createDiv({cls: 'income-summary-label', text: 'Total'});
        this.totalIncomeHeaderEl = totalIncomeContainer.createDiv({cls: 'income-summary-value'});

        // --- AREA 2: RESUMO MENSAL ---
        const summaryEl = gridContainer.createDiv({ cls: 'grid-area grid-summary' });
        summaryEl.createEl('h2', { text: 'Resumo do Mês' });
        const summaryContainer = summaryEl.createDiv({ cls: 'stat-card-container' });
        
        const receitaCard = summaryContainer.createDiv({ cls: 'stat-card', attr: {'id': 'receita-total-card'} });
        this.receitaValueEl = receitaCard.createDiv({ cls: "stat-value" });
        this.receitaValueEl.setText("R$ 0,00");
        const receitaLabel = receitaCard.createDiv({ cls: "stat-label" });
        receitaLabel.setText('Receita Total');
        
        const despesasCard = summaryContainer.createDiv({ cls: 'stat-card', attr: {'id': 'despesas-pendentes-card'} });
        this.despesasValueEl = despesasCard.createDiv({ cls: "stat-value" });
        this.despesasValueEl.setText("R$ 0,00");
        const despesasLabel = despesasCard.createDiv({ cls: "stat-label" });
        despesasLabel.setText('Despesas Pendentes');
        
        const paidCard = summaryContainer.createDiv({ cls: 'stat-card', attr: {'id': 'pago-no-mes-card'} });
        this.saldoValueEl = paidCard.createDiv({ cls: "stat-value" });
        this.saldoValueEl.setText("R$ 0,00");
        const paidLabel = paidCard.createDiv({ cls: "stat-label" });
        paidLabel.setText('Pago no Mês');
        
        const monthlySurplusCard = summaryContainer.createDiv({ cls: 'stat-card', attr: {'id': 'saldo-projetado-card'} });
        this.monthlySurplusEl = monthlySurplusCard.createDiv({ cls: "stat-value" });
        this.monthlySurplusEl.setText("R$ 0,00");
        const surplusLabel = monthlySurplusCard.createDiv({ cls: "stat-label" });
        surplusLabel.setText('Saldo Projetado');
        
        // --- AREA 3: AÇÕES E GERENCIAMENTO ---
        const actionsEl = gridContainer.createDiv({ cls: 'grid-area grid-actions' });
        actionsEl.createEl('h2', { text: 'Gerenciamento' });
        
        // Botões principais de ação
        const addTransactionBtn = actionsEl.createEl('button', { cls: 'nexus-hub-button-primary' });
        addTransactionBtn.setText('Adicionar Transação');
        addTransactionBtn
            .addEventListener('click', () => new AddTransactionModal(this.app, this.plugin, this.currentMonth, () => this.updateDashboardCalculations()).open());
            
        actionsEl.createEl('hr');
    
        // Botões de navegação para os painéis
        const navContainer = actionsEl.createDiv({ cls: 'nav-container' });
        const budgetBtn = navContainer.createDiv({cls: 'nav-item'});
        setIcon(budgetBtn.createDiv({cls: 'nav-item-icon'}), 'target');
        budgetBtn.createDiv({cls: 'nav-item-label', text: 'Orçamentos'});
        budgetBtn.addEventListener('click', () => new ManageBudgetsModal(this.app, this.plugin).open());

        const categoriesBtn = navContainer.createDiv({cls: 'nav-item'});
        setIcon(categoriesBtn.createDiv({cls: 'nav-item-icon'}), 'tag');
        categoriesBtn.createDiv({cls: 'nav-item-label', text: 'Categorias'});
        categoriesBtn.addEventListener('click', () => new ManageCategoriesModal(this.app, this.plugin).open());

        const extraIncomeBtn = navContainer.createDiv({cls: 'nav-item'});
        setIcon(extraIncomeBtn.createDiv({cls: 'nav-item-icon'}), 'plus-circle');
        extraIncomeBtn.createDiv({cls: 'nav-item-label', text: 'Renda Extra'});
        extraIncomeBtn.addEventListener('click', () => new ExtraIncomeModal(this.app, this.plugin, this.currentMonth).open());

        const goalsBtn = navContainer.createDiv({cls: 'nav-item'});
        setIcon(goalsBtn.createDiv({cls: 'nav-item-icon'}), 'flag');
        goalsBtn.createDiv({cls: 'nav-item-label', text: 'Metas'});
        goalsBtn.addEventListener('click', () => new GoalsModal(this.app, this.plugin, 'All').open());

        const futureLedgerBtn = navContainer.createDiv({cls: 'nav-item'});
        setIcon(futureLedgerBtn.createDiv({cls: 'nav-item-icon'}), 'calendar-clock');
        futureLedgerBtn.createDiv({cls: 'nav-item-label', text: 'Lançamentos Futuros'});
        futureLedgerBtn.addEventListener('click', () => this.plugin.activateFutureLedgerView());

        const cardsBtn = navContainer.createDiv({cls: 'nav-item'});
        setIcon(cardsBtn.createDiv({cls: 'nav-item-icon'}), 'credit-card');
        cardsBtn.createDiv({cls: 'nav-item-label', text: 'Cartões'});
        cardsBtn.addEventListener('click', () => new ManageCreditCardsModal(this.app, this.plugin, this.currentMonth).open());

        const emergencyBtn = navContainer.createDiv({cls: 'nav-item'});
        setIcon(emergencyBtn.createDiv({cls: 'nav-item-icon'}), 'shield');
        emergencyBtn.createDiv({cls: 'nav-item-label', text: 'Fundo de Emergência'});
        emergencyBtn.addEventListener('click', () => new EmergencyFundModal(this.app, this.plugin).open());

        const reportsBtn = navContainer.createDiv({cls: 'nav-item'});
        setIcon(reportsBtn.createDiv({cls: 'nav-item-icon'}), 'pie-chart');
        reportsBtn.createDiv({cls: 'nav-item-label', text: 'Relatórios'});
        reportsBtn.addEventListener('click', () => this.plugin.activateReportView());

        const achievementsBtn = navContainer.createDiv({cls: 'nav-item'});
        setIcon(achievementsBtn.createDiv({cls: 'nav-item-icon'}), 'award');
        achievementsBtn.createDiv({cls: 'nav-item-label', text: 'Conquistas'});
        achievementsBtn.addEventListener('click', () => new AchievementsModal(this.app, this.plugin).open());

        actionsEl.createEl('hr');
        actionsEl.createEl('h2', { text: 'Orçamentos do Mês' });
        this.budgetContainer = actionsEl.createDiv({ cls: 'budgets-container' });
    
    
        // --- AREA 4: CONTEÚDO PRINCIPAL (CONTAS A PAGAR) ---
        const mainEl = gridContainer.createDiv({ cls: 'grid-area grid-main-content' });
        mainEl.createEl('h2', { text: 'Transações do Mês' });

        // Container para alertas importantes
        this.alertsContainer = mainEl.createDiv({ cls: 'alerts-container' });

        const monthSelectorContainer = mainEl.createDiv({ cls: 'month-selector-container' });

        const prevMonthBtn = monthSelectorContainer.createEl('button', { text: '‹' });
        const monthInput = monthSelectorContainer.createEl('input', { type: 'month' });
        const nextMonthBtn = monthSelectorContainer.createEl('button', { text: '›' });

        monthInput.addEventListener('change', () => {
            if (monthInput.value) {
                this.currentMonth = moment(monthInput.value, 'YYYY-MM');
                this.updateViewForNewMonth();
            }
        });

        prevMonthBtn.addEventListener('click', () => {
            this.currentMonth.subtract(1, 'month');
            this.updateViewForNewMonth();
        });

        nextMonthBtn.addEventListener('click', () => {
            this.currentMonth.add(1, 'month');
            this.updateViewForNewMonth();
        });

        const viewModeContainer = mainEl.createDiv({ cls: 'view-mode-container' });
        const pendingBtn = viewModeContainer.createEl('button');
        pendingBtn.setText('Pendentes');
        pendingBtn.addClass('view-mode-btn');
        const paidBtn = viewModeContainer.createEl('button');
        paidBtn.setText('Pagas');
        paidBtn.addClass('view-mode-btn');

        if (this.accountViewMode === 'pending') pendingBtn.addClass('active'); else paidBtn.addClass('active');

        // --- Focus Mode Toggle ---
        const focusToggleContainer = mainEl.createDiv({ cls: 'focus-toggle-container' });
        const focusBtn: HTMLButtonElement = focusToggleContainer.createEl('button');
        focusBtn.addClass('focus-mode-btn');
        focusBtn.setAttr('title', 'Alternar Modo Foco');
        setIcon(focusBtn, 'maximize');
        focusBtn.addEventListener('click', () => {
            gridContainer.classList.toggle('focus-mode-active');
            const newIcon = gridContainer.classList.contains('focus-mode-active') ? 'minimize' : 'maximize';
            focusBtn.empty();
            setIcon(focusBtn, newIcon);
        });

        pendingBtn.addEventListener('click', () => {
            if (this.accountViewMode === 'pending') return;
            this.accountViewMode = 'pending';
            pendingBtn.addClass('active');
            paidBtn.removeClass('active');
            this.renderTransactions();
        });
        
        paidBtn.addEventListener('click', () => {
            if (this.accountViewMode === 'paid') return;
            this.accountViewMode = 'paid';
            paidBtn.addClass('active');
            pendingBtn.removeClass('active');
            this.renderTransactions();
        });
    
        // --- Renderização Inicial e Eventos ---
        this.updateHeader();
        this.updateViewForNewMonth(); // Chamada inicial para renderizar dados do mês atual
        this.checkForUpcomingBills(); // Verifica contas a vencer ao abrir
        
        // Registra o evento para atualizações em tempo real sempre que os dados do plugin mudarem
        const onDataChange = () => {
            this.updateHeader();
            this.updateDashboardCalculations();
            this.renderTransactions();
        };
        eventManager.on('data-changed', onDataChange);

        const onNavigate = (...args: any[]) => {
            const month = args[0] as moment.Moment;
            this.currentMonth = month;
            this.updateViewForNewMonth();
        };
        eventManager.on('navigate-to-month', onNavigate);

        // Registra a função de "limpeza" que será chamada quando a view for fechada, evitando memory leaks.
        this.register(() => {
            eventManager.off('data-changed', onDataChange);
            eventManager.off('navigate-to-month', onNavigate);
        });
    }

    /**
     * Centralized filter to get all transactions relevant to a specific month.
     * @param month The month to filter transactions for.
     * @returns An array of transactions for that month.
     */
    private getTransactionsForMonth(month: moment.Moment): Transaction[] {
        const startOfMonth = month.clone().startOf('month');
        const endOfMonth = month.clone().endOf('month');
        return (this.plugin.settings.transactions || []).filter(transaction => {
            if (transaction.type === 'income') {
                const transactionDate = moment(transaction.date, 'YYYY-MM-DD');
                return transactionDate.isBetween(startOfMonth, endOfMonth, null, '[]');
            } else { // It's an expense
                // Expenses are matched by their paymentMonth string (e.g., "2025-10")
                return transaction.paymentMonth === month.format('YYYY-MM');
            }
        });
    }

    /**
     * Atualiza a UI para refletir um novo mês selecionado.
     */
    private updateViewForNewMonth() {
        // Garante que o seletor de mês reflita o estado atual
        const monthInput = this.contentEl.querySelector('.month-selector-container input[type="month"]') as HTMLInputElement;
        if (monthInput) {
            monthInput.value = this.currentMonth.format('YYYY-MM');
        }

        this.updateDashboardCalculations();
    }

    /**
     * Verifica transações pendentes próximas do vencimento e exibe uma notificação.
     */
    private async checkForUpcomingBills() {
        // Garante que a propriedade exista nas configurações
        if (!this.plugin.settings.notifiedTransactionIds) {
            this.plugin.settings.notifiedTransactionIds = [];
        }

        const upcomingTransactions = this.plugin.settings.transactions.filter(tx => {
            if (tx.status !== 'pending') return false;
            // Evita re-notificar
            if (this.plugin.settings.notifiedTransactionIds?.includes(tx.id)) return false;

            const dueDate = moment(tx.date);
            const daysUntilDue = dueDate.diff(moment(), 'days');
            return daysUntilDue >= 0 && daysUntilDue <= 3; // Vencendo hoje ou nos próximos 3 dias
        });

        if (upcomingTransactions.length > 0) {
            const notifiedIds: string[] = [];
            upcomingTransactions.forEach(transaction => {
                new Notice(`Conta próxima do vencimento: ${transaction.description} vence ${moment(transaction.date).fromNow()}`, 10000); // Notificação dura 10s
                notifiedIds.push(transaction.id);
            });
            this.plugin.settings.notifiedTransactionIds.push(...notifiedIds);
            await this.plugin.saveSettings();
        }
    }

    /**
     * Atualiza o cabeçalho com o nome do usuário e o score.
     */
    private updateHeader() {
        const userName = this.plugin.settings.userName;
        this.welcomeEl.setText(userName ? `Olá, ${userName}!` : 'Bem-vindo ao Nexus Hub');
        this.nexusScoreEl.setText(`Nexus Score: ${this.plugin.settings.nexusScore || 0}`);
    }

    /**
     * Busca as contas no array de settings e as renderiza na tela.
     */
    private renderTransactionItem(transaction: Transaction, container: HTMLElement) {
        const itemEl = container.createDiv({ cls: "nexus-hub-account-item" });
        itemEl.toggleClass('is-paid', transaction.status === 'paid');
        
        const isPaused = transaction.pausedUntil && moment(transaction.pausedUntil).isSameOrAfter(moment(transaction.date), 'day');
        if (isPaused) {
            itemEl.addClass('is-paused');
            itemEl.setAttr('title', `Pausado até ${moment(transaction.pausedUntil).format('DD/MM/YYYY')}`);
        }
    
        const leftPanel = itemEl.createDiv({ cls: 'account-left-panel' });
    
        const iconContainer = leftPanel.createDiv({ cls: 'account-item-icon' });
        if (transaction.isRecurring) {
            setIcon(iconContainer, 'repeat');
            iconContainer.setAttr('title', 'Transação Recorrente');
        } else {
            setIcon(iconContainer, 'file-text');
            iconContainer.setAttr('title', 'Transação Única');
        }

        // Checkbox para marcar como pago/pendente
        const checkbox = leftPanel.createEl('input', { type: 'checkbox' });
        checkbox.checked = transaction.status === 'paid';
        checkbox.addEventListener('change', async () => {
            const transactionInSettings = this.plugin.settings.transactions.find(tx => tx.id === transaction.id);
            if (transactionInSettings) {
                const newStatus = checkbox.checked ? 'paid' : 'pending';
                if (transactionInSettings.status === newStatus) return; // Avoid re-processing

                transactionInSettings.status = newStatus;

                if (newStatus === 'paid') {
                    await this.plugin.handlePayment(transactionInSettings);
                } else {
                    // If un-paying, just save and refresh
                    await this.plugin.saveSettings();
                    eventManager.emit('data-changed');
                }
            }
        });
    
        const nameContainer = leftPanel.createDiv({ cls: 'account-name' });
        const descriptionEl = nameContainer.createDiv();
        descriptionEl.setText(transaction.description);
        
        if (isPaused) {
            const pausedIndicator = nameContainer.createSpan({ cls: 'paused-indicator' });
            setIcon(pausedIndicator, 'pause-circle');
            pausedIndicator.setAttr('title', `Pausado até ${moment(transaction.pausedUntil).format('DD/MM/YYYY')}`);
        }

        if (transaction.isRecurring || transaction.isInstallment) {
            nameContainer.addClass('is-clickable');
            nameContainer.addEventListener('click', () => {
                let groupKey: string;
                if (transaction.isInstallment && transaction.installmentOf) {
                    groupKey = transaction.installmentOf;
                } else {
                    groupKey = transaction.description;
                }
                new AccountDetailModal(this.app, this.plugin, groupKey, transaction.isInstallment).open();
            });
        }

        const dueDateText = `Vence em: ${moment(transaction.date).format('DD/MM/YYYY')}`;
        const dueDateEl = nameContainer.createDiv({ cls: "account-due-date" });
        dueDateEl.setText(dueDateText);
    
        const dueDate = moment(transaction.date);
        const now = moment();
        const daysUntilDue = dueDate.diff(now, 'days');

        if (transaction.status === 'pending') {
            if (dueDate.isBefore(now, 'day')) {
                dueDateEl.addClass('is-overdue');
            } else if (daysUntilDue <= 3) {
                const dueSoonIndicator = nameContainer.createSpan({ cls: 'due-soon-indicator' });
                setIcon(dueSoonIndicator, 'bell');
                const days = daysUntilDue + 1;
                const tooltipText = days === 1 
                    ? 'Vence amanhã!' 
                    : `Vence em ${days} dias.`;
                dueSoonIndicator.setAttr('title', tooltipText);
            }
        }
    
        const rightPanel = itemEl.createDiv({ cls: "account-right-panel" });
        const amountEl = rightPanel.createSpan();
        amountEl.setText(formatAsCurrency(transaction.amount));

        const duplicateBtn = rightPanel.createEl('button', { cls: 'action-btn' });
        setIcon(duplicateBtn, 'copy');
        duplicateBtn.setAttr('title', 'Duplicar Transação');
        duplicateBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Evita que o clique se propague para o item pai
            new AddTransactionModal(this.app, this.plugin, this.currentMonth, () => this.updateDashboardCalculations(), transaction).open();
        });

        const editBtn = rightPanel.createEl('button', { cls: 'action-btn' });
        setIcon(editBtn, 'pencil');
        editBtn.setAttr('title', 'Editar Transação');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            new EditTransactionModal(this.app, this.plugin, transaction, () => this.updateDashboardCalculations()).open();
        });

        const deleteBtn = rightPanel.createEl('button', { cls: 'action-btn' });
        setIcon(deleteBtn, 'trash');
        deleteBtn.setAttr('title', 'Apagar Transação');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            new ConfirmationModal(
                this.app,
                'Apagar Transação',
                `Tem certeza que deseja apagar a transação '${transaction.description}'?`,
                async () => {
                    this.plugin.settings.transactions = this.plugin.settings.transactions.filter(t => t.id !== transaction.id);
                    await this.plugin.saveSettings();
                    eventManager.emit('data-changed');
                }
            ).open();
        });

        // Botão para pagar com a reserva de emergência
        if (transaction.status === 'pending' && transaction.type === 'expense') {
            const payWithEFBtn = rightPanel.createEl('button', { cls: 'action-btn' });
            setIcon(payWithEFBtn, 'shield-check');
            payWithEFBtn.setAttr('title', 'Pagar com Fundo de Emergência');
            payWithEFBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.plugin.payFromEmergencyFund(transaction.id);
            });
        }
        // A cor já é tratada pelo CSS geral para despesas, não precisa de classe extra.
    }

    private renderCardBillItem(card: CreditCard, bill: { total: number, dueDate: moment.Moment, transactions: Transaction[] }, container: HTMLElement) {
        const itemEl = container.createDiv({ cls: "nexus-hub-account-item is-credit-card-invoice" });
    
        const leftPanel = itemEl.createDiv({ cls: 'account-left-panel' }); // Adiciona o checkbox aqui

        const iconContainer = leftPanel.createDiv({ cls: 'account-item-icon' });
        setIcon(iconContainer, 'credit-card');
        iconContainer.setAttr('title', 'Fatura de Cartão de Crédito');

        // Checkbox para marcar a fatura como paga
        const checkbox = leftPanel.createEl('input', { type: 'checkbox' });
        const isBillFullyPaid = bill.transactions.every(t => t.status === 'paid');
        checkbox.checked = isBillFullyPaid;
        itemEl.toggleClass('is-paid', isBillFullyPaid); // Aplica o estilo de "pago" ao item

        checkbox.addEventListener('change', async () => {
            const newStatus = checkbox.checked ? 'paid' : 'pending';
            const transactionsToUpdate: Transaction[] = [];

            for (const billTransaction of bill.transactions) {
                const transactionInSettings = this.plugin.settings.transactions.find(ts => ts.id === billTransaction.id);
                if (transactionInSettings && transactionInSettings.status !== newStatus) { // Evita mudar status se já for o mesmo
                    transactionInSettings.status = newStatus;
                    transactionsToUpdate.push(transactionInSettings);
                }
            }

            if (transactionsToUpdate.length === 0) return;

            if (newStatus === 'paid') {
                await this.plugin.handleBulkPayment(transactionsToUpdate);
            } else {
                // If un-paying, just save and refresh
                await this.plugin.saveSettings();
                eventManager.emit('data-changed');
            }
        });
        
        const nameContainer = leftPanel.createDiv({ cls: 'account-name is-clickable' });
        nameContainer.addEventListener('click', () => new CardBillDetailModal(this.app, this.plugin, card.id, this.currentMonth).open());
        const cardNameEl = nameContainer.createDiv();
        cardNameEl.setText(`Fatura ${card.name}`);
        
        const dueDateText = `Vence em: ${bill.dueDate.format('DD/MM/YYYY')}`;
        const dueDateEl = nameContainer.createDiv({ cls: "account-due-date" });
        dueDateEl.setText(dueDateText);
    
        const now = moment();
        const daysUntilDue = bill.dueDate.diff(now, 'days');

        if (!isBillFullyPaid) { // Só mostra alertas para faturas pendentes
            if (bill.dueDate.isBefore(now, 'day')) {
                dueDateEl.addClass('is-overdue');
            } else if (daysUntilDue <= 3) {
                const dueSoonIndicator = nameContainer.createSpan({ cls: 'due-soon-indicator' });
                setIcon(dueSoonIndicator, 'bell');
                const days = daysUntilDue + 1;
                const tooltipText = days === 1 
                    ? 'Vence amanhã!' 
                    : `Vence em ${days} dias.`;
                dueSoonIndicator.setAttr('title', tooltipText);
            }
        }
    
        const rightPanel = itemEl.createDiv({ cls: "account-right-panel" });
        const billTotalEl = rightPanel.createSpan();
        billTotalEl.setText(formatAsCurrency(bill.total));
    }

    async renderTransactions() {
        const mainEl = this.contentEl.querySelector('.grid-main-content') as HTMLElement;
        if (!mainEl) return;

        this.contentEl.querySelector('.accounts-list-container')?.remove();
        const container = mainEl.createDiv({ cls: 'accounts-list-container' });

        const transactionsInMonth = this.getTransactionsForMonth(this.currentMonth);

        const expensesToDisplay = transactionsInMonth.filter(t =>
            t.type === 'expense' &&
            t.status === this.accountViewMode
        );

        expensesToDisplay.sort((a, b) => moment(a.date).diff(moment(b.date)));

        // 1. Render regular transactions
        expensesToDisplay
            .filter(t => !t.cardId)
            .forEach(transaction => this.renderTransactionItem(transaction, container));

        // 2. Group and render credit card bills
        const billsToRender = new Map<string, { card: CreditCard, transactions: Transaction[] }>();

        const cardTransactions = expensesToDisplay.filter(t => t.cardId);

        for (const tx of cardTransactions) {
            const card = (this.plugin.settings.creditCards || []).find(c => c.id === tx.cardId);
            if (!card) continue;

            // Group by the bill's due date month. The transaction's date IS the bill's due date.
            const billIdentifier = `${card.id}_${moment(tx.date).format('YYYY-MM')}`;

            let billGroup = billsToRender.get(billIdentifier);
            if (!billGroup) {
                billGroup = { card: card, transactions: [] };
                billsToRender.set(billIdentifier, billGroup);
            }
            billGroup.transactions.push(tx);
        }

        billsToRender.forEach(({ card, transactions }) => {
            if (transactions.length === 0) return;

            const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
            const dueDate = moment(transactions[0].date); // All tx in this group have the same due date month

            this.renderCardBillItem(card, { total, dueDate, transactions }, container);
        });

        // 3. Display empty message if needed
        if (container.childElementCount === 0) {
            const message = this.accountViewMode === 'pending'
                ? 'Nenhuma transação pendente para este mês.'
                : 'Nenhuma transação paga para este mês.';
            container.createEl("p", { text: message, cls: 'empty-list-message' });
        }
    }

    /**
     * O coração do dashboard. Calcula e atualiza os valores dos cards de resumo.
     */
    async updateDashboardCalculations() {
        // --- DATA CALCULATION ---

        // 1. Get current official salary from settings for header display
        const { salarioLiquido, salarioLiquido2, salaryFrequency } = this.plugin.settings;
        const currentOfficialSalary = salaryFrequency === 'bi-weekly' 
            ? (salarioLiquido || 0) + (salarioLiquido2 || 0)
            : (salarioLiquido || 0);

        // 2. Process transactions for the currently viewed month in a single pass
        const monthSummary = {
            baseIncome: 0,
            extraIncome: 0,
            pendingExpenses: 0,
            paidExpenses: 0,
            committedSpendingByCategory: new Map<string, number>()
        };

        const transactionsInMonth = this.getTransactionsForMonth(this.currentMonth);

        for (const transaction of transactionsInMonth) {
            if (transaction.type === 'income') {
                if (transaction.isRecurring) {
                    monthSummary.baseIncome += transaction.amount;
                } else {
                    monthSummary.extraIncome += transaction.amount;
                }
            } else { // type === 'expense'
                // For budget calculation
                const category = (this.plugin.settings.categories || []).find(c => c.name === transaction.category);
                if (category) {
                    const currentSpending = monthSummary.committedSpendingByCategory.get(category.id) || 0;
                    monthSummary.committedSpendingByCategory.set(category.id, currentSpending + transaction.amount);
                }

                // For summary cards
                if (transaction.status === 'paid') {
                    monthSummary.paidExpenses += transaction.amount;
                } else if (transaction.status === 'pending') {
                    const isPaused = transaction.pausedUntil && moment(transaction.pausedUntil).isSameOrAfter(moment(transaction.date), 'day');
                    if (!isPaused) {
                        monthSummary.pendingExpenses += transaction.amount;
                    }
                }
            }
        }

        // FIX: If no recurring income transaction was found for the current month (e.g., new user),
        // use the official total salary as the base income.
        if (monthSummary.baseIncome === 0 && this.currentMonth.isSame(moment(), 'month')) {
            monthSummary.baseIncome = currentOfficialSalary;
        }

        const totalIncomeForMonth = monthSummary.baseIncome + monthSummary.extraIncome;

        // 3. Calculate monthly surplus projection
        const monthlySurplus = totalIncomeForMonth - (monthSummary.pendingExpenses + monthSummary.paidExpenses);
    
        // --- UI UPDATE ---

        // Header: Show current official salary, but month-specific extras and total
        this.baseIncomeEl.setText(formatAsCurrency(currentOfficialSalary));
        this.extraIncomeEl.setText(formatAsCurrency(monthSummary.extraIncome));
        this.totalIncomeHeaderEl.setText(formatAsCurrency(totalIncomeForMonth));

        // Summary cards: Use the calculated summary for the selected month
        this.receitaValueEl.setText(formatAsCurrency(totalIncomeForMonth));
        this.despesasValueEl.setText(formatAsCurrency(monthSummary.pendingExpenses));
        this.saldoValueEl.setText(formatAsCurrency(monthSummary.paidExpenses));
        this.monthlySurplusEl.setText(formatAsCurrency(monthlySurplus));
        
        this.monthlySurplusEl.toggleClass('is-negative', monthlySurplus < 0);

        // Alert for negative projection
        if (monthlySurplus < 0) {
            this.renderNegativeBalanceAlert(monthlySurplus);
        } else {
            this.clearAlerts();
        }
    
        // --- RENDER CHILD COMPONENTS ---
        // Pass calculated data down to avoid re-calculation
        await this.renderTransactions();
        this.renderBudgets(monthSummary.committedSpendingByCategory);
    }

    private renderNegativeBalanceAlert(negativeAmount: number) {
        this.clearAlerts(); // Limpa alertas antigos
        const alertBox = this.alertsContainer.createDiv({ cls: 'alert-box is-warning' });
        const iconEl = alertBox.createDiv({ cls: 'alert-icon' });
        setIcon(iconEl, 'alert-triangle');
        const textEl = alertBox.createDiv({ cls: 'alert-text' });
        textEl.createEl('strong', { text: 'Atenção:' });
        textEl.appendText(` Seu saldo projetado para o mês está negativo em ${formatAsCurrency(negativeAmount)}.`);
    }

    private clearAlerts() {
        this.alertsContainer.empty();
    }

    private renderBudgets(spendingMap: Map<string, number>) { 
        this.budgetContainer.empty();
        const budgets = this.plugin.settings.budgets || [];
    
        if (budgets.length === 0) {
            this.budgetContainer.createEl('p', { text: 'Nenhum orçamento definido. Crie um na tela de gerenciamento.', cls: 'mod-subtle' });
            return;
        }

        // The spendingMap is now passed directly from updateDashboardCalculations
        // which avoids re-calculating the same data.
    
        budgets.forEach(budget => {
            const category = (this.plugin.settings.categories || []).find(c => c.id === budget.categoryId);
            if (!category) return;
    
            const spentAmount = spendingMap.get(budget.categoryId) || 0;
            const budgetAmount = budget.amount;
            const percentage = budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;
    
            const remainingAmount = budgetAmount - spentAmount;

            const cardEl = this.budgetContainer.createDiv({ cls: 'budget-card' });

            const headerEl = cardEl.createDiv({ cls: 'budget-card-header' });
            headerEl.createSpan({ text: category.name, cls: 'budget-category-name' });
            headerEl.createSpan({ text: `${Math.min(percentage, 100).toFixed(0)}%`, cls: 'budget-percentage' });
    
            const progressBarWrapper = cardEl.createDiv({ cls: 'progress-bar-wrapper' });
            const progressBarFill = progressBarWrapper.createDiv({ cls: 'progress-bar-fill' });
            progressBarFill.style.setProperty('--progress-percent', `${Math.min(percentage, 100)}%`);
    
            if (percentage > 100) progressBarFill.addClass('is-over-limit');
            else if (percentage > 80) progressBarFill.addClass('is-warning');
    
            const detailsEl = cardEl.createDiv({ cls: 'budget-card-details' });
            detailsEl.createDiv({ text: `Gasto: ${formatAsCurrency(spentAmount)} de ${formatAsCurrency(budgetAmount)}` });
            const remainingEl = detailsEl.createDiv({ text: `Restante: ${formatAsCurrency(remainingAmount)}` });
            remainingEl.toggleClass('is-negative', remainingAmount < 0);
        });
    }
}
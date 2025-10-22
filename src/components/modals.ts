import { Modal, Setting, Notice, App, setIcon } from 'obsidian';
import moment from 'moment';

import { Transaction, Goal, CreditCard, Category, NexusHubSettings } from '../views/settings';
import type NexusHubPlugin from '../main';
import { formatAsCurrency, calculateCardBill, suggestCategory, parseCurrency } from '../helpers/helpers';
import { eventManager } from '../helpers/EventManager';
import { setupCurrencyInput, renderCategoryDropdown, ConfirmationModal } from '../helpers/ui-helpers';
import type { TextComponent } from 'obsidian';
import { ALL_ACHIEVEMENTS } from '../services/achievements';

// EXPORTS STUBS PARA MODAIS FALTANTES
export class GoalsModal extends Modal {
    plugin: NexusHubPlugin;
    filter: 'All' | 'Saving' | 'Debt';

    constructor(app: App, plugin: NexusHubPlugin, filter: 'All' | 'Saving' | 'Debt') {
        super(app);
        this.plugin = plugin;
        this.filter = filter;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Suas Metas' });

        const goalTypeDisplayText = this.filter === 'Saving' ? 'Economia' : (this.filter === 'Debt' ? 'Dívida' : undefined);
        const emptyText = goalTypeDisplayText ? `Você ainda não tem nenhuma meta de ${goalTypeDisplayText}.` : 'Você ainda não tem nenhuma meta. Crie uma para começar!';
        const createButtonText = this.filter === 'Debt' ? 'Criar Grupo de Dívidas' : 'Criar Nova Meta';

        const goalsToDisplay = this.filter !== 'All'
            ? (this.plugin.settings.goals || []).filter(g => g.goalType === this.filter)
            : (this.plugin.settings.goals || []);

        const goalsListContainer = contentEl.createDiv({ cls: 'goals-list-container' });

        if (goalsToDisplay.length === 0) {
            goalsListContainer.createEl('p', { text: emptyText });
        } else {
            goalsToDisplay.forEach(goal => {
                const goalCard = goalsListContainer.createDiv({ cls: 'goal-card' });
                goalCard.createEl('h3', { text: goal.name });

                const target = goal.targetAmount || 1;
                const current = goal.currentAmount || 0;
                goalCard.createEl('progress', { attr: { max: target, value: current } });
                const percentage = target > 0 ? ((current / target) * 100).toFixed(1) : 0;
                const progressText = `${formatAsCurrency(current)} de ${formatAsCurrency(target)} (${percentage}%)`;
                goalCard.createEl('p', { text: progressText, cls: 'progress-text' });

                // Apenas metas de 'Economizar Dinheiro' podem ter contribuições manuais
                if (goal.goalType === 'Saving') {
                    const contributionContainer = goalCard.createDiv({ cls: 'contribution-container' });
                    const amountInput = contributionContainer.createEl('input', { type: 'number', placeholder: 'Valor da contribuição' });
                    const contributeButton = contributionContainer.createEl('button', { text: 'Contribuir' });

                    contributeButton.addEventListener('click', async () => {
                        const amountValue = parseFloat(amountInput.value);
                        if (!isNaN(amountValue) && amountValue > 0) {
                            goal.currentAmount += amountValue;

                            // Log the contribution to the goal's history
                            if (!goal.history) {
                                goal.history = [];
                            }
                            goal.history.push({
                                date: new Date().toISOString(),
                                amount: amountValue,
                                balanceAfter: goal.currentAmount
                            });

                            // Check for goal completion
                            if (!goal.completed && goal.currentAmount >= goal.targetAmount) {
                                goal.completed = true;
                                this.plugin.increaseNexusScore(50, `Meta de economia '${goal.name}' concluída!`);
                                new Notice(`Parabéns! Você completou sua meta de economia '${goal.name}'!`);
                            }

                            await this.plugin.saveSettings();
                            eventManager.emit('data-changed');
                            this.onOpen(); // Re-render the modal
                        }
                    });
                }

                const actionsContainer = goalCard.createDiv({ cls: 'goal-actions-container' });
                const editButton = actionsContainer.createEl('button', { text: 'Editar' });
                editButton.addEventListener('click', () => {
                    new CreateEditGoalModal(this.app, this.plugin, () => this.onOpen(), goal).open();
                    this.close();
                });

                const deleteButton = actionsContainer.createEl('button', { text: 'Apagar', cls: 'mod-warning' });
                deleteButton.addEventListener('click', async () => {
                    new ConfirmationModal(
                        this.app,
                        'Apagar Meta',
                        `Tem certeza que deseja apagar a meta '${goal.name}'? Esta ação não pode ser desfeita.`,
                        async () => {
                            this.plugin.settings.goals = (this.plugin.settings.goals || []).filter(g => g.id !== goal.id);
                            await this.plugin.saveSettings();
                            eventManager.emit('data-changed');
                            this.onOpen(); // Recarrega o GoalsModal
                        }
                    ).open();
                });
            });
        }

        const isDebtPanel = this.filter === 'Debt';
        const goalTypeToCreate = isDebtPanel ? 'Debt' : (this.filter === 'Saving' ? 'Saving' : undefined);

        if (goalsToDisplay.length > 0) contentEl.createEl('hr');
        new Setting(contentEl).addButton(btn => btn
            .setButtonText(createButtonText)
            .setCta()
            .onClick(() => {
                // Pass the specific type to the creation modal if we are in a filtered view
                new CreateEditGoalModal(this.app, this.plugin, () => this.onOpen(), undefined, goalTypeToCreate).open();
                this.close();
            }));
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class AchievementsModal extends Modal {
    plugin: NexusHubPlugin;

    constructor(app: App, plugin: NexusHubPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Conquistas' });

        const achievementsContainer = contentEl.createDiv({ cls: 'achievements-container' });

        const userAchievements = new Map((this.plugin.settings.achievements || []).map(a => [a.id, a]));

        ALL_ACHIEVEMENTS.forEach(achievementTpl => {
            const userAchievement = userAchievements.get(achievementTpl.id);
            const isUnlocked = !!userAchievement;

            const card = achievementsContainer.createDiv({ cls: 'achievement-card' });
            card.toggleClass('is-unlocked', isUnlocked);

            const iconEl = card.createDiv({ cls: 'achievement-icon' });
            setIcon(iconEl, achievementTpl.icon);

            const infoEl = card.createDiv({ cls: 'achievement-info' });
            infoEl.createEl('h3', { text: achievementTpl.name });
            infoEl.createEl('p', { text: achievementTpl.description });

            if (isUnlocked && userAchievement) {
                infoEl.createEl('span', {
                    text: `Desbloqueado em: ${moment(userAchievement.unlockedDate).format('DD/MM/YYYY')}`,
                    cls: 'achievement-date'
                });
            }
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class AddCreditCardFormModal extends Modal {
    plugin: NexusHubPlugin;
    onSubmit: () => void;

    constructor(app: App, plugin: NexusHubPlugin, onSubmit: () => void) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Adicionar Novo Cartão de Crédito' });

        let name = '', limit = 0, closingDay = 0, dueDate = 0;

        new Setting(contentEl).setName('Nome do Cartão').addText(text => text.onChange(val => name = val.trim()));
        new Setting(contentEl).setName('Limite do Cartão').addText(text => setupCurrencyInput(text, val => limit = val));
        new Setting(contentEl).setName('Dia de Fechamento da Fatura').addText(text => {
            text.inputEl.type = 'number'; text.inputEl.min = '1'; text.inputEl.max = '31';
            text.onChange(val => closingDay = parseInt(val) || 0);
        });
        new Setting(contentEl).setName('Dia de Vencimento da Fatura').addText(text => {
            text.inputEl.type = 'number'; text.inputEl.min = '1'; text.inputEl.max = '31';
            text.onChange(val => dueDate = parseInt(val) || 0);
        });

        new Setting(contentEl).addButton(btn => btn
            .setButtonText('Salvar Cartão')
            .setCta()
            .onClick(async () => {
                if (name && limit > 0 && closingDay >= 1 && closingDay <= 31 && dueDate >= 1 && dueDate <= 31) {
                    const newCard: CreditCard = { id: `cc_${Date.now()}`, name, limit, closingDay, dueDate };
                    if (!this.plugin.settings.creditCards) {
                        this.plugin.settings.creditCards = [];
                    }
                    this.plugin.settings.creditCards.push(newCard);
                    await this.plugin.saveSettings();
                    eventManager.emit('data-changed');
                    this.onSubmit(); // Recarrega o modal anterior
                    this.close();
                } else { new Notice('Por favor, preencha todos os campos corretamente.'); }
            }));
    }

    onClose() { this.contentEl.empty(); }
}

export class ManageCreditCardsModal extends Modal {
    plugin: NexusHubPlugin;
    currentMonth: moment.Moment;

    constructor(app: App, plugin: NexusHubPlugin, currentMonth: moment.Moment) {
        super(app);
        this.plugin = plugin;
        this.currentMonth = currentMonth;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Gerenciar Cartões de Crédito' });

        // --- SEÇÃO DE LISTAGEM DE CARTÕES ---
        const cardsListContainer = contentEl.createDiv({ cls: 'cards-list-container' });
        const creditCards = this.plugin.settings.creditCards || [];

        if (creditCards.length === 0) {
            cardsListContainer.createEl('p', { text: 'Nenhum cartão de crédito cadastrado.' });
        } else {
            creditCards.forEach(card => {
                const cardItem = cardsListContainer.createDiv({ cls: 'credit-card-item' });

                const cardInfo = cardItem.createDiv({ cls: 'card-info' });
                cardInfo.createEl('span', { text: card.name, cls: 'card-name' });
                cardInfo.createEl('span', { text: `Limite: ${formatAsCurrency(card.limit)}`, cls: 'card-limit' });

                const cardActions = cardItem.createDiv({ cls: 'card-actions' });

                // BOTÃO EXPLÍCITO PARA DETALHAR FATURA
                cardActions.createEl('button', { text: 'Ver Fatura' })
                    .addEventListener('click', () => {
                        new CardBillDetailModal(this.app, this.plugin, card.id, this.currentMonth).open();
                        this.close();
                    });

                const deleteButton = cardActions.createEl('button', { cls: 'mod-warning' });
                setIcon(deleteButton, 'trash-2'); // Usa um ícone de lixeira
                deleteButton.addEventListener('click', async () => {
                    new ConfirmationModal(
                        this.app,
                        'Apagar Cartão de Crédito',
                        `Tem certeza que deseja apagar o cartão '${card.name}'? Esta ação não pode ser desfeita.`,
                        async () => {
                            this.plugin.settings.creditCards = (this.plugin.settings.creditCards || []).filter(c => c.id !== card.id);
                            await this.plugin.saveSettings();
                            this.onOpen();
                        }
                    ).open();
                });
            });
        }

        contentEl.createEl('hr');

        // --- SEÇÃO PARA ADICIONAR NOVO CARTÃO ---
        new Setting(contentEl)
            .setName('Adicionar Novo Cartão')
            .setDesc('Adicione um novo cartão de crédito para gerenciar suas compras parceladas.')
            .addButton(button => {
                button.setButtonText('Adicionar Cartão')
                    .setCta()
                    .onClick(() => {
                        new AddCreditCardFormModal(this.app, this.plugin, () => this.onOpen()).open();
                    });
            });
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class EditUserModal extends Modal {
    plugin: NexusHubPlugin;
    private userName: string;
    private salarioLiquido1: number;
    private salarioLiquido2: number;
    private salaryFrequency: 'monthly' | 'bi-weekly';
    private salaryPayday1: number;
    private salaryPayday2: number | undefined;
    private promptForSalaryUpdate: boolean;

    constructor(app: App, plugin: NexusHubPlugin) {
        super(app);
        this.plugin = plugin;
        this.userName = this.plugin.settings.userName || '';
        this.salarioLiquido1 = this.plugin.settings.salarioLiquido || 0;
        this.salarioLiquido2 = this.plugin.settings.salarioLiquido2 || 0;
        this.salaryFrequency = this.plugin.settings.salaryFrequency;
        this.salaryPayday1 = this.plugin.settings.salaryPayday1;
        this.salaryPayday2 = this.plugin.settings.salaryPayday2;
        this.promptForSalaryUpdate = this.plugin.settings.promptForSalaryUpdate;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Editar Informações do Usuário' });

        // User Name
        new Setting(contentEl)
            .setName('Seu Nome')
            .addText(text => text
                .setValue(this.userName)
                .onChange(value => this.userName = value));

        contentEl.createEl('h3', { text: 'Configurações de Salário' });

        // --- Salary Section ---
        const salarySection = contentEl.createDiv();

        const drawSalarySettings = () => {
            salarySection.empty();
            const isBiWeekly = this.salaryFrequency === 'bi-weekly';

            new Setting(salarySection)
                .setName('Frequência do Salário')
                .addDropdown(dd => dd
                    .addOption('monthly', 'Mensal')
                    .addOption('bi-weekly', 'Quinzenal')
                    .setValue(this.salaryFrequency)
                    .onChange((value: 'monthly' | 'bi-weekly') => {
                        this.salaryFrequency = value;
                        drawSalarySettings(); // Re-draw the whole salary section
                    }));

            if (isBiWeekly) {
                const totalEl = new Setting(salarySection)
                    .setName('Total Recebido no Mês')
                    .controlEl.createEl('strong', { cls: 'salary-total' });

                const updateTotal = () => {
                    totalEl.setText(formatAsCurrency(this.salarioLiquido1 + this.salarioLiquido2));
                };

                salarySection.createEl('h4', { text: '1º Pagamento' });
                new Setting(salarySection)
                    .setName('Dia do 1º Pagamento')
                    .addText(text => text.setValue(String(this.salaryPayday1)).onChange(val => this.salaryPayday1 = parseInt(val) || 1));
                new Setting(salarySection)
                    .setName('Valor Líquido do 1º Pagamento')
                    .addText(text => setupCurrencyInput(text, val => { this.salarioLiquido1 = val; updateTotal(); }, this.salarioLiquido1));

                salarySection.createEl('h4', { text: '2º Pagamento' });
                new Setting(salarySection)
                    .setName('Dia do 2º Pagamento')
                    .addText(text => text.setValue(String(this.salaryPayday2 || 15)).onChange(val => this.salaryPayday2 = parseInt(val) || 15));
                new Setting(salarySection)
                    .setName('Valor Líquido do 2º Pagamento')
                    .addText(text => setupCurrencyInput(text, val => { this.salarioLiquido2 = val; updateTotal(); }, this.salarioLiquido2));
                
                updateTotal(); // Initial calculation

            } else {
                // Monthly
                new Setting(salarySection)
                    .setName('Salário Líquido Mensal')
                    .addText(text => setupCurrencyInput(text, val => this.salarioLiquido1 = val, this.salarioLiquido1));
                new Setting(salarySection)
                    .setName('Dia do Pagamento')
                    .addText(text => text.setValue(String(this.salaryPayday1)).onChange(val => this.salaryPayday1 = parseInt(val) || 1));
            }

            // Prompt setting is outside the conditional drawing
            new Setting(contentEl)
                .setName('Perguntar sobre atualização de salário')
                .setDesc('Se ativado, o plugin perguntará no início de cada mês se você deseja atualizar seu salário.')
                .addToggle(toggle => toggle
                    .setValue(this.promptForSalaryUpdate)
                    .onChange(value => this.promptForSalaryUpdate = value));
        }

        drawSalarySettings(); // Initial draw

        // --- Save Button ---
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Salvar')
                .setCta()
                .onClick(async () => {
                    this.plugin.settings.userName = this.userName.trim();
                    this.plugin.settings.salaryFrequency = this.salaryFrequency;
                    this.plugin.settings.salarioLiquido = this.salarioLiquido1;
                    this.plugin.settings.salarioLiquido2 = this.salaryFrequency === 'bi-weekly' ? this.salarioLiquido2 : 0;
                    this.plugin.settings.salaryPayday1 = this.salaryPayday1;
                    this.plugin.settings.salaryPayday2 = this.salaryFrequency === 'bi-weekly' ? this.salaryPayday2 : undefined;
                    this.plugin.settings.promptForSalaryUpdate = this.promptForSalaryUpdate;

                    this.plugin.settings.transactions = this.plugin.settings.transactions.filter(transaction =>
                        !(transaction.type === 'income' && transaction.isRecurring)
                    );

                    this.createRecurringIncome();

                    await this.plugin.saveSettings();
                    eventManager.emit('data-changed');
                    this.close();
                }));
    }

    private createRecurringIncome() {
        const newTransactions: Transaction[] = [];
        const finalDate = moment().add(5, 'years');

        if (this.salaryFrequency === 'bi-weekly' && this.salaryPayday1 && this.salaryPayday2) {
            // First payment
            if (this.salarioLiquido1 > 0) {
                let loopDate1 = moment().startOf('month');
                while (loopDate1.isBefore(finalDate)) {
                    const transactionDate = loopDate1.clone().date(this.salaryPayday1);
                    newTransactions.push({
                        id: `txn_income_${loopDate1.format('YYYY-MM')}_p1`,
                        description: 'Renda Mensal',
                        amount: this.salarioLiquido1,
                        date: transactionDate.format('YYYY-MM-DD'),
                        category: 'Salário',
                        type: 'income',
                        status: 'pending',
                        isRecurring: true,
                        recurrenceRule: 'monthly',
                        isInstallment: false,
                    });
                    loopDate1.add(1, 'month');
                }
            }
            // Second payment
            if (this.salarioLiquido2 > 0) {
                let loopDate2 = moment().startOf('month');
                while (loopDate2.isBefore(finalDate)) {
                    const transactionDate = loopDate2.clone().date(this.salaryPayday2);
                    newTransactions.push({
                        id: `txn_income_${loopDate2.format('YYYY-MM')}_p2`,
                        description: 'Renda Mensal',
                        amount: this.salarioLiquido2,
                        date: transactionDate.format('YYYY-MM-DD'),
                        category: 'Salário',
                        type: 'income',
                        status: 'pending',
                        isRecurring: true,
                        recurrenceRule: 'monthly',
                        isInstallment: false,
                    });
                    loopDate2.add(1, 'month');
                }
            }
        } else {
            // Monthly payment
            if (this.salarioLiquido1 > 0) {
                let loopDate = moment().startOf('month');
                while (loopDate.isBefore(finalDate)) {
                    const transactionDate = loopDate.clone().date(this.salaryPayday1);
                    newTransactions.push({
                        id: `txn_income_${loopDate.format('YYYY-MM')}_main`,
                        description: 'Renda Mensal',
                        amount: this.salarioLiquido1,
                        date: transactionDate.format('YYYY-MM-DD'),
                        category: 'Salário',
                        type: 'income',
                        status: 'pending',
                        isRecurring: true,
                        recurrenceRule: 'monthly',
                        isInstallment: false,
                    });
                    loopDate.add(1, 'month');
                }
            }
        }

        this.plugin.settings.transactions.push(...newTransactions);

        // DEBUGGING NOTICE
        const debugDates = newTransactions.slice(0, 4).map(t => t.date).join(', ');
        new Notice(`Created ${newTransactions.length} recurring incomes. First few dates: ${debugDates}`, 15000);
    }
}

export class ExtraIncomeModal extends Modal {
    plugin: NexusHubPlugin;
    currentMonth: moment.Moment;

    constructor(app: App, plugin: NexusHubPlugin, currentMonth: moment.Moment) {
        super(app);
        this.plugin = plugin;
        this.currentMonth = currentMonth;
    }

    onOpen() {
        this.render();
    }

    render() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Rendas Extras' });
        contentEl.createEl('p', { text: `Adicione ou remova rendas extras para o mês de ${this.currentMonth.format('MMMM YYYY')}.`, cls: 'mod-subtle' });

        // --- List existing extra incomes ---
        const extraIncomes = this.plugin.settings.transactions.filter(transaction =>
            transaction.type === 'income' &&
            !transaction.isRecurring &&
            moment(transaction.date).isSame(this.currentMonth, 'month')
        );

        const listContainer = contentEl.createDiv();
        if (extraIncomes.length > 0) {
            extraIncomes.forEach(income => {
                new Setting(listContainer)
                    .setName(income.description)
                    .setDesc(formatAsCurrency(income.amount))
                    .addButton(btn => btn
                        .setIcon('trash')
                        .setTooltip('Apagar Renda Extra')
                        .setClass('mod-warning')
                        .onClick(async () => {
                            new ConfirmationModal(
                                this.app,
                                'Apagar Renda Extra',
                                `Tem certeza que deseja apagar a renda extra '${income.description}'?`,
                                async () => {
                                    this.plugin.settings.transactions = this.plugin.settings.transactions.filter(tx => tx.id !== income.id);
                                    await this.plugin.saveSettings();
                                    eventManager.emit('data-changed');
                                    this.render(); // Re-render the modal
                                }
                            ).open();
                        }));
            });
        } else {
            listContainer.createEl('p', { text: 'Nenhuma renda extra registrada para este mês.', cls: 'mod-subtle' });
        }

        contentEl.createEl('hr');

        // --- Form to add new extra income ---
        contentEl.createEl('h3', { text: 'Adicionar Nova Renda Extra' });
        let description = '';
        let amount = 0;
        let date = this.currentMonth.clone().startOf('month').format('YYYY-MM-DD');

        new Setting(contentEl).setName('Descrição').addText(text => text.setPlaceholder('Ex: Freelance, Venda de item, etc.').onChange(val => description = val.trim()));
        new Setting(contentEl).setName('Valor').addText(text => setupCurrencyInput(text, val => amount = val));
        new Setting(contentEl).setName('Data').addText(text => {
            text.inputEl.type = 'date';
            text.setValue(date).onChange(val => date = val);
        });

        new Setting(contentEl).addButton(btn => btn
            .setButtonText('Adicionar Renda')
            .setCta()
            .onClick(async () => {
                if (!description || amount <= 0) {
                    new Notice('Descrição e valor são obrigatórios.');
                    return;
                }
                const newIncome: Transaction = {
                    id: `txn_extra_${Date.now()}`,
                    description,
                    amount,
                    date,
                    category: 'Renda Extra',
                    type: 'income',
                    status: 'pending',
                    isRecurring: false,
                    isInstallment: false
                };
                this.plugin.settings.transactions.push(newIncome);
                await this.plugin.saveSettings();
                eventManager.emit('data-changed');
                this.render(); // Re-render to show the new item
            }));
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class ManageBudgetsModal extends Modal {
    plugin: NexusHubPlugin;

    constructor(app: App, plugin: NexusHubPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Gerenciar Orçamentos' });

        // --- Seção 1: Orçamentos Existentes ---
        contentEl.createEl('h3', { text: 'Orçamentos Atuais' });
        const existingBudgetsContainer = contentEl.createDiv();
        const existingBudgets = this.plugin.settings.budgets || [];

        if (existingBudgets.length === 0) {
            existingBudgetsContainer.createEl('p', { text: 'Nenhum orçamento definido para este mês.', cls: 'mod-subtle' });
        } else {
            existingBudgets.forEach(budget => {
                const category = this.plugin.settings.categories.find(c => c.id === budget.categoryId);
                if (!category) return;

                new Setting(existingBudgetsContainer)
                    .setName(category.name)
                    .addText(text => {
                        setupCurrencyInput(text, (newValue) => {
                            budget.amount = newValue;
                        }, budget.amount);
                        text.inputEl.addEventListener('blur', async () => {
                            if (budget.amount > 0) {
                                await this.plugin.saveSettings();
                                eventManager.emit('data-changed');
                            } else {
                                this.plugin.settings.budgets = (this.plugin.settings.budgets || []).filter(b => b.categoryId !== budget.categoryId);
                                await this.plugin.saveSettings();
                                eventManager.emit('data-changed');
                                this.onOpen(); // Re-render
                            }
                        });
                    })
                    .addButton(btn => {
                        btn.setIcon('trash')
                            .setTooltip('Apagar Orçamento')
                            .setClass('mod-warning')
                            .onClick(async () => {
                                this.plugin.settings.budgets = (this.plugin.settings.budgets || []).filter(b => b.categoryId !== budget.categoryId);
                                await this.plugin.saveSettings();
                                eventManager.emit('data-changed');
                                this.onOpen(); // Re-render
                            });
                    });
            });
        }

        contentEl.createEl('hr');

        // --- Seção 2: Adicionar Novo Orçamento ---
        contentEl.createEl('h3', { text: 'Adicionar Novo Orçamento' });
        const addBudgetContainer = contentEl.createDiv();

        const budgetedCategoryIds = new Set(existingBudgets.map(b => b.categoryId));
        const availableCategories = this.plugin.settings.categories.filter(c =>
            !budgetedCategoryIds.has(c.id) &&
            c.name !== 'Salário' &&
            c.name !== 'Renda Extra'
        );

        if (availableCategories.length === 0) {
            addBudgetContainer.createEl('p', { text: 'Todas as categorias já possuem um orçamento.', cls: 'mod-subtle' });
            return;
        }

        let newBudgetCategoryId = availableCategories[0].id;
        let newBudgetAmount = 0;

        new Setting(addBudgetContainer)
            .addDropdown(dd => {
                availableCategories.forEach(cat => dd.addOption(cat.id, cat.name));
                dd.onChange(val => newBudgetCategoryId = val);
            })
            .addText(text => {
                text.setPlaceholder('Valor do orçamento');
                setupCurrencyInput(text, val => newBudgetAmount = val);
            })
            .addButton(btn => {
                btn.setButtonText('Adicionar Orçamento')
                    .setCta()
                    .onClick(async () => {
                        if (newBudgetAmount > 0 && newBudgetCategoryId) {
                            if (!this.plugin.settings.budgets) {
                                this.plugin.settings.budgets = [];
                            }
                            this.plugin.settings.budgets.push({
                                categoryId: newBudgetCategoryId,
                                amount: newBudgetAmount
                            });
                            await this.plugin.saveSettings();
                            eventManager.emit('data-changed');
                            this.onOpen(); // Re-render o modal com o novo orçamento
                        }
                    });
            });
    }
}

export class AddTransactionModal extends Modal {
    plugin: NexusHubPlugin;
    onSubmit: () => void;

    // State properties
    private description: string = "";
    private amount: number = 0;
    private category: string = "";
    private isRecurring: boolean = false;
    private paymentMonth: string = moment().format('YYYY-MM');
    private recurringPaymentRule: 'due_month' | 'previous_month' = 'due_month';

    // Single
    private date: string = moment().format("YYYY-MM-DD");

    // Recurring
    private dayOfMonthDue: number = 1;
    private hasEndDate: boolean = false;
    private endDate: string = ''; // YYYY-MM-DD

    constructor(app: App, plugin: NexusHubPlugin, currentMonth: moment.Moment, onSubmit: () => void, transactionToDuplicate?: Transaction) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;

        if (transactionToDuplicate) {
            // Pre-fill state from the transaction to be duplicated
            this.description = transactionToDuplicate.description;
            this.amount = transactionToDuplicate.amount;
            this.category = transactionToDuplicate.category;
            this.isRecurring = transactionToDuplicate.isRecurring;
            // Default the date to today for convenience, a common use case for duplication
            this.date = moment().format("YYYY-MM-DD");
            // IMPORTANT: Default paymentMonth to the one from the duplicated transaction OR the current view month
            this.paymentMonth = transactionToDuplicate.paymentMonth || currentMonth.format('YYYY-MM');
        } else {
            // Default state for a new transaction
            this.paymentMonth = currentMonth.format('YYYY-MM');
            if (this.plugin.settings.categories.length > 0) {
                this.category = this.plugin.settings.categories[0].name;
            }
        }
    }

    onOpen() {
        this.render();
    }

    onClose() {
        this.contentEl.empty();
    }

    private handleDescriptionChange(description: string) {
        this.description = description;
        // A query é um pouco frágil, mas funciona para a estrutura atual do modal.
        const categoryDropdown = this.contentEl.querySelector('.setting-item-control select') as HTMLSelectElement;
        if (!categoryDropdown) return;

        const suggestedCategory = suggestCategory(description, this.plugin.settings.categories);
        if (suggestedCategory && suggestedCategory !== categoryDropdown.value) {
            const optionExists = Array.from(categoryDropdown.options).some(opt => opt.value === suggestedCategory);
            if (optionExists) {
                this.category = suggestedCategory;
                categoryDropdown.value = suggestedCategory;
                new Notice(`Categoria sugerida: ${suggestedCategory}`, 2000);
            }
        }
    }

    private render() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: 'Adicionar Transação' });

        const optionsContainer = contentEl.createDiv();

        const redrawOptions = () => {
            optionsContainer.empty(); // Limpa as opções atuais

            // Renderiza as opções baseadas no estado de isRecurring
            if (this.isRecurring) {
                this.renderRecurringSubOptions(optionsContainer);
            } else {
                this.renderSingleTransactionOptions(optionsContainer);
            }

            // Renderiza os campos comuns DEPOIS das opções específicas
            new Setting(optionsContainer)
                .setName('Valor')
                .addText(text => {
                    setupCurrencyInput(text, val => this.amount = val, this.amount);
                });

            renderCategoryDropdown(optionsContainer, this.plugin, () => this.category, (val) => this.category = val);
        };

        // Main Toggle
        new Setting(contentEl)
            .setName('É uma despesa recorrente?')
            .addToggle(toggle => toggle
                .setValue(this.isRecurring)
                .onChange(value => {
                    this.isRecurring = value;
                    redrawOptions(); // Redesenha as opções quando o toggle muda
                }));

        redrawOptions(); // Desenha as opções iniciais

        // Botão Salvar (fora do container de opções para não ser limpo)
        new Setting(contentEl)
            .addButton(btn => btn.setButtonText('Salvar').setCta().onClick(() => this.saveTransaction()));
    }

    private renderSingleTransactionOptions(container: HTMLElement) {
        container.empty();

        // Dropdown for description as requested for "Variable Expense"
        const nameSetting = new Setting(container).setName('Descrição');
        const otherNameInput = new Setting(container).setName('Outra Descrição').addText(text => text.setValue(this.description).onChange(val => this.description = val));

        nameSetting.addDropdown(dd => {
            const standardOptions = ['Luz', 'Água', 'Gás', 'Internet'];
            standardOptions.forEach(opt => dd.addOption(opt, opt));
            dd.addOption('__OTHER__', 'Outro...');

            // Pre-select based on duplicated transaction or default
            const isStandard = standardOptions.includes(this.description);
            if (this.description && !isStandard) {
                dd.setValue('__OTHER__');
                otherNameInput.settingEl.removeClass('is-hidden');
            } else {
                dd.setValue(this.description || 'Luz');
                otherNameInput.settingEl.addClass('is-hidden');
                if (!this.description) this.handleDescriptionChange('Luz'); // Set initial value and try to categorize
            }

            dd.onChange(val => {
                if (val !== '__OTHER__') {
                    this.handleDescriptionChange(val);
                    otherNameInput.settingEl.addClass('is-hidden');
                } else {
                    this.description = '';
                    otherNameInput.settingEl.removeClass('is-hidden');
                    (otherNameInput.components[0] as TextComponent)?.inputEl.focus();
                }
            });
        });

        (otherNameInput.components[0] as TextComponent)?.inputEl.addEventListener('blur', () => {
            this.handleDescriptionChange((otherNameInput.components[0] as TextComponent).getValue());
        });

        // Date picker
        new Setting(container)
            .setName('Data de Vencimento')
            .addText(text => {
                text.inputEl.type = 'date';
                text.setValue(this.date).onChange(value => {
                    this.date = value;
                    // O mês de pagamento agora é controlado manualmente pelo usuário.
                });
            });

        // Payment Month Picker
        new Setting(container)
            .setName('Mês de Pagamento')
            .setDesc('Selecione o mês ao qual este pagamento pertence (para faturas de cartão de crédito).')
            .addText(text => {
                text.inputEl.type = 'month';
                text.setValue(this.paymentMonth).onChange(value => this.paymentMonth = value);
            });
    }

    private renderRecurringSubOptions(container: HTMLElement) {
        container.empty();
        new Setting(container).setName('Descrição').addText(text => {
            text.setPlaceholder('Ex: Aluguel, Assinatura de Streaming')
                .onChange(value => this.description = value);

            text.inputEl.addEventListener('blur', () => this.handleDescriptionChange(text.getValue()));
        });

        new Setting(container).setName('Dia do Vencimento no Mês').addText(text => {
            text.inputEl.type = 'number';
            text.inputEl.min = '1';
            text.inputEl.max = '31';
            text.setValue(String(this.dayOfMonthDue));
            text.onChange(val => this.dayOfMonthDue = parseInt(val) || 1);
        });

        let endDateSetting: Setting;

        new Setting(container).setName('Tem data de término?').addToggle(toggle => toggle
            .setValue(this.hasEndDate)
            .onChange(val => {
                this.hasEndDate = val;
                if (endDateSetting) {
                    endDateSetting.settingEl.toggleClass('is-hidden', !val);
                }
            }));

        endDateSetting = new Setting(container).setName('Data de Término').addText(text => {
            text.inputEl.type = 'date'; // YYYY-MM-DD
            text.onChange(val => this.endDate = val);
        });
        endDateSetting.settingEl.toggleClass('is-hidden', !this.hasEndDate);

        new Setting(container)
            .setName('Regra de Pagamento para Recorrências')
            .setDesc('Define se a despesa pertence ao mês de vencimento ou ao mês anterior (útil para cartões de crédito).')
            .addDropdown(dd => dd
                .addOption('due_month', 'Pagar no Mês de Vencimento')
                .addOption('previous_month', 'Pagar no Mês Anterior')
                .setValue(this.recurringPaymentRule)
                .onChange(val => this.recurringPaymentRule = val as 'due_month' | 'previous_month'));
    }

    private async saveTransaction() {
        if (!this.description || this.amount <= 0) {
            new Notice('Descrição e valor são obrigatórios.');
            return;
        }

        const newTransactions: Transaction[] = [];

        if (!this.isRecurring) { // Single Transaction
            const transaction: Transaction = {
                id: `txn_${Date.now()}`,
                description: this.description,
                amount: this.amount,
                date: this.date,
                category: this.category,
                type: 'expense',
                status: 'pending',
                isRecurring: false,
                isInstallment: false,
                paymentMonth: this.paymentMonth,
            };
            newTransactions.push(transaction);
        } else { // Recurring Transaction
            const startDate = moment().startOf('month');
            const finalDate = this.hasEndDate && this.endDate ? moment(this.endDate) : moment().add(5, 'years');
            let currentDate = startDate.clone();

            while (currentDate.isBefore(finalDate) || currentDate.isSame(finalDate, 'month')) {
                const transactionDate = currentDate.clone().date(this.dayOfMonthDue);
                // Evita criar transações no passado se a data de início for a atual
                if (transactionDate.isBefore(moment(), 'day') && currentDate.isSame(moment(), 'month')) {
                    currentDate.add(1, 'month');
                    continue;
                }

                // Define o mês de pagamento
                let paymentMonth = transactionDate.clone();
                if (this.recurringPaymentRule === 'previous_month') {
                    paymentMonth.subtract(1, 'month');
                }

                const transaction: Transaction = {
                    id: `txn_${Date.now()}_${currentDate.format('YYYY-MM')}`,
                    description: this.description,
                    amount: this.amount,
                    date: transactionDate.format('YYYY-MM-DD'),
                    category: this.category,
                    type: 'expense',
                    status: 'pending',
                    isRecurring: true,
                    recurrenceRule: 'monthly',
                    endDate: this.hasEndDate ? this.endDate : undefined,
                    isInstallment: false,
                    paymentMonth: paymentMonth.format('YYYY-MM'),
                };
                newTransactions.push(transaction);
                currentDate.add(1, 'month');
            }
        }

        this.plugin.settings.transactions.push(...newTransactions);
        await this.plugin.saveSettings();
        eventManager.emit('data-changed');
        new Notice('Transação adicionada com sucesso!');
        this.onSubmit();
        this.close();
    }
}

// ===================================================================
// MODAL PARA ADICIONAR CONTAS GERAIS
// ===================================================================

export class CreateEditGoalModal extends Modal {
    plugin: NexusHubPlugin;
    onSubmit: () => void;
    goal?: Goal;

    // Form state
    private goalName: string = '';
    private goalType: 'Saving' | 'Debt' = 'Saving';
    private totalValue: number = 0;
    private targetDate: string = '';
    private step: 1 | 2 | 3 = 1;
    private selectedAccountIds: Set<string> = new Set();
    private initialGoalType: 'Saving' | 'Debt' | undefined;

    constructor(app: App, plugin: NexusHubPlugin, onSubmit: () => void, goal?: Goal, initialGoalType?: 'Saving' | 'Debt') {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
        this.goal = goal;
        this.initialGoalType = initialGoalType;

        if (this.goal) {
            this.goalName = this.goal.name;
            this.goalType = this.goal.goalType; // Now it's 'Saving' or 'Debt'
            this.totalValue = this.goal.targetAmount;
            this.targetDate = this.goal.targetDate || "";
            this.selectedAccountIds = new Set(this.goal.linkedAccountIds);
        }
    }

    onOpen() {
        this.renderStep();
    }

    private renderStep() {
        const { contentEl } = this;
        contentEl.empty();
        const isEditing = !!this.goal;

        if (isEditing) {
            contentEl.createEl('h2', { text: `Editando Meta: ${this.goalName}` });
            this.renderForm();
        } else {
            // If an initial type is provided (e.g., from a specific button), skip the choice step.
            if (this.initialGoalType) {
                this.goalType = this.initialGoalType;
                this.step = 2;
            }

            switch (this.step) {
                case 1: this.renderTypeChoice(); break;
                case 2: this.renderForm(); break;
            }
        }
    }

    private renderTypeChoice() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Criar Nova Meta' });

        const choiceContainer = contentEl.createDiv({ cls: 'goal-type-choice-container' });

        const savingCard = choiceContainer.createDiv({ cls: 'goal-type-card' });
        savingCard.createEl('h3', { text: 'Meta de Economia' });
        savingCard.createEl('p', { text: 'Para juntar dinheiro para um objetivo específico (ex: viagem, entrada de um imóvel).' });
        savingCard.addEventListener('click', () => {
            this.goalType = 'Saving';
            this.step = 2;
            this.renderStep();
        });

        const debtCard = choiceContainer.createDiv({ cls: 'goal-type-card' });
        debtCard.createEl('h3', { text: 'Meta de Dívida' });
        debtCard.createEl('p', { text: 'Para agrupar e quitar dívidas existentes (ex: compras parceladas).' });
        debtCard.addEventListener('click', () => {
            this.goalType = 'Debt';
            this.step = 2;
            this.renderStep();
        });
    }

    private renderForm() {
        const { contentEl } = this;
        const isEditing = !!this.goal;

        new Setting(contentEl)
            .setName('Nome da Meta')
            .addText(text => text
                .setPlaceholder('Ex: Viagem para a praia')
                .setValue(this.goalName)
                .onChange(val => this.goalName = val));

        if (this.goalType === 'Saving') {
            new Setting(contentEl)
                .setName('Valor Alvo')
                .addText(text => {
                    text.inputEl.type = 'number';
                    text.setValue(String(this.totalValue))
                        .onChange(val => this.totalValue = parseFloat(val) || 0);
                });

            new Setting(contentEl)
                .setName('Data Alvo')
                .addText(text => {
                    text.inputEl.type = 'date';
                    text.setValue(this.targetDate)
                        .onChange(val => this.targetDate = val);
                });
        } else if (this.goalType === 'Debt') {
            contentEl.createEl('h3', { text: 'Agrupar Dívidas' });
            contentEl.createEl('p', { text: 'Selecione as compras parceladas que você deseja agrupar nesta meta de dívida.' });

            const accountsContainer = contentEl.createDiv({ cls: 'goal-accounts-list' });

            const installmentGroups = this.plugin.settings.transactions
                .filter(transaction => transaction.isInstallment && transaction.installmentOf)
                .reduce((acc, t) => {
                    if (t.installmentOf && !acc.has(t.installmentOf)) {
                        const baseDescription = t.description.substring(0, t.description.lastIndexOf(' ('));
                        const totalAmount = t.amount * (t.totalInstallments || 1);
                        acc.set(t.installmentOf, { description: baseDescription, total: totalAmount });
                    }
                    return acc;
                }, new Map<string, { description: string, total: number }>());

            if (installmentGroups.size === 0) {
                accountsContainer.createEl('p', { text: 'Nenhuma compra parcelada encontrada para agrupar.', cls: 'mod-subtle' });
            } else {
                installmentGroups.forEach((group, id) => {
                    const itemEl = accountsContainer.createDiv({ cls: 'goal-account-item' });
                    const label = itemEl.createEl('label');
                    const checkbox = label.createEl('input', { type: 'checkbox' });
                    checkbox.checked = this.selectedAccountIds.has(id);
                    checkbox.onchange = () => {
                        if (checkbox.checked) {
                            this.selectedAccountIds.add(id);
                        } else {
                            this.selectedAccountIds.delete(id);
                        }
                    };
                    label.appendText(` ${group.description} `);
                    label.createEl('span', { text: `(${formatAsCurrency(group.total)})`, cls: 'mod-subtle' });
                });
            }
        }

        const buttonText = isEditing
            ? 'Salvar Alterações'
            : (this.goalType === 'Debt' ? 'Criar Meta de Dívida' : 'Criar Meta de Economia');
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText(buttonText)
                .setCta()
                .onClick(() => this.saveGoal()));
    }

    private async saveGoal() {
        if (!this.goalName) {
            new Notice('O nome da meta é obrigatório.');
            return;
        }

        let calculatedTarget = this.totalValue;
        let calculatedCurrent = 0;

        if (this.goalType === 'Debt') {
            // For debt goals, the target and current amounts are calculated from linked accounts
            calculatedTarget = 0;
            calculatedCurrent = 0;
            this.selectedAccountIds.forEach(accountId => {
                const relatedInstallments = this.plugin.settings.transactions.filter(tx => tx.installmentOf === accountId);
                if (relatedInstallments.length > 0) {
                    const installmentAmount = relatedInstallments[0].amount;
                    const totalInstallments = relatedInstallments[0].totalInstallments || 1;
                    calculatedTarget += installmentAmount * totalInstallments;
                    const paidCount = relatedInstallments.filter(tx => tx.status === 'paid').length;
                    calculatedCurrent += paidCount * installmentAmount;
                }
            });
        }

        if (this.goal) { // Editing existing goal
            const goalToUpdate = (this.plugin.settings.goals || []).find(g => g.id === this.goal?.id);
            if (goalToUpdate) {
                goalToUpdate.name = this.goalName;
                if (goalToUpdate.goalType === 'Saving') {
                    goalToUpdate.targetAmount = this.totalValue;
                    goalToUpdate.targetDate = this.targetDate;
                }
                if (goalToUpdate.goalType === 'Debt') {
                    goalToUpdate.linkedAccountIds = Array.from(this.selectedAccountIds);
                    goalToUpdate.targetAmount = calculatedTarget;
                    goalToUpdate.currentAmount = calculatedCurrent;
                }
            }
        } else { // Creating new goal
            const newGoal: Goal = {
                id: `goal_${Date.now()}`,
                name: this.goalName,
                goalType: this.goalType,
                targetAmount: calculatedTarget,
                currentAmount: calculatedCurrent,
                targetDate: this.goalType === 'Saving' ? this.targetDate : undefined,
                linkedAccountIds: Array.from(this.selectedAccountIds),
                completed: false,
            };
            if (!this.plugin.settings.goals) {
                this.plugin.settings.goals = [];
            }
            this.plugin.settings.goals.push(newGoal);
        }

        await this.plugin.saveSettings();
        eventManager.emit('data-changed');
        this.onSubmit();
        this.close();
    }
}

export class PurchaseDetailModal extends Modal {
    plugin: NexusHubPlugin;
    purchaseId: string;

    constructor(app: App, plugin: NexusHubPlugin, purchaseId: string) {
        super(app);
        this.plugin = plugin;
        this.purchaseId = purchaseId;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        const allInstallments = this.plugin.settings.transactions
            .filter((transaction: Transaction) => transaction.installmentOf === this.purchaseId)
            .sort((a: Transaction, b: Transaction) => (a.installmentNumber || 0) - (b.installmentNumber || 0));

        if (allInstallments.length === 0) {
            contentEl.createEl('h2', { text: 'Erro' });
            contentEl.createEl('p', { text: 'Detalhes da compra não encontrados.' });
            return;
        }

        const firstInstallment = allInstallments[0];
        const baseDescription = firstInstallment.description.substring(0, firstInstallment.description.lastIndexOf(' (')).trim();
        const totalAmount = firstInstallment.amount * (firstInstallment.totalInstallments || 1);

        contentEl.createEl('h2', { text: baseDescription });
        new Setting(contentEl)
            .setName('Valor Total da Compra')
            .setDesc(formatAsCurrency(totalAmount));
        new Setting(contentEl)
            .setName('Categoria')
            .setDesc(firstInstallment.category);
        new Setting(contentEl)
            .setName('Total de Parcelas')
            .setDesc(String(firstInstallment.totalInstallments || 1));

        contentEl.createEl('hr');
        contentEl.createEl('h3', { text: 'Parcelas' });

        const installmentsContainer = contentEl.createDiv({ cls: 'installments-list-container' });
        allInstallments.forEach((installment: Transaction) => {
            const item = new Setting(installmentsContainer)
                .setName(installment.description)
                .setDesc(`Vencimento: ${moment(installment.date).format('DD/MM/YYYY')}`);

            item.controlEl.createSpan({
                text: installment.status === 'paid' ? 'Paga' : 'Pendente',
                cls: `status-badge status-${installment.status}`
            });
        });
    }
}

export class CardBillDetailModal extends Modal {
    plugin: NexusHubPlugin;
    cardId: string;
    currentMonth: moment.Moment;

    constructor(app: App, plugin: NexusHubPlugin, cardId: string, currentMonth: moment.Moment) {
        super(app);
        this.plugin = plugin;
        this.cardId = cardId;
        this.currentMonth = currentMonth;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();


        const card = (this.plugin.settings.creditCards || []).find(c => c.id === this.cardId);
        if (!card) {
            contentEl.setText('Cartão de crédito não encontrado.');
            return;
        }

        contentEl.createEl('h2', { text: `Fatura do Cartão: ${card.name}` });

        // Usa o mês que foi passado pelo construtor para garantir consistência com a view principal.
        const bill = calculateCardBill(card, this.plugin.settings.transactions, this.currentMonth);
        const { total: billTotal, dueDate: billDueDate, transactions: transactionsForBill } = bill;

        contentEl.createEl('p', { text: `Fatura de ${this.currentMonth.format('MMMM YYYY')} - Vencimento em ${billDueDate.format('DD/MM')} - Total: ${formatAsCurrency(billTotal)}` });

        // --- List transactions in the bill ---
        if (transactionsForBill.length > 0) {
            const billItemsContainer = contentEl.createDiv({ cls: 'payment-list-container' });
            billItemsContainer.createEl('h4', { text: 'Itens da Fatura' });
            transactionsForBill.forEach((transaction: Transaction) => {
                const itemSetting = new Setting(billItemsContainer)

                    .setName(transaction.description)
                    .setDesc(formatAsCurrency(transaction.amount));

                // Adiciona botão de Editar
                itemSetting.addButton(btn => btn
                    .setIcon('pencil')
                    .setTooltip('Editar Compra Original')
                    .onClick(() => {
                        if (!transaction.isInstallment || !transaction.installmentOf) {
                            new Notice('Apenas compras parceladas podem ser editadas a partir daqui.');
                            return;
                        }
                        const purchaseId = transaction.installmentOf;
                        const allInstallments = this.plugin.settings.transactions
                            .filter((trans: Transaction) => trans.installmentOf === purchaseId)
                            .sort((a: Transaction, b: Transaction) => (a.installmentNumber || 0) - (b.installmentNumber || 0));

                        if (allInstallments.length > 0) {
                            const firstInstallment = allInstallments[0];
                            new EditPurchaseModal(this.app, this.plugin, firstInstallment, () => this.onOpen()).open();
                            this.close();
                        } else {
                            new Notice('Não foi possível encontrar a compra original para editar.');
                        }
                    }));

                // Adiciona botão de Apagar
                itemSetting.addButton(btn => btn
                    .setIcon('trash')
                    .setTooltip('Apagar Compra Original (todas as parcelas)')
                    .setClass('mod-warning')
                    .onClick(async () => {
                        if (!transaction.installmentOf) {
                            new Notice('Apenas compras parceladas podem ser apagadas por completo a partir daqui.');
                            return;
                        }
                        const baseDescription = transaction.description.substring(0, transaction.description.lastIndexOf(' ('));
                        new ConfirmationModal(
                            this.app,
                            'Apagar Compra',
                            `Tem certeza que deseja apagar a compra '${baseDescription}' e todas as suas parcelas?`,
                            async () => {
                                const purchaseId = transaction.installmentOf;
                                if (purchaseId) {
                                    this.plugin.settings.transactions = this.plugin.settings.transactions.filter(
                                        trans => trans.installmentOf !== purchaseId
                                    );
                                    await this.plugin.saveSettings();
                                    eventManager.emit('data-changed');
                                    this.onOpen(); // Recarrega o modal para refletir a exclusão
                                }
                            }
                        ).open();
                    }));
            });
        } else {
            contentEl.createEl('p', { text: `Nenhum item na fatura de ${this.currentMonth.format('MMMM YYYY')}.`, cls: 'mod-subtle' });
        }

        contentEl.createEl('hr');

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Adicionar Compra Parcelada')
                .setCta()
                .onClick(() => {
                    // Abre o modal de adição, passando um callback para recarregar este modal ao salvar
                    new AddPurchaseModal(this.app, this.plugin, this.cardId, () => this.onOpen()).open();
                    this.close();
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class EditPurchaseModal extends Modal {
    plugin: NexusHubPlugin;
    firstInstallment: Transaction;
    onSaveCallback?: () => void;

    // Form state
    private description: string = '';
    private totalAmount: number = 0;
    private installments: number = 1;
    private purchaseDate: string = moment().format('YYYY-MM-DD');
    private category: string = '';
    private installmentsPaid: number = 0;
    private cardId: string;

    constructor(app: App, plugin: NexusHubPlugin, firstInstallment: Transaction, onSaveCallback?: () => void) {
        super(app);
        this.plugin = plugin;
        this.firstInstallment = firstInstallment;
        this.onSaveCallback = onSaveCallback;
        this.cardId = firstInstallment.cardId || '';

        // Pre-populate form state
        const purchaseGroup = this.plugin.settings.transactions.filter((transaction: Transaction) => transaction.installmentOf === this.firstInstallment.installmentOf);

        this.description = this.firstInstallment.description.substring(0, this.firstInstallment.description.lastIndexOf(' ('));
        this.totalAmount = this.firstInstallment.amount * (this.firstInstallment.totalInstallments || 1);
        this.installments = this.firstInstallment.totalInstallments || 1;
        this.purchaseDate = this.firstInstallment.purchaseDate || moment().format('YYYY-MM-DD');
        this.category = this.firstInstallment.category;
        this.installmentsPaid = purchaseGroup.filter((transaction: Transaction) => transaction.status === 'paid').length;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Editar Compra Parcelada' });

        new Setting(contentEl).setName('Descrição da Compra').addText(text => text.setValue(this.description).onChange(val => this.description = val));

        new Setting(contentEl).setName('Valor Total').addText(text => {
            setupCurrencyInput(text, val => this.totalAmount = val, this.totalAmount);
        });

        new Setting(contentEl).setName('Número de Parcelas').addText(text => {
            text.inputEl.type = 'number';
            text.inputEl.min = '1';
            text.setValue(String(this.installments)).onChange(val => this.installments = parseInt(val) || 1);
        });

        new Setting(contentEl).setName('Data da Compra').addText(text => {
            text.inputEl.type = 'date';
            text.setValue(this.purchaseDate).onChange(val => this.purchaseDate = val);
        });

        new Setting(contentEl).setName('Parcelas Pagas').addText(text => {
            text.inputEl.type = 'number';
            text.inputEl.min = '0';
            text.setValue(String(this.installmentsPaid));
            text.setDisabled(true); // Non-editable
        });

        renderCategoryDropdown(contentEl, this.plugin, () => this.category, (val) => this.category = val);

        new Setting(contentEl).addButton(btn => btn
            .setButtonText('Salvar Alterações')
            .setCta()
            .onClick(() => this.saveChanges()));
    }

    private async saveChanges() {
        if (!this.description || this.totalAmount <= 0 || this.installments <= 0) {
            new Notice('Descrição, valor total e número de parcelas são obrigatórios.');
            return;
        }
        if (this.installmentsPaid >= this.installments) {
            new Notice('O número de parcelas pagas não pode ser maior ou igual ao total de parcelas.');
            return;
        }

        // 1. Remove ALL existing transactions for this purchase to ensure consistency
        const purchaseId = this.firstInstallment.installmentOf;
        if (!purchaseId) return;

        this.plugin.settings.transactions = this.plugin.settings.transactions.filter((transaction: Transaction) =>
            transaction.installmentOf !== purchaseId
        );

        // 2. Re-generate all installments from scratch with the new, correct data
        const card = (this.plugin.settings.creditCards || []).find((c: CreditCard) => c.id === this.cardId);
        if (!card) {
            new Notice('Cartão de crédito associado à compra não encontrado.');
            return;
        }

        const installmentAmount = this.totalAmount / this.installments;
        const newTransactions: Transaction[] = [];

        // Lógica de data definitiva para cálculo de vencimento da fatura.
        // 1. Determina o mês de FECHAMENTO da primeira parcela.
        const purchaseDateMoment = moment(this.purchaseDate);
        let closingMonth = purchaseDateMoment.clone();
        if (purchaseDateMoment.date() > card.closingDay) {
            closingMonth.add(1, 'month');
        }

        // 2. Determina o mês de VENCIMENTO da primeira parcela.
        let firstDueDateMonth = closingMonth.clone();
        if (card.dueDate < card.closingDay) {
            firstDueDateMonth.add(1, 'month');
        }

        for (let i = 0; i < this.installments; i++) {
            const installmentNumber = i + 1;

            const targetMonth = firstDueDateMonth.clone().add(i, 'months');
            const daysInTargetMonth = targetMonth.daysInMonth();
            const dueDay = Math.min(card.dueDate, daysInTargetMonth);
            const billDueDate = targetMonth.date(dueDay);

            let paymentMonthForInstallment = billDueDate.clone();
            if (billDueDate.date() < 15) {
                paymentMonthForInstallment.subtract(1, 'month');
            }

            const newTransaction: Transaction = {
                id: `txn_${purchaseId}_${installmentNumber}`,
                description: `${this.description} (${installmentNumber}/${this.installments})`,
                amount: installmentAmount,
                date: billDueDate.format('YYYY-MM-DD'),
                category: this.category,
                type: 'expense',
                status: installmentNumber <= this.installmentsPaid ? 'paid' : 'pending',
                isRecurring: false,
                isInstallment: true,
                installmentOf: purchaseId,
                installmentNumber: installmentNumber,
                totalInstallments: this.installments,
                cardId: this.cardId,
                purchaseDate: this.purchaseDate,
                paymentMonth: paymentMonthForInstallment.format('YYYY-MM'),
            };
            newTransactions.push(newTransaction);
        }

        this.plugin.settings.transactions.push(...newTransactions);
        await this.plugin.saveSettings();
        eventManager.emit('data-changed');
        new Notice('Compra atualizada com sucesso!');
        this.onSaveCallback?.();
        this.close();
    }

}

export class AddPurchaseModal extends Modal {
    plugin: NexusHubPlugin;
    cardId: string;
    private onSaveCallback?: () => void;

    // Form state
    private description: string = '';
    private totalAmount: number = 0;
    private installments: number = 1;
    private purchaseDate: string = moment().format('YYYY-MM-DD');
    private category: string = '';
    private installmentsPaid: number = 0;

    constructor(app: App, plugin: NexusHubPlugin, cardId: string, onSaveCallback?: () => void) {
        super(app);
        this.plugin = plugin;
        this.cardId = cardId;
        this.onSaveCallback = onSaveCallback;

        // MODO DE CRIAÇÃO: Usa valores padrão
        if (this.plugin.settings.categories.length > 0) {
            this.category = this.plugin.settings.categories.find((c: { id: string, name: string }) => c.name === 'Alimentação')?.name || this.plugin.settings.categories[0].name;
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Adicionar Compra Parcelada' });

        new Setting(contentEl).setName('Descrição da Compra').addText(text => text.onChange(val => this.description = val));
        new Setting(contentEl).setName('Valor Total').addText(text => setupCurrencyInput(text, val => this.totalAmount = val));

        new Setting(contentEl).setName('Número de Parcelas').addText(text => {
            text.inputEl.type = 'number';
            text.inputEl.min = '1';
            text.setValue('1').onChange(val => this.installments = parseInt(val) || 1);
        });

        new Setting(contentEl).setName('Data da Compra').addText(text => {
            text.inputEl.type = 'date';
            text.setValue(this.purchaseDate).onChange(val => this.purchaseDate = val);
        });

        new Setting(contentEl).setName('Número de Parcelas Já Pagas').addText(text => {
            text.inputEl.type = 'number';
            text.inputEl.min = '0';
            text.setValue('0').onChange(val => this.installmentsPaid = parseInt(val) || 0);
        });

        renderCategoryDropdown(contentEl, this.plugin, () => this.category, (val) => this.category = val);

        new Setting(contentEl).addButton(btn => btn
            .setButtonText('Salvar Compra')
            .setCta()
            .onClick(() => this.savePurchase()));
    }

    private async savePurchase() {
        if (!this.description || this.totalAmount <= 0 || this.installments <= 0) {
            new Notice('Descrição, valor total e número de parcelas são obrigatórios.');
            return;
        }
        if (this.installmentsPaid >= this.installments) {
            new Notice('O número de parcelas pagas não pode ser maior ou igual ao total de parcelas.');
            return;
        }

        const card = (this.plugin.settings.creditCards || []).find((c: CreditCard) => c.id === this.cardId);
        if (!card) {
            new Notice('Cartão de crédito associado à compra não encontrado.');
            return;
        }

        const purchaseId = `purch_${Date.now()}`;
        const installmentAmount = this.totalAmount / this.installments;
        const newTransactions: Transaction[] = [];

        // Lógica de data definitiva para cálculo de vencimento da fatura.
        // 1. Determina o mês de FECHAMENTO da primeira parcela.
        const purchaseDateMoment = moment(this.purchaseDate);
        let closingMonth = purchaseDateMoment.clone();
        if (purchaseDateMoment.date() > card.closingDay) {
            closingMonth.add(1, 'month');
        }

        // 2. Determina o mês de VENCIMENTO da primeira parcela.
        let firstDueDateMonth = closingMonth.clone();
        if (card.dueDate < card.closingDay) {
            firstDueDateMonth.add(1, 'month');
        }

        // Create ALL installments, from the first to the last
        for (let i = 0; i < this.installments; i++) {
            const installmentNumber = i + 1;
            const targetMonth = firstDueDateMonth.clone().add(i, 'months');
            const daysInTargetMonth = targetMonth.daysInMonth();
            const dueDay = Math.min(card.dueDate, daysInTargetMonth);
            const billDueDate = targetMonth.date(dueDay);

            let paymentMonthForInstallment = billDueDate.clone();
            if (billDueDate.date() < 15) {
                paymentMonthForInstallment.subtract(1, 'month');
            }

            const newTransaction: Transaction = {
                id: `txn_${purchaseId}_${installmentNumber}`,
                description: `${this.description} (${installmentNumber}/${this.installments})`,
                amount: installmentAmount,
                date: billDueDate.format('YYYY-MM-DD'),
                category: this.category,
                type: 'expense',
                // Set status based on how many were already paid
                status: installmentNumber <= this.installmentsPaid ? 'paid' : 'pending',
                isRecurring: false,
                isInstallment: true,
                installmentOf: purchaseId,
                installmentNumber: installmentNumber,
                totalInstallments: this.installments,
                cardId: this.cardId,
                purchaseDate: this.purchaseDate,
                paymentMonth: paymentMonthForInstallment.format('YYYY-MM'),
            };
            newTransactions.push(newTransaction);
        }

        this.plugin.settings.transactions.push(...newTransactions);
        await this.plugin.saveSettings();
        eventManager.emit('data-changed');
        new Notice('Compra parcelada adicionada com sucesso!');
        this.onSaveCallback?.();
        this.close();
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class AccountDetailModal extends Modal {
    plugin: NexusHubPlugin;
    groupKey: string; // description for recurring, installmentOf for installments
    isInstallment: boolean;

    constructor(app: App, plugin: NexusHubPlugin, groupKey: string, isInstallment: boolean) {
        super(app);
        this.plugin = plugin;
        this.groupKey = groupKey;
        this.isInstallment = isInstallment;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        const groupTransactions = this.isInstallment
            ? this.plugin.settings.transactions.filter((transaction: Transaction) => transaction.installmentOf === this.groupKey)
            : this.plugin.settings.transactions.filter((transaction: Transaction) => transaction.description === this.groupKey && transaction.isRecurring);

        if (groupTransactions.length === 0) {
            contentEl.setText('Detalhes da conta não encontrados.');
            return;
        }

        const firstTransaction = groupTransactions[0];
        const mainDescription = this.isInstallment
            ? firstTransaction.description.substring(0, firstTransaction.description.lastIndexOf('(')).trim()
            : firstTransaction.description;

        const header = contentEl.createDiv({ cls: 'modal-header-with-action' });
        header.createEl('h2', { text: mainDescription });
        header.createEl('button', { text: 'Editar' }).addEventListener('click', () => {
            new EditAccountModal(this.app, this.plugin, this.groupKey, this.isInstallment, () => this.onOpen()).open();
        });

        // Botão de Pausar, apenas para transações recorrentes
        if (!this.isInstallment) {
            header.createEl('button', { text: 'Pausar/Retomar' }).addEventListener('click', () => {
                new PauseRecurringModal(this.app, this.plugin, this.groupKey, () => this.onOpen()).open();
            });
        }

        contentEl.createEl('p', { text: `Categoria: ${firstTransaction.category}` });
        if (!this.isInstallment) {
            contentEl.createEl('p', { text: `Valor Mensal: ${formatAsCurrency(firstTransaction.amount)}` });
        }

        contentEl.createEl('h3', { text: 'Pagamentos Futuros' });
        const futureContainer = contentEl.createDiv({ cls: 'payment-list-container' });
        const pending = groupTransactions.filter((transaction: Transaction) => transaction.status === 'pending').sort((a: Transaction, b: Transaction) => moment(a.date).diff(moment(b.date)));
        if (pending.length > 0) {
            pending.forEach((transaction: Transaction) => {
                const name = moment(transaction.date).format('DD/MM/YYYY');
                const desc = transaction.pausedUntil && moment(transaction.pausedUntil).isSameOrAfter(moment(transaction.date), 'day')
                    ? `Pausado até ${moment(transaction.pausedUntil).format('DD/MM/YY')} (${formatAsCurrency(transaction.amount)})`
                    : formatAsCurrency(transaction.amount);
                new Setting(futureContainer).setName(name).setDesc(desc);
            });
        } else {
            futureContainer.createEl('p', { text: 'Nenhum pagamento futuro.', cls: 'mod-subtle' });
        }

        contentEl.createEl('h3', { text: 'Histórico de Pagamentos' });
        const historyContainer = contentEl.createDiv({ cls: 'payment-list-container' });
        const paid = groupTransactions.filter((transaction: Transaction) => transaction.status === 'paid').sort((a: Transaction, b: Transaction) => moment(b.date).diff(moment(a.date)));
        if (paid.length > 0) {
            paid.forEach((transaction: Transaction) => new Setting(historyContainer).setName(moment(transaction.date).format('DD/MM/YYYY')).setDesc(formatAsCurrency(transaction.amount)));
        } else {
            historyContainer.createEl('p', { text: 'Nenhum pagamento no histórico.', cls: 'mod-subtle' });
        }
    }
}

export class EditAccountModal extends Modal {
    plugin: NexusHubPlugin;
    groupKey: string;
    isInstallment: boolean;
    onSave: () => void;

    private newDescription: string;
    private newCategory: string;

    constructor(app: App, plugin: NexusHubPlugin, groupKey: string, isInstallment: boolean, onSave: () => void) {
        super(app);
        this.plugin = plugin;
        this.groupKey = groupKey;
        this.isInstallment = isInstallment;
        this.onSave = onSave;

        const firstTransaction = this.isInstallment
            ? this.plugin.settings.transactions.find((transaction: Transaction) => transaction.installmentOf === this.groupKey)
            : this.plugin.settings.transactions.find((transaction: Transaction) => transaction.description === this.groupKey && transaction.isRecurring);

        if (firstTransaction) {
            this.newDescription = this.isInstallment
                ? firstTransaction.description.substring(0, firstTransaction.description.lastIndexOf('(')).trim()
                : firstTransaction.description;
            this.newCategory = firstTransaction.category;
        } else {
            this.newDescription = "";
            this.newCategory = "";
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: `Editar Grupo: ${this.newDescription}` });

        new Setting(contentEl)
            .setName('Nome do Grupo')
            .addText(text => text
                .setValue(this.newDescription)
                .setDisabled(true)); // Disabling name change for now to avoid complexity

        renderCategoryDropdown(contentEl, this.plugin, () => this.newCategory, (val) => this.newCategory = val);

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Salvar')
                .setCta()
                .onClick(async () => {
                    // Update category for all future transactions in the group
                    this.plugin.settings.transactions.forEach((transaction: Transaction) => {
                        const isMatch = this.isInstallment ? transaction.installmentOf === this.groupKey : (transaction.description === this.groupKey && transaction.isRecurring);
                        if (isMatch && transaction.status === 'pending') {
                            transaction.category = this.newCategory;
                        }
                    });

                    await this.plugin.saveSettings();
                    eventManager.emit('data-changed');
                    this.onSave();
                    this.close();
                }));
    }
}

export class PauseRecurringModal extends Modal {
    plugin: NexusHubPlugin;
    groupKey: string;
    onSave: () => void;
    private pauseUntilDate: string = moment().add(1, 'month').format('YYYY-MM-DD');

    constructor(app: App, plugin: NexusHubPlugin, groupKey: string, onSave: () => void) {
        super(app);
        this.plugin = plugin;
        this.groupKey = groupKey;
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: `Pausar Transação Recorrente: ${this.groupKey}` });
        contentEl.createEl('p', { text: 'Pagamentos recorrentes para este item não serão considerados no cálculo do saldo até a data que você selecionar. Eles não serão apagados.' });

        new Setting(contentEl)
            .setName('Pausar pagamentos até')
            .addText(text => {
                text.inputEl.type = 'date';
                text.setValue(this.pauseUntilDate).onChange(val => this.pauseUntilDate = val);
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Salvar Pausa')
                .setCta()
                .onClick(() => this.savePause()))
            .addButton(btn => btn
                .setButtonText('Remover Pausa')
                .setClass('mod-warning')
                .onClick(() => this.removePause()));
    }

    private async savePause() {
        if (!this.pauseUntilDate) {
            new Notice('Por favor, selecione uma data.');
            return;
        }

        this.plugin.settings.transactions.forEach(transaction => {
            if (transaction.description === this.groupKey && transaction.isRecurring && transaction.status === 'pending') {
                transaction.pausedUntil = this.pauseUntilDate;
            }
        });

        await this.plugin.saveSettings();
        eventManager.emit('data-changed');
        new Notice(`Transações pausadas até ${moment(this.pauseUntilDate).format('DD/MM/YYYY')}.`);
        this.onSave();
        this.close();
    }

    private async removePause() {
        this.plugin.settings.transactions.forEach(transaction => {
            if (transaction.description === this.groupKey && transaction.isRecurring) {
                delete transaction.pausedUntil;
            }
        });

        await this.plugin.saveSettings();
        eventManager.emit('data-changed');
        new Notice('Pausa removida das transações recorrentes.');
        this.onSave();
        this.close();
    }
}

/**
 * Modal de Onboarding para novos usuários.
 */
export class OnboardingModal extends Modal {
    plugin: NexusHubPlugin;
    onSubmit?: () => void;
    userName: string = "";
    monthlyIncome: number = 0;

    constructor(app: App, plugin: NexusHubPlugin, onSubmit?: () => void) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // Pre-fill with existing data for editing
        this.userName = this.plugin.settings.userName || '';

        const isEditing = this.plugin.settings.onboardingComplete;

        if (isEditing) {
            contentEl.createEl("h1", { text: 'Atualizar Informações' });
        } else {
            contentEl.createEl("h1", { text: 'Bem-vindo ao Nexus Hub!' });
            contentEl.createEl("p", { text: 'Vamos começar com algumas informações básicas para personalizar sua experiência.' });
        }

        new Setting(contentEl)
            .setName('Qual é o seu nome?')
            .addText(text =>
                text.setPlaceholder('Seu nome')
                    .setValue(this.userName)
                    .onChange((value) => this.userName = value));

        // Only ask for income during initial onboarding
        if (!isEditing) {
            new Setting(contentEl)
                .setName('Qual é a sua renda mensal líquida principal?')
                .addText(text => {
                    text.setPlaceholder(formatAsCurrency(5000));
                    setupCurrencyInput(text, val => this.monthlyIncome = val);
                });
        }

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText(isEditing ? 'Salvar Alterações' : 'Começar a Usar')
                .setCta()
                .onClick(async () => {
                    if (!this.userName) {
                        new Notice('Por favor, insira seu nome.');
                        return;
                    }
                    if (!isEditing && this.monthlyIncome <= 0) {
                        new Notice('Por favor, insira uma renda válida.');
                        return;
                    }

                    this.plugin.settings.userName = this.userName.trim();

                    if (!isEditing) {
                        this.plugin.settings.onboardingComplete = true;
                        this.createRecurringIncome();
                    }

                    await this.plugin.saveSettings();
                    eventManager.emit('data-changed');
                    if (this.onSubmit) {
                        this.onSubmit();
                    }
                    this.close();
                }));
    }

    private createRecurringIncome() {
        const newTransactions: Transaction[] = [];
        const incomeDay = 5; // Dia padrão para o recebimento da renda
        let startDate = moment().startOf('month');
        const finalDate = moment().add(5, 'years');


        let currentDate = startDate.clone();

        while (currentDate.isBefore(finalDate)) {
            const transactionDate = currentDate.clone().date(incomeDay);
            const transaction: Transaction = {
                id: `txn_income_${currentDate.format('YYYY-MM')}`,
                description: 'Renda Mensal',
                amount: this.monthlyIncome,
                date: transactionDate.format('YYYY-MM-DD'),
                category: 'Salário',
                type: 'income',
                status: 'pending',
                isRecurring: true,
                recurrenceRule: 'monthly',
                isInstallment: false,
            };
            newTransactions.push(transaction);
            currentDate.add(1, 'month');
        }
        this.plugin.settings.transactions.push(...newTransactions);
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class EmergencyFundModal extends Modal {
    plugin: NexusHubPlugin;

    constructor(app: App, plugin: NexusHubPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Fundo de Emergência' });
        contentEl.createEl('p', { text: 'Gerencie seu fundo de emergência, faça depósitos, retiradas e configure contribuições mensais.' });

        const balance = this.plugin.settings.emergencyFund.currentBalance;
        contentEl.createDiv({ text: `Saldo Atual: ${formatAsCurrency(balance)}`, cls: 'emergency-fund-balance' });

        contentEl.createEl('hr');

        // --- Configuration Section ---
        contentEl.createEl('h3', { text: 'Configuração' });

        let monthlyContribution = this.plugin.settings.emergencyFund.monthlyContribution;
        let isEnabled = this.plugin.settings.emergencyFund.isEnabled;

        new Setting(contentEl)
            .setName('Contribuição Mensal Automática')
            .setDesc('O valor que será automaticamente agendado como uma despesa todo mês para contribuir com seu fundo.')
            .addText(text => setupCurrencyInput(text, val => monthlyContribution = val, monthlyContribution || 100));

        new Setting(contentEl)
            .setName('Ativar Contribuição Automática')
            .addToggle(toggle => toggle
                .setValue(isEnabled)
                .onChange(value => {
                    isEnabled = value;
                }));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Salvar Configuração')
                .setCta()
                .onClick(async () => {
                    const wasEnabled = this.plugin.settings.emergencyFund.isEnabled;
                    this.plugin.settings.emergencyFund.monthlyContribution = monthlyContribution;
                    this.plugin.settings.emergencyFund.isEnabled = isEnabled;
                    await this.updateRecurringContributionTransaction(isEnabled, wasEnabled, monthlyContribution);
                    eventManager.emit('data-changed');
                    this.onOpen();
                }));

        contentEl.createEl('hr');

        // --- Transaction Section ---
        contentEl.createEl('h3', { text: 'Fazer uma Transação Manual' });
        let transactionAmount = 0;

        new Setting(contentEl)
            .setName('Valor da Transação')
            .addText(text => {
                setupCurrencyInput(text, val => transactionAmount = val, 50);
            });

        const transactionActions = new Setting(contentEl);
        transactionActions.addButton(btn => btn
            .setButtonText('Depositar')
            .onClick(async () => {
                if (transactionAmount > 0) {
                    this.plugin.settings.emergencyFund.currentBalance += transactionAmount;
                    this.plugin.settings.emergencyFund.history.push({
                        date: new Date().toISOString(),
                        type: 'deposit',
                        amount: transactionAmount,
                        balanceAfter: this.plugin.settings.emergencyFund.currentBalance
                    });
                    await this.plugin.saveSettings();
                    eventManager.emit('data-changed');
                    new Notice(`Depositado ${formatAsCurrency(transactionAmount)} no fundo de emergência.`);
                    this.onOpen(); // Re-render modal
                } else {
                    new Notice('O valor da transação deve ser maior que zero.');
                }
            }));

        transactionActions.addButton(btn => btn
            .setButtonText('Retirar')
            .setClass('mod-warning')
            .onClick(async () => {
                if (transactionAmount > 0) {
                    if (this.plugin.settings.emergencyFund.currentBalance >= transactionAmount) {
                        // 1. Subtrai do saldo da reserva
                        this.plugin.settings.emergencyFund.currentBalance -= transactionAmount;
                        this.plugin.settings.emergencyFund.history.push({
                            date: new Date().toISOString(),
                            type: 'withdrawal',
                            amount: transactionAmount,
                            balanceAfter: this.plugin.settings.emergencyFund.currentBalance
                        });

                        // 2. Cria uma transação de renda para refletir no orçamento
                        const withdrawalTransaction: Transaction = {
                            id: `txn_ef_wd_${Date.now()}`,
                            description: 'Retirada do Fundo de Emergência',
                            amount: transactionAmount,
                            date: moment().format('YYYY-MM-DD'), // Data da retirada é hoje
                            category: 'Renda Extra',
                            type: 'income',
                            status: 'paid', // Dinheiro já recebido
                            isRecurring: false,
                            isInstallment: false,
                        };
                        this.plugin.settings.transactions.push(withdrawalTransaction);

                        await this.plugin.saveSettings();
                        eventManager.emit('data-changed');
                        new Notice(`Retirado ${formatAsCurrency(transactionAmount)} do fundo de emergência.`);
                        this.onOpen(); // Re-render modal
                    } else {
                        new Notice('Saldo insuficiente no fundo de emergência.');
                    }
                } else {
                    new Notice('O valor da transação deve ser maior que zero.');
                }
            }));

        contentEl.createEl('hr');

        // --- History Section ---
        contentEl.createEl('h3', { text: 'Histórico de Transações' });
        const historyContainer = contentEl.createDiv({ cls: 'emergency-fund-history' });

        const history = [...(this.plugin.settings.emergencyFund.history || [])].reverse(); // Show most recent first

        if (history.length === 0) {
            historyContainer.createEl('p', { text: 'Nenhuma transação registrada no fundo de emergência.', cls: 'mod-subtle' });
        } else {
            history.forEach(item => {
                const itemEl = historyContainer.createDiv({ cls: 'history-item' });

                const mainInfo = itemEl.createDiv({ cls: 'history-main-info' });
                mainInfo.createDiv({ cls: 'history-date', text: moment(item.date).format('DD/MM/YY') });
                mainInfo.createDiv({ cls: `history-type ${item.type}`, text: item.type === 'deposit' ? 'Depósito' : 'Retirada' });
                mainInfo.createDiv({ cls: 'history-amount', text: formatAsCurrency(item.amount) });
                if (item.reason) {
                    itemEl.createDiv({ cls: 'history-reason', text: item.reason });
                }
            });
        }
    }

    private async updateRecurringContributionTransaction(isEnabled: boolean, wasEnabled: boolean, amount: number) {
        const description = 'Aporte para Fundo de Emergência';

        // 1. Remove todas as transações futuras pendentes para a reserva de emergência para evitar duplicatas.
        this.plugin.settings.transactions = this.plugin.settings.transactions.filter(transaction =>
            !(transaction.description === description && transaction.isRecurring && transaction.status === 'pending' && moment(transaction.date).isSameOrAfter(moment(), 'day'))
        );

        // Se a configuração não mudou e o valor é o mesmo, não faz nada.
        if (isEnabled === wasEnabled && amount === this.plugin.settings.emergencyFund.monthlyContribution) {
            return;
        }

        // 2. Se estiver ativado e com um valor válido, cria as novas transações recorrentes.
        if (isEnabled && amount > 0) {
            const newTransactions: Transaction[] = [];
            const contributionDay = 15; // Dia padrão para a contribuição
            let startDate = moment().startOf('month');
            const finalDate = moment().add(5, 'years');

            // Se o dia da contribuição no mês atual já passou, começa a partir do próximo mês.
            if (moment().date() > contributionDay) {
                startDate.add(1, 'month');
            }

            let currentDate = startDate.clone();

            while (currentDate.isBefore(finalDate)) {
                const transactionDate = currentDate.clone().date(contributionDay);

                const transaction: Transaction = {
                    id: `txn_ef_${currentDate.format('YYYY-MM')}`,
                    description: description,
                    amount: amount,
                    date: transactionDate.format('YYYY-MM-DD'),
                    category: "Investimentos", // Usa a mesma categoria das metas
                    type: 'expense',
                    status: 'pending',
                    isRecurring: true,
                    recurrenceRule: 'monthly',
                    isInstallment: false,
                };
                newTransactions.push(transaction);
                currentDate.add(1, 'month');
            }
            this.plugin.settings.transactions.push(...newTransactions);
            await this.plugin.saveSettings();
            new Notice(`Contribuição mensal de ${formatAsCurrency(amount)} para o fundo de emergência foi agendada.`);
        } else {
            await this.plugin.saveSettings();
            new Notice('A contribuição mensal para o fundo de emergência foi desativada.');
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class NexusScoreHistoryModal extends Modal {
    plugin: NexusHubPlugin;

    constructor(app: App, plugin: NexusHubPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Histórico de Nexus Score' });

        const currentScoreEl = contentEl.createDiv({ cls: 'nexus-score-current-display' });
        currentScoreEl.createSpan({ text: 'Pontuação Atual' });
        currentScoreEl.createSpan({ text: String(this.plugin.settings.nexusScore) });

        contentEl.createEl('hr');

        const historyContainer = contentEl.createDiv({ cls: 'nexus-score-history-list' });
        const history = [...(this.plugin.settings.scoreHistory || [])].reverse(); // Mostra os mais recentes primeiro

        if (history.length === 0) {
            historyContainer.createEl('p', { text: 'Nenhum histórico de pontuação encontrado.', cls: 'mod-subtle' });
        } else {
            history.forEach((item: { date: string; points: number; reason: string; currentScore: number; }) => {
                const itemEl = historyContainer.createDiv({ cls: 'score-history-item' });

                const infoEl = itemEl.createDiv();
                infoEl.createDiv({ text: item.reason, cls: 'score-reason' });
                infoEl.createDiv({ text: moment(item.date).format('DD/MM/YYYY HH:mm'), cls: 'score-date' });

                const pointsEl = itemEl.createDiv({
                    text: item.points > 0 ? `+${item.points}` : String(item.points),
                    cls: `score-points ${item.points > 0 ? 'positive' : 'negative'}`
                });
            });
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class ResetConfirmationModal extends Modal {
    plugin: NexusHubPlugin;

    constructor(app: App, plugin: NexusHubPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Resetar Todos os Dados' });
        contentEl.createEl('p', { text: 'Esta ação é irreversível e apagará todas as suas transações, metas, orçamentos e configurações. Seu progresso será perdido.' });

        const keyword = 'resetar';
        contentEl.createEl('p', { text: `Para confirmar, por favor, digite "${keyword}" no campo abaixo.` });

        let inputText = '';
        new Setting(contentEl)
            .setName('Confirmação')
            .addText(text => text
                .setPlaceholder(keyword as string)
                .onChange(value => inputText = value));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Cancelar')
                .onClick(() => this.close()))
            .addButton(btn => btn
                .setButtonText('Confirmar Reset')
                .setClass('mod-warning')
                .setCta()
                .onClick(async () => {
                    if (inputText.toLowerCase() === (keyword as string).toLowerCase()) {
                        await this.plugin.resetAllData();
                        this.close();
                    } else {
                        new Notice('A palavra-chave de confirmação está incorreta.');
                    }
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class ManageCategoriesModal extends Modal {
    plugin: NexusHubPlugin;

    constructor(app: App, plugin: NexusHubPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Gerenciar Categorias' });

        // Seção para adicionar nova categoria
        contentEl.createEl('h3', { text: 'Adicionar Nova Categoria' });
        let newCategoryName = '';
        new Setting(contentEl)
            .setName('Nome da Nova Categoria')
            .addText(text => text
                .setPlaceholder('Ex: Lazer, Saúde')
                .onChange(value => newCategoryName = value.trim()))
            .addButton(btn => btn
                .setButtonText('Adicionar Categoria')
                .setCta()
                .onClick(async () => {
                    if (newCategoryName) {
                        if (!(this.plugin.settings.categories || []).find(c => c.name.toLowerCase() === newCategoryName.toLowerCase())) {
                            const newCategory: Category = { id: `cat_${Date.now()}`, name: newCategoryName };
                            if (!this.plugin.settings.categories) {
                                this.plugin.settings.categories = [];
                            }
                            this.plugin.settings.categories.push(newCategory);
                            await this.plugin.saveSettings();
                            eventManager.emit('data-changed');
                            this.onOpen(); // Re-render the modal
                        } else {
                            new Notice('Esta categoria já existe.');
                        }
                    }
                }));

        contentEl.createEl('hr');

        // Seção de categorias existentes
        contentEl.createEl('h3', { text: 'Categorias Existentes' });
        const categoriesContainer = contentEl.createDiv();

        if ((this.plugin.settings.categories || []).length === 0) {
            categoriesContainer.createEl('p', { text: 'Nenhuma categoria personalizada encontrada.' });
        } else {
            (this.plugin.settings.categories || []).forEach(category => {
                new Setting(categoriesContainer)
                    .setName(category.name)
                    .addButton(btn => btn
                        .setIcon('trash')
                        .setTooltip('Apagar Categoria')
                        .setClass('mod-warning')
                        .onClick(async () => {
                            new ConfirmationModal(
                                this.app,
                                'Apagar Categoria',
                                `Tem certeza que deseja apagar a categoria '${category.name}'? Todas as transações associadas serão movidas para 'Sem Categoria'.`,
                                async () => {
                                    let uncategorized = (this.plugin.settings.categories || []).find(c => c.name === 'Sem Categoria');
                                    if (!uncategorized) {
                                        uncategorized = { id: `cat_uncategorized`, name: 'Sem Categoria' };
                                        if (!this.plugin.settings.categories) {
                                            this.plugin.settings.categories = [];
                                        }
                                        this.plugin.settings.categories.push(uncategorized);
                                    }

                                    this.plugin.settings.transactions.forEach(transaction => {
                                        if (transaction.category === category.name) {
                                            transaction.category = uncategorized!.name;
                                        }
                                    });

                                    this.plugin.settings.categories = (this.plugin.settings.categories || []).filter(c => c.id !== category.id);
                                    await this.plugin.saveSettings();
                                    eventManager.emit('data-changed');
                                    this.onOpen(); // Re-render
                                }
                            ).open();
                        }));
            });
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class EditTransactionModal extends Modal {
    plugin: NexusHubPlugin;
    transaction: Transaction;
    onSubmit: () => void;

    private description: string;
    private amount: number;
    private date: string;
    private category: string;

    constructor(app: App, plugin: NexusHubPlugin, transaction: Transaction, onSubmit: () => void) {
        super(app);
        this.plugin = plugin;
        this.transaction = transaction;
        this.onSubmit = onSubmit;

        this.description = this.transaction.description;
        this.amount = this.transaction.amount;
        this.date = this.transaction.date;
        this.category = this.transaction.category;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Editar Transação' });

        new Setting(contentEl)
            .setName('Descrição')
            .addText(text => text
                .setValue(this.description)
                .onChange(value => this.description = value));

        new Setting(contentEl)
            .setName('Valor')
            .addText(text => setupCurrencyInput(text, val => this.amount = val, this.amount));

        new Setting(contentEl)
            .setName('Data')
            .addText(text => {
                text.inputEl.type = 'date';
                text.setValue(this.date).onChange(val => this.date = val);
            });

        renderCategoryDropdown(contentEl, this.plugin, () => this.category, (val) => this.category = val);

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Salvar')
                .setCta()
                .onClick(async () => {
                    const transactionToUpdate = this.plugin.settings.transactions.find(t => t.id === this.transaction.id);
                    if (transactionToUpdate) {
                        transactionToUpdate.description = this.description;
                        transactionToUpdate.amount = this.amount;
                        transactionToUpdate.date = this.date;
                        transactionToUpdate.category = this.category;

                        await this.plugin.saveSettings();
                        eventManager.emit('data-changed');
                        this.onSubmit();
                        this.close();
                    }
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class UpdateSalaryModal extends Modal {
    plugin: NexusHubPlugin;
    private newSalary: number;

    constructor(app: App, plugin: NexusHubPlugin) {
        super(app);
        this.plugin = plugin;
        this.newSalary = this.plugin.settings.salarioLiquido || 0;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Atualizar Salário do Mês' });
        contentEl.createEl('p', { text: 'Seu salário mudou este mês? Atualize o valor para que os cálculos fiquem corretos.' });

        new Setting(contentEl)
            .setName('Novo Salário Líquido para este Mês')
            .setDesc(`O valor padrão é ${formatAsCurrency(this.plugin.settings.salarioLiquido)}. Se não preencher, este será usado.`)
            .addText(text => {
                setupCurrencyInput(text, val => this.newSalary = val, this.newSalary);
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Salvar Novo Salário')
                .setCta()
                .onClick(async () => {
                    if (this.newSalary > 0) {
                        await this.plugin.salaryManager.updateCurrentMonthSalary(this.newSalary);
                        this.plugin.settings.lastSalaryUpdatePromptMonth = moment().format('YYYY-MM');
                        await this.plugin.saveSettings(); // Save the prompt month
                        eventManager.emit('data-changed');
                        new Notice('Salário do mês atualizado com sucesso!');
                        this.close();
                    } else {
                        new Notice('O valor do salário deve ser maior que zero.');
                    }
                }))
            .addButton(btn => btn
                .setButtonText('Usar Valor Padrão')
                .onClick(async () => {
                    await this.plugin.salaryManager.updateCurrentMonthSalary(); // No amount override
                    this.plugin.settings.lastSalaryUpdatePromptMonth = moment().format('YYYY-MM');
                    await this.plugin.saveSettings();
                    eventManager.emit('data-changed');
                    new Notice('Salário padrão do mês foi aplicado.');
                    this.close();
                }))
            .addButton(btn => btn
                .setButtonText('Pular este Mês')
                .onClick(async () => {
                    this.plugin.settings.lastSalaryUpdatePromptMonth = moment().format('YYYY-MM');
                    await this.plugin.saveSettings();
                    this.close();
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}

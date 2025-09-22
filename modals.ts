import { Modal, Setting, Notice, App, setIcon } from 'obsidian';
import { moment } from 'obsidian';
import { t } from './lang';
import { Transaction, Goal, CreditCard } from './settings';
import type NexusHubPlugin from './main';
import { formatAsCurrency, calculateCardBill, suggestCategory, parseCurrency } from './helpers';
import { eventManager } from './EventManager';
import { setupCurrencyInput, renderCategoryDropdown, ConfirmationModal } from './ui-helpers';
import type { TextComponent } from 'obsidian';
import { ALL_ACHIEVEMENTS } from './achievements';

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
        contentEl.createEl('h2', { text: t('MODAL_GOALS_TITLE') });

        const goalTypeDisplayText = this.filter === 'Saving' ? t('GOAL_TYPE_SAVING') : (this.filter === 'Debt' ? t('GOAL_TYPE_DEBT') : undefined);
        const emptyText = goalTypeDisplayText ? t('MODAL_GOALS_EMPTY_FILTERED', { goalType: goalTypeDisplayText }) : t('MODAL_GOALS_EMPTY_ALL');
        const createButtonText = this.filter === 'Debt' ? t('MODAL_GOALS_CREATE_DEBT_GROUP') : t('MODAL_GOALS_CREATE_NEW');

        const goalsToDisplay = this.filter !== 'All'
            ? this.plugin.settings.goals.filter(g => g.goalType === this.filter)
            : this.plugin.settings.goals;

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
                const progressText = `${formatAsCurrency(current)} ${t('MODAL_GOALS_PROGRESS_OF')} ${formatAsCurrency(target)} (${percentage}%)`;
                goalCard.createEl('p', { text: progressText, cls: 'progress-text' });

                // Apenas metas de 'Economizar Dinheiro' podem ter contribuições manuais
                if (goal.goalType === 'Saving') {
                    const contributionContainer = goalCard.createDiv({ cls: 'contribution-container' });
                    const amountInput = contributionContainer.createEl('input', { type: 'number', placeholder: t('MODAL_GOALS_CONTRIBUTION_VALUE') });
                    const contributeButton = contributionContainer.createEl('button', { text: t('MODAL_GOALS_CONTRIBUTE_BUTTON') });

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
                                this.plugin.increaseNexusScore(50, t('NEXUS_SCORE_REASON_SAVING_GOAL_COMPLETED', { goalName: goal.name }));
                                new Notice(t('MODAL_GOALS_COMPLETED_NOTICE', { goalName: goal.name }));
                            }

                            await this.plugin.saveSettings();
                            eventManager.emit('data-changed');
                            this.onOpen(); // Re-render the modal
                        }
                    });
                }

                const actionsContainer = goalCard.createDiv({ cls: 'goal-actions-container' });
                const editButton = actionsContainer.createEl('button', { text: t('MODAL_EDIT_BUTTON') });
                editButton.addEventListener('click', () => {
                    new CreateEditGoalModal(this.app, this.plugin, () => this.onOpen(), goal).open();
                    this.close();
                });

                const deleteButton = actionsContainer.createEl('button', { text: t('MODAL_DELETE_BUTTON'), cls: 'mod-warning' });
                deleteButton.addEventListener('click', async () => {
                    new ConfirmationModal(
                        this.app,
                        t('MODAL_GOALS_DELETE_TITLE'),
                        t('MODAL_GOALS_DELETE_CONFIRM', { goalName: goal.name }),
                        async () => {
                            this.plugin.settings.goals = this.plugin.settings.goals.filter(g => g.id !== goal.id);
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
        contentEl.createEl('h2', { text: t('MODAL_ACHIEVEMENTS_TITLE') });

        const achievementsContainer = contentEl.createDiv({ cls: 'achievements-container' });

        const userAchievements = new Map(this.plugin.settings.achievements.map(a => [a.id, a]));

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

            if (isUnlocked) {
                infoEl.createEl('span', { 
                    text: t('MODAL_ACHIEVEMENTS_UNLOCKED_ON', { date: moment(userAchievement.unlockedDate).format('DD/MM/YYYY') }),
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
        contentEl.createEl('h2', { text: t('MODAL_ADD_CARD_TITLE') });

        let name = '', limit = 0, closingDay = 0, dueDate = 0;

        new Setting(contentEl).setName(t('MODAL_ADD_CARD_NAME')).addText(text => text.onChange(val => name = val.trim()));
        new Setting(contentEl).setName(t('MODAL_ADD_CARD_LIMIT')).addText(text => setupCurrencyInput(text, val => limit = val));
        new Setting(contentEl).setName(t('MODAL_ADD_CARD_CLOSING_DAY')).addText(text => {
            text.inputEl.type = 'number'; text.inputEl.min = '1'; text.inputEl.max = '31';
            text.onChange(val => closingDay = parseInt(val) || 0);
        });
        new Setting(contentEl).setName(t('MODAL_ADD_CARD_DUE_DAY')).addText(text => {
            text.inputEl.type = 'number'; text.inputEl.min = '1'; text.inputEl.max = '31';
            text.onChange(val => dueDate = parseInt(val) || 0);
        });

        new Setting(contentEl).addButton(btn => btn
            .setButtonText(t('MODAL_ADD_CARD_SAVE_BUTTON'))
            .setCta()
            .onClick(async () => {
                if (name && limit > 0 && closingDay >= 1 && closingDay <= 31 && dueDate >= 1 && dueDate <= 31) {
                    const newCard: CreditCard = { id: `cc_${Date.now()}`, name, limit, closingDay, dueDate };
                    this.plugin.settings.creditCards.push(newCard);
                    await this.plugin.saveSettings();
                    eventManager.emit('data-changed');
                    this.onSubmit(); // Recarrega o modal anterior
                    this.close();
                } else { new Notice(t('MODAL_ADD_CARD_INVALID_FIELDS_NOTICE')); }
            }));
    }
    
    onClose() { this.contentEl.empty(); }
}

export class ManageCreditCardsModal extends Modal {
    plugin: NexusHubPlugin;

    constructor(app: App, plugin: NexusHubPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('MODAL_MANAGE_CARDS_TITLE') });

        // --- SEÇÃO DE LISTAGEM DE CARTÕES ---
        const cardsListContainer = contentEl.createDiv({ cls: 'cards-list-container' });
        const creditCards = this.plugin.settings.creditCards;

        if (creditCards.length === 0) {
            cardsListContainer.createEl('p', { text: t('MODAL_MANAGE_CARDS_EMPTY') });
        } else {
            creditCards.forEach(card => {
                const cardItem = cardsListContainer.createDiv({ cls: 'credit-card-item' });
                
                const cardInfo = cardItem.createDiv({ cls: 'card-info' });
                cardInfo.createEl('span', { text: card.name, cls: 'card-name' });
                cardInfo.createEl('span', { text: t('MODAL_MANAGE_CARDS_LIMIT_LABEL', { limit: formatAsCurrency(card.limit) }), cls: 'card-limit' });

                const cardActions = cardItem.createDiv({ cls: 'card-actions' });
                
                // BOTÃO EXPLÍCITO PARA DETALHAR FATURA
                cardActions.createEl('button', { text: t('MODAL_MANAGE_CARDS_DETAILS_BUTTON') })
                    .addEventListener('click', () => {
                        // Ao abrir a partir daqui, queremos ver a próxima fatura a vencer.
                        const today = moment();
                        let billMonth = moment();
                        // Se a data de hoje já passou do dia de fechamento, a "próxima fatura" é a do mês seguinte.
                        if (today.date() > card.closingDay) {
                            billMonth.add(1, 'month');
                        }
                        new CardBillDetailModal(this.app, this.plugin, card.id, billMonth).open();
                        this.close();
                    });

                const deleteButton = cardActions.createEl('button', { cls: 'mod-warning' });
                setIcon(deleteButton, 'trash-2'); // Usa um ícone de lixeira
                deleteButton.addEventListener('click', async () => {
                    new ConfirmationModal(
                        this.app,
                        t('MODAL_MANAGE_CARDS_DELETE_TITLE'),
                        t('MODAL_MANAGE_CARDS_DELETE_CONFIRM', { cardName: card.name }),
                        async () => {
                            this.plugin.settings.creditCards = this.plugin.settings.creditCards.filter(c => c.id !== card.id);
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
            .setName(t('MODAL_MANAGE_CARDS_ADD_NEW_TITLE'))
            .setDesc(t('MODAL_MANAGE_CARDS_ADD_NEW_DESC'))
            .addButton(button => {
                button.setButtonText(t('MODAL_MANAGE_CARDS_ADD_NEW_BUTTON'))
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
    private monthlyIncome: number;

    constructor(app: App, plugin: NexusHubPlugin) {
        super(app);
        this.plugin = plugin;
        this.userName = this.plugin.settings.userName;
        
        // Find the latest recurring income transaction to get the most recent salary value.
        const allRecurringIncomes = this.plugin.settings.transactions
            .filter(transaction => transaction.type === 'income' && transaction.isRecurring)
            .sort((a, b) => moment(b.date).diff(moment(a.date))); // Sort descending by date

        const lastKnownIncome = allRecurringIncomes.length > 0 ? allRecurringIncomes[0] : undefined;
        this.monthlyIncome = lastKnownIncome ? lastKnownIncome.amount : 0;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('MODAL_EDIT_PROFILE_TITLE') });

        new Setting(contentEl)
            .setName(t('MODAL_EDIT_PROFILE_NAME'))
            .addText(text => text
                .setValue(this.userName)
                .onChange(value => this.userName = value));

        new Setting(contentEl)
            .setName(t('MODAL_EDIT_PROFILE_INCOME'))
            .addText(text => {
                text.setPlaceholder(formatAsCurrency(5000));
                setupCurrencyInput(text, val => this.monthlyIncome = val, this.monthlyIncome);
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText(t('MODAL_SAVE_BUTTON'))
                .setCta()
                .onClick(async () => {
                    this.plugin.settings.userName = this.userName.trim();
                    
                    const pendingIncomeTransactions = this.plugin.settings.transactions.filter(transaction => 
                        transaction.type === 'income' && transaction.isRecurring && transaction.status === 'pending'
                    );

                    if (pendingIncomeTransactions.length > 0) {
                        // Update all future recurring income transactions
                        pendingIncomeTransactions.forEach(transaction => {
                            transaction.amount = this.monthlyIncome;
                        });
                    } else {
                        this.createRecurringIncome();
                    }

                    await this.plugin.saveSettings();

                    eventManager.emit('data-changed');
                    this.close();
                }));
    }

    private createRecurringIncome() {
        const newTransactions: Transaction[] = [];
        const incomeDay = 5; // Dia padrão para o recebimento da renda
        let startDate = moment().startOf('month');
        const finalDate = moment().add(5, 'years');

        // Se o dia do pagamento no mês atual já passou, começa a criar a partir do próximo mês.
        if (moment().date() > incomeDay) {
            startDate.add(1, 'month');
        }

        let currentDate = startDate.clone();

        while(currentDate.isBefore(finalDate)) {
            const transactionDate = currentDate.clone().date(incomeDay);
            
            
            const transaction: Transaction = {
                id: `txn_income_${currentDate.format('YYYY-MM')}`,
                description: t('TRANSACTION_MONTHLY_INCOME'),
                amount: this.monthlyIncome,
                date: transactionDate.format('YYYY-MM-DD'),
                category: t('CATEGORY_SALARY'),
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
        contentEl.createEl('h2', { text: t('MODAL_EXTRA_INCOME_TITLE') });
        contentEl.createEl('p', { text: t('MODAL_EXTRA_INCOME_DESC', { monthYear: this.currentMonth.format('MMMM YYYY') }), cls: 'mod-subtle' });

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
                        .setTooltip(t('MODAL_EXTRA_INCOME_DELETE_TOOLTIP'))
                        .setClass('mod-warning')
                        .onClick(async () => {
                            new ConfirmationModal(
                                this.app,
                                t('MODAL_EXTRA_INCOME_DELETE_TITLE'),
                                t('MODAL_EXTRA_INCOME_DELETE_CONFIRM', { incomeName: income.description }),
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
            listContainer.createEl('p', { text: t('MODAL_EXTRA_INCOME_EMPTY'), cls: 'mod-subtle' });
        }

        contentEl.createEl('hr');

        // --- Form to add new extra income ---
        contentEl.createEl('h3', { text: t('MODAL_EXTRA_INCOME_ADD_NEW_TITLE') });
        let description = '';
        let amount = 0;
        let date = this.currentMonth.clone().startOf('month').format('YYYY-MM-DD');

        new Setting(contentEl).setName(t('MODAL_EXTRA_INCOME_DESCRIPTION')).addText(text => text.setPlaceholder(t('MODAL_EXTRA_INCOME_DESCRIPTION_PLACEHOLDER')).onChange(val => description = val.trim()));
        new Setting(contentEl).setName(t('MODAL_EXTRA_INCOME_VALUE')).addText(text => setupCurrencyInput(text, val => amount = val));
        new Setting(contentEl).setName(t('MODAL_EXTRA_INCOME_DATE')).addText(text => {
            text.inputEl.type = 'date';
            text.setValue(date).onChange(val => date = val);
        });

        new Setting(contentEl).addButton(btn => btn
            .setButtonText(t('MODAL_EXTRA_INCOME_ADD_BUTTON'))
            .setCta()
            .onClick(async () => {
                if (!description || amount <= 0) {
                    new Notice(t('MODAL_EXTRA_INCOME_REQUIRED_FIELDS_NOTICE'));
                    return;
                }
                const newIncome: Transaction = {
                    id: `txn_extra_${Date.now()}`, description, amount, date,
                    category: t('CATEGORY_EXTRA_INCOME'), type: 'income', status: 'pending',
                    isRecurring: false, isInstallment: false,
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
        contentEl.createEl('h2', { text: t('MODAL_MANAGE_BUDGETS_TITLE') });

        // --- Seção 1: Orçamentos Existentes ---
        contentEl.createEl('h3', { text: t('MODAL_MANAGE_BUDGETS_EXISTING_HEADER') });
        const existingBudgetsContainer = contentEl.createDiv();
        const existingBudgets = this.plugin.settings.budgets;

        if (existingBudgets.length === 0) {
            existingBudgetsContainer.createEl('p', { text: t('MODAL_MANAGE_BUDGETS_NO_BUDGETS'), cls: 'mod-subtle' });
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
                                this.plugin.settings.budgets = this.plugin.settings.budgets.filter(b => b.categoryId !== budget.categoryId);
                                await this.plugin.saveSettings();
                                eventManager.emit('data-changed');
                                this.onOpen(); // Re-render
                            }
                        });
                    })
                    .addButton(btn => {
                        btn.setIcon('trash')
                            .setTooltip(t('MODAL_MANAGE_BUDGETS_DELETE_TOOLTIP'))
                            .setClass('mod-warning')
                            .onClick(async () => {
                                this.plugin.settings.budgets = this.plugin.settings.budgets.filter(b => b.categoryId !== budget.categoryId);
                                await this.plugin.saveSettings();
                                eventManager.emit('data-changed');
                                this.onOpen(); // Re-render
                            });
                    });
            });
        }

        contentEl.createEl('hr');

        // --- Seção 2: Adicionar Novo Orçamento ---
        contentEl.createEl('h3', { text: t('MODAL_MANAGE_BUDGETS_ADD_NEW_HEADER') });
        const addBudgetContainer = contentEl.createDiv();

        const budgetedCategoryIds = new Set(existingBudgets.map(b => b.categoryId));
        const availableCategories = this.plugin.settings.categories.filter(c =>
            !budgetedCategoryIds.has(c.id) &&
            c.name !== t('CATEGORY_SALARY') &&
            c.name !== t('CATEGORY_EXTRA_INCOME')
        );

        if (availableCategories.length === 0) {
            addBudgetContainer.createEl('p', { text: t('MODAL_MANAGE_BUDGETS_NO_MORE_CATEGORIES'), cls: 'mod-subtle' });
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
                text.setPlaceholder(t('MODAL_MANAGE_BUDGETS_AMOUNT_PLACEHOLDER'));
                setupCurrencyInput(text, val => newBudgetAmount = val);
            })
            .addButton(btn => {
                btn.setButtonText(t('MODAL_MANAGE_BUDGETS_ADD_BUTTON'))
                    .setCta()
                    .onClick(async () => {
                        if (newBudgetAmount > 0 && newBudgetCategoryId) {
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

    // Single
    private date: string = moment().format("YYYY-MM-DD");

    // Recurring
    private dayOfMonthDue: number = 1;
    private hasEndDate: boolean = false;
    private endDate: string = ''; // YYYY-MM-DD

	constructor(app: App, plugin: NexusHubPlugin, onSubmit: () => void, transactionToDuplicate?: Transaction) {
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
        } else {
            // Default state for a new transaction
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
        contentEl.createEl("h2", { text: t('MODAL_ADD_TRANSACTION_TITLE') });

        // Main Toggle
        const recurringOptionsContainer = contentEl.createDiv();
        const singleOptionsContainer = contentEl.createDiv();

        new Setting(contentEl)
            .setName(t('MODAL_ADD_TRANSACTION_IS_RECURRING'))
            .addToggle(toggle => toggle
                .setValue(this.isRecurring)
                .onChange(value => {
                    this.isRecurring = value;
                    recurringOptionsContainer.toggleClass('is-hidden', !value);
                    singleOptionsContainer.toggleClass('is-hidden', value);
                }));

        // Container for single transaction options
        singleOptionsContainer.toggleClass('is-hidden', this.isRecurring);
        this.renderSingleTransactionOptions(singleOptionsContainer);

        // Container for recurring/installment options
        recurringOptionsContainer.toggleClass('is-hidden', !this.isRecurring);
        this.renderRecurringSubOptions(recurringOptionsContainer);
        
        // Common Fields (that are truly common)
        new Setting(contentEl)
            .setName(t('MODAL_ADD_TRANSACTION_VALUE'))
            .addText(text => {
                setupCurrencyInput(text, val => this.amount = val, this.amount);
            });

        renderCategoryDropdown(contentEl, this.plugin, () => this.category, (val) => this.category = val);
        
        // Save button
        new Setting(contentEl)
            .addButton(btn => btn.setButtonText(t('MODAL_SAVE_BUTTON')).setCta().onClick(() => this.saveTransaction()));
    }

    private renderSingleTransactionOptions(container: HTMLElement) {
        container.empty();
        
        // Dropdown for description as requested for "Variable Expense"
        const nameSetting = new Setting(container).setName(t('MODAL_ADD_TRANSACTION_DESCRIPTION'));
        const otherNameInput = new Setting(container).setName(t('MODAL_ADD_TRANSACTION_OTHER_DESCRIPTION')).addText(text => text.setValue(this.description).onChange(val => this.description = val));
    
        nameSetting.addDropdown(dd => {
            const standardOptions = [t('MODAL_ADD_TRANSACTION_STANDARD_OPTION_LIGHT'), t('MODAL_ADD_TRANSACTION_STANDARD_OPTION_WATER'), t('MODAL_ADD_TRANSACTION_STANDARD_OPTION_GAS'), t('MODAL_ADD_TRANSACTION_STANDARD_OPTION_INTERNET')];
            standardOptions.forEach(opt => dd.addOption(opt, opt));
            dd.addOption('__OTHER__', t('MODAL_ADD_TRANSACTION_OTHER_OPTION'));

            // Pre-select based on duplicated transaction or default
            const isStandard = standardOptions.includes(this.description);
            if (this.description && !isStandard) {
                dd.setValue('__OTHER__');
                otherNameInput.settingEl.removeClass('is-hidden');
            } else {
                dd.setValue(this.description || t('MODAL_ADD_TRANSACTION_STANDARD_OPTION_LIGHT'));
                otherNameInput.settingEl.addClass('is-hidden');
                if (!this.description) this.handleDescriptionChange(t('MODAL_ADD_TRANSACTION_STANDARD_OPTION_LIGHT')); // Set initial value and try to categorize
            }

            dd.onChange(val => {
                if (val !== '__OTHER__') {
                    this.handleDescriptionChange(val);
                    otherNameInput.settingEl.addClass('is-hidden');
                } else {
                    this.description = '';
                    otherNameInput.settingEl.removeClass('is-hidden');
                    (otherNameInput.components[0] as TextComponent).inputEl.focus();
                }
            });
        });

        (otherNameInput.components[0] as TextComponent).inputEl.addEventListener('blur', () => {
            this.handleDescriptionChange((otherNameInput.components[0] as TextComponent).getValue());
        });
    
        // Date picker
        new Setting(container)
            .setName(t('MODAL_ADD_TRANSACTION_DUE_DATE'))
            .addText(text => {
                text.inputEl.type = 'date';
                text.setValue(this.date).onChange(value => this.date = value);
            });
    }

    private renderRecurringSubOptions(container: HTMLElement) {
        container.empty();
        new Setting(container).setName(t('MODAL_ADD_TRANSACTION_DESCRIPTION')).addText(text => {
            text.setPlaceholder(t('MODAL_ADD_TRANSACTION_RECURRING_DESC_PLACEHOLDER'))
                .onChange(value => this.description = value);
            
            text.inputEl.addEventListener('blur', () => this.handleDescriptionChange(text.getValue()));
        });
        
        new Setting(container).setName(t('MODAL_ADD_TRANSACTION_RECURRING_DUE_DAY')).addText(text => {
            text.inputEl.type = 'number';
            text.inputEl.min = '1';
            text.inputEl.max = '31';
            text.setValue(String(this.dayOfMonthDue));
            text.onChange(val => this.dayOfMonthDue = parseInt(val) || 1);
        });

        const endDateSetting = new Setting(container).setName(t('MODAL_ADD_TRANSACTION_RECURRING_END_DATE')).addText(text => {
            text.inputEl.type = 'date'; // YYYY-MM-DD
            text.onChange(val => this.endDate = val);
        });
        endDateSetting.settingEl.toggleClass('is-hidden', !this.hasEndDate);

        new Setting(container).setName(t('MODAL_ADD_TRANSACTION_RECURRING_HAS_END_DATE')).addToggle(toggle => toggle
            .setValue(this.hasEndDate)
            .onChange(val => {
                this.hasEndDate = val;
                endDateSetting.settingEl.toggleClass('is-hidden', !val);
            }));
    }

    private async saveTransaction() {
        if (!this.description || this.amount <= 0) {
            new Notice(t('MODAL_ADD_TRANSACTION_REQUIRED_FIELDS_NOTICE'));
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
            };
            newTransactions.push(transaction);
        } else { // Recurring Transaction
            const startDate = moment().startOf('month');
            const finalDate = this.hasEndDate && this.endDate ? moment(this.endDate) : moment().add(5, 'years');
            let currentDate = startDate.clone();

            while(currentDate.isBefore(finalDate) || currentDate.isSame(finalDate, 'month')) {
                const transactionDate = currentDate.clone().date(this.dayOfMonthDue);
                // Evita criar transações no passado se a data de início for a atual
                if (transactionDate.isBefore(moment(), 'day') && currentDate.isSame(moment(), 'month')) {
                    currentDate.add(1, 'month');
                    continue;
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
                };
                newTransactions.push(transaction);
                currentDate.add(1, 'month');
            }
        }

        this.plugin.settings.transactions.push(...newTransactions);
        await this.plugin.saveSettings();
        eventManager.emit('data-changed');
        new Notice(t('MODAL_ADD_TRANSACTION_SUCCESS_NOTICE'));
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
            contentEl.createEl('h2', { text: t('MODAL_CREATE_EDIT_GOAL_EDIT_TITLE', { goalName: this.goalName }) });
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
        contentEl.createEl('h2', { text: t('MODAL_CREATE_EDIT_GOAL_NEW_TITLE') });

        const choiceContainer = contentEl.createDiv({ cls: 'goal-type-choice-container' });

        const savingCard = choiceContainer.createDiv({ cls: 'goal-type-card' });
        savingCard.createEl('h3', { text: t('MODAL_CREATE_EDIT_GOAL_TYPE_SAVING_TITLE') });
        savingCard.createEl('p', { text: t('MODAL_CREATE_EDIT_GOAL_TYPE_SAVING_DESC') });
        savingCard.addEventListener('click', () => {
            this.goalType = 'Saving';
            this.step = 2;
            this.renderStep();
        });

        const debtCard = choiceContainer.createDiv({ cls: 'goal-type-card' });
        debtCard.createEl('h3', { text: t('MODAL_CREATE_EDIT_GOAL_TYPE_DEBT_TITLE') });
        debtCard.createEl('p', { text: t('MODAL_CREATE_EDIT_GOAL_TYPE_DEBT_DESC') });
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
            .setName(t('MODAL_CREATE_EDIT_GOAL_NAME'))
            .addText(text => text
                .setPlaceholder(t('MODAL_CREATE_EDIT_GOAL_NAME_PLACEHOLDER'))
                .setValue(this.goalName)
                .onChange(val => this.goalName = val));

        if (this.goalType === 'Saving') {
            new Setting(contentEl)
                .setName(t('MODAL_CREATE_EDIT_GOAL_TARGET_AMOUNT'))
                .addText(text => {
                    text.inputEl.type = 'number';
                    text.setValue(String(this.totalValue))
                        .onChange(val => this.totalValue = parseFloat(val) || 0);
                });

            new Setting(contentEl)
                .setName(t('MODAL_CREATE_EDIT_GOAL_TARGET_DATE'))
                .addText(text => {
                    text.inputEl.type = 'date';
                    text.setValue(this.targetDate)
                        .onChange(val => this.targetDate = val);
                });
        } else if (this.goalType === 'Debt') {
            contentEl.createEl('h3', { text: t('MODAL_CREATE_EDIT_GOAL_GROUP_DEBTS_TITLE') });
            contentEl.createEl('p', { text: t('MODAL_CREATE_EDIT_GOAL_GROUP_DEBTS_DESC') });

            const accountsContainer = contentEl.createDiv({ cls: 'goal-accounts-list' });

            const installmentGroups = this.plugin.settings.transactions
                .filter(transaction => transaction.isInstallment && transaction.installmentOf)
                .reduce((acc, t) => {
                    if (!acc.has(t.installmentOf!)) {
                        const baseDescription = t.description.substring(0, t.description.lastIndexOf(' ('));
                        const totalAmount = t.amount * t.totalInstallments!;
                        acc.set(t.installmentOf!, { description: baseDescription, total: totalAmount });
                    }
                    return acc;
                }, new Map<string, { description: string, total: number }>());

            if (installmentGroups.size === 0) {
                accountsContainer.createEl('p', { text: t('MODAL_CREATE_EDIT_GOAL_NO_INSTALLMENTS_FOUND'), cls: 'mod-subtle' });
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
            ? t('MODAL_CREATE_EDIT_GOAL_SAVE_CHANGES_BUTTON') 
            : (this.goalType === 'Debt' ? t('MODAL_CREATE_EDIT_GOAL_CREATE_DEBT_BUTTON') : t('MODAL_CREATE_EDIT_GOAL_CREATE_SAVING_BUTTON'));
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText(buttonText)
                .setCta()
                .onClick(() => this.saveGoal()));
    }

    private async saveGoal() {
        if (!this.goalName) {
            new Notice(t('MODAL_CREATE_EDIT_GOAL_INCOMPLETE_NOTICE'));
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
                    const totalInstallments = relatedInstallments[0].totalInstallments!;
                    calculatedTarget += installmentAmount * totalInstallments;
                    const paidCount = relatedInstallments.filter(tx => tx.status === 'paid').length;
                    calculatedCurrent += paidCount * installmentAmount;
                }
            });
        }

        if (this.goal) { // Editing existing goal
            const goalToUpdate = this.plugin.settings.goals.find(g => g.id === this.goal!.id);
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
            contentEl.createEl('h2', { text: t('MODAL_PURCHASE_DETAIL_ERROR_TITLE') });
            contentEl.createEl('p', { text: t('MODAL_PURCHASE_DETAIL_NOT_FOUND') });
            return;
        }

        const firstInstallment = allInstallments[0];
        const baseDescription = firstInstallment.description.substring(0, firstInstallment.description.lastIndexOf(' (')).trim();
        const totalAmount = firstInstallment.amount * (firstInstallment.totalInstallments || 1);

        contentEl.createEl('h2', { text: baseDescription });
        new Setting(contentEl)
            .setName(t('MODAL_PURCHASE_DETAIL_TOTAL_AMOUNT'))
            .setDesc(formatAsCurrency(totalAmount));
        new Setting(contentEl)
            .setName(t('MODAL_PURCHASE_DETAIL_CATEGORY'))
            .setDesc(firstInstallment.category);
        new Setting(contentEl)
            .setName(t('MODAL_PURCHASE_DETAIL_TOTAL_INSTALLMENTS'))
            .setDesc(String(firstInstallment.totalInstallments || 1));
        
        contentEl.createEl('hr');
        contentEl.createEl('h3', { text: t('MODAL_PURCHASE_DETAIL_INSTALLMENTS_TITLE') });

        const installmentsContainer = contentEl.createDiv({ cls: 'installments-list-container' });
        allInstallments.forEach((installment: Transaction) => {
            const item = new Setting(installmentsContainer)
                .setName(installment.description)
                .setDesc(t('MODAL_PURCHASE_DETAIL_DUE_DATE', { date: moment(installment.date).format('DD/MM/YYYY') }));
            
            item.controlEl.createSpan({
                text: installment.status === 'paid' ? t('STATUS_PAID') : t('STATUS_PENDING'),
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


        const card = this.plugin.settings.creditCards.find(c => c.id === this.cardId);
        if (!card) {
            contentEl.setText(t('MODAL_CARD_BILL_NOT_FOUND'));
            return;
        }

        contentEl.createEl('h2', { text: t('MODAL_CARD_BILL_TITLE', { cardName: card.name }) });
        
        // Usa o mês que foi passado pelo construtor para garantir consistência com a view principal.
        const bill = calculateCardBill(card, this.plugin.settings.transactions, this.currentMonth);
        const { total: billTotal, dueDate: billDueDate, transactions: transactionsForBill } = bill;

        contentEl.createEl('p', { text: t('MODAL_CARD_BILL_HEADER', { monthYear: this.currentMonth.format('MMMM YYYY'), dueDate: billDueDate.format('DD/MM'), total: formatAsCurrency(billTotal) }) });

        // --- List transactions in the bill ---
        if (transactionsForBill.length > 0) {
            const billItemsContainer = contentEl.createDiv({ cls: 'payment-list-container' });
            billItemsContainer.createEl('h4', { text: t('MODAL_CARD_BILL_ITEMS_TITLE') });
            transactionsForBill.forEach((transaction: Transaction) => {
                const itemSetting = new Setting(billItemsContainer)

                    .setName(transaction.description)
                    .setDesc(formatAsCurrency(transaction.amount));

                // Adiciona botão de Editar
                itemSetting.addButton(btn => btn
                    .setIcon('pencil')
                    .setTooltip(t('MODAL_CARD_BILL_EDIT_PURCHASE_TOOLTIP'))
                    .onClick(() => {
                        if (!transaction.isInstallment || !transaction.installmentOf) {
                            new Notice(t('MODAL_CARD_BILL_EDIT_ONLY_INSTALLMENTS_NOTICE'));
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
                            new Notice(t('MODAL_CARD_BILL_EDIT_ORIGINAL_NOT_FOUND_NOTICE'));
                        }
                    }));

                // Adiciona botão de Apagar
                itemSetting.addButton(btn => btn
                    .setIcon('trash')
                    .setTooltip(t('MODAL_CARD_BILL_DELETE_PURCHASE_TOOLTIP'))
                    .setClass('mod-warning')
                    .onClick(async () => {
                        if (!transaction.installmentOf) {
                            new Notice(t('MODAL_CARD_BILL_DELETE_ONLY_INSTALLMENTS_NOTICE'));
                            return;
                        }
                        const baseDescription = transaction.description.substring(0, transaction.description.lastIndexOf(' ('));
                        new ConfirmationModal(
                            this.app,
                            t('MODAL_CARD_BILL_DELETE_TITLE'),
                            t('MODAL_CARD_BILL_DELETE_CONFIRM', { purchaseName: baseDescription }),
                            async () => {
                                const purchaseId = transaction.installmentOf!;
                                this.plugin.settings.transactions = this.plugin.settings.transactions.filter(
                                    trans => trans.installmentOf !== purchaseId
                                );
                                await this.plugin.saveSettings();
                                eventManager.emit('data-changed');
                                this.onOpen(); // Recarrega o modal para refletir a exclusão
                            }
                        ).open();
                    }));
            });
        } else {
            contentEl.createEl('p', { text: t('MODAL_CARD_BILL_EMPTY', { monthYear: this.currentMonth.format('MMMM YYYY') }), cls: 'mod-subtle' });
        }

        contentEl.createEl('hr');

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText(t('MODAL_CARD_BILL_ADD_PURCHASE_BUTTON'))
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
        this.cardId = firstInstallment.cardId!;

        // Pre-populate form state
        const purchaseGroup = this.plugin.settings.transactions.filter((transaction: Transaction) => transaction.installmentOf === this.firstInstallment.installmentOf);
        
        this.description = this.firstInstallment.description.substring(0, this.firstInstallment.description.lastIndexOf(' ('));
        this.totalAmount = this.firstInstallment.amount * this.firstInstallment.totalInstallments!;
        this.installments = this.firstInstallment.totalInstallments!;
        this.purchaseDate = this.firstInstallment.purchaseDate || moment().format('YYYY-MM-DD');
        this.category = this.firstInstallment.category;
        this.installmentsPaid = purchaseGroup.filter((transaction: Transaction) => transaction.status === 'paid').length;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('MODAL_EDIT_PURCHASE_TITLE') });

        new Setting(contentEl).setName(t('MODAL_EDIT_PURCHASE_DESCRIPTION')).addText(text => text.setValue(this.description).onChange(val => this.description = val));
        
        new Setting(contentEl).setName(t('MODAL_EDIT_PURCHASE_TOTAL_AMOUNT')).addText(text => {
            setupCurrencyInput(text, val => this.totalAmount = val, this.totalAmount);
        });
        
        new Setting(contentEl).setName(t('MODAL_EDIT_PURCHASE_TOTAL_INSTALLMENTS')).addText(text => {
            text.inputEl.type = 'number';
            text.inputEl.min = '1';
            text.setValue(String(this.installments)).onChange(val => this.installments = parseInt(val) || 1);
        });

        new Setting(contentEl).setName(t('MODAL_EDIT_PURCHASE_DATE')).addText(text => {
            text.inputEl.type = 'date';
            text.setValue(this.purchaseDate).onChange(val => this.purchaseDate = val);
        });

        new Setting(contentEl).setName(t('MODAL_EDIT_PURCHASE_INSTALLMENTS_PAID')).addText(text => {
            text.inputEl.type = 'number';
            text.inputEl.min = '0';
            text.setValue(String(this.installmentsPaid));
            text.setDisabled(true); // Non-editable
        });

        renderCategoryDropdown(contentEl, this.plugin, () => this.category, (val) => this.category = val);

        new Setting(contentEl).addButton(btn => btn
            .setButtonText(t('MODAL_EDIT_PURCHASE_SAVE_BUTTON'))
            .setCta()
            .onClick(() => this.saveChanges()));
    }

    private async saveChanges() {
        if (!this.description || this.totalAmount <= 0 || this.installments <= 0) {
            new Notice(t('MODAL_EDIT_PURCHASE_REQUIRED_FIELDS_NOTICE'));
            return;
        }
        if (this.installmentsPaid >= this.installments) {
            new Notice(t('MODAL_EDIT_PURCHASE_PAID_EXCEEDS_TOTAL_NOTICE'));
            return;
        }

        // 1. Remove ALL existing transactions for this purchase to ensure consistency
        const purchaseId = this.firstInstallment.installmentOf!;
        this.plugin.settings.transactions = this.plugin.settings.transactions.filter((transaction: Transaction) => 
            transaction.installmentOf !== purchaseId
        );

        // 2. Re-generate all installments from scratch with the new, correct data
        const card = this.plugin.settings.creditCards.find((c: CreditCard) => c.id === this.cardId);
        if (!card) {
            new Notice(t('MODAL_EDIT_PURCHASE_CARD_NOT_FOUND_NOTICE'));
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
            };
            newTransactions.push(newTransaction);
        }

        this.plugin.settings.transactions.push(...newTransactions);
        await this.plugin.saveSettings();
        eventManager.emit('data-changed');
        new Notice(t('MODAL_EDIT_PURCHASE_SUCCESS_NOTICE'));
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
            this.category = this.plugin.settings.categories.find((c: {id: string, name: string}) => c.name === 'Alimentação')?.name || this.plugin.settings.categories[0].name;
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('MODAL_ADD_PURCHASE_TITLE') });

        new Setting(contentEl).setName(t('MODAL_EDIT_PURCHASE_DESCRIPTION')).addText(text => text.onChange(val => this.description = val));
        new Setting(contentEl).setName(t('MODAL_EDIT_PURCHASE_TOTAL_AMOUNT')).addText(text => setupCurrencyInput(text, val => this.totalAmount = val));
        
        new Setting(contentEl).setName(t('MODAL_EDIT_PURCHASE_TOTAL_INSTALLMENTS')).addText(text => {
            text.inputEl.type = 'number';
            text.inputEl.min = '1';
            text.setValue('1').onChange(val => this.installments = parseInt(val) || 1);
        });

        new Setting(contentEl).setName(t('MODAL_EDIT_PURCHASE_DATE')).addText(text => {
            text.inputEl.type = 'date';
            text.setValue(this.purchaseDate).onChange(val => this.purchaseDate = val);
        });

        new Setting(contentEl).setName(t('MODAL_ADD_PURCHASE_INSTALLMENTS_PAID')).addText(text => {
            text.inputEl.type = 'number';
            text.inputEl.min = '0';
            text.setValue('0').onChange(val => this.installmentsPaid = parseInt(val) || 0);
        });

        renderCategoryDropdown(contentEl, this.plugin, () => this.category, (val) => this.category = val);

        new Setting(contentEl).addButton(btn => btn
            .setButtonText(t('MODAL_ADD_PURCHASE_SAVE_BUTTON'))
            .setCta()
            .onClick(() => this.savePurchase()));
    }

    private async savePurchase() {
        if (!this.description || this.totalAmount <= 0 || this.installments <= 0) {
            new Notice(t('MODAL_EDIT_PURCHASE_REQUIRED_FIELDS_NOTICE'));
            return;
        }
        if (this.installmentsPaid >= this.installments) {
            new Notice(t('MODAL_EDIT_PURCHASE_PAID_EXCEEDS_TOTAL_NOTICE'));
            return;
        }

        const card = this.plugin.settings.creditCards.find((c: CreditCard) => c.id === this.cardId);
        if (!card) {
            new Notice(t('MODAL_EDIT_PURCHASE_CARD_NOT_FOUND_NOTICE'));
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
            };
            newTransactions.push(newTransaction);
        }

        this.plugin.settings.transactions.push(...newTransactions);
        await this.plugin.saveSettings();
        eventManager.emit('data-changed');
        new Notice(t('MODAL_ADD_PURCHASE_SUCCESS_NOTICE'));
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
            contentEl.setText(t('MODAL_ACCOUNT_DETAIL_NOT_FOUND'));
            return;
        }

        const firstTransaction = groupTransactions[0];
        const mainDescription = this.isInstallment 
            ? firstTransaction.description.substring(0, firstTransaction.description.lastIndexOf('(')).trim()
            : firstTransaction.description;

        const header = contentEl.createDiv({ cls: 'modal-header-with-action' });
        header.createEl('h2', { text: mainDescription });
        header.createEl('button', { text: t('MODAL_ACCOUNT_DETAIL_EDIT_BUTTON') }).addEventListener('click', () => {
            new EditAccountModal(this.app, this.plugin, this.groupKey, this.isInstallment, () => this.onOpen()).open();
        });

        // Botão de Pausar, apenas para transações recorrentes
        if (!this.isInstallment) {
            header.createEl('button', { text: t('MODAL_ACCOUNT_DETAIL_PAUSE_BUTTON') }).addEventListener('click', () => {
                new PauseRecurringModal(this.app, this.plugin, this.groupKey, () => this.onOpen()).open();
            });
        }

        contentEl.createEl('p', { text: t('MODAL_ACCOUNT_DETAIL_CATEGORY', { category: firstTransaction.category }) });
        if (!this.isInstallment) {
            contentEl.createEl('p', { text: t('MODAL_ACCOUNT_DETAIL_MONTHLY_AMOUNT', { amount: formatAsCurrency(firstTransaction.amount) }) });
        }

        contentEl.createEl('h3', { text: t('MODAL_ACCOUNT_DETAIL_FUTURE_PAYMENTS') });
        const futureContainer = contentEl.createDiv({ cls: 'payment-list-container' });
        const pending = groupTransactions.filter((transaction: Transaction) => transaction.status === 'pending').sort((a: Transaction, b: Transaction) => moment(a.date).diff(moment(b.date)));
        if (pending.length > 0) {
            pending.forEach((transaction: Transaction) => {
                const name = moment(transaction.date).format('DD/MM/YYYY');
                const desc = transaction.pausedUntil && moment(transaction.pausedUntil).isSameOrAfter(moment(transaction.date), 'day')
                    ? t('MODAL_ACCOUNT_DETAIL_PAUSED_UNTIL', { amount: formatAsCurrency(transaction.amount), date: moment(transaction.pausedUntil).format('DD/MM/YY') })
                    : formatAsCurrency(transaction.amount);
                new Setting(futureContainer).setName(name).setDesc(desc);
            });
        } else {
            futureContainer.createEl('p', { text: t('MODAL_ACCOUNT_DETAIL_NO_FUTURE_PAYMENTS'), cls: 'mod-subtle' });
        }

        contentEl.createEl('h3', { text: t('MODAL_ACCOUNT_DETAIL_PAYMENT_HISTORY') });
        const historyContainer = contentEl.createDiv({ cls: 'payment-list-container' });
        const paid = groupTransactions.filter((transaction: Transaction) => transaction.status === 'paid').sort((a: Transaction, b: Transaction) => moment(b.date).diff(moment(a.date)));
        if (paid.length > 0) {
            paid.forEach((transaction: Transaction) => new Setting(historyContainer).setName(moment(transaction.date).format('DD/MM/YYYY')).setDesc(formatAsCurrency(transaction.amount)));
        } else {
            historyContainer.createEl('p', { text: t('MODAL_ACCOUNT_DETAIL_NO_PAYMENT_HISTORY'), cls: 'mod-subtle' });
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
        contentEl.createEl('h2', { text: t('MODAL_EDIT_ACCOUNT_TITLE', { groupName: this.newDescription }) });

        new Setting(contentEl)
            .setName(t('MODAL_EDIT_ACCOUNT_GROUP_NAME'))
            .addText(text => text
                .setValue(this.newDescription)
                .setDisabled(true)); // Disabling name change for now to avoid complexity

        renderCategoryDropdown(contentEl, this.plugin, () => this.newCategory, (val) => this.newCategory = val);

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText(t('MODAL_SAVE_BUTTON'))
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
        contentEl.createEl('h2', { text: t('MODAL_PAUSE_RECURRING_TITLE', { groupName: this.groupKey }) });
        contentEl.createEl('p', { text: t('MODAL_PAUSE_RECURRING_DESC') });

        new Setting(contentEl)
            .setName(t('MODAL_PAUSE_RECURRING_DATE_LABEL'))
            .addText(text => {
                text.inputEl.type = 'date';
                text.setValue(this.pauseUntilDate).onChange(val => this.pauseUntilDate = val);
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText(t('MODAL_PAUSE_RECURRING_SAVE_BUTTON'))
                .setCta()
                .onClick(() => this.savePause()))
            .addButton(btn => btn
                .setButtonText(t('MODAL_PAUSE_RECURRING_REMOVE_BUTTON'))
                .setClass('mod-warning')
                .onClick(() => this.removePause()));
    }

    private async savePause() {
        if (!this.pauseUntilDate) {
            new Notice(t('MODAL_PAUSE_RECURRING_DATE_REQUIRED_NOTICE'));
            return;
        }

        this.plugin.settings.transactions.forEach(transaction => {
            if (transaction.description === this.groupKey && transaction.isRecurring && transaction.status === 'pending') {
                transaction.pausedUntil = this.pauseUntilDate;
            }
        });

        await this.plugin.saveSettings();
        eventManager.emit('data-changed');
        new Notice(t('MODAL_PAUSE_RECURRING_SUCCESS_NOTICE', { date: moment(this.pauseUntilDate).format('DD/MM/YYYY') }));
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
        new Notice(t('MODAL_PAUSE_RECURRING_REMOVED_NOTICE'));
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
        this.userName = this.plugin.settings.userName;

        const isEditing = this.plugin.settings.onboardingComplete;

        if (isEditing) {
            contentEl.createEl("h1", { text: t('MODAL_ONBOARDING_UPDATE_TITLE') });
        } else {
            contentEl.createEl("h1", { text: t('MODAL_ONBOARDING_WELCOME_TITLE') });
            contentEl.createEl("p", { text: t('MODAL_ONBOARDING_WELCOME_DESC') });
        }

        new Setting(contentEl)
            .setName(t('MODAL_ONBOARDING_NAME_LABEL'))
            .addText(text =>
                text.setPlaceholder(t('MODAL_ONBOARDING_NAME_PLACEHOLDER'))
                    .setValue(this.userName)
                    .onChange((value) => this.userName = value));

        // Only ask for income during initial onboarding
        if (!isEditing) {
            new Setting(contentEl)
                .setName(t('MODAL_ONBOARDING_INCOME_LABEL'))
                .addText(text => {
                    text.setPlaceholder(formatAsCurrency(5000));
                setupCurrencyInput(text, val => this.monthlyIncome = val);
                });
        }

        new Setting(contentEl)
            .addButton(button => button
                    .setButtonText(isEditing ? t('MODAL_ONBOARDING_SAVE_BUTTON') : t('MODAL_ONBOARDING_START_BUTTON'))
                    .setCta()
                    .onClick(async () => {
                        if (!this.userName) {
                            new Notice(t('MODAL_ONBOARDING_NAME_REQUIRED_NOTICE'));
                            return;
                        }
                        if (!isEditing && this.monthlyIncome <= 0) {
                            new Notice(t('MODAL_ONBOARDING_INCOME_REQUIRED_NOTICE'));
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

        // Se o dia do pagamento no mês atual já passou, começa a criar a partir do próximo mês.
        if (moment().date() > incomeDay) {
            startDate.add(1, 'month');
        }

        let currentDate = startDate.clone();

        while(currentDate.isBefore(finalDate)) {
            const transactionDate = currentDate.clone().date(incomeDay);
            const transaction: Transaction = {
                id: `txn_income_${currentDate.format('YYYY-MM')}`,
                description: t('TRANSACTION_MONTHLY_INCOME'),
                amount: this.monthlyIncome,
                date: transactionDate.format('YYYY-MM-DD'),
                category: t('CATEGORY_SALARY'),
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

        contentEl.createEl('h2', { text: t('MODAL_EMERGENCY_FUND_TITLE') });
        contentEl.createEl('p', { text: t('MODAL_EMERGENCY_FUND_DESC') });

        const balance = this.plugin.settings.emergencyFund.currentBalance;
        contentEl.createDiv({ text: t('MODAL_EMERGENCY_FUND_BALANCE', { balance: formatAsCurrency(balance) }), cls: 'emergency-fund-balance' });

        contentEl.createEl('hr');

        // --- Configuration Section ---
        contentEl.createEl('h3', { text: t('MODAL_EMERGENCY_FUND_CONFIG_TITLE') });

        let monthlyContribution = this.plugin.settings.emergencyFund.monthlyContribution;
        let isEnabled = this.plugin.settings.emergencyFund.isEnabled;

        new Setting(contentEl)
            .setName(t('MODAL_EMERGENCY_FUND_CONTRIBUTION_LABEL'))
            .setDesc(t('MODAL_EMERGENCY_FUND_CONTRIBUTION_DESC'))
            .addText(text => setupCurrencyInput(text, val => monthlyContribution = val, monthlyContribution || 100));
        
        new Setting(contentEl)
            .setName(t('MODAL_EMERGENCY_FUND_ENABLE_LABEL'))
            .addToggle(toggle => toggle
                .setValue(isEnabled)
                .onChange(value => {
                    isEnabled = value;
                }));
        
        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText(t('MODAL_EMERGENCY_FUND_SAVE_CONFIG_BUTTON'))
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
        contentEl.createEl('h3', { text: t('MODAL_EMERGENCY_FUND_TRANSACTION_TITLE') });
        let transactionAmount = 0;

        new Setting(contentEl)
            .setName(t('MODAL_EMERGENCY_FUND_TRANSACTION_AMOUNT_LABEL'))
            .addText(text => {
                setupCurrencyInput(text, val => transactionAmount = val, 50);
            });

        const transactionActions = new Setting(contentEl);
        transactionActions.addButton(btn => btn
            .setButtonText(t('MODAL_EMERGENCY_FUND_DEPOSIT_BUTTON'))
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
                    new Notice(t('MODAL_EMERGENCY_FUND_DEPOSIT_SUCCESS_NOTICE', { amount: formatAsCurrency(transactionAmount) }));
                    this.onOpen(); // Re-render modal
                } else {
                    new Notice(t('MODAL_EMERGENCY_FUND_INVALID_AMOUNT_NOTICE'));
                }
            }));
        
        transactionActions.addButton(btn => btn
            .setButtonText(t('MODAL_EMERGENCY_FUND_WITHDRAW_BUTTON'))
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
                            description: t('TRANSACTION_EMERGENCY_FUND_WITHDRAWAL'),
                            amount: transactionAmount,
                            date: moment().format('YYYY-MM-DD'), // Data da retirada é hoje
                            category: t('CATEGORY_EXTRA_INCOME'),
                            type: 'income',
                            status: 'paid', // Dinheiro já recebido
                            isRecurring: false,
                            isInstallment: false,
                        };
                        this.plugin.settings.transactions.push(withdrawalTransaction);

                        await this.plugin.saveSettings();
                        eventManager.emit('data-changed');
                        new Notice(t('MODAL_EMERGENCY_FUND_WITHDRAW_SUCCESS_NOTICE', { amount: formatAsCurrency(transactionAmount) }));
                        this.onOpen(); // Re-render modal
                    } else {
                        new Notice(t('MODAL_EMERGENCY_FUND_INSUFFICIENT_FUNDS_NOTICE'));
                    }
                } else {
                    new Notice(t('MODAL_EMERGENCY_FUND_INVALID_AMOUNT_NOTICE'));
                }
            }));

        contentEl.createEl('hr');

        // --- History Section ---
        contentEl.createEl('h3', { text: t('MODAL_EMERGENCY_FUND_HISTORY_TITLE') });
        const historyContainer = contentEl.createDiv({ cls: 'emergency-fund-history' });

        const history = [...this.plugin.settings.emergencyFund.history].reverse(); // Show most recent first

        if (history.length === 0) {
            historyContainer.createEl('p', { text: t('MODAL_EMERGENCY_FUND_HISTORY_EMPTY'), cls: 'mod-subtle' });
        } else {
            history.forEach(item => {
                const itemEl = historyContainer.createDiv({ cls: 'history-item' });

                const mainInfo = itemEl.createDiv({ cls: 'history-main-info' });
                mainInfo.createDiv({ cls: 'history-date', text: moment(item.date).format('DD/MM/YY') });
                mainInfo.createDiv({ cls: `history-type ${item.type}`, text: item.type === 'deposit' ? t('MODAL_EMERGENCY_FUND_HISTORY_TYPE_DEPOSIT') : t('MODAL_EMERGENCY_FUND_HISTORY_TYPE_WITHDRAWAL') });
                mainInfo.createDiv({ cls: 'history-amount', text: formatAsCurrency(item.amount) });
                if (item.reason) {
                    itemEl.createDiv({ cls: 'history-reason', text: item.reason });
                }
            });
        }
    }

    private async updateRecurringContributionTransaction(isEnabled: boolean, wasEnabled: boolean, amount: number) {
        const description = t('TRANSACTION_EMERGENCY_FUND_CONTRIBUTION');

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

            while(currentDate.isBefore(finalDate)) {
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
            new Notice(t('MODAL_EMERGENCY_FUND_CONTRIBUTION_SCHEDULED_NOTICE', { amount: formatAsCurrency(amount) }));
        } else {
            await this.plugin.saveSettings();
            new Notice(t('MODAL_EMERGENCY_FUND_CONTRIBUTION_DISABLED_NOTICE'));
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

        contentEl.createEl('h2', { text: t('MODAL_NEXUS_SCORE_HISTORY_TITLE') });

        const currentScoreEl = contentEl.createDiv({ cls: 'nexus-score-current-display' });
        currentScoreEl.createSpan({ text: t('MODAL_NEXUS_SCORE_HISTORY_CURRENT_SCORE') });
        currentScoreEl.createSpan({ text: String(this.plugin.settings.nexusScore) });

        contentEl.createEl('hr');

        const historyContainer = contentEl.createDiv({ cls: 'nexus-score-history-list' });
        const history = [...this.plugin.settings.scoreHistory].reverse(); // Mostra os mais recentes primeiro

        if (history.length === 0) {
            historyContainer.createEl('p', { text: t('MODAL_NEXUS_SCORE_HISTORY_EMPTY'), cls: 'mod-subtle' });
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
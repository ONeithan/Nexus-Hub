
import { Modal, App, Setting, Notice, setIcon, TextComponent } from 'obsidian';
import moment from 'moment';
import * as XLSX from 'xlsx';

import { Transaction, Goal, CreditCard, Category, NexusHubSettings, DEFAULT_SETTINGS } from '../views/settings';
import type NexusHubPlugin from '../main';
import { formatAsCurrency, calculateCardBill, suggestCategory, parseCurrency } from '../helpers/helpers';
import { eventManager } from '../helpers/EventManager';
import { setupCurrencyInput, renderCategoryDropdown, ConfirmationModal } from '../helpers/ui-helpers';
import { ALL_ACHIEVEMENTS } from '../services/achievements';

// ===================================================================
// MODAL DEFINITIONS
// ===================================================================

// Forward declare to solve dependency loop if needed, though ordering is preferred.
let CreateEditGoalModal: any;

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

                if (goal.goalType === 'Saving') {
                    const contributionContainer = goalCard.createDiv({ cls: 'contribution-container' });
                    const amountInput = contributionContainer.createEl('input', { type: 'number', placeholder: 'Valor da contribuição' });
                    const contributeButton = contributionContainer.createEl('button', { text: 'Contribuir' });

                    contributeButton.addEventListener('click', async () => {
                        const amountValue = parseFloat(amountInput.value);
                        if (!isNaN(amountValue) && amountValue > 0) {
                            goal.currentAmount += amountValue;
                            if (!goal.history) goal.history = [];
                            goal.history.push({ date: new Date().toISOString(), amount: amountValue, balanceAfter: goal.currentAmount });
                            if (!goal.completed && goal.currentAmount >= goal.targetAmount) {
                                goal.completed = true;
                                this.plugin.increaseNexusScore(50, `Meta de economia '${goal.name}' concluída!`);
                                new Notice(`Parabéns! Você completou sua meta de economia '${goal.name}'!`);
                            }
                            await this.plugin.saveSettings();
                            eventManager.emit('data-changed');
                            this.onOpen();
                        }
                    });
                }

                const actionsContainer = goalCard.createDiv({ cls: 'goal-actions-container' });
                actionsContainer.createEl('button', { text: 'Editar' }).addEventListener('click', () => {
                    new CreateEditGoalModal(this.app, this.plugin, () => this.onOpen(), goal).open();
                    this.close();
                });
                actionsContainer.createEl('button', { text: 'Apagar', cls: 'mod-warning' }).addEventListener('click', async () => {
                    new ConfirmationModal(this.app, 'Apagar Meta', `Tem certeza que deseja apagar a meta '${goal.name}'? Esta ação não pode ser desfeita.`, async () => {
                        this.plugin.settings.goals = (this.plugin.settings.goals || []).filter(g => g.id !== goal.id);
                        await this.plugin.saveSettings();
                        eventManager.emit('data-changed');
                        this.onOpen();
                    }).open();
                });
            });
        }

        const isDebtPanel = this.filter === 'Debt';
        const goalTypeToCreate = isDebtPanel ? 'Debt' : (this.filter === 'Saving' ? 'Saving' : undefined);
        if (goalsToDisplay.length > 0) contentEl.createEl('hr');
        new Setting(contentEl).addButton(btn => btn.setButtonText(createButtonText).setCta().onClick(() => {
            new CreateEditGoalModal(this.app, this.plugin, () => this.onOpen(), undefined, goalTypeToCreate).open();
            this.close();
        }));
    }

    onClose() { this.contentEl.empty(); }
}

CreateEditGoalModal = class extends Modal {
    plugin: NexusHubPlugin;
    onSubmit: () => void;
    goal?: Goal;
    private goalName: string = '';
    private goalType: 'Saving' | 'Debt' = 'Saving';
    private totalValue: number = 0;
    private targetDate: string = '';
    private step: 1 | 2 = 1;
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
            this.goalType = this.goal.goalType;
            this.totalValue = this.goal.targetAmount;
            this.targetDate = this.goal.targetDate || "";
            this.selectedAccountIds = new Set(this.goal.linkedAccountIds);
        }
    }

    onOpen() { this.renderStep(); }

    private renderStep() {
        const { contentEl } = this;
        contentEl.empty();
        const isEditing = !!this.goal;

        if (isEditing) {
            contentEl.createEl('h2', { text: `Editando Meta: ${this.goalName}` });
            this.renderForm();
        } else {
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
        new Setting(contentEl).setName('Nome da Meta').addText(text => text.setPlaceholder('Ex: Viagem para a praia').setValue(this.goalName).onChange(val => this.goalName = val));
        if (this.goalType === 'Saving') {
            new Setting(contentEl).setName('Valor Alvo').addText(text => { text.inputEl.type = 'number'; text.setValue(String(this.totalValue)).onChange(val => this.totalValue = parseFloat(val) || 0); });
            new Setting(contentEl).setName('Data Alvo').addText(text => { text.inputEl.type = 'date'; text.setValue(this.targetDate).onChange(val => this.targetDate = val); });
        } else if (this.goalType === 'Debt') {
            contentEl.createEl('h3', { text: 'Agrupar Dívidas' });
            contentEl.createEl('p', { text: 'Selecione as compras parceladas que você deseja agrupar nesta meta de dívida.' });
            const accountsContainer = contentEl.createDiv({ cls: 'goal-accounts-list' });
            const installmentGroups = this.plugin.settings.transactions.filter(t => t.isInstallment && t.installmentOf).reduce((acc, t) => {
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
                        if (checkbox.checked) this.selectedAccountIds.add(id);
                        else this.selectedAccountIds.delete(id);
                    };
                    label.appendText(` ${group.description} `);
                    label.createEl('span', { text: `(${formatAsCurrency(group.total)})`, cls: 'mod-subtle' });
                });
            }
        }
        const buttonText = isEditing ? 'Salvar Alterações' : (this.goalType === 'Debt' ? 'Criar Meta de Dívida' : 'Criar Meta de Economia');
        new Setting(contentEl).addButton(btn => btn.setButtonText(buttonText).setCta().onClick(() => this.saveGoal()));
    }

    private async saveGoal() {
        if (!this.goalName) { new Notice('O nome da meta é obrigatório.'); return; }
        let calculatedTarget = this.totalValue;
        let calculatedCurrent = 0;
        if (this.goalType === 'Debt') {
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
        if (this.goal) {
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
        } else {
            const newGoal: Goal = {
                id: `goal_${Date.now()}`, name: this.goalName, goalType: this.goalType,
                targetAmount: calculatedTarget, currentAmount: calculatedCurrent,
                targetDate: this.goalType === 'Saving' ? this.targetDate : undefined,
                linkedAccountIds: Array.from(this.selectedAccountIds), completed: false,
            };
            if (!this.plugin.settings.goals) this.plugin.settings.goals = [];
            this.plugin.settings.goals.push(newGoal);
        }
        await this.plugin.saveSettings();
        eventManager.emit('data-changed');
        this.onSubmit();
        this.close();
    }
}

export class OnboardingModal extends Modal {
    plugin: NexusHubPlugin;
    onSubmit?: () => void;
    private userName: string = "";
    private salarioLiquido1: number = 0;
    private salarioLiquido2: number = 0;
    private salaryFrequency: 'monthly' | 'bi-weekly' = 'monthly';
    private salaryPayday1: number = 5;
    private salaryPayday2: number | undefined = 20;

    constructor(app: App, plugin: NexusHubPlugin, onSubmit?: () => void) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h1", { text: 'Bem-vindo ao Nexus Hub!' });
        contentEl.createEl("p", { text: 'Vamos começar com algumas informações básicas para personalizar sua experiência.' });
        new Setting(contentEl).setName('Qual é o seu nome?').addText(text => text.setPlaceholder('Seu nome').setValue(this.userName).onChange((value) => this.userName = value));
        contentEl.createEl('h3', { text: 'Configuração de Renda Principal' });
        const salarySection = contentEl.createDiv();
        const drawSalarySettings = () => {
            salarySection.empty();
            const isBiWeekly = this.salaryFrequency === 'bi-weekly';
            new Setting(salarySection).setName('Frequência do Recebimento').addDropdown(dd => dd.addOption('monthly', 'Mensal').addOption('bi-weekly', 'Quinzenal').setValue(this.salaryFrequency).onChange((value: 'monthly' | 'bi-weekly') => {
                this.salaryFrequency = value;
                drawSalarySettings();
            }));
            if (isBiWeekly) {
                const totalEl = new Setting(salarySection).setName('Total Recebido no Mês').controlEl.createEl('strong', { cls: 'salary-total' });
                const updateTotal = () => { totalEl.setText(formatAsCurrency(this.salarioLiquido1 + this.salarioLiquido2)); };
                salarySection.createEl('h4', { text: '1º Pagamento' });
                new Setting(salarySection).setName('Dia do 1º Pagamento').addText(text => text.setValue(String(this.salaryPayday1)).onChange(val => this.salaryPayday1 = parseInt(val) || 1));
                new Setting(salarySection).setName('Valor Líquido do 1º Pagamento').addText(text => setupCurrencyInput(text, val => { this.salarioLiquido1 = val; updateTotal(); }, this.salarioLiquido1));
                salarySection.createEl('h4', { text: '2º Pagamento' });
                new Setting(salarySection).setName('Dia do 2º Pagamento').addText(text => text.setValue(String(this.salaryPayday2 || 20)).onChange(val => this.salaryPayday2 = parseInt(val) || 20));
                new Setting(salarySection).setName('Valor Líquido do 2º Pagamento').addText(text => setupCurrencyInput(text, val => { this.salarioLiquido2 = val; updateTotal(); }, this.salarioLiquido2));
                updateTotal();
            } else {
                new Setting(salarySection).setName('Renda Mensal Líquida').addText(text => setupCurrencyInput(text, val => this.salarioLiquido1 = val, this.salarioLiquido1));
                new Setting(salarySection).setName('Dia do Pagamento').addText(text => text.setValue(String(this.salaryPayday1)).onChange(val => this.salaryPayday1 = parseInt(val) || 1));
            }
        }
        drawSalarySettings();
        new Setting(contentEl).addButton(button => button.setButtonText('Começar a Usar').setCta().onClick(async () => {
            if (!this.userName) { new Notice('Por favor, insira seu nome.'); return; }
            const totalIncome = this.salarioLiquido1 + (this.salaryFrequency === 'bi-weekly' ? this.salarioLiquido2 : 0);
            if (totalIncome <= 0) { new Notice('Por favor, insira uma renda válida.'); return; }
            this.plugin.settings.userName = this.userName.trim();
            this.plugin.settings.salaryFrequency = this.salaryFrequency;
            this.plugin.settings.salarioLiquido = this.salarioLiquido1;
            this.plugin.settings.salarioLiquido2 = this.salaryFrequency === 'bi-weekly' ? this.salarioLiquido2 : 0;
            this.plugin.settings.salaryPayday1 = this.salaryPayday1;
            this.plugin.settings.salaryPayday2 = this.salaryFrequency === 'bi-weekly' ? this.salaryPayday2 : undefined;
            this.plugin.settings.promptForSalaryUpdate = true;
            this.plugin.settings.onboardingComplete = true;
            this.createRecurringIncome();
            await this.plugin.saveSettings();
            eventManager.emit('data-changed');
            if (this.onSubmit) this.onSubmit();
            this.close();
        }));
    }

    private createRecurringIncome() {
        const newTransactions: Transaction[] = [];
        const finalDate = moment().add(5, 'years');
        if (this.salaryFrequency === 'bi-weekly' && this.salaryPayday1 && this.salaryPayday2) {
            if (this.salarioLiquido1 > 0) {
                let loopDate1 = moment().startOf('month');
                while (loopDate1.isBefore(finalDate)) {
                    const transactionDate = loopDate1.clone().date(this.salaryPayday1);
                    newTransactions.push({ id: `txn_income_${loopDate1.format('YYYY-MM')}_p1`, description: 'Renda Quinzenal (1/2)', amount: this.salarioLiquido1, date: transactionDate.format('YYYY-MM-DD'), category: 'Salário', type: 'income', status: 'pending', isRecurring: true, recurrenceRule: 'monthly', isInstallment: false });
                    loopDate1.add(1, 'month');
                }
            }
            if (this.salarioLiquido2 > 0) {
                let loopDate2 = moment().startOf('month');
                while (loopDate2.isBefore(finalDate)) {
                    const transactionDate = loopDate2.clone().date(this.salaryPayday2);
                    newTransactions.push({ id: `txn_income_${loopDate2.format('YYYY-MM')}_p2`, description: 'Renda Quinzenal (2/2)', amount: this.salarioLiquido2, date: transactionDate.format('YYYY-MM-DD'), category: 'Salário', type: 'income', status: 'pending', isRecurring: true, recurrenceRule: 'monthly', isInstallment: false });
                    loopDate2.add(1, 'month');
                }
            }
        } else {
            if (this.salarioLiquido1 > 0) {
                let loopDate = moment().startOf('month');
                while (loopDate.isBefore(finalDate)) {
                    const transactionDate = loopDate.clone().date(this.salaryPayday1);
                    newTransactions.push({ id: `txn_income_${loopDate.format('YYYY-MM')}_main`, description: 'Renda Mensal', amount: this.salarioLiquido1, date: transactionDate.format('YYYY-MM-DD'), category: 'Salário', type: 'income', status: 'pending', isRecurring: true, recurrenceRule: 'monthly', isInstallment: false });
                    loopDate.add(1, 'month');
                }
            }
        }
        this.plugin.settings.transactions.push(...newTransactions);
    }
}

export class ImportCsvModal extends Modal {
    plugin: NexusHubPlugin;
    file: File | null = null;
    parsedData: any[] = [];
    headers: string[] = [];
    private dateColumn: string | null = null;
    private descriptionColumn: string | null = null;
    private amountColumn: string | null = null;
    private dateFormat: string = 'YYYY-MM-DD';

    constructor(app: App, plugin: NexusHubPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Importar Transações de CSV' });
        this.renderStep1_FileUpload(contentEl);
    }

    renderStep1_FileUpload(container: HTMLElement) {
        new Setting(container).setName('Arquivo CSV').setDesc('Selecione o arquivo .csv exportado do seu banco.').addButton(btn => {
            const input = createEl('input', { attr: { type: 'file', accept: '.csv, .txt', style: 'display: none' } });
            btn.buttonEl.appendChild(input);
            btn.setButtonText('Selecionar Arquivo').onClick(() => input.click());
            input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                this.file = file;
                btn.setButtonText(file.name).setDisabled(true);
                this.parseFile();
            };
        });
    }

    async parseFile() {
        if (!this.file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const fileContent = event.target?.result;
            if (typeof fileContent !== 'string') return;
            try {
                const workbook = XLSX.read(fileContent, { type: 'string' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                this.parsedData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                if (this.parsedData.length > 0) {
                    this.headers = this.parsedData[0] as string[];
                    this.renderStep2_ColumnMapping(this.contentEl);
                } else {
                    new Notice('Erro: O arquivo CSV está vazio ou em um formato inválido.');
                }
            } catch (error) {
                console.error("Nexus Hub - Erro ao parsear CSV:", error);
                new Notice('Ocorreu um erro ao ler o arquivo. Verifique se é um CSV válido.');
            }
        };
        reader.readAsText(this.file);
    }

    renderStep2_ColumnMapping(container: HTMLElement) {
        container.empty();
        container.createEl('h2', { text: 'Mapear Colunas' });
        container.createEl('p', { text: 'Associe as colunas do seu arquivo aos campos de transação do Nexus Hub.' });
        const createMappingDropdown = (name: string, description: string, onchange: (value: string) => void) => {
            new Setting(container).setName(name).setDesc(description).addDropdown(dd => {
                dd.addOption('__none__', '-- Ignorar --');
                this.headers.forEach((header, index) => { dd.addOption(String(index), header); });
                dd.onChange(onchange);
            });
        };
        createMappingDropdown('Coluna da Data', 'Coluna que contém a data da transação.', val => this.dateColumn = val === '__none__' ? null : val);
        createMappingDropdown('Coluna da Descrição', 'Coluna que contém a descrição/nome da transação.', val => this.descriptionColumn = val === '__none__' ? null : val);
        createMappingDropdown('Coluna do Valor', 'Coluna que contém o valor monetário da transação.', val => this.amountColumn = val === '__none__' ? null : val);
        new Setting(container).setName('Formato da Data').setDesc('Ex: DD/MM/YYYY, YYYY-MM-DD. Use a sintaxe do Moment.js.').addText(text => text.setValue(this.dateFormat).onChange(val => this.dateFormat = val));
        new Setting(container).addButton(btn => btn.setButtonText('Pré-visualizar Importação').setCta().onClick(() => this.renderStep3_Preview(container)));
    }

    renderStep3_Preview(container: HTMLElement) {
        if (!this.dateColumn || !this.descriptionColumn || !this.amountColumn) { new Notice('Por favor, mapeie as colunas de data, descrição e valor.'); return; }
        container.empty();
        container.createEl('h2', { text: 'Pré-visualização dos Dados' });
        const previewTable = container.createEl('table', { cls: 'nexus-hub-table' });
        const thead = previewTable.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: 'Data' });
        headerRow.createEl('th', { text: 'Descrição' });
        headerRow.createEl('th', { text: 'Valor' });
        const tbody = previewTable.createEl('tbody');
        const dataToPreview = this.parsedData.slice(1, 6);
        dataToPreview.forEach(row => {
            const tableRow = tbody.createEl('tr');
            const dateStr = row[this.dateColumn!];
            const formattedDate = moment(dateStr, this.dateFormat).format('DD/MM/YYYY');
            const amount = parseCurrency(String(row[this.amountColumn!]));
            tableRow.createEl('td', { text: formattedDate });
            tableRow.createEl('td', { text: row[this.descriptionColumn!] });
            tableRow.createEl('td', { text: formatAsCurrency(amount) });
        });
        new Setting(container).addButton(btn => btn.setButtonText('Confirmar e Importar').setCta().onClick(() => this.importData()));
    }

    async importData() {
        if (!this.dateColumn || !this.descriptionColumn || !this.amountColumn) return;
        const transactionsToImport: Transaction[] = [];
        const dataToImport = this.parsedData.slice(1);
        for (const row of dataToImport) {
            const dateStr = row[this.dateColumn];
            const date = moment(dateStr, this.dateFormat);
            const amount = parseCurrency(String(row[this.amountColumn]));
            const description = String(row[this.descriptionColumn]);
            if (!date.isValid() || isNaN(amount) || !description) {
                console.warn("Nexus Hub: Pulando linha do CSV por dados inválidos:", row);
                continue;
            }
            const newTransaction: Transaction = {
                id: `csv_${Date.now()}_${Math.random()}`,
                description: description,
                amount: Math.abs(amount),
                date: date.format('YYYY-MM-DD'),
                category: 'Importado',
                type: amount < 0 ? 'expense' : 'income',
                status: 'paid',
                isRecurring: false,
                isInstallment: false,
            };
            transactionsToImport.push(newTransaction);
        }
        this.plugin.settings.transactions.push(...transactionsToImport);
        await this.plugin.saveSettings();
        eventManager.emit('data-changed');
        new Notice(`${transactionsToImport.length} transações importadas com sucesso!`);
        this.close();
    }
}

export class AchievementsModal extends Modal { constructor(app: App, plugin: NexusHubPlugin) { super(app); } onOpen() { this.close(); } }
export class AddCreditCardFormModal extends Modal { constructor(app: App, plugin: NexusHubPlugin) { super(app); } onOpen() { this.close(); } }
export class ManageCreditCardsModal extends Modal { constructor(app: App, plugin: NexusHubPlugin, currentMonth: moment.Moment) { super(app); } onOpen() { this.close(); } }
export class EditUserModal extends Modal { constructor(app: App, plugin: NexusHubPlugin) { super(app); } onOpen() { this.close(); } }
export class ExtraIncomeModal extends Modal { constructor(app: App, plugin: NexusHubPlugin, currentMonth: moment.Moment) { super(app); } onOpen() { this.close(); } }
export class ManageBudgetsModal extends Modal { constructor(app: App, plugin: NexusHubPlugin) { super(app); } onOpen() { this.close(); } }
export class AddTransactionModal extends Modal { constructor(app: App, plugin: NexusHubPlugin, currentMonth: moment.Moment, onSubmit: () => void, transaction?: Transaction) { super(app); } onOpen() { this.close(); } }
export class PurchaseDetailModal extends Modal { constructor(app: App, plugin: NexusHubPlugin, purchaseId: string) { super(app); } onOpen() { this.close(); } }
export class CardBillDetailModal extends Modal { constructor(app: App, plugin: NexusHubPlugin, cardId: string, currentMonth: moment.Moment) { super(app); } onOpen() { this.close(); } }
export class EditPurchaseModal extends Modal { constructor(app: App, plugin: NexusHubPlugin, transaction: Transaction, onSubmit: () => void) { super(app); } onOpen() { this.close(); } }
export class AddPurchaseModal extends Modal { constructor(app: App, plugin: NexusHubPlugin, card: CreditCard, onSubmit: () => void) { super(app); } onOpen() { this.close(); } }
export class AccountDetailModal extends Modal { constructor(app: App, plugin: NexusHubPlugin, accountId: string, isInstallment: boolean) { super(app); } onOpen() { this.close(); } }
export class EditAccountModal extends Modal { constructor(app: App, plugin: NexusHubPlugin, transaction: Transaction, onSubmit: () => void) { super(app); } onOpen() { this.close(); } }
export class PauseRecurringModal extends Modal { constructor(app: App, plugin: NexusHubPlugin, transaction: Transaction, onSubmit: () => void) { super(app); } onOpen() { this.close(); } }
export class NexusScoreHistoryModal extends Modal { constructor(app: App, plugin: NexusHubPlugin) { super(app); } onOpen() { this.close(); } }
export class ResetConfirmationModal extends Modal {
    plugin: NexusHubPlugin;
    private confirmationText: string = "apagar";

    constructor(app: App, plugin: NexusHubPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Apagar Todos os Dados' });
        const warningDiv = contentEl.createDiv({ cls: 'nexus-hub-warning' });
        warningDiv.createEl('p', { text: 'Esta ação é irreversível e irá apagar permanentemente todos os seus dados do Nexus Hub, incluindo transações, metas, orçamentos e configurações.' });
        warningDiv.createEl('p', { text: 'Suas configurações de "onboarding" (primeiro uso) serão mantidas.' });
        contentEl.createEl('p', { text: `Para confirmar, digite "${this.confirmationText}" no campo abaixo.` });

        let confirmInput = '';
        const inputEl = new TextComponent(contentEl)
            .setPlaceholder(this.confirmationText)
            .onChange(value => {
                confirmInput = value;
                deleteButton.setDisabled(confirmInput.toLowerCase() !== this.confirmationText);
            });
        inputEl.inputEl.style.width = '100%';
        inputEl.inputEl.style.marginTop = '1rem';
        inputEl.inputEl.style.marginBottom = '1rem';


        const deleteButton = new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Apagar Tudo Permanentemente')
                .setWarning()
                .setDisabled(true)
                .onClick(async () => {
                    if (confirmInput.toLowerCase() === this.confirmationText) {
                        const onboardingComplete = this.plugin.settings.onboardingComplete;
                        const newSettings = { ...DEFAULT_SETTINGS, onboardingComplete: onboardingComplete };

                        this.plugin.settings = Object.assign(this.plugin.settings, newSettings);

                        await this.plugin.saveSettings();
                        eventManager.emit('data-changed');
                        new Notice('Todos os dados do Nexus Hub foram apagados. Recarregando o plugin...');

                        // Reload the plugin
                        // @ts-ignore
                        await this.app.plugins.disablePlugin(this.plugin.manifest.id);
                        // @ts-ignore
                        await this.app.plugins.enablePlugin(this.plugin.manifest.id);

                        this.close();
                    } else {
                        new Notice('Texto de confirmação incorreto.');
                    }
                })
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
export class ManageCategoriesModal extends Modal { constructor(app: App, plugin: NexusHubPlugin) { super(app); } onOpen() { this.close(); } }
export class EditTransactionModal extends Modal { constructor(app: App, plugin: NexusHubPlugin, transaction: Transaction, onSubmit: () => void) { super(app); } onOpen() { this.close(); } }
export class UpdateSalaryModal extends Modal { constructor(app: App, plugin: NexusHubPlugin) { super(app); } onOpen() { this.close(); } }
export class EmergencyFundModal extends Modal { constructor(app: App, plugin: NexusHubPlugin) { super(app); } onOpen() { this.close(); } }

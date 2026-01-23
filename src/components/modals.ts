import { Modal, App, Setting, Notice, setIcon, TextComponent, DropdownComponent, ButtonComponent, ToggleComponent, moment } from 'obsidian';

import { Transaction, Goal, CreditCard, Category, NexusHubSettings, DEFAULT_SETTINGS } from '../views/settings';
import type NexusHubPlugin from '../main';
import { formatAsCurrency, calculateCardBill, suggestCategory, parseCurrency, calculatePaymentMonth, generateUUID } from '../helpers/helpers';
import { eventManager } from '../helpers/EventManager';
import { setupCurrencyInput, renderCategoryDropdown, ConfirmationModal, PromptModal, InfoModal } from '../helpers/ui-helpers';
export { ConfirmationModal, PromptModal };
import { unlockAchievement } from '../services/achievement-engine';
import { ALL_ACHIEVEMENTS, Achievement } from '../services/achievements';

// ===================================================================
// MODAL DEFINITIONS
// ===================================================================

// Forward declare to solve dependency loop if needed, though ordering is preferred.
// Forward declare to solve dependency loop if needed, though ordering is preferred.

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
        this.contentEl.addClass('nexus-fintech-modal');

        const header = contentEl.createDiv({ cls: 'modal-header' });
        if (this.filter !== 'All') {
            header.addClass('modal-header-with-action');
            new ButtonComponent(header).setIcon('arrow-left').setTooltip('Voltar').onClick(() => {
                new GoalsModal(this.app, this.plugin, 'All').open();
                this.close();
            });
        }
        header.createEl('h2', { text: 'Suas Metas' });

        const helpIcon = header.createDiv({ cls: 'clickable-icon help-icon modal-help-icon' });
        setIcon(helpIcon, 'help-circle');
        helpIcon.setAttr('title', 'O que são Metas?');
        helpIcon.addEventListener('click', () => {
            const helpText = `<h3>O que são as Metas?</h3><p>A seção de Metas é sua ferramenta para <strong>planejar e conquistar grandes objetivos financeiros</strong>. Use-a para economizar para uma viagem, um carro novo, ou para organizar e quitar suas dívidas de forma focada.</p><br><br><h3>Como funciona?</h3><p><strong>1. Crie sua Meta:</strong><br>- <strong>Meta de Economia:</strong> Defina quanto você quer juntar e até quando. O plugin calcula o quanto você precisa guardar por mês.<br>- <strong>Meta de Dívida:</strong> Agrupe compras parceladas existentes para visualizar e focar na quitação total da dívida.</p><p><strong>2. Acompanhe o Progresso:</strong><br>- Veja o avanço de cada meta com barras de progresso claras.<br>- Adicione contribuições manuais para suas metas de economia.</p><p><strong>3. Integração (Em breve - Fase 2):</strong><br>- Suas economias ou pagamentos de metas aparecerão automaticamente nos "Pagamentos Pendentes".<br>- Você terá flexibilidade para confirmar, editar o valor do mês ou pular a contribuição.</p><br><br><p><strong>Dica de Mestre:</strong> Transforme seus sonhos em planos. Ao criar uma meta, você dá um propósito claro para o seu dinheiro e se mantém motivado para alcançar seus objetivos.</p>`;
            new InfoModal(this.app, 'Sobre as Metas', helpText).open();
        });

        const styleEl = contentEl.createEl('style');
        styleEl.innerHTML = `
            .nexus-fintech-modal .modal-content {
                width: 800px;
                max-width: 95vw;
            }
            .modal-help-icon svg { /* Aumenta o tamanho do ícone de ajuda */
                width: 24px;
                height: 24px;
            }
            .goals-list-container {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: 20px;
                padding: 20px;
            }
            .goal-card {
                background: var(--background-secondary);
                border-radius: 12px;
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 15px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                transition: all 0.2s ease-in-out;
            }
            .goal-card:hover { transform: translateY(-3px); box-shadow: 0 5px 15px rgba(0,0,0,0.3); }
            .goal-card h3 { margin: 0; font-size: 1.2em; }
            .progress-text { font-size: 0.9em; color: var(--text-muted); }
            .goal-card progress {
                width: 100%;
                height: 12px;
                -webkit-appearance: none;
                appearance: none;
            }
            .goal-card progress::-webkit-progress-bar { background-color: var(--background-primary); border-radius: 6px; }
            .goal-card progress::-webkit-progress-value { background-color: var(--interactive-accent); border-radius: 6px; transition: width 0.3s ease-in-out; }
            .contribution-container { display: flex; gap: 10px; }
            .contribution-container input { flex-grow: 1; }
            .goal-actions-container { display: flex; gap: 10px; margin-top: auto; }

            .modal-header, .modal-header-with-action {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .modal-header h2, .modal-header-with-action h2 {
                margin: 0;
                flex-grow: 1; /* Make title take up space */
            }
            .goal-card-header-row { display: flex; align-items: center; gap: 10px; }
            .goal-card-icon { color: var(--interactive-accent); }
        `;

        const goalsToDisplay = this.filter !== 'All'
            ? (this.plugin.settings.goals || []).filter(g => g.goalType === this.filter)
            : (this.plugin.settings.goals || []);

        const goalsListContainer = contentEl.createDiv({ cls: 'goals-list-container' });

        if (goalsToDisplay.length === 0) {
            goalsListContainer.createEl('p', { text: 'Você ainda não tem nenhuma meta.', cls: 'no-cards-message' });
        } else {
            goalsToDisplay.forEach(goal => {
                const goalCard = goalsListContainer.createDiv({ cls: 'goal-card' });

                const headerRow = goalCard.createDiv({ cls: 'goal-card-header-row' });
                const iconDiv = headerRow.createDiv({ cls: 'goal-card-icon' });
                setIcon(iconDiv, goal.goalType === 'Saving' ? 'piggy-bank' : 'file-minus'); // Distinct icons
                headerRow.createEl('h3', { text: goal.name });

                const target = goal.targetAmount || 1;
                const current = goal.currentAmount || 0;
                const percentage = target > 0 ? ((current / target) * 100) : 0;

                goalCard.createEl('progress', { attr: { max: 100, value: percentage } });
                const progressText = `${formatAsCurrency(current)} de ${formatAsCurrency(target)} (${percentage.toFixed(1)}%)`;
                goalCard.createEl('p', { text: progressText, cls: 'progress-text' });

                if (goal.goalType === 'Saving') {
                    const contributionContainer = goalCard.createDiv({ cls: 'contribution-container' });
                    const amountInput = new TextComponent(contributionContainer);
                    setupCurrencyInput(amountInput, () => { }, 0, 'Valor da contribuição');
                    new ButtonComponent(contributionContainer).setButtonText('Contribuir').onClick(async () => {
                        const amountValue = parseCurrency(amountInput.getValue());
                        if (!isNaN(amountValue) && amountValue > 0) {
                            // 1. Update Goal State
                            goal.currentAmount += amountValue;
                            if (!goal.history) goal.history = [];
                            goal.history.push({
                                date: new Date().toISOString(),
                                amount: amountValue,
                                balanceAfter: goal.currentAmount,
                                referenceMonth: moment().format('YYYY-MM') // Track contribution month
                            });

                            // 2. Register REAL Transaction (Fix "Not Registering" issue)
                            const newTx: any = {
                                id: `txn_${Date.now()}_${generateUUID()}`,
                                description: `Aporte Manual: ${goal.name}`,
                                amount: amountValue,
                                date: moment().format('YYYY-MM-DD'),
                                category: 'Metas',
                                type: 'expense',
                                status: 'paid',
                                isRecurring: false,
                                isInstallment: false,
                                installmentOf: goal.id, // Link for robustness
                                paymentMonth: moment().format('YYYY-MM')
                            };
                            this.plugin.settings.transactions.push(newTx);
                            new Notice(`Contribuição de ${formatAsCurrency(amountValue)} registrada no mês ${moment().format('MM/YYYY')}`);

                            if (!goal.completed && goal.currentAmount >= goal.targetAmount) {
                                goal.completed = true;
                                (this.plugin as any).increaseNexusScore(50, `Meta de economia '${goal.name}' concluída!`);
                                new Notice(`Parabéns! Você completou sua meta de economia '${goal.name}'!`);
                            }
                            await this.plugin.saveSettings();
                            new GoalsModal(this.app, this.plugin, this.filter).open(); // Re-open properly
                            this.close();
                        }
                    });
                }

                const actionsContainer = goalCard.createDiv({ cls: 'goal-actions-container' });
                new ButtonComponent(actionsContainer).setButtonText('Editar').onClick(() => {
                    new CreateEditGoalModal(this.app, this.plugin, () => new GoalsModal(this.app, this.plugin, this.filter).open(), goal).open(); // Pass correct callback
                    this.close();
                });
                new ButtonComponent(actionsContainer).setButtonText('Apagar').setClass('mod-warning').onClick(async () => {
                    new ConfirmationModal(this.app, 'Apagar Meta', `Tem certeza que deseja apagar a meta '${goal.name}'?`, async () => {
                        // 1. Remove Goal
                        this.plugin.settings.goals = (this.plugin.settings.goals || []).filter(g => g.id !== goal.id);

                        // 2. Remove Linked Transactions (Clean up backfilled paid debts AND legacy/unlinked ones)
                        this.plugin.settings.transactions = (this.plugin.settings.transactions || []).filter(t => {
                            if (t.installmentOf === goal.id) return false; // Explicit Link
                            // Fallback: Check by Name match if it's a Debt Payment
                            if (goal.goalType === 'Debt' && t.description.includes(`Pagamento Dívida: ${goal.name}`)) return false;
                            return true;
                        });

                        await this.plugin.saveSettings();
                        this.onOpen();
                    }).open();
                });
            });
        }

        const footerEl = contentEl.createDiv({ cls: 'modal-footer' });
        new Setting(footerEl).addButton(btn => btn.setButtonText('Criar Nova Meta').setCta().onClick(() => {
            new CreateEditGoalModal(this.app, this.plugin, () => new GoalsModal(this.app, this.plugin, this.filter).open()).open(); // Pass correct callback
            this.close();
        }));
    }

    onClose() { this.contentEl.empty(); }
}

export class CreateEditGoalModal extends Modal {
    plugin: NexusHubPlugin;
    onSubmit: () => void;
    goal?: Goal;
    private goalName: string = '';
    private goalType: 'Saving' | 'Debt';
    private totalValue: number = 0;
    private monthlyInstallment: number = 0;
    private targetDate: string = '';
    private showInPending: boolean = false;
    private calculationMode: 'byDate' | 'byInstallment' = 'byDate';
    private step: 1 | 2 = 1;
    private selectedAccountIds: Set<string> = new Set();
    private initialGoalType: 'Saving' | 'Debt' | undefined;
    private manualCurrentAmount: number = 0;
    // Debt specific helpers
    private debtInstallmentCount: number = 1;
    private debtStartDate: string = '';
    private startDate: string = '';

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
            this.monthlyInstallment = this.goal.monthlyInstallment || 0;
            // Se já existe uma parcela mensal, assume que o modo era por parcela
            this.calculationMode = this.goal.monthlyInstallment ? 'byInstallment' : 'byDate';
            this.showInPending = this.goal.showInPending || false;
            this.selectedAccountIds = new Set(this.goal.linkedAccountIds);
            this.startDate = this.goal.startDate || '';
            // New fields
            this.targetDate = this.goal.targetDate || this.targetDate; // For debt too
            this.monthlyInstallment = this.goal.totalInstallments || 0; // reusing var temporarily for installments count logic or just create new
            // Actually let's use proper separate vars to avoid confusion, but for now strict to class props


            // Calculate manual portion if editing
            if (this.goalType === 'Debt') {
                let linkedTotal = 0;
                let linkedCurrent = 0;
                this.selectedAccountIds.forEach(id => {
                    const relatedInstallments = this.plugin.settings.transactions.filter(tx => tx.installmentOf === id);
                    if (relatedInstallments.length > 0) {
                        const installmentAmount = relatedInstallments[0].amount;
                        const totalInstallments = relatedInstallments[0].totalInstallments || 1;
                        linkedTotal += installmentAmount * totalInstallments;
                        const paidCount = relatedInstallments.filter(tx => tx.status === 'paid').length;
                        linkedCurrent += paidCount * installmentAmount;
                    }
                });
                // The difference is the manual part
                this.totalValue = Math.max(0, this.goal.targetAmount - linkedTotal);
                this.manualCurrentAmount = Math.max(0, this.goal.currentAmount - linkedCurrent);

                // Debt Specifics Initialization
                this.debtStartDate = this.goal.startDate || '';
                this.debtInstallmentCount = this.goal.totalInstallments || 1;
            }

        } else {
            this.goalType = 'Saving'; // Default para Saving no modo de criacao
        }
    }

    onOpen() {
        this.contentEl.addClass('nexus-fintech-modal');
        this.renderStep();
    }

    private renderStep() {
        const { contentEl } = this;
        contentEl.empty();
        const isEditing = !!this.goal;

        const styleEl = contentEl.createEl('style');
        styleEl.innerHTML = `
            .goal-type-choice-container {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); /* Responsive columns */
                gap: 20px;
                padding: 20px;
            }
            .goal-type-card {
                background: var(--background-secondary);
                border-radius: 12px;
                padding: 25px;
                text-align: center;
                cursor: pointer;
                transition: all 0.2s ease-in-out;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 150px; /* Ensure cards have a consistent height */
            }
            .goal-type-card:hover { transform: translateY(-5px); box-shadow: 0 8px 25px rgba(0,0,0,0.3); }
            .goal-type-icon { font-size: 2.8em; margin-bottom: 15px; color: var(--interactive-accent); } /* Larger icon, themed color */
            .goal-type-card h3 { margin: 0 0 8px 0; font-size: 1.3em; color: var(--text-normal); } /* Slightly larger and more prominent title */
            .goal-type-card p { font-size: 0.95em; color: var(--text-muted); margin: 0; line-height: 1.4; } /* Better readability */
            .transaction-form-container { padding: 20px; }
            .goal-accounts-list { max-height: 200px; overflow-y: auto; padding: 10px; border: 1px solid var(--background-modifier-border); border-radius: 8px; margin-top: 10px; }
            .goal-account-item { display: flex; align-items: center; gap: 10px; padding: 8px; border-bottom: 1px solid var(--background-modifier-border-hover); }
            .goal-account-item:last-child { border-bottom: none; }

            /* General form group improvements */
            .form-group {
                display: flex;
                flex-direction: column;
                margin-bottom: 15px; /* Spacing between form groups */
            }
            .form-group label {
                font-size: 0.9em;
                color: var(--text-muted);
                margin-bottom: 5px;
                font-weight: 600;
            }
            .form-group input[type='text'],
            .form-group input[type='number'],
            .form-group input[type='date'] {
                padding: 8px 12px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                background-color: var(--background-secondary);
                color: var(--text-normal);
                font-size: 1em;
                transition: border-color 0.2s ease-in-out;
            }
            .form-group input:focus {
                border-color: var(--interactive-accent);
                outline: none;
                box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2);
            }

            /* Styling for header with action button */
            .modal-header-with-action {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .modal-header-with-action h2 {
                margin: 0;
            }

            /* Specific styling for goal form groups */
            .goal-form-group {
                display: flex;
                flex-direction: column;
                margin-bottom: 15px;
            }
            .goal-form-group label {
                font-size: 0.9em;
                color: var(--text-muted);
                margin-bottom: 5px;
                font-weight: 600;
            }
            .goal-form-group input[type='text'],
            .goal-form-group input[type='number'],
            .goal-form-group input[type='date'] {
                padding: 8px 12px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                background-color: var(--background-secondary);
                color: var(--text-normal);
                font-size: 1em;
                transition: border-color 0.2s ease-in-out;
                width: 100%; /* Ensure inputs take full width */
                box-sizing: border-box; /* Include padding and border in the element's total width and height */
            }
            .goal-form-group input:focus {
                border-color: var(--interactive-accent);
                outline: none;
                box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2);
            }
        `;

        if (isEditing) {
            const header = contentEl.createDiv({ cls: 'modal-header-with-action' });
            new ButtonComponent(header).setIcon('arrow-left').setTooltip('Voltar').onClick(() => {
                this.onSubmit(); // Go back to the previous modal (GoalsModal)
                this.close();
            });
            header.createEl('h2', { text: `Editando Meta: ${this.goalName}` });
            this.renderForm(contentEl);
        } else {
            if (this.initialGoalType) {
                this.goalType = this.initialGoalType;
                this.step = 2;
            }
            switch (this.step) {
                case 1: this.renderTypeChoice(contentEl); break;
                case 2:
                    const header = contentEl.createDiv({ cls: 'modal-header-with-action' });
                    new ButtonComponent(header).setIcon('arrow-left').setTooltip('Voltar').onClick(() => {
                        this.step = 1;
                        this.renderStep();
                    });
                    header.createEl('h2', { text: this.goalType === 'Saving' ? 'Criar Meta de Economia' : 'Criar Meta de Dívida' });
                    this.renderForm(contentEl);
                    break;
            }
        }
    }

    private renderTypeChoice(contentEl: HTMLElement) {
        const header = contentEl.createDiv({ cls: 'modal-header' });
        header.createEl('h2', { text: 'Qual tipo de meta você quer criar?' });

        const choiceContainer = contentEl.createDiv({ cls: 'goal-type-choice-container' });

        const savingCard = choiceContainer.createDiv({ cls: 'goal-type-card' });
        setIcon(savingCard.createDiv({ cls: 'goal-type-icon' }), 'piggy-bank');
        savingCard.createEl('h3', { text: 'Meta de Economia' });
        savingCard.createEl('p', { text: 'Para juntar dinheiro para um objetivo específico.' });
        savingCard.addEventListener('click', () => {
            this.goalType = 'Saving';
            this.step = 2;
            this.renderStep();
        });

        const debtCard = choiceContainer.createDiv({ cls: 'goal-type-card' });
        setIcon(debtCard.createDiv({ cls: 'goal-type-icon' }), 'file-text');
        debtCard.createEl('h3', { text: 'Meta de Dívida' });
        debtCard.createEl('p', { text: 'Para agrupar e quitar dívidas existentes.' });
        debtCard.addEventListener('click', () => {
            this.goalType = 'Debt';
            this.step = 2;
            this.renderStep();
        });
    }

    private renderForm(contentEl: HTMLElement) {
        const isEditing = !!this.goal;
        const formContainer = contentEl.createDiv({ cls: 'transaction-form-container' });

        const createGroup = (labelText: string, el: HTMLElement) => {
            const group = formContainer.createDiv({ cls: 'form-group goal-form-group' });
            group.createEl('label', { text: labelText });
            group.appendChild(el);
            return group;
        };

        const placeholder = this.goalType === 'Debt' ? 'Ex: Empréstimo Pessoal' : 'Ex: Viagem para a praia';
        const nameInput = new TextComponent(formContainer).setPlaceholder(placeholder).setValue(this.goalName).onChange(val => this.goalName = val);
        createGroup('Nome da Meta', nameInput.inputEl);

        if (this.goalType === 'Saving') {
            const valueInput = new TextComponent(formContainer);
            const totalValueGroup = createGroup('Valor Total da Meta', valueInput.inputEl);
            setupCurrencyInput(valueInput, val => {
                this.totalValue = val;
                updateCalculation();
            }, this.totalValue, 'Ex: R$ 5.000,00');

            new Setting(formContainer)
                .setName('Como calcular a meta?')
                .addDropdown(dd => dd
                    .addOption('byDate', 'Quero definir o PRAZO FINAL')
                    .addOption('byInstallment', 'Quero definir a PARCELA MENSAL')
                    .setValue(this.calculationMode)
                    .onChange((value: 'byDate' | 'byInstallment') => {
                        this.calculationMode = value;
                        toggleFields();
                        updateCalculation();
                    }));

            const dateInput = new TextComponent(formContainer);
            dateInput.inputEl.type = 'date';
            const dateGroup = createGroup('Data Final da Meta', dateInput.inputEl);
            dateInput.setValue(this.targetDate).onChange(val => {
                this.targetDate = val;
                updateCalculation();
            });

            const installmentInput = new TextComponent(formContainer);
            const installmentGroup = createGroup('Valor a Guardar por Mês', installmentInput.inputEl);
            setupCurrencyInput(installmentInput, val => {
                this.monthlyInstallment = val;
                updateCalculation();
            }, this.monthlyInstallment, 'Ex: R$ 200,00');

            const resultEl = formContainer.createDiv({ cls: 'goal-calculation-result' });

            const toggleFields = () => {
                if (this.calculationMode === 'byDate') {
                    dateGroup.style.display = 'flex';
                    installmentGroup.style.display = 'none';
                } else {
                    dateGroup.style.display = 'none';
                    installmentGroup.style.display = 'flex';
                }
            };

            const updateCalculation = () => {
                resultEl.empty();
                if (this.totalValue <= 0) return;

                // FIX: Use Start Date if defined, otherwise Today
                const start = this.startDate ? moment(this.startDate) : moment();

                if (this.calculationMode === 'byDate' && this.targetDate) {
                    const months = moment(this.targetDate).diff(start, 'months', true);
                    if (months > 0) {
                        const installment = this.totalValue / months;
                        this.monthlyInstallment = installment;
                        resultEl.setText(`✅ Com base no início em ${start.format('DD/MM/YYYY')}, você precisará guardar ${formatAsCurrency(installment)} por mês.`);
                    } else {
                        resultEl.setText('A data final precisa ser após a data de início.');
                    }
                } else if (this.calculationMode === 'byInstallment' && this.monthlyInstallment > 0) {
                    const months = Math.ceil(this.totalValue / this.monthlyInstallment);
                    const endDate = start.clone().add(months, 'months');
                    this.targetDate = endDate.format('YYYY-MM-DD');
                    resultEl.setText(`✅ Começando em ${start.format('DD/MM/YYYY')}, você levará ${months} meses, terminando em ${endDate.format('MMMM [de] YYYY')}.`);
                }
            };

            toggleFields();
            updateCalculation();

            const startDateInput = new TextComponent(formContainer);
            startDateInput.inputEl.type = 'date';
            const startDateGroup = createGroup('Data de Início (Opcional)', startDateInput.inputEl);
            startDateInput.setPlaceholder('dd/mm/aaaa');
            startDateInput.setValue(this.startDate).onChange(val => {
                this.startDate = val;
                updateCalculation(); // Trigger recalculation
            });
            // Add description or tooltip if needed to explain it's for future planning

            new Setting(formContainer)
                .setName('Exibir nos pagamentos pendentes?')
                .setDesc('Se ativado, um lembrete para guardar este valor aparecerá na sua lista de pagamentos pendentes todo mês.')
                .addToggle(toggle => toggle
                    .setValue(this.showInPending)
                    .onChange(value => this.showInPending = value));

        } else if (this.goalType === 'Debt') {

            // --- MANUAL DEBT SECTION ---
            formContainer.createEl('h3', { text: 'Detalhes da Dívida (Manual)' });
            formContainer.createEl('p', { text: 'Insira as informações para o cálculo automático.', cls: 'mod-subtle' });

            // 1. Start Date (Drivers Calculation)
            const loanDateInput = new TextComponent(formContainer);
            loanDateInput.inputEl.type = 'date';
            loanDateInput.setValue(this.debtStartDate);
            const dateGroup = createGroup('Data do Início', loanDateInput.inputEl);

            // 2. Total Value
            const manualValueInput = new TextComponent(formContainer);
            const manualValueGroup = createGroup('Valor Total da Dívida', manualValueInput.inputEl);

            // Row for details
            const debtDetailsGroup = formContainer.createDiv({ cls: 'form-group-row', attr: { style: 'display: flex; gap: 10px; align-items: flex-end;' } });

            // 3. Total Installments
            const installmentsInput = new TextComponent(debtDetailsGroup);
            installmentsInput.inputEl.type = 'number';
            installmentsInput.setPlaceholder('Ex: 12');
            installmentsInput.setValue(String(this.debtInstallmentCount));
            const instGroup = createGroup('Total de Parcelas', installmentsInput.inputEl);
            instGroup.style.flex = '1';
            debtDetailsGroup.appendChild(instGroup);

            // 4. Paid Installments
            const paidInstInput = new TextComponent(debtDetailsGroup);
            paidInstInput.inputEl.type = 'number';
            paidInstInput.setPlaceholder('Ex: 2 (Auto)');
            const paidInstGroup = createGroup('Parcelas Pagas (Auto)', paidInstInput.inputEl);
            paidInstGroup.style.flex = '1';
            debtDetailsGroup.appendChild(paidInstGroup);

            // 5. Paid Value (Moved below)
            const manualPaidInput = new TextComponent(formContainer);
            const manualPaidGroup = createGroup('Valor Já Pago (Auto)', manualPaidInput.inputEl);

            // Result Display
            const resultEl = formContainer.createDiv({ cls: 'goal-calculation-result', attr: { style: 'margin-top: 15px; margin-bottom: 15px;' } });


            // --- LOGIC ---
            // --- LOGIC ---
            const updateDebtCalc = () => {
                const total = this.totalValue || 0;
                const paid = this.manualCurrentAmount || 0;
                const count = Math.max(1, this.debtInstallmentCount);
                const monthly = total / count;

                // Only calculate 'paidCount' from 'paid amount' if we have a valid monthly value
                // Otherwise, we trust the input (which might have come from autoCalc)
                let paidCount = 0;
                if (monthly > 0) {
                    paidCount = Math.floor(paid / monthly);
                    // Update Paid Installments Input (only if not focused to avoid fighting user)
                    if (document.activeElement !== paidInstInput.inputEl) {
                        paidInstInput.setValue(String(paidCount));
                    }
                } else {
                    // Fallback: Read what's in the input so we don't display "Paid 0" if input says 2
                    paidCount = parseInt(paidInstInput.getValue()) || 0;
                }

                // Check Dates
                let dateText = '';
                let statusText = '';
                if (this.debtStartDate && count > 0) {
                    const startKey = moment(this.debtStartDate);
                    const endKey = startKey.clone().add(count, 'months'); // Exact month addition
                    dateText = ` | Término: ${endKey.format('DD/MM/YYYY')}`;

                    // Calculate Next Due Date based on PAID count (Real Status)
                    // If paidCount is 2, next is 3.
                    const nextParcelToPay = paidCount + 1;

                    if (nextParcelToPay <= count) {
                        // Simplified: Start + PaidCount + 1 Month (Wait, Start=Oct. 1st Due=Nov (Start+1). 2nd Due=Dec (Start+2). 
                        // If Paid=2 (Oct, Nov). Next is Dec. Start+2?
                        // Logic: 1st Due = Start+1m.
                        // Nth Due = Start + N m.
                        // Next is (Paid+1)th.
                        const nextDueDate = startKey.clone().add(nextParcelToPay, 'months');
                        statusText = `\n📅 Próximo Vencimento: ${nextDueDate.format('DD/MM/YYYY')} (Parcela #${nextParcelToPay})`;
                    } else {
                        statusText = `\n✅ Dívida Paga!`;
                    }
                }

                resultEl.setText(`📦 Parcela Mensal: ${formatAsCurrency(monthly)}${dateText}${statusText} | Restam ${Math.max(0, count - paidCount)} parcelas.`);
                resultEl.style.whiteSpace = 'pre-line';
            };

            const autoCalcPaidFromDate = () => {
                if (!this.debtStartDate) return;
                const start = moment(this.debtStartDate);
                const today = moment();
                const total = this.debtInstallmentCount || 1;
                let pCount = 0;

                // Rule: 1st installment is 1 month after start
                for (let i = 1; i <= total; i++) {
                    const due = start.clone().add(i, 'months');
                    // Strict check: If installment is due within Current Month (or earlier), it is PAID.
                    // This satisfies: "conta vence no mês atual já foi paga".
                    if (due.isSameOrBefore(today, 'month')) {
                        pCount++;
                    } else {
                        break;
                    }
                }

                paidInstInput.setValue(String(pCount));

                const count = Math.max(1, this.debtInstallmentCount);

                // Only update Amount if we have a valid Total Value. 
                // If Total is 0, we leave manualAmount alone (or 0) but enable user to set Total later to trigger this.
                if (this.totalValue > 0) {
                    const monthly = this.totalValue / count;
                    this.manualCurrentAmount = pCount * monthly;
                    manualPaidInput.setValue(formatAsCurrency(this.manualCurrentAmount).replace('R$ ', ''));
                } else {
                    // If no total, we can't calculate amount. Keep it 0.
                    this.manualCurrentAmount = 0;
                    manualPaidInput.setValue(formatAsCurrency(0).replace('R$ ', ''));
                }
                updateDebtCalc();
            };

            // Wire up inputs
            // Updated: Changing Total Value NO LONGER triggers auto-calc automatically
            setupCurrencyInput(manualValueInput, val => {
                this.totalValue = val;
                updateDebtCalc(); // Apenas atualiza o cálculo visual, não sobrescreve parcelas pagas
            }, this.totalValue, 'Ex: R$ 1.500,00');

            // Manual Paid Override
            setupCurrencyInput(manualPaidInput, val => {
                this.manualCurrentAmount = val;
                updateDebtCalc();
            }, this.manualCurrentAmount, 'Ex: R$ 500,00');

            // Updated: Changing Installments NO LONGER triggers auto-calc automatically
            installmentsInput.onChange(val => {
                this.debtInstallmentCount = parseInt(val) || 1;
                updateDebtCalc(); // Apenas atualiza o cálculo visual
            });

            paidInstInput.onChange(val => {
                const pCount = parseInt(val) || 0;
                const count = Math.max(1, this.debtInstallmentCount);
                const monthly = (this.totalValue || 0) / count;
                this.manualCurrentAmount = pCount * monthly;
                // Update currency input (formatted)
                manualPaidInput.setValue(formatAsCurrency(this.manualCurrentAmount).replace('R$ ', ''));
                updateDebtCalc();
            });

            loanDateInput.onChange(val => {
                this.debtStartDate = val;
                // NÃO chama autoCalcPaidFromDate() automaticamente
            });

            // Botão manual para calcular parcelas pagas pela data
            const autoCalcSetting = new Setting(formContainer)
                .setName('Calcular parcelas pagas automaticamente')
                .setDesc('Calcula quantas parcelas deveriam estar pagas com base na data de início da dívida')
                .addButton(btn => btn
                    .setButtonText('Calcular pela Data')
                    .setIcon('calculator')
                    .onClick(() => {
                        autoCalcPaidFromDate(); // ✅ Apenas quando usuário pedir
                        new Notice('Parcelas pagas calculadas automaticamente!');
                    })
                );

            // Initial Calc - APENAS updateDebtCalc, NÃO autoCalcPaidFromDate
            updateDebtCalc();


            // Show in expenses
            new Setting(formContainer)
                .setName('Exibir nos pagamentos pendentes?')
                .setDesc('Se ativado, cria um lembrete automático mensal até a quitação.')
                .addToggle(toggle => toggle
                    .setValue(this.showInPending)
                    .onChange(value => this.showInPending = value));


        }

        const footerEl = contentEl.createDiv({ cls: 'modal-footer' });
        const buttonText = isEditing ? 'Salvar Alterações' : (this.goalType === 'Debt' ? 'Criar Meta de Dívida' : 'Criar Meta de Economia');
        new Setting(footerEl).addButton(btn => btn.setButtonText(buttonText).setCta().onClick(() => this.saveGoal()));
    }

    private async saveGoal() {
        try {
            if (!this.goalName) { new Notice('O nome da meta é obrigatório.'); return; }

            // Calculate Totals
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
                // Add manual values
                calculatedTarget += this.totalValue;
                calculatedCurrent += this.manualCurrentAmount;
            }

            // Logic Split: Update vs Create
            if (this.goal) {
                // --- UPDATE ---
                const goalToUpdate = (this.plugin.settings.goals || []).find(g => g.id === this.goal?.id);
                if (goalToUpdate) {
                    goalToUpdate.name = this.goalName;

                    if (goalToUpdate.goalType === 'Saving') {
                        goalToUpdate.targetAmount = this.totalValue;
                        goalToUpdate.targetDate = this.targetDate;
                        goalToUpdate.monthlyInstallment = this.monthlyInstallment;
                        goalToUpdate.showInPending = this.showInPending;
                        goalToUpdate.startDate = this.startDate;
                    } else if (goalToUpdate.goalType === 'Debt') {
                        goalToUpdate.linkedAccountIds = Array.from(this.selectedAccountIds);
                        goalToUpdate.targetAmount = calculatedTarget;
                        goalToUpdate.currentAmount = calculatedCurrent; // Update current amount calculation
                        goalToUpdate.totalInstallments = this.debtInstallmentCount;
                        goalToUpdate.startDate = this.debtStartDate;
                        goalToUpdate.showInPending = this.showInPending;
                        // Calculate monthly installment for Debt (Total / Installments) to enable "Pending" generator
                        const instCount = Math.max(1, this.debtInstallmentCount);
                        goalToUpdate.monthlyInstallment = calculatedTarget / instCount;
                    }
                }
            } else {
                // --- CREATE ---
                const newGoal: Goal = {
                    id: `goal_${Date.now()}`,
                    name: this.goalName,
                    goalType: this.goalType,
                    targetAmount: calculatedTarget,
                    currentAmount: calculatedCurrent,
                    targetDate: this.goalType === 'Saving' ? this.targetDate : undefined,
                    monthlyInstallment: this.goalType === 'Saving' ? this.monthlyInstallment : (this.goalType === 'Debt' ? (calculatedTarget / Math.max(1, this.debtInstallmentCount)) : undefined),
                    showInPending: this.showInPending,
                    linkedAccountIds: Array.from(this.selectedAccountIds),
                    totalInstallments: this.goalType === 'Debt' ? this.debtInstallmentCount : undefined,
                    startDate: this.goalType === 'Debt' ? this.debtStartDate : (this.goalType === 'Saving' ? (this.startDate || moment().format('YYYY-MM-DD')) : undefined),
                    completed: false,
                };

                if (!this.plugin.settings.goals) this.plugin.settings.goals = [];
                this.plugin.settings.goals.push(newGoal);
            }

            // --- BACKDATING LOGIC FOR SAVING GOALS ---
            // "se eu to no mes 10, eu registrei la q eu comecei a guarda mes 5, ele tem q automaticamente ja deixar registrado ate o mes 9"
            const targetGoal = this.goal ?
                (this.plugin.settings.goals || []).find(g => g.id === this.goal?.id) :
                this.plugin.settings.goals[this.plugin.settings.goals.length - 1]; // The one just added

            if (targetGoal && targetGoal.goalType === 'Saving' && targetGoal.startDate && targetGoal.monthlyInstallment) {
                const start = moment(targetGoal.startDate).startOf('month');
                const today = moment().startOf('month');
                const monthlyAmount = targetGoal.monthlyInstallment;

                if (start.isBefore(today)) {
                    const clone = start.clone();
                    while (clone.isBefore(today)) {
                        const monthKey = clone.format('YYYY-MM');

                        // Check if already paid/registered
                        const history = targetGoal.history || [];
                        const exists = history.some(h => {
                            if (h.referenceMonth) return h.referenceMonth === monthKey;
                            return moment(h.date).format('YYYY-MM') === monthKey;
                        });

                        if (!exists) {
                            // Register Virtual Progress
                            targetGoal.currentAmount += monthlyAmount;
                            if (!targetGoal.history) targetGoal.history = [];

                            const backdateDate = clone.clone().date(1).format('YYYY-MM-DD'); // 1st of that month

                            targetGoal.history.push({
                                date: new Date().toISOString(), // Record creation date (now)
                                amount: monthlyAmount,
                                balanceAfter: targetGoal.currentAmount,
                                referenceMonth: monthKey
                            });

                            // Create Real Backdated Transaction (to keep cashflow correct)
                            const realTx: Transaction = {
                                id: `txn_backfill_${targetGoal.id}_${monthKey}`,
                                description: `Economia Retroativa: ${targetGoal.name}`,
                                amount: monthlyAmount,
                                date: backdateDate,
                                category: 'Metas',
                                type: 'expense',
                                status: 'paid',
                                isRecurring: false,
                                isInstallment: false,
                                paymentMonth: monthKey
                            };
                            this.plugin.settings.transactions.push(realTx);
                        }

                        clone.add(1, 'month');
                    }
                }
            }

            // 2. DEBT BACKDATING (Auto-Generate Past Paid Transactions)
            if (targetGoal && targetGoal.goalType === 'Debt' && targetGoal.startDate && targetGoal.monthlyInstallment) {
                const startLoan = moment(targetGoal.startDate);
                // Rule: Loan Date + 1 Month = First Due Date
                const firstDue = startLoan.clone().add(1, 'month');

                // Calculate how many parcels are considered "Paid" based on the goal's currentAmount (which comes from the modal input)
                const paidValue = targetGoal.currentAmount || 0;
                const monthlyValue = targetGoal.monthlyInstallment || 1;
                // Rounding to nearest integer to handle float precision, though it should be exact from input
                const installmentsPaidCount = Math.round(paidValue / monthlyValue);

                const totalParcels = targetGoal.totalInstallments || 1;

                // Loop exactly 'installmentsPaidCount' times to generate history
                for (let i = 0; i < installmentsPaidCount; i++) {
                    // i=0 -> First Due Date
                    const dueToken = firstDue.clone().add(i, 'months');
                    const dueKey = dueToken.format('YYYY-MM-DD');
                    const monthKey = dueToken.format('YYYY-MM');
                    const currentParcelIndex = i + 1; // 1-based index

                    if (currentParcelIndex > totalParcels) break;

                    // Check collision
                    const exists = this.plugin.settings.transactions.some(t =>
                        t.description.includes(`Pagamento Dívida: ${targetGoal.name}`) &&
                        (t.paymentMonth === monthKey || t.date === dueKey)
                    );

                    if (!exists) {
                        const newTx: Transaction = {
                            id: `debt_backfill_${targetGoal.id}_${currentParcelIndex}_${Date.now()}_${i}`,
                            description: `Pagamento Dívida: ${targetGoal.name} (${currentParcelIndex}/${totalParcels})`, // Added Explicit Installment Count to Description
                            amount: monthlyValue,
                            type: 'expense',
                            // User Request: "Vence mes 11, teria que ta no pago do mes 10".
                            // Fix: Show Date as Due Date (e.g. 15/11), but file it under Previous Month (10/2025)
                            date: dueKey,
                            category: 'Dívidas',
                            status: 'paid', // Explicitly PAID
                            isRecurring: false,
                            isInstallment: true, // Mark as installment for UI
                            installmentOf: targetGoal.id, // Link to goal
                            currentInstallment: currentParcelIndex,
                            totalInstallments: totalParcels,
                            // CRITICAL: This puts the transaction in the PREVIOUS month's list
                            paymentMonth: dueToken.clone().subtract(1, 'month').format('YYYY-MM')
                        };
                        this.plugin.settings.transactions.push(newTx);
                    }
                }
            }

            await this.plugin.saveSettings();
            eventManager.emit('data-changed');
            // new Notice('Meta salva com sucesso!');
            this.onSubmit();
            this.close();

        } catch (e) {
            new Notice('Erro ao salvar meta. Verifique o console.');
            console.error("Nexus Hub Error:", e);
        }
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

    // Override the close method to prevent closing the modal
    close() {
        // do nothing.
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // Hide the close button
        const closeButton = this.containerEl.querySelector('.modal-close-button');
        if (closeButton) {
            (closeButton as HTMLElement).style.display = 'none';
        }

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

            // Award achievements
            await unlockAchievement('set_user_name');
            await unlockAchievement('first_income');

            // Check for card drops (e.g. Ledger card for setup completion)
            // Cards will be checked when user marks transactions as paid

            eventManager.emit('data-changed');
            if (this.onSubmit) this.onSubmit();
            super.close(); // Call the original close method
        }));
    }

    private createRecurringIncome() {
        const newTransactions: Transaction[] = [];
        const finalDate = moment().add(2, 'years');
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

        let XLSX;
        try {
            // Lazy load XLSX to prevent mobile crash on startup
            XLSX = await import('xlsx');
        } catch (e) {
            console.error("Nexus Hub: Failed to load xlsx library", e);
            new Notice("Erro: Biblioteca XLSX não suportada neste dispositivo.");
            return;
        }

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
                id: `txn_${Date.now()}`,
                description: description,
                amount: Math.abs(amount),
                date: date.format('YYYY-MM-DD'),
                category: 'Importado',
                type: 'income',
                status: 'paid',
                isRecurring: false,
                isInstallment: false,
            };
            transactionsToImport.push(newTransaction);
        }
        this.plugin.settings.transactions.push(...transactionsToImport);
        await this.plugin.saveSettings();
        eventManager.emit('data-changed');
        // new Notice(`${transactionsToImport.length} transações importadas com sucesso!`);
        this.close();
    }
}

export class AddCreditCardFormModal extends Modal {
    plugin: NexusHubPlugin;
    onSubmit: () => void;
    card?: CreditCard;

    // Form state
    private name: string = '';
    private limit: number = 0;
    private closingDay: number = 1;
    private dueDate: number = 10;

    constructor(app: App, plugin: NexusHubPlugin, onSubmit: () => void, card?: CreditCard) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
        this.card = card;

        if (this.card) {
            this.name = this.card.name;
            this.limit = this.card.limit;
            this.closingDay = this.card.closingDay;
            this.dueDate = this.card.dueDate;
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.contentEl.addClass('nexus-fintech-modal-compact');

        const title = this.card ? 'Editar Cartão de Crédito' : 'Adicionar Cartão de Crédito';
        const header = contentEl.createDiv({ cls: 'modal-header' });
        header.createEl('h2', { text: title });

        const styleEl = contentEl.createEl('style');
        styleEl.innerHTML = `
            .nexus-fintech-modal-compact .modal-content {
                padding: 0;
                background-color: #101010;
            }
            .nexus-fintech-modal-compact .modal-header {
                padding: 10px 15px;
                border-bottom: 1px solid #2a2a2a;
            }
            .nexus-fintech-modal-compact .modal-header h2 { margin: 0; font-size: 1.1rem; }

            .transaction-form-container {
                padding: 15px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .form-group {
                display: flex; flex-direction: column; gap: 6px;
            }
            .form-group label {
                font-size: 0.8rem; color: #bbb; font-weight: 600;
            }
            .form-group input {
                background-color: #1A1A1A; border: 1px solid #333; border-radius: 6px;
                color: #FFF;
                font-size: 0.9rem;
                width: 100%;
                box-sizing: border-box;
                transition: all 0.2s ease-in-out;
                height: 38px; /* Explicit height */
                padding: 0 10px; /* Horizontal padding */
            }
            .form-group input::placeholder { color: #555; }
            .form-group input:focus {
                background-color: #1A1A1A; border-color: #6D28D9;
                outline: none;
                box-shadow: 0 0 0 3px rgba(109, 40, 217, 0.3);
            }
            .form-group-button { margin-top: 12px; }
            .form-group-button .setting-item { border: none; padding: 0; }
            .form-group-button .setting-item-control button {
                width: 100%;
                background: #6D28D9;
                color: white;
                border: none;
                border-radius: 8px;
                padding: 10px 0;
                font-size: 1rem;
                font-weight: 600;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            .form-group-button .setting-item-control button:hover { background: #5b21b6; }
        `;

        const formContainer = contentEl.createDiv({ cls: 'transaction-form-container' });
        this.renderFormGroups(formContainer);

        const buttonContainer = formContainer.createDiv({ cls: 'form-group-button' });
        new Setting(buttonContainer)
            .addButton(button => button
                .setButtonText('Salvar')
                .setCta()
                .onClick(() => this.saveCard()));
    }

    private renderFormGroups(container: HTMLElement) {
        const createGroup = (labelText: string, el: HTMLElement) => {
            const group = container.createDiv({ cls: 'form-group' });
            group.createEl('label', { text: labelText });
            group.appendChild(el);
            return group;
        };

        const createInput = (labelText: string, placeholder: string, initialValue: string, onchange: (value: string) => void, type: string = 'text') => {
            const input = createEl('input', { attr: { type, placeholder } });
            input.value = initialValue;
            input.oninput = () => onchange(input.value);
            createGroup(labelText, input);
        };

        const createCurrencyInput = (labelText: string, placeholder: string, initialValue: number, onchange: (value: number) => void) => {
            const textInput = new TextComponent(createDiv());
            textInput.inputEl.placeholder = placeholder;
            setupCurrencyInput(textInput, onchange, initialValue);
            createGroup(labelText, textInput.inputEl);
        };

        createInput('Nome do Cartão', 'Ex: Nubank, Inter, etc.', this.name, value => this.name = value);
        createCurrencyInput('Limite do Cartão', 'Digite o limite', this.limit, value => this.limit = value);
        createInput('Dia do Fechamento da Fatura', 'Ex: 1 a 31', String(this.closingDay), value => this.closingDay = Math.max(1, Math.min(31, Number(value) || 1)), 'number');
        createInput('Dia do Vencimento da Fatura', 'Ex: 1 a 31', String(this.dueDate), value => this.dueDate = Math.max(1, Math.min(31, Number(value) || 1)), 'number');
    }

    async saveCard() {
        if (!this.name || this.limit <= 0 || !this.closingDay || !this.dueDate) {
            new Notice('Todos os campos são obrigatórios.');
            return;
        }

        if (this.card) {
            // Editing existing card
            const cardIndex = (this.plugin.settings.creditCards || []).findIndex(c => c.id === this.card!.id);
            if (cardIndex > -1) {
                const currentCards = this.plugin.settings.creditCards || [];
                currentCards[cardIndex] = {
                    ...currentCards[cardIndex],
                    name: this.name,
                    limit: this.limit,
                    closingDay: this.closingDay,
                    dueDate: this.dueDate,
                };
            }
        } else {
            // Creating new card
            const newCard: CreditCard = {
                id: `card_${Date.now()}`,
                name: this.name,
                limit: this.limit,
                closingDay: this.closingDay,
                dueDate: this.dueDate,
            };
            if (!this.plugin.settings.creditCards) {
                this.plugin.settings.creditCards = [];
            }
            this.plugin.settings.creditCards.push(newCard);
        }

        await this.plugin.saveSettings();
        this.onSubmit();
        this.close();
    }

    onClose() {
        this.contentEl.empty();
    }
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
        this.contentEl.addClass('nexus-fintech-modal');

        const header = contentEl.createDiv({ cls: 'modal-header' });
        header.createEl('h2', { text: 'Meus Cartões de Crédito' });

        const helpIcon = header.createDiv({ cls: 'clickable-icon help-icon modal-help-icon' });
        setIcon(helpIcon, 'help-circle');
        helpIcon.setAttr('title', 'O que é a Gestão de Cartões?');
        helpIcon.addEventListener('click', () => {
            const helpText = `<h3>Para que serve a Gestão de Cartões?</h3><p>Esta seção centraliza <strong>todas as informações e faturas dos seus cartões de crédito</strong>, transformando o caos em controle.</p><br><br><h3>Como usar?</h3><p><strong>1. Cadastre seus Cartões:</strong><br>Adicione cada um dos seus cartões de crédito informando o nome (ex: Nubank, Inter), o limite, o dia de fechamento e o dia de vencimento da fatura.</p><p><strong>2. Lance suas Compras:</strong><br>Ao fazer uma compra no crédito (especialmente as parceladas), lance-a no cartão correspondente. O plugin cuidará do resto, criando as transações de fatura para os meses seguintes automaticamente.</p><p><strong>3. Visão Clara na Tela Principal:</strong><br>No seu dashboard, você verá o valor atual da fatura de cada cartão e a data de vencimento. Isso te ajuda a se planejar para o pagamento e evita surpresas no fim do mês.</p><br><br><p><strong>Dica de Mestre:</strong> Manter seus cartões aqui é fundamental. Isso garante que suas faturas sejam contabilizadas como despesas futuras, dando a você uma visão precisa e realista de todos os seus compromissos financeiros.</p>`;
            new InfoModal(this.app, 'Sobre a Gestão de Cartões', helpText).open();
        });

        const styleEl = contentEl.createEl('style');
        styleEl.innerHTML = `
            /* NUCLEAR CSS INJECTION */
            .nexus-fintech-modal .modal-content {
                width: 700px;
                max-width: 95vw;
                padding: 0;
            }
            .modal-help-icon svg { width: 24px; height: 24px; }
            .nexus-fintech-modal .modal-header {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 15px 20px;
                border-bottom: 1px solid rgba(255,255,255,0.1);
            }
            .nexus-fintech-modal .modal-header h2 { margin: 0; flex-grow: 1; color: #fff; }
            
            .credit-card-list-container { 
                padding: 25px !important; 
                display: grid !important; 
                grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)) !important; 
                gap: 25px !important; 
            }
            
            .credit-card {
                background: linear-gradient(135deg, #2b0a3d 0%, #000000 100%) !important;
                border: 1px solid rgba(138, 43, 226, 0.4) !important;
                border-radius: 20px !important;
                padding: 25px !important;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5) !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: space-between !important;
                min-height: 220px !important;
                position: relative !important;
                overflow: hidden !important;
                transition: transform 0.3s ease, box-shadow 0.3s ease !important;
                cursor: pointer !important;
            }
            .credit-card:hover { 
                transform: translateY(-8px) scale(1.02) !important; 
                box-shadow: 0 20px 50px rgba(0,0,0,0.7), 0 0 25px rgba(138, 43, 226, 0.3) !important;
                border-color: rgba(138, 43, 226, 0.8) !important;
            }

            .credit-card::before {
                content: '';
                position: absolute;
                top: 0; left: -150%;
                width: 100%; height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
                transform: skewX(-25deg);
                transition: none;
                pointer-events: none;
            }
            .credit-card:hover::before {
                left: 150%;
                transition: left 0.7s ease;
            }

            .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
            .card-name { font-size: 1.6em; font-weight: 800; color: #fff; text-shadow: 0 2px 5px rgba(0,0,0,0.5); }
            
            .card-body { text-align: left; margin-top: auto; margin-bottom: auto; }
            .card-limit-label { font-size: 0.75em; text-transform: uppercase; color: rgba(255,255,255,0.6); letter-spacing: 2px; }
            .card-limit-value { font-size: 2.5em; font-weight: 700; color: #fff; background: linear-gradient(to right, #fff, #e0e0e0); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

            .card-footer { display: flex; justify-content: space-between; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 20px; }
            .card-date-info { display: flex; flex-direction: column; }
            .card-date-value { font-size: 1.1em; font-weight: 600; color: #fff; }
            .card-date-label { color: rgba(255,255,255,0.5); font-size: 0.7em; text-transform: uppercase; }

            .card-actions-overlay {
                position: absolute; top: 15px; right: 15px;
                display: flex; gap: 8px;
                opacity: 0; transform: translateY(-5px); transition: all 0.2s;
            }
            .credit-card:hover .card-actions-overlay { opacity: 1; transform: translateY(0); }
            .action-btn-icon { background: rgba(255,255,255,0.1); color: #fff; border-radius: 8px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; }
            .action-btn-icon:hover { background: rgba(255,255,255,0.25); }
        `;
        // .card-actions button { background: none; border: none; color: var(--text-muted); cursor: pointer; }
        //     .card-actions button:hover { color: var(--text-normal); }

        //     .no-cards-message { padding: 40px 20px; text-align: center; color: #888; }
        //     .modal-footer { padding: 0 20px 20px 20px; }
        // `;

        const cardListEl = contentEl.createDiv({ cls: 'credit-card-list-container' });
        const cards = this.plugin.settings.creditCards || [];

        if (cards.length === 0) {
            cardListEl.createDiv({ cls: 'no-cards-message' }).createEl('p', { text: 'Você ainda não adicionou nenhum cartão de crédito.' });
        } else {
            cards.forEach(card => {
                const cardEl = cardListEl.createDiv({ cls: 'credit-card' });

                // Click Listener for Details
                cardEl.addEventListener('click', (e) => {
                    new CardBillDetailModal(this.app, this.plugin, card.id, this.currentMonth, () => this.onOpen()).open();
                });

                // Header
                const cardHeader = cardEl.createDiv({ cls: 'card-header' });
                cardHeader.createDiv({ cls: 'card-name', text: card.name });
                const iconEl = cardHeader.createDiv({ cls: 'card-brand-icon' });
                setIcon(iconEl, 'credit-card');

                // Body
                const cardBody = cardEl.createDiv({ cls: 'card-body' });
                cardBody.createDiv({ cls: 'card-limit-label', text: 'Limite Disponível' });
                cardBody.createDiv({ cls: 'card-limit-value', text: formatAsCurrency(card.limit) });

                // Footer
                const cardFooter = cardEl.createDiv({ cls: 'card-footer' });

                const closingInfo = cardFooter.createDiv({ cls: 'card-date-info' });
                closingInfo.createDiv({ cls: 'card-date-label', text: 'Fecha dia' });
                closingInfo.createDiv({ cls: 'card-date-value', text: card.closingDay.toString() });

                const dueInfo = cardFooter.createDiv({ cls: 'card-date-info' });
                dueInfo.createDiv({ cls: 'card-date-label', text: 'Vence dia' });
                dueInfo.createDiv({ cls: 'card-date-value', text: card.dueDate.toString() });

                // Actions (Overlay)
                const actionsContainer = cardEl.createDiv({ cls: 'card-actions-overlay' });

                const editBtn = new ButtonComponent(actionsContainer)
                    .setIcon('pencil')
                    .setTooltip('Editar')
                    .onClick((evt) => {
                        evt.stopPropagation();
                        new AddCreditCardFormModal(this.app, this.plugin, () => this.onOpen(), card).open();
                    });
                editBtn.buttonEl.addClass('action-btn-icon');

                const deleteBtn = new ButtonComponent(actionsContainer)
                    .setIcon('trash-2')
                    .setTooltip('Apagar')
                    .setClass('mod-warning')
                    .onClick((evt) => {
                        evt.stopPropagation();
                        new ConfirmationModal(this.app, 'Apagar Cartão', `Tem certeza que deseja apagar o cartão '${card.name}'?`, async () => {
                            this.plugin.settings.creditCards = (this.plugin.settings.creditCards || []).filter(c => c.id !== card.id);
                            await this.plugin.saveSettings();
                            this.onOpen();
                        }).open();
                    });
                deleteBtn.buttonEl.addClass('action-btn-icon');
            });
        }

        const footerEl = contentEl.createDiv({ cls: 'modal-footer' });
        new Setting(footerEl).addButton(btn => btn.setButtonText('Adicionar Novo Cartão').setCta().onClick(() => {
            new AddCreditCardFormModal(this.app, this.plugin, () => this.onOpen()).open();
        }));
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class AddExtraIncomeModal extends Modal {
    plugin: NexusHubPlugin;
    currentMonth: moment.Moment;
    onSubmit: () => void;

    // Form state
    private description: string = '';
    private amount: number = 0;
    private date: string = moment().format('YYYY-MM-DD');
    private category: string = 'Renda Extra'; // Default category for extra income

    constructor(app: App, plugin: NexusHubPlugin, currentMonth: moment.Moment, onSubmit: () => void) {
        super(app);
        this.plugin = plugin;
        this.currentMonth = currentMonth;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.contentEl.addClass('nexus-fintech-modal');

        const header = contentEl.createDiv({ cls: 'modal-header-with-action' });
        new ButtonComponent(header).setIcon('arrow-left').setTooltip('Voltar').onClick(() => {
            this.close();
        });
        header.createEl('h2', { text: 'Adicionar Renda Extra' });

        const helpIcon = header.createDiv({ cls: 'clickable-icon help-icon modal-help-icon' });
        setIcon(helpIcon, 'help-circle');
        helpIcon.setAttr('title', 'O que é Renda Extra?');
        helpIcon.addEventListener('click', () => {
            const helpText = `<h3>O que é a Renda Extra?</h3><p>A seção de "Renda Extra" foi criada para você registrar todo dinheiro que entra no seu orçamento e que <strong>não vem da sua fonte de renda principal</strong> (seu salário já cadastrado).</p><br><br><h3>O que eu devo registrar aqui?</h3><p>Qualquer valor que você recebe por fora. Por exemplo:<br>- <strong>Trabalhos Freelance:</strong> Um projeto de design, uma consultoria, etc.<br>- <strong>Vendas:</strong> Vendeu um item usado, um produto que você fabrica, etc.<br>- <strong>Presentes em Dinheiro:</strong> Ganhou um dinheiro inesperado.<br>- <strong>Reembolsos:</strong> Recebeu um reembolso que não estava esperando.</p><br><br><p><strong>Dica de Mestre:</strong> Manter suas rendas extras registradas é crucial para ter uma visão <strong>realista</strong> da sua saúde financeira. Isso ajuda o plugin a calcular com precisão seus relatórios e a mostrar o verdadeiro potencial do seu fluxo de caixa.</p>`;
            new InfoModal(this.app, 'Sobre a Renda Extra', helpText).open();
        });

        const styleEl = contentEl.createEl('style');
        styleEl.innerHTML = `
            .modal-header-with-action {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .modal-help-icon svg { /* Aumenta o tamanho do ícone de ajuda */
                width: 24px;
                height: 24px;
            }
            .modal-header-with-action h2 {
                margin: 0 auto; /* Centraliza o título */
            }
            .extra-income-form-group {
                display: flex;
                flex-direction: column;
                margin-bottom: 15px;
            }
            .extra-income-form-group label {
                font-size: 0.9em;
                color: var(--text-muted);
                margin-bottom: 5px;
                font-weight: 600;
            }
            .extra-income-form-group input[type='text'],
            .extra-income-form-group input[type='number'],
            .extra-income-form-group input[type='date'] {
                padding: 8px 12px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                background-color: var(--background-secondary);
                color: var(--text-normal);
                font-size: 1em;
                transition: border-color 0.2s ease-in-out;
                width: 100%;
                box-sizing: border-box;
            }
            .extra-income-form-group input:focus {
                border-color: var(--interactive-accent);
                outline: none;
                box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2);
            }
        `;

        const formContainer = contentEl.createDiv({ cls: 'transaction-form-container' });
        this.renderFormGroups(formContainer);

        const footerEl = contentEl.createDiv({ cls: 'modal-footer' });
        new Setting(footerEl)
            .addButton(button => button
                .setButtonText('Adicionar Renda')
                .setCta()
                .onClick(() => this.saveTransaction()));
    }

    private renderFormGroups(container: HTMLElement) {
        const createGroup = (labelText: string, el: HTMLElement) => {
            const group = container.createDiv({ cls: 'form-group extra-income-form-group' });
            group.createEl('label', { text: labelText });
            group.appendChild(el);
        };

        const createInput = (labelText: string, placeholder: string, initialValue: string, onchange: (value: string) => void, type: string = 'text') => {
            const input = new TextComponent(container).setPlaceholder(placeholder).setValue(initialValue).onChange(onchange);
            input.inputEl.type = type;
            createGroup(labelText, input.inputEl);
        };

        const createCurrencyInput = (labelText: string, placeholder: string, initialValue: number, onchange: (value: number) => void) => {
            const textInput = new TextComponent(container);
            setupCurrencyInput(textInput, onchange, initialValue, placeholder);
            createGroup(labelText, textInput.inputEl);
        };

        createInput('Descrição', 'Ex: Venda de item, Freelance', this.description, value => this.description = value);
        createCurrencyInput('Valor', 'Digite o valor', this.amount, value => this.amount = value);
        createInput('Data da Renda', '', this.date, value => this.date = value, 'date');
        renderCategoryDropdown(container, this.plugin, () => this.category, (value) => this.category = value);
    }

    async saveTransaction() {
        if (!this.description || this.amount <= 0 || !this.category) {
            new Notice('Descrição, valor e categoria são obrigatórios.');
            return;
        }

        const newTransaction: Transaction = {
            id: `txn_${Date.now()} `,
            description: this.description,
            amount: this.amount,
            date: this.date,
            category: this.category,
            type: 'income',
            status: 'paid',
            isRecurring: false,
            isInstallment: false,
            paymentMonth: moment(this.date).format('YYYY-MM'),
        };
        this.plugin.settings.transactions.push(newTransaction);

        await this.plugin.saveSettings();
        eventManager.emit('data-changed', this.plugin.settings);
        this.onSubmit();
        this.close();
    }

    onClose() {
        this.contentEl.empty();
    }
}
export class ManageExtraIncomeModal extends Modal {
    plugin: NexusHubPlugin;
    onSubmit: () => void;

    constructor(app: App, plugin: NexusHubPlugin, onSubmit: () => void) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.contentEl.addClass('nexus-fintech-modal');

        const header = contentEl.createDiv({ cls: 'modal-header-with-action' });
        new ButtonComponent(header).setIcon('arrow-left').setTooltip('Voltar').onClick(() => {
            this.close();
        });
        header.createEl('h2', { text: 'Suas Rendas Extras' });

        const helpIcon = header.createDiv({ cls: 'clickable-icon help-icon modal-help-icon' });
        setIcon(helpIcon, 'help-circle');
        helpIcon.setAttr('title', 'O que é Renda Extra?');
        helpIcon.addEventListener('click', () => {
            const helpText = `<h3>O que é a Renda Extra?</h3><p>A seção de "Renda Extra" foi criada para você registrar todo dinheiro que entra no seu orçamento e que <strong>não vem da sua fonte de renda principal</strong> (seu salário já cadastrado).</p><br><br><h3>O que eu devo registrar aqui?</h3><p>Qualquer valor que você recebe por fora. Por exemplo:<br>- <strong>Trabalhos Freelance:</strong> Um projeto de design, uma consultoria, etc.<br>- <strong>Vendas:</strong> Vendeu um item usado, um produto que você fabrica, etc.<br>- <strong>Presentes em Dinheiro:</strong> Ganhou um dinheiro inesperado.<br>- <strong>Reembolsos:</strong> Recebeu um reembolso que não estava esperando.</p><br><br><p><strong>Dica de Mestre:</strong> Manter suas rendas extras registradas é crucial para ter uma visão <strong>realista</strong> da sua saúde financeira. Isso ajuda o plugin a calcular com precisão seus relatórios e a mostrar o verdadeiro potencial do seu fluxo de caixa.</p>`;
            new InfoModal(this.app, 'Sobre a Renda Extra', helpText).open();
        });

        const styleEl = contentEl.createEl('style');
        styleEl.innerHTML = `
            .modal-header-with-action {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .modal-help-icon svg { /* Aumenta o tamanho do ícone de ajuda */
                width: 24px;
                height: 24px;
            }
            .modal-header-with-action h2 {
                margin: 0 auto; /* Centraliza o título */
            }
            .nexus-fintech-modal .modal-content {
                width: 700px;
                max-width: 95vw;
            }
            .extra-income-list-container {
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 15px;
            }
            .extra-income-card {
                background: var(--background-secondary);
                border-radius: 12px;
                padding: 15px 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            }
            .income-info {
                display: flex;
                flex-direction: column;
            }
            .income-description {
                font-weight: 500;
                font-size: 1.1em;
                color: var(--text-normal);
            }
            .income-date {
                font-size: 0.85em;
                color: var(--text-muted);
            }
            .income-amount {
                font-weight: 600;
                font-size: 1.1em;
                color: var(--color-green);
            }
            .income-actions {
                display: flex;
                gap: 8px;
            }
            .no-incomes-message {
                padding: 40px 20px;
                text-align: center;
                color: var(--text-muted);
            }
            .modal-footer {
                padding: 0 20px 20px 20px;
            }
        `;

        this.renderIncomes(contentEl);
    }

    private renderIncomes(container: HTMLElement) {
        const incomeListEl = container.createDiv({ cls: 'extra-income-list-container' });
        const incomes = this.plugin.settings.transactions
            .filter(t => t.type === 'income' && !t.isRecurring && !t.isInstallment && t.category === 'Renda Extra');

        if (incomes.length === 0) {
            incomeListEl.createDiv({ cls: 'no-incomes-message' }).createEl('p', { text: 'Nenhuma renda extra adicionada ainda.' });
        } else {
            incomes.forEach(income => {
                const incomeCard = incomeListEl.createDiv({ cls: 'extra-income-card' });

                const infoEl = incomeCard.createDiv({ cls: 'income-info' });
                infoEl.createEl('div', { cls: 'income-description', text: income.description });
                infoEl.createEl('div', { cls: 'income-date', text: moment(income.date).format('DD/MM/YYYY') });

                incomeCard.createEl('div', { cls: 'income-amount', text: formatAsCurrency(income.amount) });

                const actionsEl = incomeCard.createDiv({ cls: 'income-actions' });
                new ButtonComponent(actionsEl).setIcon('pencil').setTooltip('Editar Renda').onClick((evt) => {
                    evt.stopPropagation();
                    // TODO: Implement EditExtraIncomeModal
                    new Notice('Funcionalidade de edição ainda não implementada.');
                });
                new ButtonComponent(actionsEl).setIcon('trash-2').setTooltip('Apagar Renda').setClass('mod-warning').onClick((evt) => {
                    evt.stopPropagation();
                    new ConfirmationModal(this.app, 'Apagar Renda Extra', `Tem certeza que deseja apagar a renda extra '${income.description}' ? `, async () => {
                        this.plugin.settings.transactions = this.plugin.settings.transactions.filter(t => t.id !== income.id);
                        await this.plugin.saveSettings();
                        this.onOpen(); // Re-render the list
                    }).open();
                });
            });
        }

        const footerEl = container.createDiv({ cls: 'modal-footer' });
        new Setting(footerEl).addButton(btn => btn.setButtonText('Adicionar Nova Renda Extra').setCta().onClick(() => {
            new AddExtraIncomeModal(this.app, this.plugin, moment(), () => this.onOpen()).open();
        }));
    }

    onClose() {
        this.contentEl.empty();
        this.onSubmit();
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
        this.contentEl.addClass('nexus-fintech-modal');

        const header = contentEl.createDiv({ cls: 'modal-header' });
        header.createEl('h2', { text: 'Gerenciar Orçamentos' });

        const helpIcon = header.createDiv({ cls: 'clickable-icon help-icon modal-help-icon' });
        setIcon(helpIcon, 'help-circle');
        helpIcon.setAttr('title', 'O que são Orçamentos?');
        helpIcon.addEventListener('click', () => {
            const helpText = `< p > A seção de Orçamentos permite que você defina limites de gastos para suas categorias, ajudando a controlar para onde seu dinheiro vai.< /p><br><br><p><strong>Como funciona:</strong > <br>- <strong>Criação: </strong> Você pode definir um valor máximo que planeja gastar em uma categoria específica a cada mês (ex: R$ 500 para Alimentação).<br>- <strong>Acompanhamento:</strong > O plugin monitora seus gastos em tempo real.Na tela principal, a barra de progresso da categoria mostra o quanto do orçamento você já utilizou.< br > - <strong>Controle: </strong> Ao visualizar seus orçamentos, você pode ver rapidamente quais categorias estão dentro do limite e quais estão próximas de estourar, permitindo que você ajuste seus gastos antes que seja tarde demais.</p > <br><br><p>Use os orçamentos como um guia para suas decisões de compra diárias e para garantir que você está alinhado com seu plano financeiro.</p>`;
            new InfoModal(this.app, 'Sobre os Orçamentos', helpText).open();
        });

        const styleEl = contentEl.createEl('style');
        styleEl.innerHTML = `
            .modal-header {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .modal-help-icon svg { /* Aumenta o tamanho do ícone de ajuda */
                width: 24px;
                height: 24px;
            }
            .modal-header h2 {
                margin: 0;
                flex-grow: 1;
            }
            .budgets-container {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                gap: 20px;
                padding: 20px;
            }
            .budget-card {
                background: var(--background-secondary);
                border-radius: 12px;
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .budget-card-header { display: flex; justify-content: space-between; align-items: baseline; }
            .budget-category-name { font-weight: 600; font-size: 1.1em; }
            .budget-card-details { font-size: 0.9em; color: var(--text-muted); }
            .progress-bar-wrapper { width: 100%; height: 8px; background-color: var(--background-primary); border-radius: 4px; overflow: hidden; margin-top: 5px; }
            .progress-bar-fill { height: 100%; background-color: var(--interactive-accent); transition: width .3s ease-in-out; }
            .progress-bar-fill.is-over-limit { background-color: var(--text-error); }
            .budget-actions { display: flex; gap: 10px; margin-top: 15px; }
        `;

        this.renderBudgets(contentEl);
    }

    private renderBudgets(container: HTMLElement) {
        const budgetsContainer = container.createDiv({ cls: 'budgets-container' });
        const budgets = this.plugin.settings.budgets || [];
        const transactions = this.plugin.settings.transactions || [];

        if (budgets.length === 0) {
            budgetsContainer.createDiv({ cls: 'no-transactions-message' }).createEl('p', { text: 'Nenhum orçamento definido ainda.' });
        } else {
            budgets.forEach(budget => {
                const category = this.plugin.settings.categories.find(c => c.id === budget.categoryId);
                const categoryName = category ? category.name : 'Categoria Desconhecida';

                const spentAmount = transactions
                    .filter(t => t.category === categoryName && t.type === 'expense' && t.status === 'paid')
                    .reduce((sum, t) => sum + t.amount, 0);

                const percentage = budget.amount > 0 ? (spentAmount / budget.amount) * 100 : 0;

                const budgetCard = budgetsContainer.createDiv({ cls: 'budget-card' });

                const header = budgetCard.createDiv({ cls: 'budget-card-header' });
                header.createEl('span', { cls: 'budget-category-name', text: categoryName });

                const details = budgetCard.createDiv({ cls: 'budget-card-details' });
                details.setText(`${formatAsCurrency(spentAmount)} / ${formatAsCurrency(budget.amount)}`);

                const progressWrapper = budgetCard.createDiv({ cls: 'progress-bar-wrapper' });
                const progressFill = progressWrapper.createDiv({ cls: 'progress-bar-fill' });
                progressFill.style.width = `${Math.min(percentage, 100)}%`;
                if (percentage > 100) {
                    progressFill.addClass('is-over-limit');
                }

                const actions = budgetCard.createDiv({ cls: 'budget-actions' });
                new ButtonComponent(actions).setButtonText('Editar').onClick(() => {
                    new PromptModal(this.app, 'Editar Orçamento', 'Valor do orçamento', async (newValue: string) => {
                        const newAmount = parseCurrency(newValue);
                        if (isNaN(newAmount) || newAmount <= 0) {
                            new Notice('Por favor, insira um valor válido.');
                            return;
                        }
                        budget.amount = newAmount;
                        await this.plugin.saveSettings();
                        this.onOpen();
                    }, String(budget.amount)).open();
                });
                new ButtonComponent(actions).setButtonText('Apagar').setClass('mod-warning').onClick(() => {
                    new ConfirmationModal(this.app, 'Apagar Orçamento', `Tem certeza que deseja apagar o orçamento para '${categoryName}'?`, async () => {
                        this.plugin.settings.budgets = (this.plugin.settings.budgets || []).filter(b => b.categoryId !== budget.categoryId);
                        await this.plugin.saveSettings();
                        this.onOpen();
                    }).open();
                });
            });
        }

        const footerEl = container.createDiv({ cls: 'modal-footer' });
        new Setting(footerEl).addButton(btn => btn.setButtonText('Adicionar Novo Orçamento').setCta().onClick(() => {
            const availableCategories = this.plugin.settings.categories.filter(cat => !(this.plugin.settings.budgets || []).some(b => b.categoryId === cat.id));
            if (availableCategories.length === 0) {
                new Notice('Todas as categorias já possuem um orçamento ou não há categorias disponíveis.');
                return;
            }

            const categoryOptions: Record<string, string> = {};
            availableCategories.forEach(cat => categoryOptions[cat.id] = cat.name);

            new CategoryBudgetPromptModal(this.app, this.plugin, categoryOptions, async (categoryId, amount) => {
                if (!this.plugin.settings.budgets) {
                    this.plugin.settings.budgets = [];
                }
                this.plugin.settings.budgets.push({ categoryId: categoryId, amount: amount });
                await this.plugin.saveSettings();
                this.onOpen();
            }).open();
        }));
    }

    onClose() {
        this.contentEl.empty();
    }
}

class CategoryBudgetPromptModal extends Modal {
    plugin: NexusHubPlugin;
    categoryOptions: Record<string, string>; // { categoryId: categoryName }
    onSubmit: (categoryId: string, amount: number) => void;
    private selectedCategoryId: string = '';
    private budgetAmount: number = 0;

    constructor(app: App, plugin: NexusHubPlugin, categoryOptions: Record<string, string>, onSubmit: (categoryId: string, amount: number) => void) {
        super(app);
        this.plugin = plugin;
        this.categoryOptions = categoryOptions;
        this.onSubmit = onSubmit;
        this.selectedCategoryId = Object.keys(categoryOptions)[0]; // Default to first available category ID
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Definir Orçamento para Categoria' });

        new Setting(contentEl)
            .setName('Categoria')
            .addDropdown(dropdown => {
                // Populate dropdown with category names, but use IDs as values
                for (const id in this.categoryOptions) {
                    dropdown.addOption(id, this.categoryOptions[id]);
                }
                dropdown.setValue(this.selectedCategoryId);
                dropdown.onChange(value => this.selectedCategoryId = value);
            });

        new Setting(contentEl)
            .setName('Valor do Orçamento')
            .addText(text => setupCurrencyInput(text, value => this.budgetAmount = value, this.budgetAmount, 'Digite o valor do orçamento'));

        new Setting(contentEl)
            .addButton(btn => btn.setButtonText('Cancelar').onClick(() => this.close()))
            .addButton(btn => btn.setButtonText('Salvar Orçamento').setCta().onClick(() => {
                if (!this.selectedCategoryId || this.budgetAmount <= 0) {
                    new Notice('Selecione uma categoria e insira um valor válido.');
                    return;
                }
                this.onSubmit(this.selectedCategoryId, this.budgetAmount);
                this.close();
            }));
    }

    onClose() {
        this.contentEl.empty();
    }
}
export class AddTransactionModal extends Modal {
    plugin: NexusHubPlugin;
    currentMonth: moment.Moment;
    onSubmit: () => void;
    transaction?: Transaction;

    // Form state
    private description: string = '';
    private amount: number = 0;
    private date: string = moment().format('YYYY-MM-DD');
    private category: string = '';
    private type: 'income' | 'expense' = 'expense';
    private status: 'paid' | 'pending' = 'pending';
    private isRecurring: boolean = false;
    private hasEndDate: boolean = false;
    private endDate: string = '';
    private dayOfMonth: number = moment().date();
    private generationDate: string = moment().add(5, 'years').format('YYYY-MM-DD'); // New property for default limit

    // Edit Mode State
    private editAllInstallments: boolean = false;

    constructor(app: App, plugin: NexusHubPlugin, currentMonth: moment.Moment, onSubmit: () => void, transaction?: Transaction) {
        super(app);
        this.plugin = plugin;
        this.currentMonth = currentMonth;
        this.onSubmit = onSubmit;
        this.transaction = transaction;

        if (transaction) {
            this.description = transaction.description;
            this.amount = transaction.amount;
            this.date = transaction.date;
            this.category = transaction.category;
            this.type = transaction.type;
            this.status = transaction.status;
            this.isRecurring = transaction.isRecurring || false;
            this.hasEndDate = !!transaction.endDate;
            this.endDate = transaction.endDate || '';
            // If editing, try to infer dayOfMonth from date
            this.dayOfMonth = moment(transaction.date).date();
            this.generationDate = (transaction as any).generationDate || moment().add(5, 'years').format('YYYY-MM-DD');
        } else {
            this.date = this.currentMonth.format('YYYY-MM-DD');
            this.dayOfMonth = this.currentMonth.date();
            this.generationDate = moment().add(5, 'years').format('YYYY-MM-DD');
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.contentEl.addClass('nexus-fintech-modal-compact');

        const title = this.transaction ? 'Editar Transação' : 'Adicionar Nova Transação';
        const header = contentEl.createDiv({ cls: 'modal-header' });
        header.createEl('h2', { text: title });

        if (this.transaction) {
            if (this.transaction.isInstallment && this.transaction.installmentOf) {
                new Setting(contentEl)
                    .setName('Aplicar a todas as parcelas?')
                    .setDesc('Se marcado, atualizará valor, categoria e status (se pago/pendente mudou) de toda a série.')
                    .addToggle(toggle => toggle
                        .setValue(this.editAllInstallments)
                        .onChange(value => this.editAllInstallments = value));
            }
        }

        const styleEl = contentEl.createEl('style');
        styleEl.innerHTML = `
            .nexus-fintech-modal-compact .modal-content {
                padding: 0;
                background-color: #101010;
            }
            .nexus-fintech-modal-compact .modal-header {
                padding: 10px 15px;
                border-bottom: 1px solid #2a2a2a;
            }
            .nexus-fintech-modal-compact .modal-header h2 { margin: 0; font-size: 1.1rem; }

            .transaction-form-container {
                padding: 15px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .form-section-title {
                font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1.5px;
                font-weight: 600; color: #888; margin-bottom: -4px; margin-top: 10px;
            }
            .form-group {
                display: flex; flex-direction: column; gap: 6px;
            }
            .form-group label {
                font-size: 0.8rem; color: #bbb; font-weight: 600;
            }
            .form-group input, .form-group select {
                background-color: #1A1A1A; border: 1px solid #333; border-radius: 6px;
                color: #FFF;
                font-size: 0.9rem;
                width: 100%;
                box-sizing: border-box;
                transition: all 0.2s ease-in-out;
                height: 38px; /* Explicit height */
                padding: 0 10px; /* Horizontal padding */
            }
            .form-group select {
                line-height: 36px; /* Vertically center text */
            }

            .form-group input::placeholder, .form-group select:invalid { color: #555; }
            .form-group input:focus, .form-group select:focus {
                background-color: #1A1A1A; border-color: #6D28D9;
                outline: none;
                box-shadow: 0 0 0 3px rgba(109, 40, 217, 0.3);
            }
            .form-group select {
                -webkit-appearance: none;
                appearance: none;
                background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M5%207.5l5%205%205-5%22%20stroke%3D%22%23888%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E');
                background-repeat: no-repeat;
                background-position: right 8px center;
            }

            .custom-toggle-group {
                display: flex;
                justify-content: space-between;
                align-items: center;
                background-color: #1A1A1A;
                border: 1px solid #333;
                border-radius: 6px;
                padding: 8px 10px;
                margin-top: 4px;
            }
            .custom-toggle-group span { font-size: 0.9rem; font-weight: 500; color: #ccc; }
            .custom-toggle-switch { position: relative; display: inline-block; width: 38px; height: 22px; }
            .custom-toggle-switch input { opacity: 0; width: 0; height: 0; }
            .custom-toggle-slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: #333;
                transition: .4s;
                border-radius: 22px;
            }
            .custom-toggle-slider:before {
                position: absolute;
                content: "";
                height: 16px;
                width: 16px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                transition: .4s;
                border-radius: 50%;
            }
            input:checked + .custom-toggle-slider { background-color: #6D28D9; }
            input:checked + .custom-toggle-slider:before { transform: translateX(16px); }

            .recurrence-options {
                display: flex;
                flex-direction: column;
                gap: 10px; 
                background-color: #1A1A1A;
                padding: 10px;
                border-radius: 6px;
                margin-top: 5px;
            }

            .form-group-button { margin-top: 12px; }
            .form-group-button .setting-item { border: none; padding: 0; }
            .form-group-button .setting-item-control button {
                width: 100%;
                background: #6D28D9;
                color: white;
                border: none;
                border-radius: 8px;
                padding: 10px 0;
                font-size: 1rem;
                font-weight: 600;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            .form-group-button .setting-item-control button:hover { background: #5b21b6; }
        `;

        const formContainer = contentEl.createDiv({ cls: 'transaction-form-container' });
        this.renderFormGroups(formContainer);

        const buttonContainer = formContainer.createDiv({ cls: 'form-group-button' });
        new Setting(buttonContainer)
            .addButton(button => button
                .setButtonText(this.transaction ? 'Salvar Alterações' : 'Adicionar Transação')
                .setCta()
                .onClick(() => this.saveTransaction()));
    }

    private renderFormGroups(container: HTMLElement) {

        const createGroup = (labelText: string, el: HTMLElement, targetContainer?: HTMLElement) => {
            const parent = targetContainer || container;
            const group = parent.createDiv({ cls: 'form-group' });
            group.createEl('label', { text: labelText });
            group.appendChild(el);
            return group;
        };

        const createInput = (labelText: string, placeholder: string, initialValue: string, onchange: (value: string) => void, options: { type?: string, container?: HTMLElement } = {}) => {
            const input = createEl('input', { attr: { type: options.type || 'text', placeholder } });
            input.value = initialValue;
            input.oninput = () => onchange(input.value);
            createGroup(labelText, input, options.container);
        };

        const createCurrencyInput = (labelText: string, placeholder: string, initialValue: number, onchange: (value: number) => void) => {
            const textInput = new TextComponent(createDiv());
            textInput.inputEl.placeholder = placeholder;
            setupCurrencyInput(textInput, onchange, initialValue);
            createGroup(labelText, textInput.inputEl);
        };

        const createDropdown = (labelText: string, placeholder: string, options: [string, string][], initialValue: string, onchange: (value: any) => void) => {
            const select = createEl('select');
            select.required = true;
            select.add(new Option(placeholder, '', true, true));
            select.options[0].disabled = true;
            options.forEach(([value, text]) => select.add(new Option(text, value)));
            select.value = initialValue;
            select.onchange = () => onchange(select.value);
            createGroup(labelText, select);
        };

        const createToggle = (labelText: string, isChecked: boolean, onchange: (value: boolean) => void, options: { container?: HTMLElement } = {}) => {
            const targetContainer = options.container || container;
            const toggleGroup = targetContainer.createDiv({ cls: 'custom-toggle-group' });
            toggleGroup.createEl('span', { text: labelText });
            const switchLabel = toggleGroup.createEl('label', { cls: 'custom-toggle-switch' });
            const input = switchLabel.createEl('input', { type: 'checkbox' });
            input.checked = isChecked;
            input.onchange = () => onchange(input.checked);
            switchLabel.createDiv({ cls: 'custom-toggle-slider' });
        };

        // --- Render Form ---
        createInput('Descrição', 'Ex: Compras no mercado', this.description, value => this.description = value);
        createCurrencyInput('Valor', 'Digite o valor', this.amount, value => this.amount = value);

        renderCategoryDropdown(
            container,
            this.plugin,
            () => this.category,
            (value) => this.category = value
        );

        if (!this.transaction) {
            const recurrenceSection = container.createDiv();
            const recurrenceToggleSetting = new Setting(recurrenceSection)
                .setName('Transação Recorrente?')
                .addToggle(toggle => toggle
                    .setValue(this.isRecurring)
                    .onChange(value => {
                        this.isRecurring = value;
                        if (!value) this.hasEndDate = false;
                        this.onOpen();
                    }));

            if (this.isRecurring) {
                const recurrenceOptionsContainer = recurrenceSection.createDiv({ cls: 'recurrence-options' });

                // Toggle: Reverted to "Has End Date?" logic, but with exposed generation limit
                createToggle('A recorrência tem um fim?', this.hasEndDate, value => {
                    this.hasEndDate = value;
                    this.onOpen();
                }, { container: recurrenceOptionsContainer });

                if (this.hasEndDate) {
                    createInput('Data Final', '', this.endDate || moment().add(1, 'year').format('YYYY-MM-DD'), value => this.endDate = value, { type: 'date', container: recurrenceOptionsContainer });

                    // "Quitei!" Button - Only for existing transactions with end date
                    if (this.transaction) {
                        const quitBtn = recurrenceOptionsContainer.createEl('button', {
                            cls: 'quitei-btn',
                            text: 'Quitei! (Encerrar Recorrência)'
                        });
                        quitBtn.style.width = '100%';
                        quitBtn.style.marginTop = '10px';
                        quitBtn.style.backgroundColor = '#10b981'; // Green
                        quitBtn.style.color = 'white';
                        quitBtn.style.border = 'none';
                        quitBtn.style.padding = '8px';
                        quitBtn.style.borderRadius = '6px';
                        quitBtn.style.cursor = 'pointer';
                        quitBtn.style.fontWeight = 'bold';

                        quitBtn.onclick = async (e) => {
                            e.preventDefault();
                            new ConfirmationModal(this.app, 'Quitar Recorrência?', 'Isso manterá esta transação (como paga) e apagará todas as futuras desta série. Deseja continuar?', async () => {
                                await this.quitRecurrence();
                            }).open();
                        };
                    }

                } else {
                    // "Unlimited" Recurrence - Show Generation Limit
                    createInput('Dia do Vencimento', 'Ex: 5', String(this.dayOfMonth), value => {
                        let day = parseInt(value);
                        if (isNaN(day) || day < 1) day = 1;
                        if (day > 31) day = 31;
                        this.dayOfMonth = day;
                    }, { type: 'number', container: recurrenceOptionsContainer });

                    // Generation Limit (Default 5 years, editable)
                    const infoEl = recurrenceOptionsContainer.createDiv({ cls: 'recurrence-info' });
                    infoEl.createEl('small', {
                        text: `Gerar lançamentos até (Padrão de sistema):`,
                        cls: 'text-muted'
                    });
                    infoEl.style.marginTop = '10px';
                    infoEl.style.marginBottom = '2px';
                    infoEl.style.color = '#ccc';
                    infoEl.style.fontSize = '0.8rem';

                    createInput('', '', this.generationDate, value => this.generationDate = value, { type: 'date', container: recurrenceOptionsContainer });
                }
            }
        }

        container.createEl('h3', { text: 'Outros Detalhes', cls: 'form-section-title' });
        createDropdown('Tipo', 'Clique para escolher uma opção', [['expense', 'Despesa'], ['income', 'Receita']], this.type, value => this.type = value);
        createDropdown('Status', 'Clique para escolher uma opção', [['pending', 'Pendente'], ['paid', 'Paga']], this.status, value => this.status = value);
        if (!this.isRecurring || this.transaction) {
            createInput('Data da Transação', '', this.date, value => this.date = value, { type: 'date' });
        }
    }

    async saveTransaction() {
        if (!this.description || this.amount <= 0 || !this.category) {
            new Notice('Descrição, valor e categoria são obrigatórios.');
            return;
        }

        if (this.transaction) {
            // --- UPDATE EXISTING ---
            if (this.editAllInstallments && this.transaction.installmentOf) {
                // BULK UPDATE INSTALLMENTS
                const linkedId = this.transaction.installmentOf;
                // Prepare updated fields
                // Note: We do NOT update 'date' for all (each keeps its month).
                // We update: Amount, Category, Type. Status? Only if we want to bulk pay/unpay? Maybe risky. 
                // Let's update Status too, assuming user wants consistency.
                // Description? We should try to preserve the (x/y) suffix.

                const baseDescMatch = this.description.match(/^(.*)\s\(\d+\/\d+\)$/);
                const newBaseDesc = baseDescMatch ? baseDescMatch[1] : this.description; // If user removed suffix, use whole string.

                this.plugin.settings.transactions.forEach(t => {
                    if (t.installmentOf === linkedId) {
                        t.amount = this.amount;
                        t.category = this.category;
                        t.type = this.type;
                        // Update Status only if it was requested? Or simple overwrite?
                        // Let's match the edit.
                        t.status = this.status;

                        // Description Logic
                        if (t.currentInstallment && t.totalInstallments) {
                            t.description = `${newBaseDesc} (${t.currentInstallment}/${t.totalInstallments})`;
                        } else {
                            t.description = newBaseDesc;
                        }
                    }
                });
                new Notice('Todas as parcelas foram atualizadas.');

            } else {
                // SINGLE UPDATE
                const index = this.plugin.settings.transactions.findIndex(t => t.id === this.transaction!.id);
                if (index !== -1) {
                    this.plugin.settings.transactions[index] = {
                        ...this.transaction!,
                        description: this.description,
                        amount: this.amount,
                        date: this.date,
                        category: this.category,
                        type: this.type,
                        status: this.status,
                        isRecurring: this.isRecurring,
                        endDate: this.endDate
                    };
                }
            }
        } else {
            // --- Handle CREATION ---
            if (this.isRecurring) {
                if (this.hasEndDate && this.endDate) {
                    this.dayOfMonth = moment(this.endDate).date();
                }

                if (!this.dayOfMonth) {
                    new Notice('Dia do vencimento inválido.');
                    return;
                }

                const newTransactions: Transaction[] = [];
                // start iteration from the target month
                let loopMonthCursor = this.currentMonth.clone().startOf('month');

                // If generating for current month but the ideal date has passed, maybe verify?
                // Actually the user logic "Se passou, proximo mes" was reverted/commented out in previous edits (line 1980ish).
                // Let's stick to generating what matches the inputs.

                // However, we need to respect the original startDate logic if it was meant to skip passed dates?
                // The broken code did: if (startDate < today && currentMonth == todayMonth) startDate.add(1, month).

                // Let's replicate that simply:
                // Construct the "ideal" start date for this month
                let idealStartDay = Math.min(this.dayOfMonth, loopMonthCursor.daysInMonth());
                let idealStartDate = loopMonthCursor.clone().date(idealStartDay);

                // Logic: If the Ideal Start Date (e.g. Due Day 1) has passed TODAY (e.g. Day 10), it means:
                // 1. If we are aiming for "Competence" (Day 1 pays previous month), generating Day 1 of THIS month (which pays Prev) is too late?
                //    Actually, if today is Day 10. Day 1 was 9 days ago.
                //    If we generate Day 1 (Sept 1), Payment Month is Aug.
                //    If we generate Day 1 (Oct 1), Payment Month is Sept.
                //    User wants to see it in Sept screen. So we need Oct 1.
                //    So if Ideal Date is Passed, we skip to next month.

                // UNIVERSAL STRICT RULE: "TUDO Q FOR MARCADO COMO RECORRENCIA TODOS OS LANÇAMENTOVENCERA NO PROXIMO MES PORRA"
                // If it is a new recurring transaction (!this.transaction) created in the current month, force start to NEXT month.
                if (!this.transaction && loopMonthCursor.isSame(moment(), 'month')) {
                    loopMonthCursor.add(1, 'month');
                }

                // Calculate final date or limit
                const finalDate = (this.hasEndDate && this.endDate)
                    ? moment(this.endDate)
                    : (this.generationDate ? moment(this.generationDate) : loopMonthCursor.clone().add(5, 'years'));

                const groupId = `rec_${Date.now()}`;

                // New Loop Logic: Iterate by MONTH, then set DATE specific to that month
                while (loopMonthCursor.isSameOrBefore(finalDate, 'month')) {

                    // Determine the correct day for this specific month (Clamping)
                    // e.g. Day 30 in Feb becomes 28/29. Day 30 in Mar becomes 30.
                    const daysInCurrentMonth = loopMonthCursor.daysInMonth();
                    const actualDay = Math.min(this.dayOfMonth, daysInCurrentMonth);

                    // PARANOID FIX: Construct string directly to avoid any MomentJS cloning/mutation drift
                    const safeDateString = `${loopMonthCursor.format('YYYY-MM')}-${String(actualDay).padStart(2, '0')}`;
                    const loopDate = moment(safeDateString, 'YYYY-MM-DD');

                    // Stop if we exceeded end date (granular check)
                    if (this.hasEndDate && this.endDate && loopDate.isAfter(finalDate, 'day')) {
                        break;
                    }

                    // Logic: If due date is early (<= 12), it belongs to Previous Month's budget (Competence).
                    // "TUDO Q EU LANÇAR NO MES VENCE NO MES Q VEM E EU PAGO COM O SALARIO DO MES Q EU TO"
                    // Translation: Recurring transactions ALWAYS pay with Previous Month's salary (Start - 1).
                    const paymentMonth = (this.isRecurring || loopDate.date() <= 12)
                        ? loopDate.clone().subtract(1, 'month').format('YYYY-MM')
                        : loopDate.format('YYYY-MM');

                    newTransactions.push({
                        id: `txn_${groupId}_${loopDate.format('YYYY-MM')}`,
                        description: this.description,
                        amount: this.amount,
                        date: loopDate.format('YYYY-MM-DD'),
                        category: this.category,
                        type: this.type,
                        status: this.status, // Use the status from the form instead of hardcoded 'pending'
                        isRecurring: true,
                        recurrenceRule: 'monthly',
                        endDate: this.endDate,
                        paymentMonth: paymentMonth, // CRITICAL FIX: Ensure this is saved!
                        isInstallment: false,
                    });

                    // Advance to next month
                    loopMonthCursor.add(1, 'month');
                }
                this.plugin.settings.transactions.push(...newTransactions);
            } else {
                const newTransaction: Transaction = {
                    id: `txn_${Date.now()}`,
                    description: this.description,
                    amount: this.amount,
                    date: this.date,
                    category: this.category,
                    type: this.type,
                    status: this.status,
                    isRecurring: false,
                    isInstallment: false,
                    paymentMonth: moment(this.date).format('YYYY-MM'),
                };
                this.plugin.settings.transactions.push(newTransaction);
            }
        }

        await this.plugin.saveSettings();
        eventManager.emit('data-changed', this.plugin.settings);
        this.onSubmit();
        this.close();
    }

    async quitRecurrence() {
        if (!this.transaction) return;

        // 1. Mark THIS transaction as paid
        this.status = 'paid';
        const txIndex = this.plugin.settings.transactions.findIndex(t => t.id === this.transaction!.id);
        if (txIndex > -1) {
            this.plugin.settings.transactions[txIndex].status = 'paid';
            this.plugin.dropSystem.checkForDrop(this.plugin.settings.transactions[txIndex]); // Verificar cartas ao pagar
        }

        // 2. Delete ALL FUTURE transactions of this series
        const currentTxDate = moment(this.transaction.date);
        const idsToDelete: string[] = [];

        this.plugin.settings.transactions.forEach(t => {
            if (t.id === this.transaction!.id) return;

            // Logic: Is same series if Description, Amount and IsRecurring match
            // (Since legacy data differs, this is the safest heuristic)
            const isSameSeries = t.isRecurring &&
                t.description === this.transaction!.description &&
                t.amount === this.transaction!.amount;

            if (isSameSeries && moment(t.date).isAfter(currentTxDate, 'day')) {
                idsToDelete.push(t.id);
            }
        });

        if (idsToDelete.length > 0) {
            this.plugin.settings.transactions = this.plugin.settings.transactions.filter(t => !idsToDelete.includes(t.id));
        }

        await this.plugin.saveSettings();
        eventManager.emit('data-changed');
        this.close();
    }

    onClose() {
        this.contentEl.empty();
    }
}


export class AddPurchaseModal extends Modal {
    plugin: NexusHubPlugin;
    card: CreditCard;
    onSubmit: () => void;
    transaction?: Transaction; // Make transaction optional

    // Form state
    private description: string = '';
    private totalAmount: number = 0;
    private purchaseDate: string = moment().format('YYYY-MM-DD');
    private installments: number = 1;
    private category: string = '';

    constructor(app: App, plugin: NexusHubPlugin, card: CreditCard, onSubmit: () => void, transaction?: Transaction) {
        super(app);
        this.plugin = plugin;
        this.card = card;
        this.onSubmit = onSubmit;
        this.transaction = transaction;
        this.category = 'Fatura de Cartão';

        if (transaction) {
            this.description = transaction.description.replace(/\s\(\d+\/\d+\)$/, ''); // Remove (1/N) suffix
            this.category = transaction.category;
            this.purchaseDate = transaction.purchaseDate || transaction.date;

            // Reconstruct Total Amount and Installments count
            // Try to detect "Orphan" installments (legacy/bugged data) via Regex
            const installmentMatch = transaction.description.match(/^(.*?)\s\((\d+)\/(\d+)\)$/);

            if (transaction.installmentOf) {
                const siblings = this.plugin.settings.transactions.filter(t => t.installmentOf === transaction.installmentOf);
                if (siblings.length > 0) {
                    this.totalAmount = siblings.reduce((sum, t) => sum + t.amount, 0);
                    this.installments = transaction.totalInstallments || siblings.length;
                } else {
                    this.installments = transaction.totalInstallments || 1;
                    this.totalAmount = transaction.amount * this.installments;
                }
            } else if (installmentMatch) {
                // Fallback for Orphan Installments: Derive from Description
                // match[1] = Base Name, match[2] = Current, match[3] = Total
                const totalInst = parseInt(installmentMatch[3], 10);
                this.installments = totalInst;
                this.totalAmount = transaction.amount * totalInst; // Approximate total
                // We don't have siblings, so we assume equal parts.
            } else {
                this.totalAmount = transaction.amount;
                this.installments = 1;
            }
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.contentEl.addClass('nexus-fintech-modal-compact');

        const title = this.transaction ? `Editar Compra: ${this.description}` : `Adicionar Compra em ${this.card.name}`;

        const header = contentEl.createDiv({ cls: 'modal-header-with-action' });
        header.createEl('h2', { text: title });
        new ButtonComponent(header).setIcon('arrow-left').setTooltip('Voltar').onClick(() => {
            this.close();
        });

        const styleEl = contentEl.createEl('style');
        styleEl.innerHTML = `
            .nexus-fintech-modal-compact .modal-content { padding: 0; }
            .transaction-form-container {
                padding: 15px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .form-group {
                display: flex; flex-direction: column; gap: 6px;
            }
            .form-group label {
                font-size: 0.8rem; color: #bbb; font-weight: 600;
            }
            .form-group input, .form-group select {
                background-color: #1A1A1A; border: 1px solid #333; border-radius: 6px;
                color: #FFF; font-size: 0.9rem; width: 100%;
                box-sizing: border-box; height: 38px; padding: 0 10px;
            }
            .form-group-button { margin-top: 12px; }
        `;

        const formContainer = contentEl.createDiv({ cls: 'transaction-form-container' });
        this.renderFormGroups(formContainer);

        const buttonContainer = formContainer.createDiv({ cls: 'form-group-button' });
        const btnText = this.transaction ? 'Atualizar Compra' : 'Salvar Compra';
        new Setting(buttonContainer)
            .addButton(button => button.setButtonText(btnText).setCta().onClick(() => this.savePurchase()));
    }

    private renderFormGroups(container: HTMLElement) {
        const createGroup = (labelText: string, el: HTMLElement) => {
            const group = container.createDiv({ cls: 'form-group' });
            group.createEl('label', { text: labelText });
            group.appendChild(el);
        };

        const createInput = (labelText: string, placeholder: string, initialValue: string, onchange: (value: string) => void, type: string = 'text') => {
            const input = createEl('input', { attr: { type, placeholder } });
            input.value = initialValue;
            input.oninput = () => onchange(input.value);
            createGroup(labelText, input);
        };

        const createCurrencyInput = (labelText: string, placeholder: string, initialValue: number, onchange: (value: number) => void) => {
            const textInput = new TextComponent(createDiv());
            textInput.inputEl.placeholder = placeholder;
            setupCurrencyInput(textInput, onchange, initialValue);
            createGroup(labelText, textInput.inputEl);
        };

        createInput('Descrição da Compra', 'Ex: Celular Novo', this.description, value => this.description = value);
        createCurrencyInput('Valor Total da Compra', 'Digite o valor total', this.totalAmount, value => this.totalAmount = value);
        createInput('Data da Compra', '', this.purchaseDate, value => this.purchaseDate = value, 'date');
        createInput('Número de Parcelas', 'Ex: 1', String(this.installments), value => this.installments = Math.max(1, Number(value) || 1), 'number');

        renderCategoryDropdown(container, this.plugin, () => this.category, (value) => this.category = value);
    }

    async savePurchase() {
        if (!this.card) {
            new Notice('Erro: Cartão não encontrado.');
            return;
        }

        if (!this.description || this.totalAmount <= 0 || this.installments < 1 || !this.category) {
            new Notice('Descrição, valor, número de parcelas e categoria são obrigatórios.');
            return;
        }

        const card = (this.plugin.settings.creditCards || []).find(c => c.id === this.card.id);
        if (!card) {
            new Notice('Erro: Cartão de crédito associado não encontrado.');
            return;
        }

        // --- CLEAR OLD TRANSACTIONS IF EDITING ---
        if (this.transaction) {
            if (this.transaction.installmentOf) {
                const oldId = this.transaction.installmentOf;
                // Remove existing installments linked to this purchase (ID Match)
                this.plugin.settings.transactions = this.plugin.settings.transactions.filter(t => t.installmentOf !== oldId);
            } else {
                // No ID? Check for Regex Pattern (Legacy/Orphan Support)
                const installmentMatch = this.transaction.description.match(/^(.*?)\s\((\d+)\/(\d+)\)$/);

                if (installmentMatch) {
                    const baseName = installmentMatch[1];
                    const escapedName = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const pattern = new RegExp(`^${escapedName}\\s\\(\\d+\\/\\d+\\)$`);

                    this.plugin.settings.transactions = this.plugin.settings.transactions.filter(t => {
                        // Keep if it DOES NOT match criteria
                        if (t.cardId !== this.card.id) return true;
                        return !pattern.test(t.description);
                    });
                } else {
                    // Remove single transaction (standard)
                    this.plugin.settings.transactions = this.plugin.settings.transactions.filter(t => t.id !== this.transaction!.id);
                }
            }
        }

        const installmentAmount = this.totalAmount / this.installments;
        const purchaseGroupId = this.transaction?.installmentOf || `purch_${Date.now()}`; // Keep ID if editing, else new

        const purchaseMoment = moment(this.purchaseDate);

        const newTransactions: Transaction[] = [];

        for (let i = 0; i < this.installments; i++) {
            let paymentMoment = purchaseMoment.clone();

            // Determine the payment month for this installment
            if (purchaseMoment.date() > card.closingDay) {
                paymentMoment.add(1, 'month');
            }
            paymentMoment.add(i, 'months');

            const dueDateMoment = paymentMoment.clone().date(card.dueDate);

            // Fix: If due day is earlier than closing day, it implies due date is in the NEXT month relative to the competence month
            if (card.dueDate < card.closingDay) {
                dueDateMoment.add(1, 'month');
            }

            const isPastDue = dueDateMoment.isBefore(moment(), 'day');

            const newTx: Transaction = {
                id: `${purchaseGroupId}_${i + 1}`,
                description: this.description,
                amount: installmentAmount,
                date: dueDateMoment.format('YYYY-MM-DD'), // Bill due date
                category: 'Fatura de Cartão',
                type: 'expense',
                status: isPastDue ? 'paid' : 'pending',
                isRecurring: false, // It's an installment, not recurring in the same way
                isInstallment: true,
                installmentOf: purchaseGroupId,
                installmentNumber: i + 1,
                totalInstallments: this.installments,
                cardId: card.id,
                purchaseDate: this.purchaseDate,
                paymentMonth: paymentMoment.format('YYYY-MM'),
            };
            newTransactions.push(newTx);
        }

        this.plugin.settings.transactions.push(...newTransactions);
        await this.plugin.saveSettings();
        eventManager.emit('data-changed');
        this.onSubmit();
        this.close();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
export class AccountDetailModal extends Modal {
    plugin: NexusHubPlugin;
    groupKey: string; // installmentOf ID ou description da recorrência
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
        contentEl.addClass('nexus-fintech-modal');

        // Buscar todas as transações do grupo
        const transactions = this.plugin.settings.transactions.filter(t => {
            if (this.isInstallment) {
                return t.installmentOf === this.groupKey;
            } else {
                return t.isRecurring && t.description === this.groupKey;
            }
        });

        // Ordenar por data
        transactions.sort((a, b) => moment(a.date).diff(moment(b.date)));

        if (transactions.length === 0) {
            contentEl.createEl('p', { text: 'Nenhuma transação encontrada.' });
            new Setting(contentEl)
                .addButton(btn => btn.setButtonText('Fechar').onClick(() => this.close()));
            return;
        }

        // Renderizar header
        const title = this.isInstallment
            ? `Parcelas de ${transactions[0]?.description || 'Compra'}`
            : `Histórico de ${this.groupKey}`;
        contentEl.createEl('h2', { text: title });

        // Informações gerais
        const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);
        const paidCount = transactions.filter(tx => tx.status === 'paid').length;

        const summaryEl = contentEl.createDiv({ cls: 'account-detail-summary' });
        summaryEl.createEl('p', { text: `Total: ${formatAsCurrency(totalAmount)}` });
        summaryEl.createEl('p', { text: `${paidCount} de ${transactions.length} ${this.isInstallment ? 'parcelas pagas' : 'ocorrências pagas'}` });

        // Container para lista de transações
        const listContainer = contentEl.createDiv({ cls: 'account-detail-list' });

        // Renderizar cada transação
        transactions.forEach((tx, index) => {
            const itemEl = listContainer.createDiv({ cls: 'account-detail-item' });
            itemEl.toggleClass('is-paid', tx.status === 'paid');

            // Checkbox de status
            const leftPanel = itemEl.createDiv({ cls: 'item-left' });
            const checkbox = leftPanel.createEl('input', { type: 'checkbox' });
            checkbox.checked = tx.status === 'paid';
            checkbox.addEventListener('change', async () => {
                const transactionInSettings = this.plugin.settings.transactions.find(t => t.id === tx.id);
                if (transactionInSettings) {
                    transactionInSettings.status = checkbox.checked ? 'paid' : 'pending';
                    await this.plugin.saveSettings();

                    // Verificar cartas/conquistas ao pagar
                    if (checkbox.checked) {
                        // Cards will be checked when user marks transaction as paid
                    }

                    eventManager.emit('data-changed', this.plugin.settings);
                    // Atualizar visual
                    itemEl.toggleClass('is-paid', checkbox.checked);
                    // Atualizar contador
                    const newPaidCount = transactions.filter(t => t.status === 'paid').length;
                    summaryEl.querySelector('p:last-child')?.setText(`${newPaidCount} de ${transactions.length} ${this.isInstallment ? 'parcelas pagas' : 'ocorrências pagas'}`);
                }
            });

            // Info da parcela/ocorrência
            const infoEl = itemEl.createDiv({ cls: 'item-info' });
            const labelEl = infoEl.createDiv({ cls: 'item-label' });
            if (this.isInstallment) {
                labelEl.setText(`Parcela ${tx.currentInstallment}/${tx.totalInstallments}`);
            } else {
                labelEl.setText(`#${index + 1}`);
            }

            const dateEl = infoEl.createDiv({ cls: 'item-date' });
            dateEl.setText(`Vence: ${moment(tx.date).format('DD/MM/YYYY')}`);

            // Valor
            const rightPanel = itemEl.createDiv({ cls: 'item-right' });
            rightPanel.createSpan({ text: formatAsCurrency(tx.amount), cls: 'item-amount' });
        });

        // Estilo inline para o modal
        const styleEl = contentEl.createEl('style');
        styleEl.innerHTML = `
            .account-detail-summary {
                background-color: #1A1A1A;
                padding: 15px;
                border-radius: 8px;
                margin-bottom: 15px;
            }
            .account-detail-summary p {
                margin: 5px 0;
                font-size: 0.95rem;
            }
            .account-detail-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
                max-height: 400px;
                overflow-y: auto;
                margin-bottom: 15px;
            }
            .account-detail-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                background-color: #1A1A1A;
                padding: 12px;
                border-radius: 6px;
                border: 1px solid #333;
                transition: all 0.2s;
            }
            .account-detail-item.is-paid {
                opacity: 0.6;
                background-color: #0f1f0f;
            }
            .account-detail-item .item-left {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .account-detail-item .item-info {
                flex: 1;
            }
            .account-detail-item .item-label {
                font-weight: 600;
                font-size: 0.9rem;
            }
            .account-detail-item .item-date {
                font-size: 0.8rem;
                color: #888;
                margin-top: 2px;
            }
            .account-detail-item .item-amount {
                font-weight: 600;
                font-size: 1rem;
            }
        `;

        // Botão de fechar
        new Setting(contentEl)
            .addButton(btn => btn.setButtonText('Fechar').onClick(() => this.close()));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class EditTransactionModal extends Modal {
    plugin: NexusHubPlugin;
    transaction: Transaction;
    onSubmit: () => void;

    constructor(app: App, plugin: NexusHubPlugin, transaction: Transaction, onSubmit: () => void) {
        super(app);
        this.plugin = plugin;
        this.transaction = transaction;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        // Delegar para AddTransactionModal em modo de edição
        // AddTransactionModal já tem toda a lógica de edição implementada
        this.close();
        new AddTransactionModal(
            this.app,
            this.plugin,
            moment(this.transaction.date),
            this.onSubmit,
            this.transaction // Passa a transação para editar
        ).open();
    }
}

export class CardBillDetailModal extends Modal {
    plugin: NexusHubPlugin;
    cardId: string;
    currentMonth: moment.Moment;
    onSubmit: () => void;

    constructor(app: App, plugin: NexusHubPlugin, cardId: string, currentMonth: moment.Moment, onSubmit: () => void) {
        super(app);
        this.plugin = plugin;
        this.cardId = cardId;
        this.currentMonth = currentMonth;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('nexus-fintech-modal');

        const card = this.plugin.settings.creditCards.find(c => c.id === this.cardId);
        if (!card) {
            this.close();
            return;
        }

        // Header with Back Button
        const header = contentEl.createDiv({ cls: 'modal-header modal-header-with-action' });

        const leftGroup = header.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 10px;' } });
        const backBtn = new ButtonComponent(leftGroup)
            .setIcon('arrow-left')
            .setTooltip('Voltar para Cartões')
            .onClick(() => {
                this.close();
                new ManageCreditCardsModal(this.app, this.plugin, this.currentMonth).open();
            });
        backBtn.buttonEl.addClass('action-btn-icon'); // Reuse styling style

        leftGroup.createEl('h2', { text: `Fatura: ${card.name} - ${this.currentMonth.format('MMM/YYYY')}`, attr: { style: 'margin: 0;' } });

        // Calculate Totals
        const targetMonth = this.currentMonth.format('YYYY-MM');

        const transactions = this.plugin.settings.transactions.filter(t =>
            t.cardId === this.cardId &&
            (t.paymentMonth ? t.paymentMonth === targetMonth : moment(t.date).isSame(this.currentMonth, 'month'))
        );

        const total = transactions.reduce((sum, t) => sum + t.amount, 0);

        const summaryEl = contentEl.createDiv({ cls: 'income-summary-header', attr: { style: 'margin-bottom: 20px;' } });

        const totalItem = summaryEl.createDiv({ cls: 'income-summary-item' });
        totalItem.createDiv({ cls: 'income-summary-label', text: 'Total da Fatura' });
        totalItem.createDiv({ cls: 'income-summary-value', text: formatAsCurrency(total) }).style.color = 'var(--text-error)';

        const limitItem = summaryEl.createDiv({ cls: 'income-summary-item' });
        limitItem.createDiv({ cls: 'income-summary-label', text: 'Limite Disponível' });
        // Simplified calculation for demo - real world would subtract all open balances
        limitItem.createDiv({ cls: 'income-summary-value', text: formatAsCurrency(card.limit - total) });


        // --- TRANSACTIONS LIST ---
        contentEl.createEl('h3', { text: 'Lançamentos' });

        // CSS INJECTION FOR COMPACT LIST WITHIN THIS MODAL
        const compactStyle = contentEl.createEl('style');
        compactStyle.innerHTML = `
            .payment-list-container .credit-card-item { padding: 8px 10px !important; min-height: auto !important; }
            .payment-list-container .card-name { font-size: 0.95em !important; margin-bottom: 2px !important; }
            .payment-list-container .card-limit { font-size: 0.8em !important; opacity: 0.7; }
            .payment-list-container .card-actions-overlay { display: none !important; } /* Hide the card overlay style here */
            .payment-list-container .action-btn-icon { width: 28px !important; height: 28px !important; margin-left: 5px !important; }
        `;

        const listContainer = contentEl.createDiv({ cls: 'payment-list-container' });

        if (transactions.length === 0) {
            listContainer.createDiv({ text: 'Nenhum lançamento nesta fatura.', cls: 'list-removed-placeholder', attr: { style: 'display: block;' } });
        } else {
            transactions.forEach(t => {
                const item = listContainer.createDiv({ cls: 'credit-card-item' });
                const info = item.createDiv({ cls: 'card-info' });
                info.createDiv({ cls: 'card-name', text: t.description });
                info.createDiv({ cls: 'card-limit', text: `${moment(t.date).format('DD/MM')} • ${t.category}` });

                const actions = item.createDiv({ cls: 'card-actions', attr: { style: 'align-items: center; position: relative; opacity: 1; pointer-events: auto; background: none; padding: 0;' } });
                actions.createDiv({ text: formatAsCurrency(t.amount), attr: { style: 'font-weight: bold; margin-right: 8px;' } });

                // Edit Button
                const editBtn = actions.createEl('button', { cls: 'action-btn-icon' });
                setIcon(editBtn, 'pencil');
                editBtn.setAttr('title', 'Editar Compra');
                editBtn.onClickEvent((e) => {
                    e.stopPropagation();
                    // Use AddPurchaseModal to edit the full purchase context
                    new AddPurchaseModal(this.app, this.plugin, card, () => this.onOpen(), t).open();
                });



                // Delete Button
                const deleteBtn = actions.createEl('button', { cls: 'action-btn-icon' });
                setIcon(deleteBtn, 'trash');
                deleteBtn.setAttr('title', 'Excluir');
                deleteBtn.onClickEvent((e) => {
                    e.stopPropagation();

                    // Check for Real Linkage (ID) OR Regex Pattern (Legacy/Orphan)
                    const installmentMatch = t.description.match(/^(.*?)\s\((\d+)\/(\d+)\)$/);
                    const isInstallment = !!t.installmentOf || !!installmentMatch;

                    if (isInstallment) {
                        const modal = new Modal(this.app);
                        modal.contentEl.addClass('nexus-fintech-modal');
                        modal.contentEl.createEl('h2', { text: 'Excluir Compra' });
                        modal.contentEl.createEl('p', { text: `Deseja excluir apenas esta parcela ou toda a compra "${t.description.replace(/\s\(\d+\/\d+\)$/, '')}"?` });

                        const btnContainer = modal.contentEl.createDiv({ cls: 'modal-footer', attr: { style: 'justify-content: space-between; gap: 10px;' } });

                        // Handler for deleting just THIS one
                        const handleDeleteSingle = async () => {
                            this.plugin.settings.transactions = this.plugin.settings.transactions.filter(x => x.id !== t.id);
                            await this.plugin.saveSettings();
                            eventManager.emit('data-changed');
                            modal.close();
                            this.onOpen();
                        };

                        // Handler for deleting ALL
                        const handleDeleteAll = async () => {
                            if (t.installmentOf) {
                                // Easy way: ID match
                                this.plugin.settings.transactions = this.plugin.settings.transactions.filter(x => x.installmentOf !== t.installmentOf);
                            } else if (installmentMatch) {
                                // Hard way: Name Pattern match
                                const baseName = installmentMatch[1]; // e.g. "Shoppe"
                                // Safety: Filter by Card + BaseName + "(*/*)" pattern
                                // We escape special regex chars in baseName just in case
                                const escapedName = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                const pattern = new RegExp(`^${escapedName}\\s\\(\\d+\\/\\d+\\)$`);

                                this.plugin.settings.transactions = this.plugin.settings.transactions.filter(x => {
                                    // Keep if it DOES NOT match criteria
                                    if (x.cardId !== t.cardId) return true;
                                    return !pattern.test(x.description);
                                });
                            }

                            await this.plugin.saveSettings();
                            eventManager.emit('data-changed');
                            modal.close();
                            this.onOpen();
                        };

                        new Setting(btnContainer)
                            .addButton(btn => btn.setButtonText('Apenas esta').onClick(handleDeleteSingle));

                        new Setting(btnContainer)
                            .addButton(btn => btn.setButtonText('Todas as parcelas').setWarning().onClick(handleDeleteAll));

                        modal.open();
                    } else {
                        // Standard delete logic...
                        new ConfirmationModal(
                            this.app,
                            'Excluir Lançamento',
                            `Tem certeza que deseja excluir "${t.description}"?`,
                            async () => {
                                this.plugin.settings.transactions = this.plugin.settings.transactions.filter(x => x.id !== t.id);
                                await this.plugin.saveSettings();
                                eventManager.emit('data-changed');
                                this.onOpen();
                            }
                        ).open();
                    }
                });
            });
        }

        // --- ADD TRANSACTION FORM ---
        contentEl.createEl('hr');

        const formHeader = contentEl.createDiv({ attr: { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;' } });
        formHeader.createEl('h3', { text: 'Adicionar Despesa', attr: { style: 'margin: 0;' } });

        const toggleFormBtn = new ButtonComponent(formHeader)
            .setButtonText('+ Nova Despesa')
            .setCta()
            .onClick(() => {
                const card = this.plugin.settings.creditCards.find(c => c.id === this.cardId);
                if (card) {
                    new AddPurchaseModal(this.app, this.plugin, card, () => this.onOpen()).open();
                } else {
                    new Notice('Cartão não encontrado.');
                }
            });

        // (Inline Form removed in favor of dedicated Modal - Fixes Issue #1)
    }

    onClose() {
        this.contentEl.empty();
        this.onSubmit();
    }
}

export class ResetConfirmationModal extends Modal {
    onConfirm: () => void;

    constructor(app: App, onConfirm: () => void) {
        super(app);
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        // contentEl.addClass('nexus-fintech-modal'); // Standard modal naming consistent with app

        const header = contentEl.createDiv({ cls: 'modal-header' });
        header.createEl('h2', { text: '⚠️ Zona de Perigo: Apagar Tudo' }).style.color = 'var(--text-error)';

        const body = contentEl.createDiv({ cls: 'modal-body' });
        body.createEl('p', { text: 'Você está prestes a apagar permanentemente TODOS os seus dados do Nexus Hub.', attr: { style: 'font-weight: bold;' } });
        body.createEl('p', { text: '• Histórico de transações será perdido.\n• Configurações de cartões e contas serão resetadas.\n• Todas as conquistas serão zeradas.' });
        body.createEl('p', { text: 'Esta ação é irreversível.', attr: { style: 'color: var(--text-error);' } });

        const footer = contentEl.createDiv({ cls: 'modal-footer', attr: { style: 'display: flex; justify-content: flex-end; gap: 10px; padding-top: 20px;' } });

        new ButtonComponent(footer)
            .setButtonText('Cancelar')
            .onClick(() => this.close());

        new ButtonComponent(footer)
            .setButtonText('SIM, APAGAR TUDO')
            .setClass('mod-warning')
            .onClick(() => {
                this.onConfirm();
                this.close();
            });
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
        contentEl.addClass('nexus-fintech-modal');

        const header = contentEl.createDiv({ cls: 'modal-header' });
        header.createEl('h2', { text: 'Gerenciar Categorias' });

        const styleEl = contentEl.createEl('style');
        styleEl.innerHTML = `
            .category-list-container {
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .category-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px;
                background-color: var(--background-secondary);
                border-radius: 8px;
            }
            .category-name {
                font-weight: 500;
            }
            .category-actions button {
                margin-left: 10px;
            }
        `;

        // Add new category
        new Setting(contentEl)
            .setName('Nova Categoria')
            .addText(text => {
                text.setPlaceholder('Nome da categoria');
                text.inputEl.addEventListener('keydown', async (e) => {
                    if (e.key === 'Enter') {
                        await this.addCategory(text.getValue());
                        text.setValue('');
                        this.onOpen();
                    }
                });
            })
            .addButton(button => {
                button.setButtonText('Adicionar')
                    .setCta()
                    .onClick(async () => {
                        const input = contentEl.querySelector('.setting-item-control input') as HTMLInputElement;
                        await this.addCategory(input.value);
                        input.value = '';
                        this.onOpen();
                    });
            });

        const listContainer = contentEl.createDiv({ cls: 'category-list-container' });

        this.plugin.settings.categories.forEach(category => {
            const itemEl = listContainer.createDiv({ cls: 'category-item' });
            itemEl.createDiv({ cls: 'category-name', text: category.name });

            const actionsEl = itemEl.createDiv({ cls: 'category-actions' });

            new ButtonComponent(actionsEl)
                .setIcon('pencil')
                .setTooltip('Editar')
                .onClick(() => {
                    new PromptModal(this.app, 'Editar Categoria', 'Novo nome da categoria', async (newName) => {
                        if (newName && newName.trim() !== '') {
                            await this.editCategory(category, newName.trim());
                            this.onOpen();
                        }
                    }, category.name).open();
                });

            new ButtonComponent(actionsEl)
                .setIcon('trash-2')
                .setTooltip('Apagar')
                .setClass('mod-warning')
                .onClick(() => {
                    new ConfirmationModal(this.app, 'Apagar Categoria', `Tem certeza que deseja apagar a categoria '${category.name}'?`, async () => {
                        await this.deleteCategory(category);
                        this.onOpen();
                    }).open();
                });
        });
    }

    async addCategory(name: string) {
        if (!name || name.trim() === '') {
            new Notice('O nome da categoria não pode ser vazio.');
            return;
        }
        if (this.plugin.settings.categories.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
            new Notice('Esta categoria já existe.');
            return;
        }
        this.plugin.settings.categories.push({
            id: `cat_${Date.now()}`,
            name: name.trim()
        });
        await this.plugin.saveSettings();
        eventManager.emit('data-changed');
    }

    async editCategory(category: Category, newName: string) {
        const oldName = category.name;
        category.name = newName;

        // Update transactions
        this.plugin.settings.transactions.forEach(t => {
            if (t.category === oldName) {
                t.category = newName;
            }
        });

        await this.plugin.saveSettings();
        eventManager.emit('data-changed');
    }

    async deleteCategory(category: Category) {
        this.plugin.settings.categories = this.plugin.settings.categories.filter(c => c.id !== category.id);
        // Optionally, handle what happens to transactions with this category
        // For now, we'll leave them as is, but you could re-categorize them to 'Outros' for example.
        await this.plugin.saveSettings();
        eventManager.emit('data-changed');
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class PauseRecurringModal extends Modal {
    constructor(app: App, plugin: NexusHubPlugin, transaction: Transaction, onSubmit: () => void) { super(app); }
    onOpen() { this.close(); }
}
export class EmergencyFundModal extends Modal {
    plugin: NexusHubPlugin;
    private targetAmount: number = 0;
    private currentBalance: number = 0;
    private monthlyContribution: number = 0;

    private targetDate: string = '';
    private calculationMode: 'byDate' | 'byInstallment' = 'byInstallment';
    private showInPending: boolean = false;

    constructor(app: App, plugin: NexusHubPlugin) {
        super(app);
        this.plugin = plugin;
        const fund = this.plugin.settings.emergencyFund;
        this.targetAmount = fund?.targetAmount || 0;
        this.currentBalance = fund?.currentBalance || 0;
        this.monthlyContribution = fund?.monthlyContribution || 0;
        this.targetDate = fund?.targetDate || '';
        this.calculationMode = fund?.calculationMode || (fund?.monthlyContribution ? 'byInstallment' : 'byDate');
        this.showInPending = fund?.showInPending || false;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.contentEl.addClass('nexus-fintech-modal');

        const header = contentEl.createDiv({ cls: 'modal-header-with-action' });
        new ButtonComponent(header).setIcon('arrow-left').setTooltip('Voltar').onClick(() => {
            this.close();
        });
        header.createEl('h2', { text: 'Fundo de Emergência' });

        const helpIcon = header.createDiv({ cls: 'clickable-icon help-icon modal-help-icon' });
        setIcon(helpIcon, 'help-circle');
        helpIcon.setAttr('title', 'O que é o Fundo de Emergência?');
        helpIcon.addEventListener('click', () => {
            const helpText = `<h3>O que é o Fundo de Emergência?</h3><p>O Fundo de Emergência é a sua <strong>reserva de segurança financeira</strong>. Pense nele como um colchão para amortecer o impacto de imprevistos, como uma despesa médica inesperada, um conserto de carro urgente ou a perda de um emprego.</p><br><br><h3>Como usar esta ferramenta?</h3><p><strong>1. Defina sua Meta:</strong><br>- <strong>Valor Ideal:</strong> Especialistas recomendam ter o equivalente a 3 a 6 meses de suas despesas essenciais guardado. Use o campo "Valor Total da Meta" para definir seu objetivo.</p><p><strong>2. Construa sua Reserva:</strong><br>- <strong>Contribuições:</strong> Adicione dinheiro ao fundo usando a seção "Contribuir / Retirar".<br>- <strong>Planejamento Automático:</strong> Use a seção "Planejamento da Meta" para calcular o quanto você precisa guardar por mês para atingir seu objetivo em um prazo definido, ou veja em quanto tempo você atingirá a meta com uma contribuição mensal fixa.</p><p><strong>3. Acompanhe seu Progresso:</strong><br>- A barra de progresso visual mostra o quão perto você está de ter sua reserva completa.<br>- Todo o histórico de depósitos e retiradas fica salvo para sua consulta.</p><br><br><p><strong>Dica de Mestre:</strong> Ative a opção <strong>"Exibir nos pagamentos pendentes"</strong>. Isso criará um "boleto" mensal para você mesmo, te ajudando a criar o hábito de poupar e a construir sua reserva de forma disciplinada.</p>`;
            new InfoModal(this.app, 'Sobre o Fundo de Emergência', helpText).open();
        });

        const styleEl = contentEl.createEl('style');
        styleEl.innerHTML = `
            .nexus-fintech-modal .modal-content {
                width: 90%; /* Ajustado para 90% */
                max-width: 700px; /* Mantido max-width */
                padding: 0; 
            }
            .modal-header-with-action {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 15px 20px; 
                border-bottom: 1px solid var(--background-modifier-border);
            }
            .modal-help-icon svg { 
                width: 24px;
                height: 24px;
            }
            .modal-header-with-action h2 {
                margin: 0;
                flex-grow: 1;
            }
            .emergency-fund-summary {
                padding: 25px;
                text-align: center;
                background-color: var(--background-primary);
                border-bottom: 1px solid var(--background-modifier-border);
            }
            .fund-balance { font-size: 2.8em; font-weight: 700; color: var(--text-normal); margin-bottom: 8px; }
            .fund-target { font-size: 1.1em; color: var(--text-muted); }
            .fund-target span { color: var(--text-normal); font-weight: 600; }
            .fund-progress-bar { width: 100%; max-width: 400px; margin: 15px auto; height: 14px; background-color: var(--background-secondary); border-radius: 7px; overflow: hidden; }
            .fund-progress-fill { height: 100%; background-color: var(--interactive-accent); width: 0%; transition: width 0.5s ease-in-out; border-radius: 7px; }
            
            .fund-actions-container {
                padding: 20px;
                display: flex; /* Alterado para flex */
                flex-direction: column; /* Colunas em telas menores */
                gap: 15px; 
                border-bottom: 1px solid var(--background-modifier-border);
            }
            @media (min-width: 768px) { 
                .fund-actions-container {
                    flex-direction: row; /* Linhas em telas maiores */
                    flex-wrap: wrap; /* Permite quebra de linha */
                }
            }
            .fund-action-card {
                background-color: var(--background-primary); 
                padding: 20px;
                border-radius: 8px;
                border-left: 4px solid var(--interactive-accent); 
                display: flex;
                flex-direction: column;
                gap: 15px;
                flex: 1 1 100%; /* Ocupa 100% da largura em telas menores, flexível em maiores */
            }
            @media (min-width: 768px) {
                .fund-action-card {
                    flex: 1 1 calc(50% - 7.5px); /* Duas colunas com gap */
                }
            }
            .fund-action-card h3 { margin-top: 0; margin-bottom: 5px; font-size: 1.3em; color: var(--text-normal); }
            .fund-action-card .setting-item-control {
                display: flex;
                gap: 10px;
                justify-content: flex-end;
            }
            .fund-action-card .setting-item-control button {
                flex-grow: 1;
            }
            .fund-action-card .setting-item {
                border-bottom: none;
                padding: 0;
            }
            /* Estilos para inputs dentro de fund-action-card */
            .fund-action-card .form-group label {
                font-size: 0.9em;
                color: var(--text-muted);
                margin-bottom: 5px;
                font-weight: 600;
            }
            .fund-action-card .form-group input[type='text'],
            .fund-action-card .form-group input[type='number'],
            .fund-action-card .form-group input[type='date'] {
                padding: 8px 12px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                background-color: var(--background-secondary); 
                color: var(--text-normal);
                font-size: 1em;
                transition: border-color 0.2s ease-in-out;
                width: 100%; 
                box-sizing: border-box;
            }
            .fund-action-card .form-group input:focus {
                border-color: var(--interactive-accent);
                outline: none;
                box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2);
            }

            .emergency-fund-history {
                padding: 20px;
            }
            .emergency-fund-history h3 {
                margin-top: 0;
                margin-bottom: 15px;
                font-size: 1.3em;
                color: var(--text-normal);
            }
            .history-list { max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
            .history-item {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto; 
                gap: 10px;
                align-items: center;
                background-color: var(--background-secondary); 
                padding: 12px 15px;
                border-radius: 8px;
                border-bottom: 1px solid var(--background-modifier-border); 
            }
            .history-item:last-child {
                border-bottom: none;
            }
            .history-item-info {
                display: flex;
                flex-direction: column;
                min-width: 0; 
                width: 100%; 
            }
            .history-item-info span:first-child {
                font-weight: 500;
                color: var(--text-normal);
                white-space: nowrap; 
                overflow: hidden;
                text-overflow: ellipsis; 
            }
            .history-item-info span:last-child {
                font-size: 0.85em;
                color: var(--text-muted);
                white-space: nowrap; 
                overflow: hidden;
                text-overflow: ellipsis; 
            }
            .history-amount {
                white-space: nowrap; 
            }
            .history-amount.deposit { color: var(--text-success); font-weight: 600; } 
            .history-amount.withdrawal { color: var(--text-error); font-weight: 600; } 
            .no-transactions-message { color: var(--text-muted); text-align: center; padding: 20px; }
        `;

        this.renderFundDetails(contentEl);
    }

    private renderFundDetails(container: HTMLElement) {
        // O container.empty() já é chamado em onOpen, então não precisamos aqui.

        const summaryEl = container.createDiv({ cls: 'emergency-fund-summary' });
        summaryEl.createEl('div', { cls: 'fund-balance', text: formatAsCurrency(this.currentBalance) });
        summaryEl.createEl('div', { cls: 'fund-target' }).createSpan({ text: formatAsCurrency(this.targetAmount) }).prepend('Meta: ');

        const progressBarContainer = summaryEl.createDiv({ cls: 'fund-progress-bar' });
        const progressFill = progressBarContainer.createDiv({ cls: 'fund-progress-fill' });
        const percentage = this.targetAmount > 0 ? (this.currentBalance / this.targetAmount) * 100 : 0;
        progressFill.style.width = `${Math.min(percentage, 100)}%`;

        const actionsContainer = container.createDiv({ cls: 'fund-actions-container' });

        const contributeCard = actionsContainer.createDiv({ cls: 'fund-action-card' });
        contributeCard.createEl('h3', { text: 'Contribuir / Retirar' });
        const amountInput = new TextComponent(contributeCard);
        setupCurrencyInput(amountInput, () => { }, 0, 'Valor');
        new Setting(contributeCard).addButton(btn => btn.setButtonText('Adicionar').setCta().onClick(async () => {
            const value = parseCurrency(amountInput.getValue());
            if (value <= 0) { new Notice('Insira um valor positivo para contribuir.'); return; }
            this.currentBalance += value;
            await this.saveFundSettings('deposit', value);
            this.onOpen();
        })).addButton(btn => btn.setButtonText('Retirar').setWarning().onClick(async () => {
            const value = parseCurrency(amountInput.getValue());
            if (value <= 0) { new Notice('Insira um valor positivo para retirar.'); return; }
            if (this.currentBalance < value) { new Notice('Valor de retirada maior que o saldo atual.'); return; }
            this.currentBalance -= value;
            await this.saveFundSettings('withdrawal', value);
            this.onOpen();
        }));

        const targetCard = actionsContainer.createDiv({ cls: 'fund-action-card' });
        targetCard.createEl('h3', { text: 'Planejamento da Meta' });

        const createGroup = (labelText: string, el: HTMLElement) => {
            const group = targetCard.createDiv({ cls: 'form-group goal-form-group' });
            group.createEl('label', { text: labelText });
            group.appendChild(el);
            return group;
        };

        const valueInput = new TextComponent(targetCard);
        createGroup('Valor Total da Meta', valueInput.inputEl);
        setupCurrencyInput(valueInput, val => {
            this.targetAmount = val;
            this.updateCalculation(resultEl, dateGroup, installmentGroup);
        }, this.targetAmount, 'Ex: R$ 10.000,00');

        new Setting(targetCard)
            .setName('Como calcular a meta?')
            .addDropdown(dd => dd
                .addOption('byDate', 'Definir PRAZO FINAL')
                .addOption('byInstallment', 'Definir CONTRIBUIÇÃO MENSAL')
                .setValue(this.calculationMode)
                .onChange((value: 'byDate' | 'byInstallment') => {
                    this.calculationMode = value;
                    this.toggleFields(dateGroup, installmentGroup);
                    this.updateCalculation(resultEl, dateGroup, installmentGroup);
                }));

        const dateInput = new TextComponent(targetCard);
        dateInput.inputEl.type = 'date';
        const dateGroup = createGroup('Data Final da Meta', dateInput.inputEl);
        dateInput.setValue(this.targetDate).onChange(val => {
            this.targetDate = val;
            this.updateCalculation(resultEl, dateGroup, installmentGroup);
        });

        const installmentInput = new TextComponent(targetCard);
        const installmentGroup = createGroup('Contribuição Mensal', installmentInput.inputEl);
        setupCurrencyInput(installmentInput, val => {
            this.monthlyContribution = val;
            this.updateCalculation(resultEl, dateGroup, installmentGroup);
        }, this.monthlyContribution, 'Ex: R$ 300,00');

        const resultEl = targetCard.createDiv({ cls: 'goal-calculation-result' });

        this.toggleFields(dateGroup, installmentGroup);
        this.updateCalculation(resultEl, dateGroup, installmentGroup);

        new Setting(targetCard)
            .setName('Exibir nos pagamentos pendentes?')
            .setDesc('Se ativado, um lembrete para guardar este valor aparecerá na sua lista de pagamentos pendentes todo mês.')
            .addToggle(toggle => toggle
                .setValue(this.showInPending)
                .onChange(value => this.showInPending = value));

        new Setting(targetCard).addButton(btn => btn.setButtonText('Salvar Planejamento').setCta().onClick(async () => {
            await this.saveFundSettings();
            this.onOpen();
        }));

        const historyContainer = container.createDiv({ cls: 'emergency-fund-history' });
        historyContainer.createEl('h3', { text: 'Histórico de Movimentações' });
        const historyList = historyContainer.createDiv({ cls: 'history-list' });
        const history = this.plugin.settings.emergencyFund?.history || [];
        if (history.length === 0) {
            historyList.createEl('p', { text: 'Nenhuma movimentação registrada.', cls: 'no-transactions-message' });
        } else {
            history.slice().reverse().forEach((item: any) => {
                const itemEl = historyList.createDiv({ cls: 'history-item' });
                const infoEl = itemEl.createDiv({ cls: 'history-item-info' });
                infoEl.createEl('span', { text: item.reason || (item.type === 'deposit' ? 'Depósito' : 'Retirada') });
                infoEl.createEl('span', { text: moment(item.date).format('DD/MM/YYYY') });
                const amountEl = itemEl.createEl('span', { cls: `history-amount ${item.type}` });
                amountEl.setText(`${item.type === 'deposit' ? '+' : '-'} ${formatAsCurrency(item.amount)}`);
            });
        }
    }

    private toggleFields(dateGroup: HTMLElement, installmentGroup: HTMLElement) {
        if (this.calculationMode === 'byDate') {
            dateGroup.style.display = 'flex';
            installmentGroup.style.display = 'none';
        } else {
            dateGroup.style.display = 'none';
            installmentGroup.style.display = 'flex';
        }
    }

    private updateCalculation(resultEl: HTMLElement, dateGroup: HTMLElement, installmentGroup: HTMLElement) {
        resultEl.empty();
        const remainingAmount = this.targetAmount - this.currentBalance;
        if (remainingAmount <= 0) {
            resultEl.setText('✅ Meta atingida!');
            return;
        }

        if (this.calculationMode === 'byDate' && this.targetDate) {
            const months = moment(this.targetDate).diff(moment(), 'months', true);
            if (months > 0) {
                const installment = remainingAmount / months;
                this.monthlyContribution = installment;
                resultEl.setText(`Faltam ${formatAsCurrency(remainingAmount)}. Você precisará guardar ${formatAsCurrency(installment)} por mês.`);
            } else {
                resultEl.setText('A data final precisa ser no futuro.');
            }
        } else if (this.calculationMode === 'byInstallment' && this.monthlyContribution > 0) {
            const months = Math.ceil(remainingAmount / this.monthlyContribution);
            const endDate = moment().add(months, 'months');
            this.targetDate = endDate.format('YYYY-MM-DD');
            resultEl.setText(`Faltam ${formatAsCurrency(remainingAmount)}. Você levará ${months} meses, terminando em ${endDate.format('MMMM [de] YYYY')}.`);
        }
    }

    private async saveFundSettings(type?: 'deposit' | 'withdrawal', amount?: number) {
        // Garante que o fundo de emergência e seu histórico existam
        if (!this.plugin.settings.emergencyFund) {
            this.plugin.settings.emergencyFund = {
                ...DEFAULT_SETTINGS.emergencyFund,
                targetAmount: this.targetAmount,
                currentBalance: this.currentBalance,
            };
        }
        if (!this.plugin.settings.emergencyFund.history) {
            this.plugin.settings.emergencyFund.history = [];
        }

        // Adiciona ao histórico apenas se for uma contribuicao ou retirada e tiver um valor
        if (type && amount) {
            this.plugin.settings.emergencyFund.history.push({
                type: type,
                amount: amount,
                date: new Date().toISOString(),
                balanceAfter: this.currentBalance, // O saldo já foi atualizado no modal
                reason: type === 'deposit' ? 'Contribuição' : 'Retirada'
            });
        }

        // Atualiza todas as propriedades do fundo de emergência com os dados do modal
        this.plugin.settings.emergencyFund.targetAmount = this.targetAmount;
        this.plugin.settings.emergencyFund.currentBalance = this.currentBalance;
        this.plugin.settings.emergencyFund.monthlyContribution = this.monthlyContribution;
        this.plugin.settings.emergencyFund.targetDate = this.targetDate;
        this.plugin.settings.emergencyFund.calculationMode = this.calculationMode;
        this.plugin.settings.emergencyFund.showInPending = this.showInPending;

        await this.plugin.saveSettings();
        new Notice('Fundo de emergência atualizado!');
        eventManager.emit('data-changed');
    }

    onClose() {
        this.contentEl.empty();
    }
}
export class UpdateSalaryModal extends Modal { constructor(app: App, plugin: NexusHubPlugin) { super(app); } onOpen() { this.close(); } }

export class ProfilePictureModal extends Modal {
    plugin: NexusHubPlugin;
    private file: File | null = null;
    private imageUrl: string | ArrayBuffer | null | undefined = null;
    private userName: string;
    private profileBorderColor: string | undefined;
    private profileBorderEffect: 'none' | 'shine' | 'glow';

    constructor(app: App, plugin: NexusHubPlugin) {
        super(app);
        this.plugin = plugin;
        this.imageUrl = this.plugin.settings.profilePicture || null;
        this.userName = this.plugin.settings.userName || '';
        this.profileBorderColor = this.plugin.settings.profileBorderColor;
        this.profileBorderEffect = this.plugin.settings.profileBorderEffect || 'none';
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('nexus-fintech-modal');

        contentEl.createEl('h2', { text: 'Editar Perfil' });

        const styleEl = contentEl.createEl('style');
        styleEl.innerHTML = `
            .profile-picture-preview-container {
                --profile-border-color: ${this.profileBorderColor || 'var(--interactive-accent)'};
                width: 120px;
                height: 120px;
                border-radius: 50%;
                background-color: var(--background-secondary);
                margin: 20px auto;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                position: relative;
                border: 3px solid ${this.profileBorderColor || 'var(--background-modifier-border)'};
                transition: all 0.3s ease;
            }
            .profile-picture-preview {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            .profile-picture-preview.is-default-svg {
                width: 60%;
                height: 60%;
                filter: brightness(2.5);
            }
            .color-swatch-container {
                display: flex;
                gap: 10px;
                align-items: center;
            }
            .color-swatch {
                width: 24px;
                height: 24px;
                border-radius: 50%;
                cursor: pointer;
                border: 2px solid var(--background-modifier-border);
                transition: transform 0.2s;
            }
            .color-swatch:hover {
                transform: scale(1.1);
            }

            @keyframes shine-animation {
                0%, 100% { box-shadow: 0 0 4px 1px var(--profile-border-color); }
                50% { box-shadow: 0 0 10px 3px #fff, 0 0 15px 5px var(--profile-border-color); }
            }

            .profile-picture-preview-container.effect-shine:hover {
                animation: shine-animation 1.8s ease-in-out infinite;
            }

            @keyframes glow-animation {
                0%, 100% { box-shadow: 0 0 5px -2px var(--profile-border-color); }
                50% { box-shadow: 0 0 12px 4px var(--profile-border-color); }
            }

            .profile-picture-preview-container.effect-glow:hover {
                animation: glow-animation 2.5s ease-in-out infinite;
            }

            .premade-banners-container {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                gap: 10px;
                margin-top: 15px;
                margin-bottom: 20px;
            }

            .premade-banner-item {
                height: 80px;
                background-size: cover;
                background-position: center;
                border-radius: 8px;
                cursor: pointer;
                border: 2px solid transparent;
                transition: all 0.2s ease-in-out;
            }

            .premade-banner-item:hover {
                border-color: var(--interactive-accent);
                transform: scale(1.02);
            }

            .premade-banner-item.is-selected {
                border-color: var(--color-green);
                box-shadow: 0 0 0 3px var(--color-green);
            }
        `;

        const previewContainer = contentEl.createDiv({ cls: 'profile-picture-preview-container' });

        const updateEffect = (effect: 'none' | 'shine' | 'glow') => {
            this.profileBorderEffect = effect;
            previewContainer.classList.remove('effect-shine', 'effect-glow');
            if (effect !== 'none') {
                previewContainer.classList.add(`effect-${effect}`);
            }
        };

        const updateColor = (color: string) => {
            this.profileBorderColor = color;
            previewContainer.style.setProperty('--profile-border-color', color);
            previewContainer.style.borderColor = color;
        };

        updateEffect(this.profileBorderEffect);
        if (this.profileBorderColor) {
            updateColor(this.profileBorderColor);
        }


        const previewImage = previewContainer.createEl('img', { cls: 'profile-picture-preview' });
        if (typeof this.imageUrl === 'string') {
            previewImage.src = this.imageUrl;
        } else {
            previewImage.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj4KICA8Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIvPgogIDxjaXJjbGUgY3g9IjEyIiBjeT0iMTAiIHI9IjMiLz4KICA8cGF0aCBkPSJNNyAyMC42NjJWMTlhMiAyIDAgMCAxIDItMmg2YTIgMiAwIDAgMSAyIDJ2MS42NjIiLz4KPC9zdmc+'; // Default user icon
            previewImage.addClass('is-default-svg');
        }

        new Setting(contentEl)
            .setName('Nome de Usuário')
            .setDesc('Como você gostaria de ser chamado?')
            .addText(text => text
                .setPlaceholder('Seu nome')
                .setValue(this.userName)
                .onChange((value) => {
                    this.userName = value;
                }));

        new Setting(contentEl)
            .setName('Selecionar Imagem')
            .setDesc('Escolha uma imagem para ser sua foto de perfil.')
            .addButton(btn => {
                const input = createEl('input', { attr: { type: 'file', accept: 'image/*', style: 'display: none' } });
                btn.buttonEl.appendChild(input);
                btn.setButtonText('Upload Imagem').onClick(() => input.click());
                input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    this.file = file;
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        this.imageUrl = event.target?.result;
                        previewImage.src = this.imageUrl as string;
                        previewImage.removeClass('is-default-svg');
                    };
                    reader.readAsDataURL(file);
                };
            });

        contentEl.createEl('h3', { text: 'Customização da Borda' });

        const colorPickerSetting = new Setting(contentEl)
            .setName('Cor da Borda')
            .setDesc('Escolha uma cor para a borda do seu avatar.')
            .addColorPicker(color => color
                .setValue(this.profileBorderColor || '#000000')
                .onChange(updateColor));

        const presetColors = ['#E53935', '#43A047', '#1E88E5', '#FDD835', '#8E44AD', '#F4511E', '#00ACC1'];
        const swatchSetting = new Setting(contentEl).setName('Cores Rápidas');
        const swatchContainer = swatchSetting.controlEl.createDiv({ cls: 'color-swatch-container' });
        presetColors.forEach(color => {
            const swatch = swatchContainer.createDiv({ cls: 'color-swatch' });
            swatch.style.backgroundColor = color;
            swatch.addEventListener('click', () => {
                updateColor(color);
                const colorInput = colorPickerSetting.controlEl.querySelector('input[type="color"]') as HTMLInputElement;
                if (colorInput) colorInput.value = color;
            });
        });

        new Setting(contentEl)
            .setName('Efeito da Borda')
            .setDesc('Escolha uma animação para a borda (visível ao passar o mouse).')
            .addDropdown(dropdown => dropdown
                .addOption('none', 'Nenhum')
                .addOption('shine', 'Brilho (Shine)')
                .addOption('glow', 'Pulsar (Glow)')
                .setValue(this.profileBorderEffect)
                .onChange(updateEffect));


        new Setting(contentEl)
            .addButton(btn => btn.setButtonText('Salvar').setCta().onClick(() => this.saveProfile()))
            .addButton(btn => btn.setButtonText('Remover Foto').onClick(() => this.removeProfilePicture()))
            .addButton(btn => btn.setButtonText('Cancelar').onClick(() => this.close()));
    }

    private async saveProfile() {
        if (!this.userName.trim()) {
            new Notice('O nome de usuário não pode estar em branco.');
            return;
        }

        this.plugin.settings.userName = this.userName.trim();
        this.plugin.settings.profileBorderColor = this.profileBorderColor;
        this.plugin.settings.profileBorderEffect = this.profileBorderEffect;

        if (typeof this.imageUrl === 'string') {
            this.plugin.settings.profilePicture = this.imageUrl;
        } else {
            this.plugin.settings.profilePicture = undefined;
        }

        await this.plugin.saveSettings();
        new Notice('Perfil salvo com sucesso!');
        eventManager.emit('data-changed');
        this.close();
    }

    private async removeProfilePicture() {
        this.plugin.settings.profilePicture = undefined;
        this.imageUrl = null; // Clear imageUrl in the modal state
        await this.plugin.saveSettings();
        new Notice('Foto de perfil removida com sucesso!');
        eventManager.emit('data-changed');
        // No need to close, just update the preview
        this.onOpen(); // Re-render the modal to show default icon
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class BannerModal extends Modal {
    plugin: NexusHubPlugin;
    onSubmit: (bannerUrl: string | undefined) => void;
    private bannerUrl: string | undefined;
    private file: File | null = null;

    private static PREMADE_BANNERS = [
        'https://i.imgur.com/8X7Y4Z0.png', // Exemplo de banner abstrato/gradiente
        'https://i.imgur.com/9C1B2D3.png', // Exemplo de banner de paisagem
        'https://i.imgur.com/0E5F6G7.png', // Exemplo de banner de tecnologia
        'https://i.imgur.com/1H2I3J4.png', // Exemplo de banner minimalista
        'https://i.imgur.com/5K6L7M8.png', // Exemplo de banner com formas geométricas
    ];

    constructor(app: App, plugin: NexusHubPlugin, onSubmit: (bannerUrl: string | undefined) => void) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
        this.bannerUrl = this.plugin.settings.profileBanner;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('nexus-fintech-modal');

        contentEl.createEl('h2', { text: 'Editar Banner do Perfil' });
        contentEl.createEl('p', { text: 'Resolução recomendada: 1920x300 pixels para melhor visualização.' });

        // Pre-made banners
        contentEl.createEl('h3', { text: 'Banners Pré-definidos' });
        const premadeBannersContainer = contentEl.createDiv({ cls: 'premade-banners-container' });
        BannerModal.PREMADE_BANNERS.forEach(banner => {
            const bannerEl = premadeBannersContainer.createDiv({ cls: 'premade-banner-item' });
            bannerEl.style.backgroundImage = `url(${banner})`;
            bannerEl.toggleClass('is-selected', this.bannerUrl === banner);
            bannerEl.addEventListener('click', () => {
                this.bannerUrl = banner;
                premadeBannersContainer.querySelectorAll('.premade-banner-item').forEach(el => el.removeClass('is-selected'));
                bannerEl.addClass('is-selected');
                this.file = null; // Clear custom file selection
            });
        });

        // Custom banner upload
        contentEl.createEl('h3', { text: 'Carregar Banner Personalizado' });
        new Setting(contentEl)
            .setName('Selecionar Imagem')
            .setDesc('Escolha uma imagem do seu computador.')
            .addButton(btn => {
                const input = createEl('input', { attr: { type: 'file', accept: 'image/*', style: 'display: none' } });
                btn.buttonEl.appendChild(input);
                btn.setButtonText('Upload Imagem').onClick(() => input.click());
                input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    this.file = file;
                    this.bannerUrl = undefined; // Clear pre-made selection
                    premadeBannersContainer.querySelectorAll('.premade-banner-item').forEach(el => el.removeClass('is-selected'));
                    new Notice(`Arquivo selecionado: ${file.name}`);
                };
            });

        new Setting(contentEl)
            .addButton(btn => btn.setButtonText('Salvar').setCta().onClick(() => this.saveBanner()))
            .addButton(btn => btn.setButtonText('Remover Banner').onClick(() => this.removeBanner()))
            .addButton(btn => btn.setButtonText('Cancelar').onClick(() => this.close()));
    }

    private async saveBanner() {
        if (this.file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                this.plugin.settings.profileBanner = event.target?.result as string;
                await this.plugin.saveSettings();
                new Notice('Banner salvo com sucesso!');
                eventManager.emit('data-changed');
                this.onSubmit(this.plugin.settings.profileBanner);
                this.close();
            };
            reader.readAsDataURL(this.file);
        } else {
            this.plugin.settings.profileBanner = this.bannerUrl;
            await this.plugin.saveSettings();
            new Notice('Banner salvo com sucesso!');
            eventManager.emit('data-changed');
            this.onSubmit(this.bannerUrl);
            this.close();
        }
    }

    private async removeBanner() {
        this.plugin.settings.profileBanner = undefined;
        await this.plugin.saveSettings();
        new Notice('Banner removido com sucesso!');
        eventManager.emit('data-changed');
        this.onSubmit(undefined);
        this.close();
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class ChangeUsernameModal extends Modal {
    plugin: NexusHubPlugin;
    onSubmit: (newUsername: string) => void;
    private newUsername: string;

    constructor(app: App, plugin: NexusHubPlugin, onSubmit: (newUsername: string) => void) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
        this.newUsername = this.plugin.settings.userName || '';
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('nexus-fintech-modal');

        contentEl.createEl('h2', { text: 'Alterar Nome de Usuário' });

        new Setting(contentEl)
            .setName('Novo Nome de Usuário')
            .setDesc('Digite o nome que você gostaria de usar.')
            .addText(text => text
                .setPlaceholder('Seu novo nome')
                .setValue(this.newUsername)
                .onChange((value) => {
                    this.newUsername = value;
                }));

        new Setting(contentEl)
            .addButton(btn => btn.setButtonText('Salvar').setCta().onClick(() => this.saveUsername()))
            .addButton(btn => btn.setButtonText('Cancelar').onClick(() => this.close()));
    }

    private async saveUsername() {
        if (!this.newUsername.trim()) {
            new Notice('O nome de usuário não pode estar em branco.');
            return;
        }
        this.plugin.settings.userName = this.newUsername.trim();
        await this.plugin.saveSettings();
        new Notice('Nome de usuário salvo com sucesso!');
        eventManager.emit('data-changed');
        this.onSubmit(this.newUsername.trim());
        this.close();
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class ProfileSettingsModal extends Modal {
    plugin: NexusHubPlugin;
    onSubmit: () => void;
    private userName: string;
    private profileBorderColor: string;
    private profileBorderEffect: string;
    private bannerUrl: string | undefined;
    private imageUrl: string | null | undefined; // Base64 or URL
    private file: File | null = null;
    private bannerFile: File | null = null;

    private static PREMADE_BANNERS = [
        'https://images.unsplash.com/photo-1557683316-973673baf926?w=800&q=80', // Gradient
        'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=800&q=80', // Dark Grid
        'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=80', // Tech/Space
        'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=800&q=80', // Neon
        'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&q=80', // Colorful
    ];

    private static PREMADE_AVATARS = [
        'https://ui-avatars.com/api/?name=User&background=random&size=200', // Initials
        'https://i.imgur.com/7v5Q6J8.png', // Cool Guy
        'https://i.imgur.com/XqQZ8Z9.png', // Robot
        'https://i.imgur.com/5w6Z7Y8.png', // Cat
        'https://i.imgur.com/9r0Z1X2.png', // Dog
        'https://github.com/shadcn.png', // Shadcn
    ];

    constructor(app: App, plugin: NexusHubPlugin, onSubmit: () => void) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
        this.userName = (this.plugin as any).settings.userName || '';
        this.profileBorderColor = (this.plugin as any).settings.profileBorderColor || '#a855f7';
        this.profileBorderEffect = (this.plugin as any).settings.profileBorderEffect || 'none';
        this.bannerUrl = (this.plugin as any).settings.profileBanner;
        this.imageUrl = (this.plugin as any).settings.profilePicture;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('nexus-fintech-modal');

        contentEl.createEl('h2', { text: 'Personalizar Perfil' });

        this.injectStyles(contentEl);

        // --- Avatar Preview & Border Settings ---
        const previewContainer = contentEl.createDiv({ cls: 'profile-picture-preview-container' });
        const previewImage = previewContainer.createEl('img', { cls: 'profile-picture-preview' });

        const updatePreview = () => {
            // Image
            if (this.imageUrl) {
                previewImage.src = this.imageUrl;
                previewImage.removeClass('is-default-svg');
            } else {
                previewImage.src = 'https://github.com/shadcn.png';
            }

            // Border & Glow
            previewContainer.style.setProperty('--profile-border-color', this.profileBorderColor);
            // Calculate Glow Value (Color + Opacity) - simplified to just usage of color with opacity in CSS or setting var here
            // CSS expects var(--profile-border-glow) to be a color
            // In view.ts we set it as `${color}40` (hex alpha). Let's do same.
            previewContainer.style.setProperty('--profile-border-glow', `${this.profileBorderColor}66`); // 40% opacity (approx)
            previewContainer.style.borderColor = this.profileBorderColor;

            // Reset Effects
            previewContainer.classList.remove('effect-shine', 'effect-glow');
            if (this.profileBorderEffect && this.profileBorderEffect !== 'none') {
                previewContainer.classList.add(`effect-${this.profileBorderEffect}`);
            }
        };

        const colorPickerSetting = new Setting(contentEl)
            .setName('Cor da Borda')
            .setDesc('Escolha a cor do brilho do seu avatar.')
            .addColorPicker(color => color
                .setValue(this.profileBorderColor)
                .onChange(value => {
                    this.profileBorderColor = value;
                    updatePreview();
                }));

        // Presets
        const presetColors = ['#E53935', '#43A047', '#1E88E5', '#FDD835', '#8E44AD', '#F4511E', '#00ACC1', '#a855f7'];
        const swatchContainer = contentEl.createDiv({ cls: 'color-swatch-container' });
        presetColors.forEach(color => {
            const swatch = swatchContainer.createDiv({ cls: 'color-swatch' });
            swatch.style.backgroundColor = color;
            swatch.addEventListener('click', () => {
                this.profileBorderColor = color;
                // Update Color Picker UI
                const colorInput = colorPickerSetting.controlEl.querySelector('input[type="color"]') as HTMLInputElement;
                if (colorInput) colorInput.value = color;
                updatePreview();
            });
        });

        new Setting(contentEl)
            .setName('Efeito da Borda')
            .setDesc('Animação visual do avatar.')
            .addDropdown(dropdown => dropdown
                .addOption('none', 'Nenhum')
                .addOption('shine', 'Brilho (Shine)')
                .addOption('glow', 'Pulsação (Glow)')
                .setValue(this.profileBorderEffect)
                .onChange(value => {
                    this.profileBorderEffect = value;
                    updatePreview();
                }));

        updatePreview(); // Initial call

        // --- User Details ---
        contentEl.createEl('h3', { text: 'Detalhes' });

        new Setting(contentEl)
            .setName('Nome de Usuário')
            .addText(text => text
                .setValue(this.userName)
                .onChange(value => this.userName = value));

        contentEl.createEl('h4', { text: 'Avatar' });

        // Avatar Gallery
        const premadeAvatarsContainer = contentEl.createDiv({ cls: 'premade-avatars-container' });
        ProfileSettingsModal.PREMADE_AVATARS.forEach(avatarUrl => {
            const avatarEl = premadeAvatarsContainer.createDiv({ cls: 'premade-avatar-item' });
            avatarEl.style.backgroundImage = `url(${avatarUrl})`;
            avatarEl.toggleClass('is-selected', this.imageUrl === avatarUrl);
            avatarEl.addEventListener('click', () => {
                this.imageUrl = avatarUrl;
                this.file = null;
                premadeAvatarsContainer.querySelectorAll('.premade-avatar-item').forEach(el => el.removeClass('is-selected'));
                avatarEl.addClass('is-selected');
                updatePreview();
                new Notice('Avatar selecionado!');
            });
        });


        new Setting(contentEl)
            .setName('Upload Próprio')
            .setDesc('Carregar imagem do computador')
            .addButton(btn => {
                const input = createEl('input', { attr: { type: 'file', accept: 'image/*', style: 'display: none' } });
                btn.buttonEl.appendChild(input);
                btn.setButtonText('Upload Imagem').onClick(() => input.click());
                input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    this.file = file;
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        this.imageUrl = event.target?.result as string;
                        premadeAvatarsContainer.querySelectorAll('.premade-avatar-item').forEach(el => el.removeClass('is-selected'));
                        updatePreview();
                    };
                    reader.readAsDataURL(file);
                };
            })
            .addButton(btn => btn.setButtonText('Remover').setWarning().onClick(() => {
                this.imageUrl = null;
                this.file = null;
                premadeAvatarsContainer.querySelectorAll('.premade-avatar-item').forEach(el => el.removeClass('is-selected'));
                updatePreview();
            }));

        // --- Banner Settings ---
        contentEl.createEl('h3', { text: 'Banner do Perfil' });

        const premadeBannersContainer = contentEl.createDiv({ cls: 'premade-banners-container' });
        ProfileSettingsModal.PREMADE_BANNERS.forEach(banner => {
            const bannerEl = premadeBannersContainer.createDiv({ cls: 'premade-banner-item' });
            bannerEl.style.backgroundImage = `url(${banner})`;
            bannerEl.toggleClass('is-selected', this.bannerUrl === banner);
            bannerEl.addEventListener('click', () => {
                this.bannerUrl = banner;
                this.bannerFile = null;
                premadeBannersContainer.querySelectorAll('.premade-banner-item').forEach(el => el.removeClass('is-selected'));
                bannerEl.addClass('is-selected');
            });
        });

        new Setting(contentEl)
            .setName('Banner Personalizado')
            .setDesc('Carregar imagem do computador')
            .addButton(btn => {
                const input = createEl('input', { attr: { type: 'file', accept: 'image/*', style: 'display: none' } });
                btn.buttonEl.appendChild(input);
                btn.setButtonText('Upload Banner').onClick(() => input.click());
                input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    this.bannerFile = file;
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        this.bannerUrl = event.target?.result as string;
                        // Deselect premade
                        premadeBannersContainer.querySelectorAll('.premade-banner-item').forEach(el => el.removeClass('is-selected'));
                        new Notice(`Banner carregado: ${file.name}`);
                    };
                    reader.readAsDataURL(file);
                };
            })
            .addButton(btn => btn.setButtonText('Remover').setWarning().onClick(() => {
                this.bannerUrl = undefined;
                this.bannerFile = null;
                premadeBannersContainer.querySelectorAll('.premade-banner-item').forEach(el => el.removeClass('is-selected'));
            }));


        // --- Footer ---
        const footerEl = contentEl.createDiv({ cls: 'modal-footer' });
        new Setting(footerEl)
            .addButton(btn => btn
                .setButtonText('Salvar Alterações')
                .setCta()
                .onClick(async () => {
                    (this.plugin as any).settings.userName = this.userName;
                    (this.plugin as any).settings.profileBorderColor = this.profileBorderColor;
                    (this.plugin as any).settings.profileBorderEffect = this.profileBorderEffect;

                    if (this.imageUrl !== undefined) {
                        (this.plugin as any).settings.profilePicture = this.imageUrl;
                    }
                    if (this.bannerUrl !== undefined) {
                        (this.plugin as any).settings.profileBanner = this.bannerUrl;
                    } else if (this.bannerUrl === undefined && (this.plugin as any).settings.profileBanner) {
                        (this.plugin as any).settings.profileBanner = undefined;
                    }

                    await (this.plugin as any).saveSettings();
                    eventManager.emit('data-changed');
                    this.onSubmit();
                    this.close();
                }));
    }

    private injectStyles(contentEl: HTMLElement) {
        const styleEl = contentEl.createEl('style');
        styleEl.innerHTML = `
            .profile-picture-preview-container {
                width: 100px; height: 100px;
                border-radius: 50%;
                margin: 0 auto 20px;
                border: 3px solid var(--profile-border-color, #a855f7);
                overflow: hidden;
                position: relative;
                transition: all 0.3s ease;
                box-shadow: 0 0 15px var(--profile-border-glow, rgba(168, 85, 247, 0.4));
            }
            .profile-picture-preview { width: 100%; height: 100%; object-fit: cover; }
            
            .color-swatch-container { display: flex; gap: 8px; justify-content: center; margin-bottom: 20px; }
            .color-swatch { width: 24px; height: 24px; border-radius: 50%; cursor: pointer; border: 2px solid var(--background-modifier-border); }
            .color-swatch:hover { transform: scale(1.1); border-color: var(--interactive-accent); }

            .premade-banners-container {
                display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; margin-bottom: 15px;
            }
            .premade-banner-item {
                height: 60px; background-size: cover; background-position: center; border-radius: 6px; cursor: pointer; border: 2px solid transparent;
            }
            .premade-banner-item:hover { transform: scale(1.02); }
            .premade-banner-item.is-selected { border-color: var(--interactive-accent); }

            /* Avatar Gallery Specifics */
            .avatar-gallery {
                grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
            }
            .avatar-item {
                 height: 60px; width: 60px; border-radius: 50%; /* Circle items */
            }

            /* Effects */
            .effect-shine { position: relative; overflow: hidden; }
            .effect-shine::after {
                content: ''; position: absolute; top:0; left:-100%; width: 50%; height: 100%;
                background: linear-gradient(to right, transparent, rgba(255,255,255,0.6), transparent);
                transform: skewX(-25deg); animation: shineAnim 3s infinite;
            }
            @keyframes shineAnim { 0% { left: -100%; } 20% { left: 200%; } 100% { left: 200%; } }

            .effect-glow { animation: glowAnim 2s infinite alternate; }
            @keyframes glowAnim {
                0% { box-shadow: 0 0 10px var(--profile-border-glow, rgba(168, 85, 247, 0.4)); }
                100% { box-shadow: 0 0 20px var(--profile-border-glow, rgba(168, 85, 247, 0.4)), 0 0 5px var(--profile-border-color, #a855f7); }
            }
        `;
    }

    onClose() {
        this.contentEl.empty();
    }
}


export class NexusScoreHistoryModal extends Modal { constructor(app: App, plugin: NexusHubPlugin) { super(app); } onOpen() { this.close(); } }
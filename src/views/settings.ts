import { App, PluginSettingTab, Setting } from 'obsidian';
import type NexusHubPlugin from '../main';

import { eventManager } from '../helpers/EventManager';
import { ResetConfirmationModal } from '../components/modals';
import { formatAsCurrency } from '../helpers/helpers';
import { setupCurrencyInput } from '../helpers/ui-helpers';

// --- INTERFACES ---

export interface Transaction {
    id: string;
    description: string;
    amount: number;
    date: string; // YYYY-MM-DD
    category: string;
    type: 'income' | 'expense';
    status: 'pending' | 'paid';
    isRecurring: boolean;
    recurrenceRule?: 'monthly';
    endDate?: string;
    isInstallment: boolean;
    installmentOf?: string;
    installmentNumber?: number;
    totalInstallments?: number;
    cardId?: string;
    purchaseDate?: string;
    pausedUntil?: string;
    paymentMonth?: string; // YYYY-MM
}

export interface CreditCard {
    id: string;
    name: string;
    limit: number;
    closingDay: number;
    dueDate: number;
}

export interface Goal {
    id: string;
    name: string;
    goalType: 'Saving' | 'Debt';
    targetAmount: number;
    currentAmount: number;
    targetDate?: string;
    linkedAccountIds: string[];
    completed: boolean;
    history?: { date: string; amount: number; balanceAfter: number }[];
}

export interface Achievement {
    id: string;
    name: string;
    description: string;
    icon: string;
    unlocked: boolean;
    unlockedDate: string;
}

export interface Budget {
    categoryId: string;
    amount: number;
}

export interface EmergencyFund {
    currentBalance: number;
    monthlyContribution: number;
    isEnabled: boolean;
    history: { date: string; type: 'deposit' | 'withdrawal'; amount: number; balanceAfter: number; reason?: string }[];
}

export interface Category {
    id: string;
    name: string;
}

export interface NexusHubSettings {
    salarioLiquido: number;
    salarioLiquido2?: number;
    promptForSalaryUpdate: boolean;
    salaryFrequency: 'monthly' | 'bi-weekly';
    salaryPayday1: number;
    salaryPayday2?: number;
    lastSalaryUpdatePromptMonth?: string; // YYYY-MM
    transactions: Transaction[];
    categories: Category[];
    goals: Goal[];
    emergencyFund: EmergencyFund;
    // Deprecated or to be reviewed
    dataVersion?: number;
    onboardingComplete?: boolean;
    userName?: string;
    nexusScore?: number;
    scoreHistory?: { date: string; points: number; reason: string; currentScore: number }[];
    achievements?: Achievement[];
    budgets?: Budget[];
    creditCards?: CreditCard[];
    notifiedTransactionIds?: string[];
}

// --- DEFAULT SETTINGS ---

export const DEFAULT_CATEGORIES: Category[] = [
    { id: 'cat_1', name: 'Moradia' },
    { id: 'cat_2', name: 'Alimentação' },
    { id: 'cat_3', name: 'Transporte' },
    { id: 'cat_4', name: 'Saúde' },
    { id: 'cat_5', name: 'Lazer' },
    { id: 'cat_6', name: 'Assinaturas' },
    { id: 'cat_7', name: 'Educação' },
    { id: 'cat_8', name: 'Investimentos' },
    { id: 'cat_9', name: 'Outros' },
    { id: 'cat_income_1', name: 'Salário' },
    { id: 'cat_income_2', name: 'Renda Extra' },
];

export const DEFAULT_SETTINGS: NexusHubSettings = {
    salarioLiquido: 0,
    salarioLiquido2: 0,
    promptForSalaryUpdate: false,
    salaryFrequency: 'monthly',
    salaryPayday1: 5,
    transactions: [],
    categories: DEFAULT_CATEGORIES,
    goals: [],
    emergencyFund: {
        currentBalance: 0,
        monthlyContribution: 100,
        isEnabled: false,
        history: []
    },
    scoreHistory: [],
    achievements: [],
    budgets: [],
    creditCards: [],
    notifiedTransactionIds: [],
    onboardingComplete: false,
    userName: '',
    nexusScore: 0,
};

// --- SETTINGS TAB ---

export class NexusHubSettingsTab extends PluginSettingTab {
    plugin: NexusHubPlugin;

    constructor(app: App, plugin: NexusHubPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Configurações do Nexus Hub' });

        // Salary Settings
        containerEl.createEl('h3', { text: 'Configurações de Salário' });

        new Setting(containerEl)
            .setName('Frequência do Salário')
            .setDesc('Como você recebe seu salário?')
            .addDropdown(dropdown => dropdown
                .addOption('monthly', 'Mensal')
                .addOption('bi-weekly', 'Quinzenal')
                .setValue(this.plugin.settings.salaryFrequency)
                .onChange(async (value: 'monthly' | 'bi-weekly') => {
                    this.plugin.settings.salaryFrequency = value;
                    await this.plugin.saveSettings();
                    this.display(); // Re-render the entire tab
                }));

        const isBiWeekly = this.plugin.settings.salaryFrequency === 'bi-weekly';

        if (isBiWeekly) {
            // Bi-weekly layout
            const salaryContainer = containerEl.createDiv({ cls: 'salary-section' });

            let s1 = this.plugin.settings.salarioLiquido || 0;
            let s2 = this.plugin.settings.salarioLiquido2 || 0;

            const updateTotal = () => {
                totalEl.setText(formatAsCurrency(s1 + s2));
            };

            // 1st Payment
            salaryContainer.createEl('h4', { text: '1º Pagamento' });
            new Setting(salaryContainer)
                .setName('Dia do 1º Pagamento')
                .addText(text => text.setValue(this.plugin.settings.salaryPayday1.toString()).onChange(async (value) => {
                    this.plugin.settings.salaryPayday1 = Number(value) || 1;
                    await this.plugin.saveSettings();
                }));
            new Setting(salaryContainer)
                .setName('Valor Líquido do 1º Pagamento')
                .addText(text => setupCurrencyInput(text, async (value) => {
                    s1 = value;
                    this.plugin.settings.salarioLiquido = value;
                    updateTotal();
                    await this.plugin.saveSettings();
                }, s1));

            // 2nd Payment
            salaryContainer.createEl('h4', { text: '2º Pagamento' });
            new Setting(salaryContainer)
                .setName('Dia do 2º Pagamento')
                .addText(text => text.setValue((this.plugin.settings.salaryPayday2 || 15).toString()).onChange(async (value) => {
                    this.plugin.settings.salaryPayday2 = Number(value) || 15;
                    await this.plugin.saveSettings();
                }));
            new Setting(salaryContainer)
                .setName('Valor Líquido do 2º Pagamento')
                .addText(text => setupCurrencyInput(text, async (value) => {
                    s2 = value;
                    this.plugin.settings.salarioLiquido2 = value;
                    updateTotal();
                    await this.plugin.saveSettings();
                }, s2));

            // Total
            containerEl.createEl('hr');
            const totalSetting = new Setting(containerEl)
                .setName('Total Recebido no Mês');
            const totalEl = totalSetting.controlEl.createEl('strong', { cls: 'salary-total' });
            updateTotal();

        } else {
            // Monthly layout
            new Setting(containerEl)
                .setName('Salário Líquido Mensal')
                .setDesc('Seu salário líquido após todos os descontos.')
                .addText(text => setupCurrencyInput(text, async (value) => {
                    this.plugin.settings.salarioLiquido = value;
                    await this.plugin.saveSettings();
                }, this.plugin.settings.salarioLiquido));

            new Setting(containerEl)
                .setName('Dia do Pagamento')
                .setDesc('O dia do mês em que você normalmente recebe seu salário.')
                .addText(text => text.setValue(this.plugin.settings.salaryPayday1.toString()).onChange(async (value) => {
                    this.plugin.settings.salaryPayday1 = Number(value) || 1;
                    await this.plugin.saveSettings();
                }));
        }

        containerEl.createEl('hr');

        new Setting(containerEl)
            .setName('Perguntar sobre atualização de salário')
            .setDesc('Se ativado, o plugin perguntará no início de cada mês se você deseja atualizar seu salário.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.promptForSalaryUpdate)
                .onChange(async (value) => {
                    this.plugin.settings.promptForSalaryUpdate = value;
                    await this.plugin.saveSettings();
                }));

        // Danger Zone
        containerEl.createEl('hr');
        const dangerZone = containerEl.createDiv({ cls: 'danger-zone' });
        dangerZone.createEl('h3', { text: 'Zona de Perigo' });
        dangerZone.createEl('p', { text: 'Ações nesta seção são perigosas e podem levar à perda de dados.', cls: 'mod-subtle' });

        new Setting(dangerZone)
            .addButton(btn => btn
                .setButtonText('Resetar Todos os Dados')
                .setClass('mod-warning')
                .onClick(() => new ResetConfirmationModal(this.app, this.plugin).open()));
    }
}
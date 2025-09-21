import { App, PluginSettingTab, Setting } from 'obsidian';
import type NexusHubPlugin from './main';
import { Language, setLanguage, t } from './lang';
import { moment } from 'obsidian';
import { eventManager } from './EventManager';

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
    language: Language;
    dataVersion: number;
    onboardingComplete: boolean;
    userName: string;
    nexusScore: number;
    scoreHistory: { date: string; points: number; reason: string; currentScore: number }[];
    achievements: Achievement[];
    transactions: Transaction[];
    categories: Category[];
    budgets: Budget[];
    goals: Goal[];
    creditCards: CreditCard[];
    emergencyFund: EmergencyFund;
    notifiedTransactionIds: string[];
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
    language: 'pt-br',
    dataVersion: 2,
    onboardingComplete: false,
    userName: "",
    nexusScore: 0,
    scoreHistory: [],
    achievements: [],
    transactions: [],
    categories: DEFAULT_CATEGORIES,
    budgets: [],
    goals: [],
    creditCards: [],
    emergencyFund: {
        currentBalance: 0,
        monthlyContribution: 100,
        isEnabled: false,
        history: []
    },
    notifiedTransactionIds: [],
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

        containerEl.createEl('h2', { text: t('SETTINGS_HEADER') });

        new Setting(containerEl)
            .setName(t('SETTINGS_LANGUAGE'))
            .setDesc(t('SETTINGS_LANGUAGE_DESC'))
            .addDropdown(dropdown => dropdown
                .addOption('pt-br', t('SETTINGS_LANGUAGE_PT_BR'))
                .addOption('en', t('SETTINGS_LANGUAGE_EN'))
                .setValue(this.plugin.settings.language)
                .onChange(async (value: Language) => {
                    this.plugin.settings.language = value;
                    // Aqui chamamos saveSettings, que irá disparar a verificação de conquistas
                    await this.plugin.saveSettings();
                    setLanguage(value);
                    eventManager.emit('data-changed'); // Dispara a atualização da UI principal
                    this.display(); // Redesenha a tela de configurações
                }));

        // --- ZONA DE PERIGO ---
        containerEl.createEl('hr');
        const dangerZone = containerEl.createDiv({ cls: 'danger-zone' });
        dangerZone.createEl('h3', { text: t('SETTINGS_DANGER_ZONE_HEADER') });
        dangerZone.createEl('p', { text: t('SETTINGS_DANGER_ZONE_DESC'), cls: 'mod-subtle' });

        new Setting(dangerZone)
            .addButton(btn => btn
                .setButtonText(t('SETTINGS_RESET_DATA_BUTTON'))
                .setClass('mod-warning')
                .onClick(() => this.plugin.resetAllData()));
    }
}
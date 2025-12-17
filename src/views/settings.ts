import { App, PluginSettingTab, Setting, Notice, moment } from 'obsidian';
import type NexusHubPlugin from '../main';

import { eventManager } from '../helpers/EventManager';
import { NEXUS_TRADING_CARDS } from '../services/achievements';
import { PackOpeningModal } from '../components/pack-opening-modal';
import { ResetConfirmationModal, AddCreditCardFormModal, ConfirmationModal, EmergencyFundModal, GoalsModal } from '../components/modals';
import { formatAsCurrency } from '../helpers/helpers';
import { setupCurrencyInput } from '../helpers/ui-helpers';
import { AchievementNotifier } from '../helpers/AchievementNotifier';
import { ALL_ACHIEVEMENTS } from '../services/achievements';

import { Achievement } from '../services/achievements';

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
    recurrence?: string; // Human readable frequency (e.g. "Mensal")
    endDate?: string;
    isInstallment: boolean;
    installmentOf?: string;
    installmentNumber?: number; // Legacy?
    currentInstallment?: number; // New standard
    totalInstallments?: number;
    cardId?: string;
    purchaseDate?: string;
    pausedUntil?: string;
    paymentMonth?: string; // YYYY-MM
    // Propriedades para transações virtuais (metas, etc.)
    isVirtual?: boolean;
    virtualType?: 'goal' | 'fund';
    virtualId?: string;
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
    monthlyInstallment?: number;
    showInPending?: boolean;
    linkedAccountIds: string[];
    completed: boolean;
    skippedMonths?: string[];
    history?: { date: string; amount: number; balanceAfter: number; referenceMonth?: string }[];
    monthlyContributionsOverride?: { [monthKey: string]: number };
    // Debt specific fields
    totalInstallments?: number;
    startDate?: string; // Loan date
}

// (Removed import from here)

export interface Budget {
    categoryId: string;
    amount: number;
}

export interface EmergencyFund {
    targetAmount: number;
    currentBalance: number;
    monthlyContribution: number;
    targetDate?: string;
    calculationMode?: 'byDate' | 'byInstallment';
    showInPending: boolean;
    skippedMonths?: string[];
    history: { date: string; type: 'deposit' | 'withdrawal'; amount: number; balanceAfter: number; reason?: string; referenceMonth?: string }[];
    monthlyContributionsOverride?: { [monthKey: string]: number };
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
    profilePicture?: string; // Base64 encoded image or URL
    profileBorderColor?: string;
    profileBorderEffect?: 'none' | 'shine' | 'glow';
    profileBanner?: string;

    // Nexus Extensions
    collectedCards?: string[]; // IDs of collected NexusTradingCards
    selectedBadge?: string; // ID of the badge to display on profile

    // Streak Tracking
    lastLoginDate?: string; // YYYY-MM-DD
    currentStreak?: number;
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
    { id: 'cat_9', name: 'Fatura de Cartão' },
    { id: 'cat_10', name: 'Outros' },
    { id: 'cat_tech', name: 'Tecnologia' }, // New Default
    { id: 'cat_games', name: 'Games & Lazer' }, // New Default
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
        targetAmount: 3000,
        currentBalance: 0,
        monthlyContribution: 100,
        showInPending: false,
        history: [],
        calculationMode: 'byInstallment'
    },
    scoreHistory: [],
    achievements: [],
    budgets: [],
    creditCards: [],
    notifiedTransactionIds: [],
    onboardingComplete: false,
    userName: '',
    nexusScore: 0,
    profileBorderColor: undefined,
    profileBorderEffect: 'none',
    profileBanner: '',
    collectedCards: [],
    selectedBadge: 'b1',
};

export function getCleanDefaultSettings(): NexusHubSettings {
    const clean = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    // Explicitly reset arrays to ensure they are empty, guarding against DEFAULT_SETTINGS mutation
    clean.transactions = [];
    clean.goals = [];
    clean.achievements = [];
    clean.completedGoals = [];
    clean.budgets = [];
    clean.creditCards = [];
    clean.notifiedTransactionIds = [];
    clean.scoreHistory = [];
    clean.collectedCards = [];
    return clean;
}

// --- SETTINGS TAB ---

export class NexusHubSettingsTab extends PluginSettingTab {
    plugin: NexusHubPlugin;

    constructor(app: App, plugin: NexusHubPlugin) {
        super(app, plugin as any);
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
                .setValue((this.plugin as any).settings.salaryFrequency)
                .onChange(async (value: 'monthly' | 'bi-weekly') => {
                    (this.plugin as any).settings.salaryFrequency = value;
                    await this.plugin.saveSettings();
                    this.display(); // Re-render the entire tab
                }));

        const isBiWeekly = (this.plugin as any).settings.salaryFrequency === 'bi-weekly';

        if (isBiWeekly) {
            // Bi-weekly layout
            const salaryContainer = containerEl.createDiv({ cls: 'salary-section' });

            let s1 = (this.plugin as any).settings.salarioLiquido || 0;
            let s2 = (this.plugin as any).settings.salarioLiquido2 || 0;

            const updateTotal = () => {
                totalEl.setText(formatAsCurrency(s1 + s2));
            };

            // 1st Payment
            salaryContainer.createEl('h4', { text: '1º Pagamento' });
            new Setting(salaryContainer)
                .setName('Dia do 1º Pagamento')
                .addText(text => text.setValue((this.plugin as any).settings.salaryPayday1.toString()).onChange(async (value) => {
                    (this.plugin as any).settings.salaryPayday1 = Number(value) || 1;
                    await this.plugin.saveSettings();
                }));
            new Setting(salaryContainer)
                .setName('Valor Líquido do 1º Pagamento')
                .addText(text => setupCurrencyInput(text, async (value) => {
                    s1 = value;
                    (this.plugin as any).settings.salarioLiquido = value;
                    updateTotal();
                    await this.plugin.saveSettings();
                }, s1));

            // 2nd Payment
            salaryContainer.createEl('h4', { text: '2º Pagamento' });
            new Setting(salaryContainer)
                .setName('Dia do 2º Pagamento')
                .addText(text => text.setValue(((this.plugin as any).settings.salaryPayday2 || 15).toString()).onChange(async (value) => {
                    (this.plugin as any).settings.salaryPayday2 = Number(value) || 15;
                    await this.plugin.saveSettings();
                }));
            new Setting(salaryContainer)
                .setName('Valor Líquido do 2º Pagamento')
                .addText(text => setupCurrencyInput(text, async (value) => {
                    s2 = value;
                    (this.plugin as any).settings.salarioLiquido2 = value;
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
                    const params = (this.plugin as any).settings;
                    params.salarioLiquido = value;

                    // SYNC LOGIC: Update existing RECURRING INCOME transactions for CURRENT and FUTURE months.
                    // "muda tudo do mes q vc ta pra frente, os meses anteiores nao mexe"
                    const today = moment().startOf('month');
                    params.transactions.forEach((t: any) => {
                        if (t.isRecurring && t.type === 'income' && t.category === 'Salário') {
                            const tDate = moment(t.date);
                            // If transaction is same month or future, update the amount.
                            if (tDate.isSameOrAfter(today, 'month')) {
                                t.amount = value;
                            }
                        }
                    });

                    await this.plugin.saveSettings();
                }, (this.plugin as any).settings.salarioLiquido));

            new Setting(containerEl)
                .setName('Dia do Pagamento')
                .setDesc('O dia do mês em que você normalmente recebe seu salário.')
                .addText(text => text.setValue((this.plugin as any).settings.salaryPayday1.toString()).onChange(async (value) => {
                    (this.plugin as any).settings.salaryPayday1 = Number(value) || 1;
                    await this.plugin.saveSettings();
                }));
        }

        containerEl.createEl('hr');

        new Setting(containerEl)
            .setName('Perguntar sobre atualização de salário')
            .setDesc('Se ativado, o plugin perguntará no início de cada mês se você deseja atualizar seu salário.')
            .addToggle(toggle => toggle
                .setValue((this.plugin as any).settings.promptForSalaryUpdate)
                .onChange(async (value) => {
                    (this.plugin as any).settings.promptForSalaryUpdate = value;
                    await this.plugin.saveSettings();
                }));

        // --- NEXUS TRADING CARDS (DEV ZONE) ---
        containerEl.createEl('hr');
        containerEl.createEl('h3', { text: 'Ferramentas de Coleção & Debug' });

        // 1. Force Achievement Check
        new Setting(containerEl)
            .setName('Recalcular Conquistas (Debug)')
            .setDesc('Força uma verificação completa de todas as conquistas com base nos dados atuais.')
            .addButton(btn => btn
                .setButtonText('Recalcular Agora')
                .onClick(() => {
                    if ((this.plugin as any).settings) {
                        // Import dynamically if needed or rely on main's method if exposed, 
                        // but easier to emit event which engine listens to.
                        eventManager.emit('data-changed', (this.plugin as any).settings);
                        new Notice('Verificação de conquistas disparada!');
                    }
                }));

        // 1. Drop Simulation


        // 2. View Card Test
        new Setting(containerEl)
            .setName('Debug: Visualizar Carta')
            .setDesc('Abre a animação de pacote para a primeira carta da lista.')
            .addButton(btn => btn
                .setButtonText('Visualizar')
                .onClick(() => {
                    const card = NEXUS_TRADING_CARDS[0]; // Get the first defined card
                    if (card) {
                        new PackOpeningModal(this.plugin.app, card).open();
                    } else {
                        new Notice('Nenhuma carta definida no sistema.');
                    }
                }));

        // 3. Test Achievement Notification (Restored)
        new Setting(containerEl)
            .setName('Testes de Notificação')
            .setDesc('Simula o desbloqueio de uma conquista para validar as notificações.')
            .addButton(btn => btn
                .setButtonText('Testar Notificação da Conquista')
                .setCta()
                .onClick(() => {
                    new Notice('Disparando teste visual...');
                    // Create a dummy achievement for testing
                    const testAchievement: Achievement = {
                        id: 'test_debug_1',
                        name: 'Teste de Notificação',
                        description: 'Se você está vendo isso, o sistema de notificações está funcionando!',
                        icon: 'trophy',
                        points: 100,
                        tier: 'Gold',
                        unlocked: true,
                        unlockedDate: new Date().toISOString(),
                        category: 'Debug'
                    };
                    // Call notifier directly
                    AchievementNotifier.show(this.plugin as any, testAchievement);
                }));

        // 4. Reset Collection
        new Setting(containerEl)
            .setName('Resetar Coleção de Cartas')
            .setDesc('Remove todas as cartas coletadas. Cuidado!')
            .addButton(btn => btn
                .setButtonText('Apagar Cartas')
                .setWarning()
                .onClick(async () => {
                    new ConfirmationModal(this.app, 'Confirmar Exclusão', 'Você perderá todas as cartas coletadas.', async () => {
                        (this.plugin as any).settings.collectedCards = [];
                        await this.plugin.saveSettings();
                        new Notice('Coleção resetada.');
                        this.display();
                    }).open();
                }));

        // --- DANGER ZONE ---
        containerEl.createEl('hr');
        const dangerZone = containerEl.createDiv({ cls: 'danger-zone' });
        dangerZone.createEl('h3', { text: 'Zona de Perigo' });
        dangerZone.createEl('p', { text: 'Ações nesta seção são perigosas e podem levar à perda de dados.', cls: 'mod-subtle' });

        new Setting(dangerZone)
            .setName('Resetar Dados')
            .setDesc('Isso irá apagar todos os dados do plugin, incluindo transações, metas e conquistas. Esta ação não pode ser desfeita.')
            .addButton(btn => btn
                .setButtonText('Resetar Todos os Dados')
                .setClass('mod-warning')
                .onClick(() => new ResetConfirmationModal(this.app, async () => {
                    await this.plugin.resetAllData();
                }).open()));
    }
}
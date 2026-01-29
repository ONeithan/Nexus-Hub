import { App, PluginSettingTab, Setting, Notice, moment } from 'obsidian';
import type NexusHubPlugin from '../main';

import { Achievement } from '../services/achievements';

// --- INTERFACES ---

export interface Transaction {
    id: string;
    description: string;
    amount: number;
    date: string; // YYYY-MM-DD
    dueDate?: string; // YYYY-MM-DD (Data de Vencimento)
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
    // Gamification State (Real Counters)
    reportViewCount: number;
    firstAccessDate: string; // ISO Date
    fullScreenUsageCount: number;

    // Existing fields...
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
    // Gamification State
    reportViewCount: 0,
    firstAccessDate: moment().toISOString(),
    fullScreenUsageCount: 0,

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
// Moved to settings-tab.ts to break circular dependency
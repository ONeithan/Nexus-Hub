import { eventManager } from '../helpers/EventManager';
import { AchievementNotifier } from '../helpers/AchievementNotifier';
import { NexusHubSettings } from '../views/settings';
import { ALL_ACHIEVEMENTS, Achievement } from './achievements';
import NexusHubPlugin from '../main';
import moment from 'moment';

let plugin: NexusHubPlugin;

// --- Central Unlock Logic ---
export async function unlockAchievement(id: string) {
    if (!plugin || !plugin.settings) return;
    const settings = plugin.settings;

    // Ensure achievements array exists
    settings.achievements = settings.achievements || [];

    const isUnlocked = settings.achievements.some((a: Achievement) => a.id === id);

    if (!isUnlocked) {
        const achievementData = ALL_ACHIEVEMENTS.find(a => a.id === id);
        if (achievementData) {
            console.log(`Unlocking achievement: ${achievementData.name}`);
            const newAchievement: Achievement = {
                ...achievementData,
                unlocked: true,
                unlockedDate: new Date().toISOString(),
            };
            settings.achievements.push(newAchievement);
            await plugin.saveSettings();
            AchievementNotifier.show(plugin, newAchievement);
        }
    }
}

// --- Checkers ---

// --- Checkers ---

function getValidTransactions(settings: NexusHubSettings): any[] {
    const today = moment().format('YYYY-MM-DD');
    return settings.transactions.filter(t => t.date <= today);
}

function checkSettingsAchievements(settings: NexusHubSettings) {
    if (settings.userName) unlockAchievement('identity_set');
    if (settings.onboardingComplete) unlockAchievement('first_steps');
    if (settings.creditCards && settings.creditCards.length > 0) unlockAchievement('first_credit_card');
    if (settings.creditCards && settings.creditCards.length >= 2) unlockAchievement('two_cards');
}

function checkVolumeAchievements(settings: NexusHubSettings) {
    const validTx = getValidTransactions(settings);
    // Exclude 'Salário' transactions from volume count (user "activity" count)
    // This prevents the user from getting "First Register" just by setting up their salary.
    // CRITICAL: Only count PAID transactions
    const activityTx = validTx.filter(t => t.category !== 'Salário' && t.status === 'paid');
    const txCount = activityTx.length;
    // console.log(`[Nexus Hub Debug] Volume Check (Valid): TxCount=${txCount}`);

    // Tiers defined in achievements.ts
    [1, 10, 50, 100, 250, 500, 1000, 2500, 5000, 10000].forEach(n => {
        if (txCount >= n) unlockAchievement(`total_tx_${n}`);
    });
}

function checkWealthAchievements(settings: NexusHubSettings) {
    const validTx = getValidTransactions(settings);

    // Net Worth = (Income - Expense) - ONLY PAID
    const totalIncome = validTx.filter(t => t.type === 'income' && t.status === 'paid').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = validTx.filter(t => t.type === 'expense' && t.status === 'paid').reduce((sum, t) => sum + t.amount, 0);
    const netWorth = totalIncome - totalExpense;

    // console.log(`[Nexus Hub Debug] Wealth Check (Valid): Income=${totalIncome}, Expense=${totalExpense}, NetWorth=${netWorth}, TxCount=${validTx.length}`);

    if (validTx.length === 0 && netWorth === 0) {
        return;
    }

    [1000, 5000, 10000, 50000, 100000, 250000, 500000, 1000000].forEach(n => {
        if (netWorth >= n) unlockAchievement(`wealth_${n}`);
    });
}

function checkCategoryAchievements(settings: NexusHubSettings) {
    const validTx = getValidTransactions(settings);
    const categories = settings.categories || [];
    const catMap = new Map<string, { count: number, value: number }>();

    validTx.filter(t => t.type === 'expense' && t.status === 'paid').forEach(t => {
        const cat = categories.find(c => c.name === t.category);
        if (!cat) return;

        const stats = catMap.get(cat.id) || { count: 0, value: 0 };
        stats.count++;
        stats.value += t.amount;
        catMap.set(cat.id, stats);
    });

    catMap.forEach((stats, catId) => {
        // Check Count Tiers
        [1, 5, 10, 25, 50, 100, 250, 500].forEach(n => {
            if (stats.count >= n) unlockAchievement(`cat_${catId}_count_${n}`);
        });

        // Check Value Tiers
        [500, 1000, 5000, 10000, 50000, 100000].forEach(n => {
            if (stats.value >= n) unlockAchievement(`cat_${catId}_val_${n}`);
        });
    });
}

function checkStreakAchievements(settings: NexusHubSettings) {
    const streak = settings.currentStreak || 0;
    [3, 7, 14, 21, 30, 60, 90, 180, 365].forEach(n => {
        if (streak >= n) unlockAchievement(`streak_${n}`);
    });
}

function checkMysteryAchievements(settings: NexusHubSettings) {
    const validTx = getValidTransactions(settings);

    // Check Transaction-based Mysteries
    validTx.forEach(t => {
        // Amounts
        if (Math.abs(t.amount - 1.99) < 0.01) unlockAchievement('rng_199');
        if (Math.abs(t.amount - 123.45) < 0.01) unlockAchievement('rng_12345');
        if (Math.abs(t.amount - 3.14) < 0.01) unlockAchievement('rng_314');
        if (Math.abs(t.amount - 42.00) < 0.01) unlockAchievement('rng_42');
        if (Math.abs(t.amount - 777.00) < 0.01) unlockAchievement('rng_777');
        if (Math.abs(t.amount - 1001.00) < 0.01) unlockAchievement('rng_1001');
        if (Math.abs(t.amount - 0.01) < 0.001) unlockAchievement('rng_001');
        if (Math.abs(t.amount - 888.00) < 0.01) unlockAchievement('rng_888');
        if (Math.abs(t.amount - 99.99) < 0.01) unlockAchievement('rng_9999');
        if (Math.abs(t.amount - 50.50) < 0.01) unlockAchievement('rng_5050');
        if (Math.abs(t.amount - 1337.00) < 0.01) unlockAchievement('rng_1337');
        if (Math.abs(t.amount - 4.20) < 0.01) unlockAchievement('rng_420');

        // Times - Only check if explicit time provided (length > 10, e.g. YYYY-MM-DD HH:mm)
        if (t.date.length > 10) {
            const time = moment(t.date).format('HH:mm');
            const hour = moment(t.date).hour();
            if (time === '04:04') unlockAchievement('time_0404');
            if (time === '12:00') unlockAchievement('time_1200');
            if (time === '23:59') unlockAchievement('time_2359');
            if (time === '16:20') unlockAchievement('time_1620');
            if (time === '11:11') unlockAchievement('time_1111');
            if (time === '00:00') unlockAchievement('time_0000');

            // Ranges
            if (hour >= 3 && hour < 5) unlockAchievement('time_dawn');
            if (hour >= 12 && hour < 14) unlockAchievement('time_lunch');
        }

        // Keywords
        const desc = t.description.toLowerCase();
        if (desc.includes('pizza')) unlockAchievement('key_pizza');
        if (desc.includes('uber') || desc.includes('99')) unlockAchievement('key_uber');
        if (desc.includes('steam')) unlockAchievement('key_steam');
        if (desc.includes('ifood')) unlockAchievement('key_ifood');
        if (desc.includes('netflix')) unlockAchievement('key_netflix');
        if (desc.includes('spotify')) unlockAchievement('key_spotify');
        if (desc.includes('academia') || desc.includes('gym')) unlockAchievement('key_gym');
        if (desc.includes('cerveja') || desc.includes('bar')) unlockAchievement('key_beer');
        if (desc.includes('livro') || desc.includes('kindle')) unlockAchievement('key_book');
        if (desc.includes('presente')) unlockAchievement('key_gift');
        if (desc.includes('ração') || desc.includes('vet')) unlockAchievement('key_pet');
        if (desc.includes('médico') || desc.includes('exame')) unlockAchievement('key_doctor');

        // Secrets
        if (t.amount < 0 && t.type === 'expense') unlockAchievement('secret_negative');
        if (t.amount >= 1000000 && t.type === 'income') unlockAchievement('secret_rich');
    });

    // Count Check for 'secret_penny'
    const pennyTransactions = validTx.filter(t => t.amount <= 1.00 && moment(t.date).isSame(moment(), 'day'));
    if (pennyTransactions.length >= 5) unlockAchievement('secret_penny');
}

function checkPlatinumAchievements(settings: NexusHubSettings) {
    const unlockedIds = new Set(settings.achievements?.map(a => a.id));
    const achievementsByCategory = ALL_ACHIEVEMENTS.reduce((acc, ach) => {
        if (!acc[ach.category]) {
            acc[ach.category] = [];
        }
        acc[ach.category].push(ach);
        return acc;
    }, {} as Record<string, any[]>);

    for (const category in achievementsByCategory) {
        const categoryAchievements = achievementsByCategory[category];
        const nonPlatinumAchievements = categoryAchievements.filter(a => a.tier !== 'Platinum');
        const allUnlocked = nonPlatinumAchievements.every(a => unlockedIds.has(a.id));

        if (allUnlocked) {
            const platinumAchievement = categoryAchievements.find(a => a.tier === 'Platinum');
            if (platinumAchievement) {
                unlockAchievement(platinumAchievement.id);
            }
        }
    }
}

function checkScoreAchievements(settings: NexusHubSettings) {
    const nexusScore = settings.nexusScore || 0;
    if (nexusScore >= 25) unlockAchievement('nexus_score_25');
    if (nexusScore >= 50) unlockAchievement('nexus_score_50');
    if (nexusScore >= 100) unlockAchievement('nexus_score_100');
    if (nexusScore >= 250) unlockAchievement('nexus_score_250');
    if (nexusScore >= 500) unlockAchievement('nexus_score_500');
    if (nexusScore >= 1000) unlockAchievement('nexus_score_1000');
}

function checkViewAchievements(viewId: string) {
    if (viewId === 'report') unlockAchievement('first_report_view');
}

// --- Combined Check ---
export function checkAllAchievements(settings: NexusHubSettings) {
    if (!settings) return;
    // GUARD: If user hasn't set a name (reset or new install), do not unlock anything based on stats.
    // We only check basic "Identity" achievement if they just set the name.
    if (!settings.userName || settings.userName.trim() === '') {
        // Allow ONLY specific checks that might happen during onboarding? 
        // Actually, if they have no name, they shouldn't have achievements.
        // But checkSettingsAchievements unlocks 'identity_set' based on userName existence.
        // So if userName is missing, that won't unlock. 
        // We should just return locally, assuming no other achievements are possible without onboarding.
        return;
    }
    checkSettingsAchievements(settings);
    checkVolumeAchievements(settings);
    checkWealthAchievements(settings);
    checkCategoryAchievements(settings);
    checkPlatinumAchievements(settings);
    checkScoreAchievements(settings);
    checkStreakAchievements(settings);
    checkMysteryAchievements(settings);
}

// --- Initializer ---
export function initializeAchievementEngine(p: NexusHubPlugin) {
    plugin = p;

    // Run initial check for retroactive achievements
    if (plugin.settings) {
        checkAllAchievements(plugin.settings);
    }

    eventManager.on('data-changed', (settings: NexusHubSettings) => {
        if (!settings) {
            console.log("Achievement engine received data-changed event with no settings, skipping checks.");
            return;
        }
        checkAllAchievements(settings);
    });

    eventManager.on('view-opened', (viewId: string) => {
        checkViewAchievements(viewId);
    });

    console.log("Achievement Engine Initialized");
}

export function updateEnginePluginReference(p: NexusHubPlugin) {
    plugin = p;
    console.log("[Nexus Hub Debug] Achievement Engine plugin reference updated manually.");
}
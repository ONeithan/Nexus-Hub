import { NexusHubSettings, Achievement, Transaction, Goal } from '../views/settings';

// Define all possible achievements
export const ALL_ACHIEVEMENTS = [
    { id: 'onboarding_complete', name: 'Primeiros Passos', description: 'Completou a configuração inicial.', icon: 'play-circle' },
    { id: 'first_transaction', name: 'Começando a Jornada', description: 'Registrou sua primeira transação.', icon: 'file-plus-2' },
    { id: 'ten_transactions_paid', name: 'Organizado', description: 'Pagou 10 transações no prazo.', icon: 'list-checks' },
    { id: 'first_budget', name: 'Planejador', description: 'Definiu seu primeiro orçamento mensal.', icon: 'target' },
    { id: 'first_goal', name: 'Sonhador', description: 'Criou sua primeira meta financeira.', icon: 'flag' },
    { id: 'goal_completed', name: 'Conquistador', description: 'Completou uma meta financeira.', icon: 'trophy' },
    { id: 'emergency_fund_started', name: 'Precavido', description: 'Iniciou sua reserva de emergência.', icon: 'shield' },
    { id: 'emergency_fund_contribution', name: 'Hábito Saudável', description: 'Fez sua primeira contribuição mensal para a reserva.', icon: 'repeat' },
    { id: 'nexus_score_100', name: 'Centurião', description: 'Alcançou 100 pontos no Nexus Score.', icon: 'gem' },
];

/**
 * Checks the current settings against the achievement list and unlocks new ones.
 * @param settings The current plugin settings.
 * @returns An object containing the names of newly unlocked achievements and the updated list of all achievements.
 */
export function checkAchievements(settings: NexusHubSettings): { unlocked: string[], newAchievements: Achievement[] } {
    const unlockedIds = new Set((settings.achievements || []).map((a: Achievement) => a.id));
    const newlyUnlocked: string[] = [];
    const newAchievementsList = [...(settings.achievements || [])];

    const unlock = (id: string) => {
        if (!unlockedIds.has(id)) {
            const achievementData = ALL_ACHIEVEMENTS.find((a: {id: string}) => a.id === id);
            if (achievementData) {
                newAchievementsList.push({
                    ...achievementData,
                    unlocked: true,
                    unlockedDate: new Date().toISOString(),
                });
                newlyUnlocked.push(achievementData.name);
                unlockedIds.add(id);
            }
        }
    };

    // --- Check logic for each achievement ---

    // 1. Onboarding
    if (settings.onboardingComplete) unlock('onboarding_complete');

    // 2. Transactions
    if (settings.transactions.length > 0) unlock('first_transaction');
    if (settings.transactions.filter((transaction: Transaction) => transaction.status === 'paid').length >= 10) unlock('ten_transactions_paid');

    // 3. Budgets
    if (settings.budgets && settings.budgets.length > 0) unlock('first_budget');

    // 4. Goals
    if (settings.goals && settings.goals.length > 0) unlock('first_goal');
    if (settings.goals && settings.goals.some((g: Goal) => g.completed)) unlock('goal_completed');

    // 5. Emergency Fund
    if (settings.emergencyFund && settings.emergencyFund.currentBalance > 0) unlock('emergency_fund_started');
    if (settings.emergencyFund && settings.emergencyFund.history && settings.emergencyFund.history.some((h: {reason?: string}) => h.reason === 'Aporte para Fundo de Emergência')) unlock('emergency_fund_contribution');

    // 6. Nexus Score
    if ((settings.nexusScore || 0) >= 100) unlock('nexus_score_100');

    return { unlocked: newlyUnlocked, newAchievements: newAchievementsList };
}
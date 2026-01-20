import { Transaction, NexusHubSettings, Goal } from '../views/settings';
import { NexusTradingCard } from './achievements';
import { moment } from 'obsidian';

/**
 * Sistema de Regras Determinísticas para Cartas
 * 
 * Cada carta tem uma função que verifica se o jogador cumpriu os requisitos.
 * Retorna `true` se a carta deve ser desbloqueada.
 * 
 * REGRA CRÍTICA: Apenas transações PAGAS (status === 'paid') devem contar para cartas.
 */

export type CardRule = (
    transaction: Transaction,
    settings: NexusHubSettings,
    allTransactions: Transaction[]
) => boolean;

export const CARD_RULES: Record<string, CardRule> = {
    // ===================================================================
    // SERIES: FINANCIAL ORIGIN
    // ===================================================================

    'card_ancient_coins': (tx, settings, allTx) => {
        // "Registre 5 despesas na categoria Alimentação"
        const foodExpenses = allTx.filter(t =>
            t.status === 'paid' &&
            t.type === 'expense' &&
            (t.category === 'Alimentação' || t.category === 'Mercado' || t.category === 'Restaurante' || t.category === 'Ifood')
        );
        return foodExpenses.length >= 5;
    },

    'card_ledger': (tx, settings, allTx) => {
        // "Complete setup e defina nome"
        return !!(settings.onboardingComplete && settings.userName);
    },

    'card_mint': (tx, settings, allTx) => {
        // "Acumule R$ 500 em receitas"
        const incomeTx = allTx.filter(t => t.type === 'income' && t.status === 'paid');
        const totalIncome = incomeTx.reduce((sum, t) => sum + t.amount, 0);

        // REQUISITO: Pelo menos 2 transações de renda para não dropar só com a inicial do setup
        return incomeTx.length >= 2 && totalIncome >= 500;
    },

    'card_banker': (tx, settings, allTx) => {
        // "Saldo positivo por 30 dias"
        const paidTx = allTx.filter(t => t.status === 'paid');
        if (paidTx.length < 10) return false;

        const oldestTxDate = moment.min(paidTx.map(t => moment(t.date)));
        if (moment().diff(oldestTxDate, 'days') < 30) return false;

        const last30Days = moment().subtract(30, 'days');
        const recentTx = paidTx.filter(t => moment(t.date).isAfter(last30Days));

        let balance = 0;
        for (const t of recentTx.sort((a, b) => moment(a.date).diff(moment(b.date)))) {
            balance += t.type === 'income' ? t.amount : -t.amount;
            if (balance < 0) return false;
        }
        return recentTx.length > 0 && balance > 0;
    },

    // ===================================================================
    // SERIES: CYBERPUNK ETHOS
    // ===================================================================

    'card_data_stream': (tx, settings, allTx) => {
        // "Acesse por 3 dias consecutivos"
        return (settings.currentStreak || 0) >= 3;
    },

    'card_subnet': (tx, settings, allTx) => {
        // "Despesa entre 00:00-06:00"
        if (tx.status !== 'paid') return false;
        if (tx.date.length <= 10) return false;
        const hour = moment(tx.date).hour();
        return tx.type === 'expense' && hour >= 0 && hour < 6;
    },

    'card_ai_advisor': (tx, settings, allTx) => {
        // "Complete 3 Metas"
        const completedGoals = (settings.goals || []).filter(g =>
            g.goalType === 'Saving' && g.currentAmount >= g.targetAmount
        );
        return completedGoals.length >= 3;
    },

    'card_surveillance': (tx, settings, allTx) => {
        // "Veja Relatório 5 vezes"
        return (settings.reportViewCount || 0) >= 5;
    },

    'card_mainframe': (tx, settings, allTx) => {
        // "Nexus Score ≥ 10"
        return (settings.nexusScore || 0) >= 10;
    },

    // ===================================================================
    // SERIES: CRYPTO LEGENDS
    // ===================================================================

    'card_satoshi': (tx, settings, allTx) => {
        // "Transação exata de R$ 21,00"
        return tx.status === 'paid' && Math.abs(tx.amount - 21.00) < 0.01;
    },

    'card_diamond_hands': (tx, settings, allTx) => {
        // "Economize 20% da renda mensal"
        const firstAccess = moment(settings.firstAccessDate || '2024-01-01');
        if (moment().diff(firstAccess, 'days') < 30) return false;

        const currentMonth = moment().format('YYYY-MM');
        const monthTx = allTx.filter(t => t.status === 'paid' && moment(t.date).format('YYYY-MM') === currentMonth);

        const income = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const expense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        const saved = income - expense;

        return income > 500 && expense > 0 && (saved / income) >= 0.20;
    },

    'card_bull_run': (tx, settings, allTx) => {
        // "Aumente Renda Extra em 50% num mês"
        const paidTx = allTx.filter(t => t.status === 'paid');
        const currentMonth = moment().format('YYYY-MM');
        const lastMonth = moment().subtract(1, 'month').format('YYYY-MM');

        const currentExtra = paidTx
            .filter(t => t.type === 'income' && t.category === 'Renda Extra' && moment(t.date).format('YYYY-MM') === currentMonth)
            .reduce((s, t) => s + t.amount, 0);

        const lastExtra = paidTx
            .filter(t => t.type === 'income' && t.category === 'Renda Extra' && moment(t.date).format('YYYY-MM') === lastMonth)
            .reduce((s, t) => s + t.amount, 0);

        return lastExtra > 100 && (currentExtra / lastExtra) >= 1.5;
    },

    // ===================================================================
    // SERIES: LUXURY LIFESTYLE
    // ===================================================================

    'card_private_jet': (tx, settings, allTx) => {
        // "Despesa única > R$ 5.000"
        return tx.status === 'paid' && tx.type === 'expense' && tx.amount > 5000;
    },

    'card_yacht': (tx, settings, allTx) => {
        // "Reserva > R$ 10.000"
        return (settings.emergencyFund?.currentBalance || 0) > 10000;
    },

    'card_penthouse': (tx, settings, allTx) => {
        // "Pague todas as contas antes do vencimento"
        const currentMonth = moment().format('YYYY-MM');
        const monthExpenses = allTx.filter(t =>
            t.status === 'paid' &&
            t.type === 'expense' &&
            moment(t.date).format('YYYY-MM') === currentMonth
        );

        if (monthExpenses.length < 3) return false;

        // Todas devem estar pagas
        return monthExpenses.every(t => t.status === 'paid');
    },

    // ===================================================================
    // SERIES: ARTIFACTS
    // ===================================================================

    'card_golden_calc': (tx, settings, allTx) => {
        // "Saldo exato R$ 0,00 no fim do mês"
        const paidTx = allTx.filter(t => t.status === 'paid');
        const lastMonth = moment().subtract(1, 'month').format('YYYY-MM');
        const monthTx = paidTx.filter(t => moment(t.date).format('YYYY-MM') === lastMonth);

        const income = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const expense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

        return income > 0 && Math.abs(income - expense) < 0.01;
    },

    'card_abacus': (tx, settings, allTx) => {
        // "50 transações totais"
        return allTx.filter(t => t.status === 'paid').length >= 50;
    },

    'card_scroll': (tx, settings, allTx) => {
        // "Crie orçamento para todas as categorias"
        const categories = settings.categories || [];
        const budgets = settings.budgets || [];

        return categories.length > 0 && categories.every(cat =>
            budgets.some(b => b.categoryId === cat.id)
        );
    },

    'card_kings_coin': (tx, settings, allTx) => {
        // "Nível 20"
        const level = Math.floor((settings.nexusScore || 0) / 100);
        return level >= 20;
    },

    // ===================================================================
    // SERIES: MEDIEVAL FORTUNE
    // ===================================================================

    'card_chest': (tx, settings, allTx) => {
        // "Crie Fundo de Emergência"
        return !!(settings.emergencyFund && settings.emergencyFund.targetAmount > 0);
    },

    'card_shield': (tx, settings, allTx) => {
        // "Não gaste em Lazer por 1 semana"
        const firstAccess = moment(settings.firstAccessDate || '2024-01-01');
        if (moment().diff(firstAccess, 'days') < 7) return false;

        const last7Days = moment().subtract(7, 'days');
        const recentLeisure = allTx.filter(t =>
            t.status === 'paid' &&
            t.category === 'Lazer' &&
            t.type === 'expense' &&
            moment(t.date).isAfter(last7Days)
        );
        return recentLeisure.length === 0;
    },

    'card_crown': (tx, settings, allTx) => {
        // "Patrimônio ≥ R$ 100.000"
        const validTx = allTx.filter(t =>
            t.status === 'paid' &&
            moment(t.date).isSameOrBefore(moment(), 'day')
        );

        const totalIncome = validTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const totalExpense = validTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        const netWorth = totalIncome - totalExpense;

        if (validTx.length < 20) return false;
        const oldestTxDate = moment.min(validTx.map(t => moment(t.date)));
        if (moment().diff(oldestTxDate, 'days') < 60) return false;

        return netWorth >= 100000;
    },

    // ===================================================================
    // SERIES: SPACE ODYSSEY
    // ===================================================================

    'card_rocket': (tx, settings, allTx) => {
        // "Aumente renda em 20%"
        const paidTx = allTx.filter(t => t.status === 'paid');
        const currentMonth = moment().format('YYYY-MM');
        const lastMonth = moment().subtract(1, 'month').format('YYYY-MM');

        const currentIncome = paidTx
            .filter(t => t.type === 'income' && moment(t.date).format('YYYY-MM') === currentMonth)
            .reduce((s, t) => s + t.amount, 0);

        const lastIncome = paidTx
            .filter(t => t.type === 'income' && moment(t.date).format('YYYY-MM') === lastMonth)
            .reduce((s, t) => s + t.amount, 0);

        return lastIncome > 500 && (currentIncome / lastIncome) >= 1.2;
    },

    'card_alien_artifact': (tx, settings, allTx) => {
        // "100 transações"
        return allTx.filter(t => t.status === 'paid').length >= 100;
    },

    'card_black_hole': (tx, settings, allTx) => {
        // "Gaste mais que ganhou num mês"
        const paidTx = allTx.filter(t => t.status === 'paid');
        const currentMonth = moment().format('YYYY-MM');
        const monthTx = paidTx.filter(t => moment(t.date).format('YYYY-MM') === currentMonth);

        const income = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const expense = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

        return income > 0 && expense > income;
    },

    // ===================================================================
    // SERIES: RPG CLASS
    // ===================================================================

    'card_hero_sword': (tx, settings, allTx) => {
        // "Pague dívida total"
        const completedDebts = (settings.goals || []).filter(g =>
            g.goalType === 'Debt' && g.currentAmount >= g.targetAmount
        );
        return completedDebts.length > 0;
    },

    'card_wizard_staff': (tx, settings, allTx) => {
        // "Renda Extra 3 meses seguidos"
        const paidTx = allTx.filter(t => t.status === 'paid');
        const last3Months = [0, 1, 2].map(i => moment().subtract(i, 'months').format('YYYY-MM'));

        const oldestTxDate = moment.min(paidTx.map(t => moment(t.date)));
        if (moment().diff(oldestTxDate, 'months') < 2) return false;

        return last3Months.every(month => {
            const extraIncome = paidTx.filter(t =>
                t.type === 'income' &&
                t.category === 'Renda Extra' &&
                moment(t.date).format('YYYY-MM') === month
            );
            return extraIncome.length > 0;
        });
    },

    'card_rogue_dagger': (tx, settings, allTx) => {
        // "Gaste exatamente R$ 1,00"
        return tx.status === 'paid' && tx.type === 'expense' && Math.abs(tx.amount - 1.00) < 0.01;
    },

    // ===================================================================
    // SERIES: ELEMENTAL STONES
    // ===================================================================

    'card_ruby': (tx, settings, allTx) => {
        // "Gaste muito em Lazer" (> R$ 1000 no mês)
        const paidTx = allTx.filter(t => t.status === 'paid');
        const currentMonth = moment().format('YYYY-MM');
        const leisureExpenses = paidTx.filter(t =>
            t.category === 'Lazer' &&
            t.type === 'expense' &&
            moment(t.date).format('YYYY-MM') === currentMonth
        );
        const total = leisureExpenses.reduce((s, t) => s + t.amount, 0);
        return total > 1000;
    },

    'card_sapphire': (tx, settings, allTx) => {
        // "Economize em Contas" (< 50% da renda em contas fixas)
        const paidTx = allTx.filter(t => t.status === 'paid');
        const currentMonth = moment().format('YYYY-MM');
        const monthTx = paidTx.filter(t => moment(t.date).format('YYYY-MM') === currentMonth);

        const income = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const bills = monthTx.filter(t => t.category === 'Moradia' && t.type === 'expense').reduce((s, t) => s + t.amount, 0);

        return income > 100 && bills > 0 && (bills / income) < 0.5;
    },

    'card_emerald': (tx, settings, allTx) => {
        // "Saldo positivo"
        const paidTx = allTx.filter(t => t.status === 'paid');
        if (paidTx.length < 10) return false;

        const oldestTxDate = moment.min(paidTx.map(t => moment(t.date)));
        if (moment().diff(oldestTxDate, 'days') < 30) return false;

        const totalIncome = paidTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const totalExpense = paidTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        return totalIncome > totalExpense;
    },

    'card_diamond': (tx, settings, allTx) => {
        // "Zere fatura alta" (> R$ 2000)
        const paidTx = allTx.filter(t => t.status === 'paid');
        const cards = settings.creditCards || [];
        for (const card of cards) {
            const cardTx = paidTx.filter(t => t.cardId === card.id);
            const monthlyBills = new Map<string, number>();

            cardTx.forEach(t => {
                const month = t.paymentMonth || moment(t.date).format('YYYY-MM');
                monthlyBills.set(month, (monthlyBills.get(month) || 0) + t.amount);
            });

            for (const [month, total] of monthlyBills) {
                if (total > 2000) return true;
            }
        }
        return false;
    },

    // ===================================================================
    // SERIES: RETRO TECH
    // ===================================================================

    'card_floppy': (tx, settings, allTx) => {
        // "Salve 10 transações"
        return allTx.filter(t => t.status === 'paid').length >= 10;
    },

    'card_crt': (tx, settings, allTx) => {
        // "Use plugin em tela cheia"
        return (settings.fullScreenUsageCount || 0) >= 1;
    },

    'card_cartridge': (tx, settings, allTx) => {
        // "Descubra um bug" - Easter egg manual
        return false;
    },

    // ===================================================================
    // SERIES: ZODIAC
    // ===================================================================

    'card_aries': (tx, settings, allTx) => {
        // "Gaste sem pensar" (3 despesas no mesmo dia)
        // EXCEÇÃO: Não disparar em verificações de sistema (apenas ao criar uma transação real)
        if (tx.id === 'system_check' || tx.id === 'init' || tx.id === 'check-all-dummy') return false;

        const paidTx = allTx.filter(t => t.status === 'paid');
        const today = moment(tx.date).format('YYYY-MM-DD');
        const todayExpenses = paidTx.filter(t =>
            t.type === 'expense' &&
            moment(t.date).format('YYYY-MM-DD') === today
        );
        return todayExpenses.length >= 3;
    },

    'card_taurus': (tx, settings, allTx) => {
        // "Invista R$ 500"
        const paidTx = allTx.filter(t => t.status === 'paid');
        const investments = paidTx.filter(t => t.category === 'Investimentos');
        const total = investments.reduce((s, t) => s + t.amount, 0);
        return total >= 500;
    },

    'card_leo': (tx, settings, allTx) => {
        // "Gaste com Beleza"
        const paidTx = allTx.filter(t => t.status === 'paid');
        return paidTx.some(t =>
            t.category === 'Beleza' ||
            t.description.toLowerCase().includes('beleza') ||
            t.description.toLowerCase().includes('salão') ||
            t.description.toLowerCase().includes('cabelo')
        );
    },
};

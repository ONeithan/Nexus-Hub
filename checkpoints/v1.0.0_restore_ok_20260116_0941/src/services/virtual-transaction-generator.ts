import { NexusHubSettings, Transaction, Goal } from '../views/settings';
import moment from 'moment';

/**
 * Gera transações virtuais para oportunidades de economia (metas e fundo de emergência)
 * que devem aparecer na lista de pagamentos pendentes.
 */
export function generateSavingOpportunities(settings: NexusHubSettings, month: moment.Moment): Transaction[] {
    const virtualTransactions: Transaction[] = [];
    const monthKey = month.format('YYYY-MM');

    // 1. Gerar para Metas de Economia
    if (settings.goals) {
        for (const goal of settings.goals) {
            // Allow Saving AND Debt if showInPending is true
            if (goal.showInPending && (goal.goalType === 'Saving' || goal.goalType === 'Debt') && (goal.monthlyInstallment || 0) > 0 && !goal.completed) {

                // Start Date Check
                if (goal.startDate) {
                    const start = moment(goal.startDate);
                    if (month.isBefore(start, 'month')) {
                        continue;
                    }
                }

                // Evita adicionar se o mês foi pulado
                if (goal.skippedMonths?.includes(monthKey)) {
                    continue;
                }

                // Evita adicionar se a meta já foi totalmente contribuída este mês
                // FIX: Check referenceMonth if available (new data), otherwise fallback to date (old data)
                const alreadyContributed = (goal.history || []).filter(h => {
                    if (h.referenceMonth) return h.referenceMonth === monthKey;
                    return moment(h.date).format('YYYY-MM') === monthKey;
                }).reduce((sum, h) => sum + h.amount, 0);

                if (alreadyContributed >= (goal.monthlyInstallment || 0)) {
                    continue;
                }

                // FIX: For Debts (and Goals), check if a REAL transaction exists for this month preventing duplication
                // This handles the "Backfilled" transactions which are real, ensuring we don't generate a duplicate "Pending" virtual one.
                const realTransactionExists = settings.transactions.some(t => {
                    // FIX: strict check. If paymentMonth is present, use it. Ignore date. 
                    // This prevents "Dec 15th (Paid in Nov)" from blocking "Jan 15th (Pending in Dec)" just because they share a Dec/Jan boundary overlap or date.
                    const isForThisMonth = t.paymentMonth ? t.paymentMonth === monthKey : moment(t.date).format('YYYY-MM') === monthKey;
                    const matchesGoal = t.installmentOf === goal.id || t.description.includes(goal.name); // Robust match
                    return isForThisMonth && matchesGoal;
                });

                if (realTransactionExists) {
                    continue;
                }

                // Calculate Installment Number for Debts
                let currentInstallment = undefined;
                let totalInstallments = goal.totalInstallments;
                let description = goal.goalType === 'Debt' ? `Pagamento de Dívida: ${goal.name}` : `Economia para a meta: ${goal.name}`;
                // Usage: "Pay Ahead" -> Default to 1st of NEXT month if no specific start date logic applies
                let virtualDate = month.clone().add(1, 'month').date(1);

                if ((goal.goalType === 'Debt' || goal.goalType === 'Saving') && goal.startDate) {
                    const start = moment(goal.startDate);
                    // User Request: "é pra mostrar sempre o que vence no outro mes" (Pay Ahead Logic)
                    // Logic: In December View, show the item due in January.
                    const targetMonthKey = month.clone().add(1, 'months').format('YYYY-MM');

                    // Find which installment/occurrence falls in the NEXT month
                    let estimatedI = month.diff(start, 'months') + 1; // +1 shift
                    let foundI = -1;

                    // Iterate to find exact match
                    // If indefinite (no totalInstallments), check strictly around estimatedI
                    const maxCheck = totalInstallments ? totalInstallments : (estimatedI + 12);

                    for (let i = Math.max(1, estimatedI - 1); i <= maxCheck; i++) {
                        const due = start.clone().add(i, 'months');
                        if (due.format('YYYY-MM') === targetMonthKey) {
                            foundI = i;
                            virtualDate = due;
                            break;
                        }
                    }

                    if (foundI !== -1) {
                        currentInstallment = foundI;
                        if (totalInstallments && currentInstallment > totalInstallments) continue;

                        // Formatter: (1/10) only if total is known.
                        // For Savings without fixed end, maybe just (X) or nothing? 
                        // User likes "Debt Logic", so let's show count if valid.
                        if (totalInstallments) {
                            description += ` (${currentInstallment}/${totalInstallments})`;
                        } else if (goal.goalType === 'Saving') {
                            // Optional: Show count for open-ended savings? 
                            // description += ` (${currentInstallment})`; 
                        }
                    } else {
                        // No exact installment match found (maybe calculation drift or future).
                        // Fallback: If it's a Saving Goal with infinite duration, just show it.
                        // If it's a Debt with fixed installments, strictly respect the limit.
                        if (goal.goalType === 'Debt' && totalInstallments && estimatedI > totalInstallments) {
                            continue;
                        }
                        // For Savings, or Debts within range but slightly drifted, show the default virtualDate (N+1).
                    }
                }

                const virtualTx: Transaction = {
                    id: `vgoal_${goal.id}`,
                    description: description,
                    amount: goal.monthlyInstallment || 0,
                    // Fix: Date is Due Date (e.g. 15/01/2026), label "Vence em 15/01/2026"
                    date: virtualDate.format('YYYY-MM-DD'),
                    category: 'Metas',
                    type: 'expense',
                    status: 'pending',
                    isRecurring: false,
                    isInstallment: goal.goalType === 'Debt',
                    currentInstallment: currentInstallment,
                    totalInstallments: totalInstallments,
                    installmentOf: goal.id,
                    isVirtual: true,
                    virtualType: 'goal',
                    virtualId: goal.id,
                    // Fix: Payment Month is Previous Month (e.g. 12/2025).
                    // So in Dec Ledger, I see Jan Bill.
                    paymentMonth: virtualDate.clone().subtract(1, 'month').format('YYYY-MM'),
                };

                virtualTransactions.push(virtualTx);
            }
        }
    }

    // 2. Gerar para Fundo de Emergência
    const fund = settings.emergencyFund;
    if (fund && fund.showInPending && (fund.monthlyContribution || 0) > 0 && fund.currentBalance < fund.targetAmount) {

        // Evita adicionar se o mês foi pulado
        if (fund.skippedMonths?.includes(monthKey)) {
            return virtualTransactions; // Retorna o que tem até agora, não adiciona o fundo
        }

        // Evita adicionar se o fundo já foi totalmente contribuído este mês
        const alreadyContributed = (fund.history || []).filter(h => {
            if (h.type !== 'deposit') return false;
            if (h.referenceMonth) return h.referenceMonth === monthKey;
            return moment(h.date).format('YYYY-MM') === monthKey;
        }).reduce((sum, h) => sum + h.amount, 0);

        if (alreadyContributed < (fund.monthlyContribution || 0)) {
            const virtualTx: Transaction = {
                id: `vfund_emergency`,
                description: 'Contribuição para Fundo de Emergência',
                amount: fund.monthlyContribution || 0,
                date: month.clone().date(1).format('YYYY-MM-DD'),
                category: 'Investimentos',
                type: 'expense',
                status: 'pending',
                isRecurring: false,
                isInstallment: false,
                isVirtual: true,
                virtualType: 'fund',
                virtualId: 'emergency_fund',
                paymentMonth: monthKey, // Ensure consistent filtering
            };
            virtualTransactions.push(virtualTx);
        }
    }

    return virtualTransactions;
}



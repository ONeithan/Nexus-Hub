import { moment } from 'obsidian';
import { NexusHubSettings } from './settings';
import { t } from './lang';
import { formatAsCurrency } from './helpers';

export interface SankeyDataPoint {
    from: string;
    to: string;
    flow: number;
}

export class ReportGenerator {
    private settings: NexusHubSettings;

    constructor(settings: NexusHubSettings) {
        this.settings = settings;
    }

    public getSpendingByCategory(startDate: moment.Moment, endDate: moment.Moment): { labels: string[], data: number[] } {
        const spendingMap = new Map<string, number>();

        const relevantTransactions = this.settings.transactions.filter(transaction => 
            transaction.type === 'expense' && 
            transaction.status === 'paid' && 
            moment(transaction.date).isBetween(startDate, endDate, undefined, '[]')
        );

        relevantTransactions.forEach(transaction => {
            const currentAmount = spendingMap.get(transaction.category) || 0;
            spendingMap.set(transaction.category, currentAmount + transaction.amount);
        });

        return {
            labels: Array.from(spendingMap.keys()),
            data: Array.from(spendingMap.values()),
        };
    }

    public getSpendingByDescriptionForCategory(category: string, startDate: moment.Moment, endDate: moment.Moment): { labels: string[], data: number[] } {
        const spendingMap = new Map<string, number>();

        const relevantTransactions = this.settings.transactions.filter(transaction => 
            transaction.type === 'expense' && 
            transaction.status === 'paid' && 
            transaction.category === category &&
            moment(transaction.date).isBetween(startDate, endDate, undefined, '[]')
        );

        relevantTransactions.forEach(transaction => {
            // For installments, use a base description to group them
            const description = transaction.isInstallment 
                ? transaction.description.substring(0, transaction.description.lastIndexOf(' (')).trim()
                : transaction.description;
            const currentAmount = spendingMap.get(description) || 0;
            spendingMap.set(description, currentAmount + transaction.amount);
        });

        return {
            labels: Array.from(spendingMap.keys()),
            data: Array.from(spendingMap.values()),
        };
    }

    public getCommittedSpendingByCategory(startDate: moment.Moment, endDate: moment.Moment): { labels: string[], data: number[] } {
        const spendingMap = new Map<string, number>();

        const relevantTransactions = this.settings.transactions.filter(transaction => 
            transaction.type === 'expense' && // All expenses
            moment(transaction.date).isBetween(startDate, endDate, undefined, '[]')
        );

        relevantTransactions.forEach(transaction => {
            const currentAmount = spendingMap.get(transaction.category) || 0;
            spendingMap.set(transaction.category, currentAmount + transaction.amount);
        });

        return {
            labels: Array.from(spendingMap.keys()),
            data: Array.from(spendingMap.values()),
        };
    }

    public getSankeyData(startDate: moment.Moment, endDate: moment.Moment): SankeyDataPoint[] {
        const relevantTransactions = this.settings.transactions.filter(transaction => 
            transaction.status === 'paid' && 
            moment(transaction.date).isBetween(startDate, endDate, undefined, '[]')
        );

        const totalIncome = relevantTransactions
            .filter(transaction => transaction.type === 'income')
            .reduce((sum, transaction) => sum + transaction.amount, 0);

        if (totalIncome === 0) {
            return []; // No data to show if there's no income
        }

        const spendingByCategory = new Map<string, number>();
        relevantTransactions
            .filter(transaction => transaction.type === 'expense')
            .forEach(transaction => {
                const currentAmount = spendingByCategory.get(transaction.category) || 0;
                spendingByCategory.set(transaction.category, currentAmount + transaction.amount);
            });

        const sankeyData = Array.from(spendingByCategory.entries()).map(([category, amount]) => ({
            from: t('REPORT_VIEW_SANKEY_TOTAL_INCOME'),
            to: category,
            flow: amount
        }));

        const totalExpenses = sankeyData.reduce((sum, item) => sum + item.flow, 0);
        const unspent = totalIncome - totalExpenses;
        if (unspent > 0.01) { // Use a small threshold for floating point issues
            sankeyData.push({ from: t('REPORT_VIEW_SANKEY_TOTAL_INCOME'), to: t('REPORT_VIEW_SANKEY_SAVED'), flow: unspent });
        }

        return sankeyData;
    }

    public getMonthlyFlow(startDate: moment.Moment, endDate: moment.Moment): { labels: string[], datasets: { label: string, data: number[], backgroundColor: string }[] } {
        const labels: string[] = [];
        const incomeData: number[] = [];
        const expenseData: number[] = [];

        let currentMonth = startDate.clone().startOf('month');
        while (currentMonth.isSameOrBefore(endDate, 'month')) {
            const monthLabel = currentMonth.format('MMM/YY');
            labels.push(monthLabel);

            const transactionsForMonth = this.settings.transactions.filter(transaction => 
                moment(transaction.date).isSame(currentMonth, 'month') &&
                transaction.status === 'paid'
            );

            let totalIncome = 0;
            let totalExpenses = 0;

            transactionsForMonth.forEach(tx => {
                if (tx.type === 'income') {
                    totalIncome += tx.amount;
                } else {
                    totalExpenses += tx.amount;
                }
            });

            incomeData.push(totalIncome);
            expenseData.push(totalExpenses);

            currentMonth.add(1, 'month');
        }

        return {
            labels,
            datasets: [
                { label: t('REPORT_VIEW_EXPORT_HEADER_INCOME'), data: incomeData, backgroundColor: 'rgba(75, 192, 192, 0.5)' },
                { label: t('REPORT_VIEW_EXPORT_HEADER_EXPENSE'), data: expenseData, backgroundColor: 'rgba(255, 99, 132, 0.5)' }
            ]
        };
    }

    public getDashboardKPIs(startDate: moment.Moment, endDate: moment.Moment): {
        topSpendingCategory: { name: string, amount: number };
        savingsRate: number;
        avgDailySpending: number;
        balance: number;
    } {
        const relevantTransactions = this.settings.transactions.filter(transaction => 
            transaction.status === 'paid' && 
            moment(transaction.date).isBetween(startDate, endDate, undefined, '[]')
        );

        const totalIncome = relevantTransactions
            .filter(transaction => transaction.type === 'income')
            .reduce((sum, transaction) => sum + transaction.amount, 0);

        const totalExpenses = relevantTransactions
            .filter(transaction => transaction.type === 'expense')
            .reduce((sum, transaction) => sum + transaction.amount, 0);

        const spendingByCategory = this.getSpendingByCategory(startDate, endDate);
        let topCategory = { name: t('REPORT_GENERATOR_NO_DATA'), amount: 0 };
        if (spendingByCategory.data.length > 0) {
            const maxAmount = Math.max(...spendingByCategory.data);
            const maxIndex = spendingByCategory.data.indexOf(maxAmount);
            topCategory = { name: spendingByCategory.labels[maxIndex], amount: maxAmount };
        }

        const savingsRate = totalIncome > 0 ? (totalIncome - totalExpenses) / totalIncome : 0;
        const numberOfDays = endDate.diff(startDate, 'days') + 1;
        const avgDailySpending = numberOfDays > 0 ? totalExpenses / numberOfDays : 0;

        return {
            topSpendingCategory: topCategory,
            savingsRate: savingsRate,
            avgDailySpending: avgDailySpending,
            balance: totalIncome - totalExpenses
        };
    }

    /**
     * Prepara os dados históricos da reserva de emergência para um gráfico de linha.
     */
    getEmergencyFundHistory(startDate: moment.Moment, endDate: moment.Moment): { labels: string[], data: number[] } {
        const history = this.settings.emergencyFund.history
            .filter(item => {
                const itemDate = moment(item.date);
                return itemDate.isBetween(startDate, endDate, undefined, '[]');
            })
            .sort((a, b) => moment(a.date).diff(moment(b.date))); // Garante a ordem cronológica

        if (history.length === 0) {
            return { labels: [], data: [] };
        }

        const labels = history.map(item => moment(item.date).format('DD/MM/YY'));
        const data = history.map(item => item.balanceAfter);

        return { labels, data };
    }

    /**
     * Prepara os dados históricos do patrimônio líquido (Reserva de Emergência + Metas de Economia) para um gráfico de linha.
     */
    getNetWorthHistory(startDate: moment.Moment, endDate: moment.Moment): { labels: string[], data: number[] } {
        const allEvents: { date: moment.Moment, change: number }[] = [];

        // Adiciona eventos da reserva de emergência
        this.settings.emergencyFund.history.forEach(h => {
            const amount = h.type === 'deposit' ? h.amount : -h.amount;
            allEvents.push({ date: moment(h.date), change: amount });
        });

        // Adiciona eventos de contribuição de metas de economia
        this.settings.goals.forEach(goal => {
            if (goal.goalType === 'Saving' && goal.history) {
                goal.history.forEach(h => {
                    allEvents.push({ date: moment(h.date), change: h.amount });
                });
            }
        });

        // Ordena todos os eventos cronologicamente
        allEvents.sort((a, b) => a.date.diff(b.date));

        // Calcula o saldo inicial no começo do período do filtro
        let runningBalance = 0;
        allEvents.forEach(e => {
            if (e.date.isBefore(startDate)) {
                runningBalance += e.change;
            }
        });

        const consolidated: { [key: string]: number } = {};
        // Adiciona o saldo inicial como o primeiro ponto do gráfico
        consolidated[startDate.clone().subtract(1, 'day').format('DD/MM/YY')] = runningBalance;

        // Processa os eventos dentro do período do filtro
        const filteredEvents = allEvents.filter(e => e.date.isBetween(startDate, endDate, undefined, '[]'));
        filteredEvents.forEach(event => {
            runningBalance += event.change;
            consolidated[event.date.format('DD/MM/YY')] = runningBalance; // Sobrescreve, mantendo o último saldo do dia
        });

        const sortedLabels = Object.keys(consolidated).sort((a, b) => moment(a, 'DD/MM/YY').diff(moment(b, 'DD/MM/YY')));
        const sortedData = sortedLabels.map(label => consolidated[label]);

        return { labels: sortedLabels, data: sortedData };
    }

    public getReportSummary(startDate: moment.Moment, endDate: moment.Moment): string[] {
        const kpis = this.getDashboardKPIs(startDate, endDate);
        const insights: string[] = [];

        // Insight 1: Overall Balance
        if (kpis.balance > 0) {
            insights.push(t('REPORT_GENERATOR_INSIGHT_BALANCE_POS', { balance: formatAsCurrency(kpis.balance) }));
        } else {
            insights.push(t('REPORT_GENERATOR_INSIGHT_BALANCE_NEG', { balance: formatAsCurrency(Math.abs(kpis.balance)) }));
        }

        // Insight 2: Savings Rate
        if (kpis.savingsRate >= 0.2) {
            insights.push(t('REPORT_GENERATOR_INSIGHT_SAVINGS_EXCELLENT', { rate: (kpis.savingsRate * 100).toFixed(0) }));
        } else if (kpis.savingsRate > 0) {
            insights.push(t('REPORT_GENERATOR_INSIGHT_SAVINGS_GOOD', { rate: (kpis.savingsRate * 100).toFixed(0) }));
        } else {
            insights.push(t('REPORT_GENERATOR_INSIGHT_SAVINGS_NEG'));
        }

        // Insight 3: Top Spending
        if (kpis.topSpendingCategory.name !== t('REPORT_GENERATOR_NO_DATA')) {
            insights.push(t('REPORT_GENERATOR_INSIGHT_TOP_SPEND', { category: kpis.topSpendingCategory.name, amount: formatAsCurrency(kpis.topSpendingCategory.amount) }));
        }

        return insights;
    }

    public getDailyProjection(days: number): { labels: string[], data: number[], firstNegativeDate: string | null } {
        const today = moment().startOf('day');
        const endDate = today.clone().add(days, 'days');

        // 1. Get current balance (from paid transactions before today)
        const currentBalance = this.settings.transactions
            .filter(tx => tx.status === 'paid' && moment(tx.date).isBefore(today, 'day'))
            .reduce((bal, tx) => tx.type === 'income' ? bal + tx.amount : bal - tx.amount, 0);

        // 2. Get all pending transactions in the projection window
        const upcomingTransactions = this.settings.transactions
            .filter(transaction => 
                transaction.status === 'pending' && 
                moment(transaction.date).isBetween(today, endDate, 'day', '[]') &&
                (!transaction.pausedUntil || moment(transaction.pausedUntil).isBefore(moment(transaction.date), 'day'))
            )
            .sort((a, b) => moment(a.date).diff(moment(b.date)));

        // 3. Create data points for days with transactions
        const dataPoints: { [date: string]: number } = {};
        let runningBalance = currentBalance;

        upcomingTransactions.forEach(transaction => {
            const dateKey = moment(transaction.date).format('YYYY-MM-DD');
            const change = transaction.type === 'income' ? transaction.amount : -transaction.amount;
            runningBalance += change;
            dataPoints[dateKey] = runningBalance; // Overwrites if multiple on same day, which is correct
        });

        // 4. Fill in the gaps for days without transactions
        const finalLabels: string[] = [];
        const finalData: number[] = [];
        let lastKnownBalance = currentBalance;
        let firstNegativeDate: string | null = null;

        for (let i = 0; i <= days; i++) {
            const loopDate = today.clone().add(i, 'days');
            const dateKey = loopDate.format('YYYY-MM-DD');
            finalLabels.push(loopDate.format('DD/MM'));

            if (dataPoints[dateKey] !== undefined) {
                lastKnownBalance = dataPoints[dateKey];
            }
            finalData.push(lastKnownBalance);

            // Check for first negative balance
            if (lastKnownBalance < 0 && firstNegativeDate === null) {
                firstNegativeDate = loopDate.format('DD/MM');
            }
        }

        return { labels: finalLabels, data: finalData, firstNegativeDate };
    }

    public getAnnualSummary(year: number) {
        const yearStart = moment({ year }).startOf('year');
        const yearEnd = moment({ year }).endOf('year');

        const paidTransactions = this.settings.transactions.filter(transaction => 
            transaction.status === 'paid' && 
            moment(transaction.date).isBetween(yearStart, yearEnd, undefined, '[]')
        );

        const totalIncome = paidTransactions
            .filter(transaction => transaction.type === 'income')
            .reduce((sum, transaction) => sum + transaction.amount, 0);

        const totalExpenses = paidTransactions
            .filter(transaction => transaction.type === 'expense')
            .reduce((sum, transaction) => sum + transaction.amount, 0);

        const balance = totalIncome - totalExpenses;

        const spendingByCategory = new Map<string, number>();
        paidTransactions
            .filter(transaction => transaction.type === 'expense')
            .forEach(transaction => {
                const currentAmount = spendingByCategory.get(transaction.category) || 0;
                spendingByCategory.set(transaction.category, currentAmount + transaction.amount);
            });

        return {
            totalIncome,
            totalExpenses,
            balance,
            avgMonthlySavings: balance / 12,
            spendingLabels: Array.from(spendingByCategory.keys()),
            spendingData: Array.from(spendingByCategory.values()),
        };
    }
}
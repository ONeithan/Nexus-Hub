import { moment } from 'obsidian';
import { NexusHubSettings, Transaction, Goal } from '../views/settings';
import { formatAsCurrency } from '../helpers/helpers';

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

        // Initialize map with all existing categories to ensure they appear in the report
        (this.settings.categories || []).forEach(category => {
            spendingMap.set(category.name, 0);
        });

        const relevantTransactions = this.settings.transactions.filter((transaction: Transaction) =>
            transaction.type === 'expense' &&
            // transaction.status === 'paid' && // Removed to show all planned expenses
            moment(transaction.paymentMonth || transaction.date).isBetween(startDate, endDate, undefined, '[]')
        );

        relevantTransactions.forEach((transaction: Transaction) => {
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

        const relevantTransactions = this.settings.transactions.filter((transaction: Transaction) =>
            transaction.type === 'expense' &&
            // transaction.status === 'paid' && // Removed to show all planned expenses in detail view
            transaction.category === category &&
            moment(transaction.paymentMonth || transaction.date).isBetween(startDate, endDate, undefined, '[]')
        );

        relevantTransactions.forEach((transaction: Transaction) => {
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

        const relevantTransactions = this.settings.transactions.filter((transaction: Transaction) =>
            transaction.type === 'expense' && // All expenses
            moment(transaction.paymentMonth || transaction.date).isBetween(startDate, endDate, undefined, '[]')
        );

        relevantTransactions.forEach((transaction: Transaction) => {
            const currentAmount = spendingMap.get(transaction.category) || 0;
            spendingMap.set(transaction.category, currentAmount + transaction.amount);
        });

        return {
            labels: Array.from(spendingMap.keys()),
            data: Array.from(spendingMap.values()),
        };
    }

    public getSankeyData(startDate: moment.Moment, endDate: moment.Moment): SankeyDataPoint[] {
        const relevantTransactions = this.settings.transactions.filter((transaction: Transaction) =>
            // Include both Paid and Pending to show full projected flow
            moment(transaction.paymentMonth || transaction.date).isBetween(startDate, endDate, undefined, '[]')
        );

        const totalIncome = relevantTransactions
            .filter((transaction: Transaction) => transaction.type === 'income')
            .reduce((sum, transaction: Transaction) => sum + transaction.amount, 0);

        if (totalIncome === 0) {
            return []; // No data to show if there's no income
        }

        const spendingByCategory = new Map<string, number>();
        relevantTransactions
            .filter((transaction: Transaction) => transaction.type === 'expense')
            .forEach((transaction: Transaction) => {
                const currentAmount = spendingByCategory.get(transaction.category) || 0;
                spendingByCategory.set(transaction.category, currentAmount + transaction.amount);
            });

        const sankeyData = Array.from(spendingByCategory.entries()).map(([category, amount]) => ({
            from: 'Renda Total',
            to: category,
            flow: amount
        }));

        const totalExpenses = sankeyData.reduce((sum, item: SankeyDataPoint) => sum + item.flow, 0);
        const unspent = totalIncome - totalExpenses;
        if (unspent > 0.01) { // Use a small threshold for floating point issues
            sankeyData.push({ from: 'Renda Total', to: 'Economizado', flow: unspent });
        }

        return sankeyData;
    }

    public getMonthlyFlow(startDate: moment.Moment, endDate: moment.Moment): { labels: string[], datasets: any[] } {
        const labels: string[] = [];
        const incomeCategories = new Set<string>();
        const monthlyData: { [month: string]: { income: { [category: string]: number }, expense: number } } = {};

        const currentMonth = startDate.clone().startOf('month');
        while (currentMonth.isSameOrBefore(endDate, 'month')) {
            const monthLabel = currentMonth.format('MMM/YY');
            labels.push(monthLabel);
            monthlyData[monthLabel] = { income: {}, expense: 0 };

            const transactionsForMonth = this.settings.transactions.filter((transaction: Transaction) =>
                moment(transaction.paymentMonth || transaction.date).isSame(currentMonth, 'month')
            );

            transactionsForMonth.forEach((tx: Transaction) => {
                if (tx.type === 'income') {
                    // Normalize category if needed
                    const cat = tx.category || 'Outros';
                    incomeCategories.add(cat);
                    monthlyData[monthLabel].income[cat] = (monthlyData[monthLabel].income[cat] || 0) + tx.amount;
                } else {
                    monthlyData[monthLabel].expense += tx.amount;
                }
            });

            currentMonth.add(1, 'month');
        }

        const datasets: any[] = [];
        const colors = [
            'rgba(75, 192, 192, 0.6)',
            'rgba(54, 162, 235, 0.6)',
            'rgba(153, 102, 255, 0.6)',
            'rgba(255, 206, 86, 0.6)'
        ];
        let colorIdx = 0;

        // Create a dataset for each Income Category
        incomeCategories.forEach(cat => {
            const data = labels.map(label => monthlyData[label].income[cat] || 0);
            datasets.push({
                label: cat,
                data: data,
                backgroundColor: colors[colorIdx % colors.length],
                stack: 'Income'
            });
            colorIdx++;
        });

        // Create Expense Dataset
        datasets.push({
            label: 'Despesa',
            data: labels.map(label => monthlyData[label].expense),
            backgroundColor: 'rgba(255, 99, 132, 0.6)',
            stack: 'Expense'
        });

        return { labels, datasets };
    }

    public getDashboardKPIs(startDate: moment.Moment, endDate: moment.Moment): {
        totalIncome: number;
        totalExpenses: number;
        topSpendingCategory: { name: string, amount: number };
        savingsRate: number;
        avgDailySpending: number;
        balance: number;
    } {
        const relevantTransactions = this.settings.transactions.filter((transaction: Transaction) =>
            // Include both Paid and Pending for full Month view
            moment(transaction.paymentMonth || transaction.date).isBetween(startDate, endDate, undefined, '[]')
        );

        const totalIncome = relevantTransactions
            .filter((transaction: Transaction) => transaction.type === 'income')
            .reduce((sum, transaction: Transaction) => sum + transaction.amount, 0);

        const totalExpenses = relevantTransactions
            .filter((transaction: Transaction) => transaction.type === 'expense')
            .reduce((sum, transaction: Transaction) => sum + transaction.amount, 0);

        const spendingByCategory = this.getSpendingByCategory(startDate, endDate);
        let topCategory = { name: 'N/A', amount: 0 };
        if (spendingByCategory.data.length > 0) {
            const maxAmount = Math.max(...spendingByCategory.data);
            const maxIndex = spendingByCategory.data.indexOf(maxAmount);
            topCategory = { name: spendingByCategory.labels[maxIndex], amount: maxAmount };
        }

        const savingsRate = totalIncome > 0 ? (totalIncome - totalExpenses) / totalIncome : 0;
        const numberOfDays = endDate.diff(startDate, 'days') + 1;
        const avgDailySpending = numberOfDays > 0 ? totalExpenses / numberOfDays : 0;

        return {
            totalIncome: totalIncome,
            totalExpenses: totalExpenses,
            topSpendingCategory: topCategory,
            savingsRate: savingsRate,
            avgDailySpending: avgDailySpending,
            balance: totalIncome - totalExpenses
        };
    }

    /**
     * Prepara os dados históricos da reserva de emergência para um gráfico de linha.
     */
    public hasSufficientHistory(months: number = 6): boolean {
        // Check Emergency Fund History
        const efHistory = this.settings.emergencyFund.history;
        let firstDate = moment();
        let lastDate = moment(0); // Epoch

        if (efHistory.length > 0) {
            efHistory.forEach((h: { date: string }) => {
                const d = moment(h.date);
                if (d.isBefore(firstDate)) firstDate = d;
                if (d.isAfter(lastDate)) lastDate = d;
            });
        }

        // Check Goals History
        this.settings.goals.forEach((goal: Goal) => {
            if (goal.goalType === 'Saving' && goal.history) {
                goal.history.forEach((h: { date: string }) => {
                    const d = moment(h.date);
                    if (d.isBefore(firstDate)) firstDate = d;
                    if (d.isAfter(lastDate)) lastDate = d;
                });
            }
        });

        // If no data at all
        if (lastDate.isSame(moment(0))) return false;

        const durationMonths = lastDate.diff(firstDate, 'months', true);
        return durationMonths >= months;
    }

    getEmergencyFundHistory(startDate: moment.Moment, endDate: moment.Moment): { labels: string[], data: number[] } {
        const history = this.settings.emergencyFund.history
            .filter((item: { date: string }) => {
                const itemDate = moment(item.date);
                return itemDate.isBetween(startDate, endDate, undefined, '[]');
            })
            .sort((a: { date: string }, b: { date: string }) => moment(a.date).diff(moment(b.date))); // Garante a ordem cronológica

        if (history.length === 0) {
            return { labels: [], data: [] };
        }

        const labels = history.map((item: { date: string }) => moment(item.date).format('DD/MM/YY'));
        const data = history.map((item: { balanceAfter: number }) => item.balanceAfter);

        return { labels, data };
    }

    /**
     * Prepara os dados históricos do patrimônio líquido (Reserva de Emergência + Metas de Economia) para um gráfico de linha.
     */
    getNetWorthHistory(startDate: moment.Moment, endDate: moment.Moment): { labels: string[], data: number[] } {
        const allEvents: { date: moment.Moment, change: number }[] = [];

        // Adiciona eventos da reserva de emergência
        this.settings.emergencyFund.history.forEach((h: { type: string, amount: number, date: string }) => {
            const amount = h.type === 'deposit' ? h.amount : -h.amount;
            allEvents.push({ date: moment(h.date), change: amount });
        });

        // Adiciona eventos de contribuição de metas de economia
        this.settings.goals.forEach((goal: Goal) => {
            if (goal.goalType === 'Saving' && goal.history) {
                goal.history.forEach((h: { date: string, amount: number }) => {
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

    public getReportSummary(startDate: moment.Moment, endDate: moment.Moment): { type: 'success' | 'warning' | 'info', text: string, title: string }[] {
        const kpis = this.getDashboardKPIs(startDate, endDate);
        const insights: { type: 'success' | 'warning' | 'info', text: string, title: string }[] = [];

        // Insight 1: Overall Balance
        if (kpis.balance > 0) {
            insights.push({
                type: 'success',
                title: 'Saldo Positivo',
                text: `Seu saldo final foi positivo em ${formatAsCurrency(kpis.balance)}. Ótimo trabalho controlando o orçamento!`
            });
        } else if (kpis.balance < 0) {
            insights.push({
                type: 'warning',
                title: 'Atenção ao Saldo',
                text: `Seu saldo final foi negativo em ${formatAsCurrency(Math.abs(kpis.balance))}. Revise seus gastos variáveis.`
            });
        }

        // Insight 2: Savings Rate
        if (kpis.savingsRate >= 0.2) {
            insights.push({
                type: 'success',
                title: 'Alta Poupança',
                text: `Excelente! Você economizou ${(kpis.savingsRate * 100).toFixed(0)}% da sua renda. Continue assim para atingir suas metas.`
            });
        } else if (kpis.savingsRate > 0) {
            insights.push({
                type: 'info',
                title: 'Bom Começo',
                text: `Você economizou ${(kpis.savingsRate * 100).toFixed(0)}% da sua renda. Tente aumentar essa taxa gradualmente.`
            });
        } else {
            insights.push({
                type: 'warning',
                title: 'Gasto Excessivo',
                text: 'Você gastou mais do que ganhou neste período. Tente reduzir despesas não essenciais.'
            });
        }

        // Insight 3: Top Spending
        if (kpis.topSpendingCategory.name !== 'N/A') {
            insights.push({
                type: 'info',
                title: 'Maior Despesa',
                text: `Sua maior categoria de despesa foi ${kpis.topSpendingCategory.name}, totalizando ${formatAsCurrency(kpis.topSpendingCategory.amount)}.`
            });
        }

        return insights;
    }

    public getDailyProjection(days: number): { labels: string[], data: number[], firstNegativeDate: string | null } {
        const today = moment().startOf('day');

        // 1. Calculate current balance from all PAID transactions up to and including today.
        const currentBalance = this.settings.transactions
            .filter((tx: Transaction) => tx.status === 'paid' && moment(tx.date).isSameOrBefore(today, 'day'))
            .reduce((bal, tx: Transaction) => tx.type === 'income' ? bal + tx.amount : bal - tx.amount, 0);

        // 2. Get all PENDING transactions from tomorrow onwards for the projection.
        const upcomingTransactions = this.settings.transactions
            .filter((transaction: Transaction) =>
                transaction.status === 'pending' &&
                moment(transaction.date).isAfter(today, 'day') &&
                moment(transaction.date).isSameOrBefore(today.clone().add(days, 'days'), 'day') &&
                (!transaction.pausedUntil || moment(transaction.pausedUntil).isBefore(moment(transaction.date), 'day'))
            )
            .sort((a: Transaction, b: Transaction) => moment(a.date).diff(moment(b.date)));

        // 3. Group transactions by date for efficient processing.
        const transactionsByDate: { [key: string]: Transaction[] } = {};
        upcomingTransactions.forEach(tx => {
            const dateKey = moment(tx.date).format('YYYY-MM-DD');
            if (!transactionsByDate[dateKey]) {
                transactionsByDate[dateKey] = [];
            }
            transactionsByDate[dateKey].push(tx);
        });

        // 4. Build the labels and data array for the chart.
        const finalLabels: string[] = ['Hoje'];
        const finalData: number[] = [currentBalance];
        let runningBalance = currentBalance;
        let firstNegativeDate: string | null = null;

        for (let i = 1; i <= days; i++) {
            const loopDate = today.clone().add(i, 'days');
            const dateKey = loopDate.format('YYYY-MM-DD');

            finalLabels.push(loopDate.format('DD/MM'));

            if (transactionsByDate[dateKey]) {
                transactionsByDate[dateKey].forEach(tx => {
                    runningBalance += tx.type === 'income' ? tx.amount : -tx.amount;
                });
            }

            finalData.push(runningBalance);

            if (runningBalance < 0 && firstNegativeDate === null) {
                firstNegativeDate = loopDate.format('DD/MM');
            }
        }

        return { labels: finalLabels, data: finalData, firstNegativeDate };
    }

    public getDailyCashflow(days: number): { labels: string[], incomeData: number[], expenseData: number[] } {
        const today = moment().startOf('day');
        const labels: string[] = [];
        const incomeData: number[] = [];
        const expenseData: number[] = [];

        const transactionsByDate: { [key: string]: { income: number, expense: number } } = {};

        const upcomingTransactions = this.settings.transactions
            .filter((transaction: Transaction) =>
                transaction.status === 'pending' &&
                moment(transaction.date).isBetween(today, today.clone().add(days, 'days'), 'day', '[]')
            );

        upcomingTransactions.forEach(tx => {
            const dateKey = moment(tx.date).format('YYYY-MM-DD');
            if (!transactionsByDate[dateKey]) {
                transactionsByDate[dateKey] = { income: 0, expense: 0 };
            }
            if (tx.type === 'income') {
                transactionsByDate[dateKey].income += tx.amount;
            } else {
                transactionsByDate[dateKey].expense += tx.amount;
            }
        });

        for (let i = 0; i <= days; i++) {
            const loopDate = today.clone().add(i, 'days');
            const dateKey = loopDate.format('YYYY-MM-DD');
            labels.push(loopDate.format('DD/MM'));

            if (transactionsByDate[dateKey]) {
                incomeData.push(transactionsByDate[dateKey].income);
                expenseData.push(transactionsByDate[dateKey].expense);
            } else {
                incomeData.push(0);
                expenseData.push(0);
            }
        }

        return { labels, incomeData, expenseData };
    }

    public getAnnualSummary(year: number) {
        const yearStart = moment({ year }).startOf('year');
        const yearEnd = moment({ year }).endOf('year');

        const paidTransactions = this.settings.transactions.filter((transaction: Transaction) =>
            // Include Pending + Paid for Annual Budget View
            moment(transaction.paymentMonth || transaction.date).isBetween(yearStart, yearEnd, undefined, '[]')
        );

        const totalIncome = paidTransactions
            .filter((transaction: Transaction) => transaction.type === 'income')
            .reduce((sum, transaction: Transaction) => sum + transaction.amount, 0);

        const totalExpenses = paidTransactions
            .filter((transaction: Transaction) => transaction.type === 'expense')
            .reduce((sum, transaction: Transaction) => sum + transaction.amount, 0);

        const balance = totalIncome - totalExpenses;

        const spendingByCategory = new Map<string, number>();
        paidTransactions
            .filter((transaction: Transaction) => transaction.type === 'expense')
            .forEach((transaction: Transaction) => {
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
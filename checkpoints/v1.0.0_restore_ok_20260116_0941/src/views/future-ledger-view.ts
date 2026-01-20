
import { ItemView, WorkspaceLeaf, moment, setIcon, Notice, DropdownComponent, Setting, ButtonComponent } from "obsidian";
import NexusHubPlugin from "../main";
import { Transaction } from "./settings";
import { formatAsCurrency } from "../helpers/helpers";
import { generateSavingOpportunities } from "../services/virtual-transaction-generator";
import { eventManager } from "../helpers/EventManager";
import { Chart } from "chart.js/auto";
import { addHelpButton } from "../helpers/ui-helpers";
import { ConfirmationModal } from "../components/modals";


export const FUTURE_LEDGER_VIEW_TYPE = "future-ledger-view";

export class FutureLedgerView extends ItemView {
    plugin: NexusHubPlugin;
    private descriptionFilter = "";
    private categoryFilter = "all";
    private monthFilter = "";
    // private listContainer: HTMLElement; // REMOVED
    private balanceChart: Chart | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: NexusHubPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return FUTURE_LEDGER_VIEW_TYPE; }
    getDisplayText() { return 'Lançamentos Futuros'; }
    getIcon() { return "calendar-clock"; }

    async onClose() {
        this.balanceChart?.destroy();
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass("future-ledger-container");
        this.injectStyles();

        // Header
        const headerEl = container.createDiv({ cls: "future-ledger-header" });
        const titleSetting = new Setting(headerEl)
            .setName('Lançamentos Futuros')
            .setHeading();

        const helpText = `<h3>Lista Mensal</h3><p>Acompanhe suas despesas e receitas organizadas por mês.</p>`;
        addHelpButton(this.app, titleSetting, 'Sobre', helpText);

        const bodyEl = container.createDiv({ cls: "future-ledger-body" });

        // Simple 2-column Layout:
        // Left: Filters & Summary
        // Right: Content (Graph + List)

        const leftColumn = bodyEl.createDiv({ cls: "summary-and-filters" });
        const premiumSummaryContainer = leftColumn.createDiv({ cls: "premium-stats-wrapper" });
        const filterContainer = leftColumn.createDiv({ cls: "filters-container" });

        const rightColumn = bodyEl.createDiv();

        // --- NEW: Horizontal Monthly Graph Container ---
        const chartContainer = rightColumn.createDiv({ cls: "chart-container" });
        const chartHeader = chartContainer.createDiv({ cls: 'chart-header-row' }); // Flex container for title + info
        chartHeader.createEl('h3', { text: 'Visão Mensal (Próximos 6 Meses)' });

        addHelpButton(this.app, chartHeader, 'Visão Mensal',
            `<p>O gráfico exibe todas as despesas e receitas previstas para o mês corrente. Cada barra representa o total de lançamentos programados para aquele dia.</p>
             <p><strong>Linha de Saldo:</strong> Mostra a evolução do seu saldo ao longo do mês (Saldo Inicial + Receitas - Despesas).</p>
             <p><strong>Filtros:</strong> Use a busca ou o seletor de categorias na barra lateral esquerda para visualizar apenas valores específicos no gráfico (ex: "Quanto vou gastar com Alimentação?").</p>`
        );

        chartContainer.createEl("canvas", { attr: { id: "projected-balance-chart" } });

        // Timeline removed 

        // ... (rest of render method)

        // 3. RENDER TIMELINE LIST (Restored!) -> REMOVED
        // this.listContainer.empty();
        // ... (removed content)

        filterContainer.createEl('h3', { text: 'Filtros' });

        const searchInput = filterContainer.createEl('input', {
            type: 'text',
            placeholder: 'Buscar...'
        });
        searchInput.addEventListener('input', () => {
            this.descriptionFilter = searchInput.value.toLowerCase();
            this.render();
        });

        new DropdownComponent(filterContainer)
            .addOption('all', 'Todas as Categorias')
            .addOptions((this.plugin as any).settings.categories.reduce((acc: any, cat: any) => {
                acc[cat.name] = cat.name;
                return acc;
            }, {} as Record<string, string>))
            .setValue(this.categoryFilter)
            .onChange((value) => {
                this.categoryFilter = value;
                this.render();
            });

        const dateInput = filterContainer.createEl('input', {
            type: 'month',
            value: this.monthFilter
        });
        dateInput.addEventListener('change', () => {
            this.monthFilter = dateInput.value;
            this.render();
        });

        const resetBtn = filterContainer.createEl('button', { text: 'Limpar Filtros' });
        resetBtn.addEventListener('click', () => {
            this.descriptionFilter = "";
            this.categoryFilter = "all";
            this.monthFilter = "";
            searchInput.value = "";
            this.onOpen();
        });

        this.render();

        const onDataChange = () => this.render();
        eventManager.on('data-changed', onDataChange);
        this.register(() => eventManager.off('data-changed', onDataChange));
    }

    private render() {
        const today = moment().startOf('day');
        const settings = (this.plugin as any).settings;

        // SANITIZATION: Fix invalid dates (e.g. Feb 30) that might have been generated
        let hasFixed = false;
        let fixCount = 0;

        console.log(`[Future Ledger] Starting render with ${settings.transactions.length} transactions`);

        settings.transactions.forEach((t: Transaction, index: number) => {
            if (t.isRecurring && typeof t.date === 'string') {
                // Parse manually to detect content (Moment is too forgiving, it might overflow silently if not strict)
                // But we want to catch explicit "YYYY-MM-DD" where DD > DaysInMonth
                const parts = t.date.split('-');
                if (parts.length === 3) {
                    const y = parseInt(parts[0]);
                    const m = parseInt(parts[1]);
                    const d = parseInt(parts[2]);

                    const monthDate = moment(`${y}-${String(m).padStart(2, '0')}-01`);
                    const maxDays = monthDate.daysInMonth();

                    if (d > maxDays) {
                        console.log(`[Future Ledger] Fixing invalid date: ${t.date} -> ${y}-${String(m).padStart(2, '0')}-${maxDays} for transaction: ${t.description}`);
                        t.date = `${y}-${String(m).padStart(2, '0')}-${maxDays}`;
                        hasFixed = true;
                        fixCount++;
                    }
                }
            }
        });

        // HEALING: Check for missing months in recurring series (specifically Salary)
        const groups: { [key: string]: Transaction[] } = {};

        settings.transactions.forEach((t: Transaction) => {
            if (t.isRecurring && t.type === 'income') {
                const key = `${t.description}|${t.amount}`;
                if (!groups[key]) groups[key] = [];
                groups[key].push(t);
            }
        });

        Object.values(groups).forEach(group => {
            if (group.length < 2) return;
            group.sort((a, b) => moment(a.date).diff(moment(b.date)));

            const start = moment(group[0].date);
            const end = moment(group[group.length - 1].date);

            const currentDate = start.clone();
            while (currentDate.isBefore(end)) {
                const monthKey = currentDate.format('YYYY-MM');
                const exists = group.some(t => moment(t.date).format('YYYY-MM') === monthKey);

                if (!exists) {
                    // Start of Feb 2026 gap found?
                    console.log(`[Future Ledger] Healing gap for ${group[0].description} in ${monthKey}`);

                    // Clone the first transaction but update date
                    const newTx = { ...group[0] };
                    newTx.id = `healed_${Date.now()}_${monthKey}`;

                    // Determine valid date for this month
                    const originalDay = moment(group[0].date).date();
                    const maxDays = currentDate.daysInMonth();
                    const safeDay = Math.min(originalDay, maxDays);

                    newTx.date = currentDate.clone().date(safeDay).format('YYYY-MM-DD');

                    // Apply Competence Logic just in case
                    const d = moment(newTx.date);
                    newTx.paymentMonth = d.date() <= 12
                        ? d.clone().subtract(1, 'month').format('YYYY-MM')
                        : d.format('YYYY-MM');

                    settings.transactions.push(newTx);
                    hasFixed = true;
                    fixCount++;
                }
                currentDate.add(1, 'month');
            }
        });

        if (hasFixed) {
            console.log(`[Future Ledger] Fixed/Healed ${fixCount} issues. Saving...`);
            (this.plugin as any).saveSettings().then(() => {
                setTimeout(() => this.render(), 100);
            });
            return;
        }

        // DEBUG: Inspect Salary Transactions
        console.log("--- SALARY TRANSACTION INSPECTION ---");
        settings.transactions.forEach((t: Transaction) => {
            if ((t.description || "").toLowerCase().includes("renda") || (t.category || "").toLowerCase().includes("salário")) {
                console.log(`Tx: ${t.description} | Date: ${t.date} | P.Month: ${t.paymentMonth} | Amt: ${t.amount}`);
            }
        });
        console.log("-------------------------------------");

        // 1. Generate Virtual Transactions (Salary/Goals)

        // 1. Generate Virtual Transactions (Salary/Goals)
        // FIX: Start from Next Month (i=1) to avoid mixing Current Month's partial state
        const allTransactionsIncludingVirtual: Transaction[] = [...settings.transactions];
        for (let i = 1; i <= 6; i++) {
            const month = moment().add(i, 'months').startOf('month');
            const virtuals = generateSavingOpportunities(settings, month);
            virtuals.forEach(vt => {
                const dayOfMonth = settings.salaryPayday1 || 1;
                const clampedDay = Math.min(dayOfMonth, month.daysInMonth());
                vt.date = month.clone().date(clampedDay).format('YYYY-MM-DD');
            });
            allTransactionsIncludingVirtual.push(...virtuals);
        }


        // --- NEW: CREDIT CARD BILL AGGREGATION ---
        const cardTransactions = allTransactionsIncludingVirtual.filter(t => t.cardId && t.status === 'pending');

        // FIX: Apply Global Competence Logic to Regular Transactions (Legacy Data Support)
        const regularTransactions = allTransactionsIncludingVirtual
            .filter(t => !t.cardId)
            .map(t => {
                // If paymentMonth is already set (New Data), preserve it.
                if (t.paymentMonth) return t;

                // Else, infer it based on User's Competence Rule (Day <= 12 -> Prev Month)
                const d = moment(t.date);
                const paymentMonth = d.date() <= 12
                    ? d.clone().subtract(1, 'month').format('YYYY-MM')
                    : d.format('YYYY-MM');

                // Return a shallow copy with the inferred paymentMonth (Avoid mutating specific storage)
                return { ...t, paymentMonth };
            });

        // Map to store aggregated bills: Key string -> Virtual Transaction
        const billMap: { [key: string]: Transaction } = {};

        cardTransactions.forEach(t => {
            const card = settings.creditCards.find((c: any) => c.id === t.cardId);
            if (!card) return; // Should not happen

            // Determine Bill Due Date based on Purchase Date vs Closing Day
            // Logic: If purchase date > closing day, it falls in next month.
            // Simplified logic: We trust t.date as purchase date.
            const purchaseDate = moment(t.date);
            let referenceMonth = purchaseDate.clone();

            // If purchase day >= closing day, move to next month
            if (purchaseDate.date() >= card.closingDay) {
                referenceMonth.add(1, 'month');
            }

            // Set the exact Due Date
            const dueDate = referenceMonth.clone().date(card.dueDate);

            // Create a unique key for this bill (CardID + Month)
            const billKey = `${card.id}-${dueDate.format('YYYY-MM')}`;

            if (!billMap[billKey]) {
                // Apply Competence Logic: If due date <= 12, belongs to prev month budget
                const paymentMonth = dueDate.date() <= 12
                    ? dueDate.clone().subtract(1, 'month').format('YYYY-MM')
                    : dueDate.format('YYYY-MM');

                billMap[billKey] = {
                    id: `bill-${billKey}`,
                    cardId: card.id, // Mark as card related, but distinct
                    type: 'expense',
                    description: `Fatura: ${card.name}`,
                    amount: 0,
                    date: dueDate.format('YYYY-MM-DD'),
                    category: 'Fatura Cartão',
                    status: 'pending',
                    isRecurring: false,
                    isInstallment: false,
                    isVirtual: true, // It is a virtual aggregation
                    virtualType: 'goal', // slight misuse, but harmless
                    paymentMonth: paymentMonth // FIX: Align with Competence View
                };
            }

            // Sum amount
            billMap[billKey].amount += t.amount;
        });

        const bills = Object.values(billMap);

        // Combine Regular Transactions + Bills
        const displayTransactions = [...regularTransactions, ...bills];


        // 2. Filter & Sort
        const futureTransactions = displayTransactions
            .filter(transaction => {
                // Apply Text Filter
                if (this.descriptionFilter && !transaction.description.toLowerCase().includes(this.descriptionFilter)) return false;

                // Apply Category Filter (Skip if 'all')
                if (this.categoryFilter !== 'all' && transaction.category !== this.categoryFilter) return false;

                let displayDate = moment(transaction.paymentMonth || transaction.date);

                // Virtual/Goals might use different date keys, but now we standardized on .date for bills
                if (transaction.paymentMonth) displayDate = moment(transaction.paymentMonth);

                // FIX: Strict Future Filter (Start from Next Month)
                const nextMonthStart = moment().add(1, 'month').startOf('month');

                // Date Filters
                const isFuture = displayDate.isSameOrAfter(nextMonthStart, 'day');
                const isWithinLimit = displayDate.isBefore(moment().add(7, 'months')); // Increased limit to ensure 6 months cover

                if (!isFuture || !isWithinLimit) return false;

                // Month Filter
                if (this.monthFilter) {
                    const filterDate = moment(this.monthFilter);
                    if (!displayDate.isSame(filterDate, 'month')) return false;
                }

                return transaction.status === 'pending';
            })
            .sort((a, b) => {
                const dateA = moment(a.paymentMonth || a.date);
                const dateB = moment(b.paymentMonth || b.date);
                return dateA.diff(dateB);
            });

        const currentBalance = this.getCurrentBalance();
        this.renderStats(currentBalance, futureTransactions);

        // Render Chart (keeping existing logic roughly same)
        this.renderProjectionChart(displayTransactions); // Refactored slightly to use display set
    }

    // Helper to keep chart logic clean in render
    private renderProjectionChart(transactions: Transaction[]) {
        // Aggregate by Monthly Total for simple bar chart
        const monthlyData: { [key: string]: number } = {};
        const monthOrder: string[] = [];
        const monthNames: string[] = [];

        // FIX: Start buckets from CURRENT Month (i=0) because Future Ledger usually includes "Review of Current Month + 5 Future"
        for (let i = 0; i <= 5; i++) {
            const m = moment().add(i, 'months');
            const key = m.format('YYYY-MM');
            monthOrder.push(key);
            monthNames.push(m.format('MMMM'));
            monthlyData[key] = 0;
        }

        const graphTransactions = transactions.filter(transaction => {
            // Apply similar filters
            const descMatch = this.descriptionFilter ? transaction.description.toLowerCase().includes(this.descriptionFilter) : true;
            const catMatch = this.categoryFilter !== 'all' ? transaction.category === this.categoryFilter : true;
            const d = moment(transaction.paymentMonth || transaction.date);

            // FIX: Chart specific filter alignment - Start from Current Month
            const currentMonthStart = moment().startOf('month');
            const isFutureOrCurrent = d.isSameOrAfter(currentMonthStart, 'month');
            const isWithinLimit = d.isBefore(moment().add(6, 'months'));

            // FIX: Include PAID transactions for reliable projection of "Total Month Cost"
            // If we exclude 'paid', the bar shrinks as we pay, losing the "Projection" value.
            // We want to see "How much does January Cost?" (Total), not "How much is left?" (Pending).
            return isFutureOrCurrent && isWithinLimit && descMatch && catMatch;
        });

        console.log(`[Future Ledger] Processing ${graphTransactions.length} transactions for chart`);

        graphTransactions.forEach(t => {
            const d = moment(t.paymentMonth || t.date);
            const key = d.format('YYYY-MM');
            const amount = t.type === 'income' ? t.amount : -t.amount;

            if (monthlyData[key] !== undefined) {
                console.log(`[Future Ledger] Adding ${t.type} ${formatAsCurrency(t.amount)} to ${key} (${t.description})`);
                monthlyData[key] += amount;
            } else {
                console.log(`[Future Ledger] Skipping transaction for ${key} (out of range): ${t.description}`);
            }
        });

        console.log('[Future Ledger] Monthly data:', monthlyData);

        const chartData = monthOrder.map(key => monthlyData[key]);
        this.renderMonthlyBarChart(monthNames, chartData);
    }

    private renderStats(currentBalance: number, futureTransactions: Transaction[]) {
        const container = this.containerEl.querySelector('.premium-stats-wrapper');
        if (!container) return;
        container.empty();
        const statsContainer = container.createDiv({ cls: 'premium-stats-container' });

        const projectedIncome = futureTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const projectedExpenses = futureTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        const finalBalance = currentBalance + projectedIncome - projectedExpenses;

        const createStat = (label: string, value: number, type: 'income' | 'expense' | 'balance') => {
            const card = statsContainer.createDiv({ cls: 'premium-stat-card' });
            card.createDiv({ cls: 'premium-stat-label', text: label });
            const valEl = card.createDiv({ cls: `premium-stat-value ${type}` });
            valEl.setText(formatAsCurrency(value));
        };

        createStat('Receitas Previstas', projectedIncome, 'income');
        createStat('Despesas Previstas', projectedExpenses, 'expense');
        createStat('Saldo Projetado (6 Meses)', finalBalance, 'balance');
    }

    private renderMonthlyBarChart(monthLabels: string[], dataPoints: number[]) {
        if (this.balanceChart) this.balanceChart.destroy();
        const chartCanvas = this.containerEl.querySelector("#projected-balance-chart") as HTMLCanvasElement;
        if (!chartCanvas) return;

        // Colors based on positive/negative
        const backgroundColors = dataPoints.map(v => v >= 0 ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)');
        const borderColors = dataPoints.map(v => v >= 0 ? 'rgba(75, 192, 192, 1)' : 'rgba(255, 99, 132, 1)');

        this.balanceChart = new Chart(chartCanvas, {
            type: 'bar',
            data: {
                labels: monthLabels,
                datasets: [{
                    label: 'Saldo Mensal Previsto',
                    data: dataPoints,
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y', // HORIZONTAL BAR CHART
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    y: {
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const val = context.parsed.x;
                                return 'Saldo: ' + formatAsCurrency(val !== null ? val : 0);
                            }
                        }
                    }
                }
            }
        });
    }

    private async confirmVirtualGoal(goalId: string, amount: number) {
        const goal = (this.plugin as any).settings.goals.find((g: any) => g.id === goalId);
        if (goal && goal.goalType === 'Saving') {
            goal.currentAmount += amount;
            if (!goal.history) goal.history = [];
            goal.history.push({ date: new Date().toISOString(), amount: amount, balanceAfter: goal.currentAmount });
            if (!goal.completed && goal.currentAmount >= goal.targetAmount) {
                goal.completed = true;
                (this.plugin as any).increaseNexusScore(50, `Meta '${goal.name}' concluída!`);
                new Notice(`Parabéns! Meta '${goal.name}' atingida!`);
            }
            await (this.plugin as any).saveSettings();
            eventManager.emit('data-changed');
        }
    }

    private async confirmVirtualEmergencyFund(amount: number) {
        const fund = (this.plugin as any).settings.emergencyFund;
        if (fund) {
            fund.currentBalance += amount;
            if (!fund.history) fund.history = [];
            fund.history.push({ date: new Date().toISOString(), type: 'deposit', amount: amount, balanceAfter: fund.currentBalance, reason: 'Contribuição via Timeline' });
            await (this.plugin as any).saveSettings();
            eventManager.emit('data-changed');
        }
    }

    private async skipVirtualGoalMonth(goalId: string, monthKey: string) {
        const goal = (this.plugin as any).settings.goals.find((g: any) => g.id === goalId);
        if (goal) {
            if (!goal.skippedMonths) goal.skippedMonths = [];
            goal.skippedMonths.push(monthKey);
            await (this.plugin as any).saveSettings();
            eventManager.emit('data-changed');
        }
    }

    private async skipVirtualEmergencyFundMonth(monthKey: string) {
        const fund = (this.plugin as any).settings.emergencyFund;
        if (fund) {
            if (!fund.skippedMonths) fund.skippedMonths = [];
            fund.skippedMonths.push(monthKey);
            await (this.plugin as any).saveSettings();
            eventManager.emit('data-changed');
        }
    }

    private getCurrentBalance(): number {
        const today = moment().startOf('day');
        return (this.plugin as any).settings.transactions
            .filter((tx: any) => tx.status === 'paid' && moment(tx.date).isSameOrBefore(today, 'day'))
            .reduce((bal: any, tx: any) => tx.type === 'income' ? bal + tx.amount : bal - tx.amount, 0);
    }

    private injectStyles() {
        const styleId = 'nexus-future-ledger-styles';
        if (document.getElementById(styleId)) return;
        const style = document.head.createEl('style', { attr: { id: styleId } });
        style.innerHTML = `
            .chart-header-row {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 10px;
            }
            .chart-header-row h3 { margin: 0; }
        `;
    }
}

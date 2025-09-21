import { ItemView, WorkspaceLeaf, moment, setIcon } from "obsidian";
import NexusHubPlugin from "./main";
import { t } from "./lang";
import { Transaction } from "./settings";
import { formatAsCurrency } from "./helpers";
import { eventManager } from "./EventManager";
import { Chart } from "chart.js/auto";
import { ReportGenerator } from "./report-generator";

export const FUTURE_LEDGER_VIEW_TYPE = "future-ledger-view";

export class FutureLedgerView extends ItemView {
    plugin: NexusHubPlugin;
    private descriptionFilter: string = "";
    private categoryFilter: string = "all";
    private listContainer: HTMLElement;
    private balanceChart: Chart | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: NexusHubPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return FUTURE_LEDGER_VIEW_TYPE; }
    getDisplayText() { return t('FUTURE_LEDGER_VIEW_TITLE'); }
    getIcon() { return "calendar-clock"; }

    async onClose() {
        this.balanceChart?.destroy();
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass("future-ledger-container");

        container.createEl("h2", { text: t('FUTURE_LEDGER_VIEW_TITLE') });

        // ADD CHART CONTAINER
        const chartContainer = container.createDiv({ cls: "chart-container" });
        chartContainer.createEl('h3', { text: t('FUTURE_LEDGER_PROJECTED_BALANCE_CHART_TITLE') });
        chartContainer.createEl("canvas", { attr: { id: "projected-balance-chart" } });

        // Filters
        const filterContainer = container.createDiv({ cls: "report-filters" });
        
        const searchInput = filterContainer.createEl('input', {
            type: 'text',
            placeholder: t('FUTURE_LEDGER_SEARCH_PLACEHOLDER')
        });
        searchInput.addEventListener('input', () => {
            this.descriptionFilter = searchInput.value.toLowerCase();
            this.render();
        });

        const categorySelect = filterContainer.createEl('select');
        categorySelect.createEl('option', { value: 'all', text: t('FUTURE_LEDGER_ALL_CATEGORIES') });
        this.plugin.settings.categories.forEach(cat => {
            categorySelect.createEl('option', { value: cat.name, text: cat.name });
        });
        categorySelect.addEventListener('change', () => {
            this.categoryFilter = categorySelect.value;
            this.render();
        });

        this.listContainer = container.createDiv({ cls: "future-ledger-list" });

        this.render();

        const onDataChange = () => this.render();
        eventManager.on('data-changed', onDataChange);
        this.register(() => eventManager.off('data-changed', onDataChange));
    }

    private render() {
        this.listContainer.empty();

        const futureTransactions = this.plugin.settings.transactions
            .filter(transaction => transaction.status === 'pending' && moment(transaction.date).isSameOrAfter(moment(), 'day'))
            .filter(transaction => {
                const descMatch = this.descriptionFilter ? transaction.description.toLowerCase().includes(this.descriptionFilter) : true;
                const catMatch = this.categoryFilter !== 'all' ? transaction.category === this.categoryFilter : true;
                return descMatch && catMatch;
            })
            .sort((a, b) => moment(a.date).diff(moment(b.date)));

        // RENDER THE CHART
        this.renderProjectedBalanceChart(futureTransactions);

        if (futureTransactions.length === 0) {
            this.listContainer.createEl('p', { text: t('FUTURE_LEDGER_EMPTY_LIST') });
            return;
        }

        // A lógica de agrupamento por mês foi refatorada para garantir que o saldo corrente
        // seja calculado na ordem cronológica correta das transações.
        let runningBalance = this.getCurrentBalance();
        let currentMonthKey = "";

        futureTransactions.forEach(transaction => {
            const monthKey = moment(transaction.date).format('MMMM YYYY');

            // Adiciona um novo cabeçalho de mês se o mês mudar
            if (monthKey !== currentMonthKey) {
                currentMonthKey = monthKey;
                this.listContainer.createEl('h3', { text: monthKey.charAt(0).toUpperCase() + monthKey.slice(1), cls: 'month-group-header' });
            }

            // Atualiza o saldo corrente
            runningBalance += (transaction.type === 'income' ? transaction.amount : -transaction.amount);

            // Renderiza o item da transação
            const itemEl = this.listContainer.createDiv({ cls: 'ledger-item-detailed' });
            
            const iconEl = itemEl.createDiv({ cls: `item-icon ${transaction.type}` });
            setIcon(iconEl, transaction.type === 'income' ? 'arrow-up-circle' : 'arrow-down-circle');

            const infoEl = itemEl.createDiv({ cls: 'item-info' });
            infoEl.createDiv({ text: transaction.description, cls: 'item-description' });
            infoEl.createDiv({ text: moment(transaction.date).format(t('FUTURE_LEDGER_DATE_FORMAT')), cls: 'item-date' });

            const amountEl = itemEl.createDiv({ cls: `item-amount ${transaction.type}` });
            amountEl.setText(`${transaction.type === 'income' ? '+' : '-'} ${formatAsCurrency(transaction.amount)}`);

            const balanceEl = itemEl.createDiv({ cls: 'item-running-balance' });
            balanceEl.setText(formatAsCurrency(runningBalance));
        });
    }

    private getCurrentBalance(): number {
        const pastTransactions = this.plugin.settings.transactions.filter(transaction => 
            moment(transaction.date).isBefore(moment(), 'day') && transaction.status === 'paid'
        );
        return pastTransactions.reduce((balance, transaction) => {
            return transaction.type === 'income' ? balance + transaction.amount : balance - transaction.amount;
        }, 0);
    }

    private renderProjectedBalanceChart(futureTransactions: Transaction[]) {
        if (this.balanceChart) {
            this.balanceChart.destroy();
        }

        const generator = new ReportGenerator(this.plugin.settings);
        const projectionData = generator.getDailyProjection(30);

        const chartCanvas = this.containerEl.querySelector("#projected-balance-chart") as HTMLCanvasElement;
        if (!chartCanvas) return;

        this.balanceChart = new Chart(chartCanvas, {
            type: 'line',
            data: {
                labels: projectionData.labels,
                datasets: [{
                    label: t('FUTURE_LEDGER_CHART_LABEL'),
                    data: projectionData.data,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    fill: true,
                    tension: 0.1,
                    pointRadius: 2, // Smaller points for a cleaner look
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: false } },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += formatAsCurrency(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }
}
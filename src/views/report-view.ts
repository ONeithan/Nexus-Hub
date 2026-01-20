import { moment, ItemView, WorkspaceLeaf, setIcon, Setting } from "obsidian";
import NexusHubPlugin from "../main";
import { eventManager } from "../helpers/EventManager";
import { formatAsCurrency } from "../helpers/helpers";
import { addHelpButton } from "../helpers/ui-helpers";
import { ReportGenerator, SankeyDataPoint } from "../services/report-generator";
// Imports estáticos removidos para evitar crash no mobile
// import { Chart, TooltipItem, registerables } from "chart.js/auto";
// import { SankeyController, Flow } from 'chartjs-chart-sankey';
import type { Chart, TooltipItem } from "chart.js/auto";
import { Transaction, NexusHubSettings } from "./settings";

// Variáveis para armazenar as bibliotecas carregadas dinamicamente
let Chartjs: any;
let SankeyController: any;
let Flow: any;
let isChartJsLoaded = false;

// Função auxiliar para carregar dependências
async function loadChartJs() {
    if (isChartJsLoaded) return;
    try {
        const c = await import('chart.js/auto');
        const s = await import('chartjs-chart-sankey');
        Chartjs = c.Chart;
        SankeyController = s.SankeyController;
        Flow = s.Flow;
        Chartjs.register(...c.registerables, SankeyController, Flow);
        isChartJsLoaded = true;
    } catch (e) {
        console.error("Nexus Hub: Failed to load Chart.js", e);
    }
}

export const NEXUS_REPORT_VIEW_TYPE = "nexus-report-view";

export class ReportView extends ItemView {
    plugin: NexusHubPlugin;
    private generator: ReportGenerator;
    private charts: Chart[] = [];
    private startDate: moment.Moment;
    private endDate: moment.Moment;
    private reportContentEl: HTMLDivElement;
    private isDemoMode = false;
    private activeTab = 'Dashboard';

    constructor(leaf: WorkspaceLeaf, plugin: NexusHubPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.generator = new ReportGenerator((this.plugin as any).settings);
        this.startDate = moment().startOf('month');
        this.endDate = moment().endOf('month');
    }

    getViewType() { return NEXUS_REPORT_VIEW_TYPE; }
    getDisplayText() { return 'Relatórios'; }
    getIcon() { return "pie-chart"; }

    async onClose() {
        this.charts.forEach(chart => chart.destroy());
    }

    async onOpen() {
        await loadChartJs(); // Lazy load
        eventManager.emit('view-opened', 'report');

        // Use contentEl instead of containerEl to ensure we are inside the standard view area
        // and not being pushed down by an empty view-content div.
        this.contentEl.empty();
        this.contentEl.addClass("nexus-reports-container");

        const styleEl = this.contentEl.createEl('style');
        styleEl.innerHTML = `
/* CSS for Report View */
            .nexus-reports-container {
                display: flex;
                flex-direction: column;
                padding: 10px; 
                overflow-y: auto;
                height: 100%;
                box-sizing: border-box;
            }
            .report-main-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                padding-bottom: 10px;
                margin-bottom: 10px;
                border-bottom: 1px solid var(--background-modifier-border);
            }
            
            /* MOBILE SPECIFIC RULES (INJECTED) */
            @media screen and (max-width: 768px) {
                .dashboard-grid-container {
                    display: flex !important;
                    flex-direction: column !important;
                }
                
                .kpi-grid {
                    /* On mobile, 2 columns for KPIs is better than 1 huge list, but let's see. 
                       2 columns is good for numbers. */
                    grid-template-columns: 1fr 1fr !important; 
                    gap: 10px !important;
                }
                
                .insights-card ul {
                    padding-left: 0 !important;
                }
                
                .chart-wrapper {
                    /* Restore height on mobile, but ensure width is fine */
                    height: 300px !important; 
                    position: relative;
                }
            }

            .report-title-group {
                display: flex;
                align-items: center;
                gap: 15px;
                flex-grow: 1;
            }
            /* ... (h2 styles) ... */
            .tabs-headers {
                display: flex;
                border-bottom: 1px solid var(--background-modifier-border);
                margin-bottom: 15px; 
                overflow-x: auto; /* Allow scroll on small screens */
                white-space: nowrap; /* Prevent wrapping */
            }
            .tab-header {
                padding: 10px 15px;
                cursor: pointer;
                color: var(--text-muted);
                font-size: 1em;
                font-weight: 500;
                transition: color 0.2s, border-bottom-color 0.2s;
                border-bottom: 2px solid transparent;
            }
            .tab-header:hover {
                color: var(--text-normal);
            }
            .tab-header.is-active {
                color: var(--interactive-accent);
                border-bottom-color: var(--interactive-accent);
            }
            .tabs-content {
                flex-grow: 1;
            }
            .tab-content-item {
                display: none;
            }
            .tab-content-item:not(.is-hidden) {
                display: block;
            }
            .report-explanation {
                font-size: 0.9em;
                color: var(--text-muted);
                margin-bottom: 20px;
                line-height: 1.5;
            }
            .insights-card ul {
                list-style: none;
                padding: 0;
            }
            .insights-card li {
                display: flex;
                align-items: flex-start;
                margin-bottom: 10px;
                color: var(--text-normal);
            }
            .insight-icon {
                margin-right: 10px;
                color: var(--interactive-accent);
            }
            .dashboard-grid-container {
                display: grid;
                grid-template-columns: 1fr 1fr;
                grid-template-rows: auto;
                grid-template-areas:
                    "kpi kpi"
                    "category-chart flow-chart";
                gap: 20px;
                width: 100%;
            }
            .kpi-area {
                grid-area: kpi;
            }
            .category-chart-area {
                grid-area: category-chart;
            }
            .flow-chart-area {
                grid-area: flow-chart;
            }
            .kpi-grid {
                 display: grid;
                 /* Desktop Default: 3 columns */
                 grid-template-columns: repeat(3, 1fr); 
                 gap: 15px;
                 width: 100%;
            }
            .kpi-item {
                background-color: var(--background-primary);
                padding: 15px;
                border-radius: 10px;
                text-align: center;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                 /* Prevent overflow */
                min-width: 0; 
                word-wrap: break-word;
            }
            .kpi-value {
                font-size: 1.4em;
                font-weight: 700;
                color: var(--text-normal);
                margin-bottom: 4px;
                /* Crucial for preventing overflow */
                white-space: nowrap; 
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 100%;
            }
            .kpi-label-container {
                display: flex;
                align-items: center;
                justify-content: center;
                margin-top: 5px;
                color: var(--text-muted);
                font-size: 0.9em;
            }
            .kpi-label-text {
                font-weight: 500;
            }
        `;

        // Main Header
        const headerEl = this.contentEl.createDiv({ cls: "report-main-header" });

        // Title and Help Button
        const titleGroup = headerEl.createDiv({ cls: "report-title-group" });
        // Using createEl('h2') instead of Setting() to avoid excessive padding/margins
        titleGroup.createEl('h2', { text: 'Relatórios Financeiros' });

        const helpText = `
            <h3>Central de Relatórios</h3>
            <p>Acompanhe a saúde financeira completa através de 4 visões detalhadas:</p>
            <ul>
                <li><b>Dashboard:</b> Visão geral do mês. Mostra saldo, renda, despesas e taxa de poupança (quanto % você guardou).</li>
                <li><b>Fluxo de Dinheiro:</b> Gráfico Sankey e Barras que mostram para onde seu dinheiro vai. Mostra o caminho da Renda -> Despesas -> Sobras.</li>
                <li><b>Histórico & Patrimônio:</b> Acompanhe a evolução da sua riqueza.
                    <ul>
                        <li><i>Patrimônio Líquido:</i> Soma de tudo que você tem guardado (Reserva de Emergência + Metas de Economia).</li>
                        <li><i>Fundo de Emergência:</i> Histórico específico da sua reserva principal.</li>
                    </ul>
                </li>
                <li><b>Insights:</b> O sistema analisa seus dados e dá dicas automáticas (ex: se gastou muito em 'Lazer' ou se sua poupança está boa).</li>
            </ul>
        `;
        addHelpButton(this.app, titleGroup, 'Entendendo os Relatórios', helpText); // Passed titleGroup directly

        // Controls Group - logic moved to renderDateFilters for better layout control
        const controlsGroup = headerEl.createDiv({ cls: "report-controls-group" });
        this.renderDateFilters(controlsGroup);

        this.generator = new ReportGenerator((this.plugin as any).settings);
        this.activeTab = 'Dashboard';

        this.reportContentEl = this.contentEl.createDiv({ cls: "nexus-report-content" });
        this.renderReports();

        const onDataChange = () => {
            if (this.isDemoMode) return;
            this.generator = new ReportGenerator((this.plugin as any).settings);
            this.renderReports();
        };
        eventManager.on('data-changed', onDataChange);
        this.register(() => eventManager.off('data-changed', onDataChange));
    }

    private renderDateFilters(container: HTMLElement) {
        container.empty();
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.gap = '10px';

        // 1. Label
        container.createSpan({ text: 'Período:', cls: 'period-label' });

        // 2. Dropdown
        const periodSelect = container.createEl('select', { cls: 'dropdown period-select' });
        const options = [
            { v: "this_month", l: 'Este Mês' },
            { v: "last_month", l: 'Mês Passado' },
            { v: "this_year", l: 'Este Ano' },
            { v: "last_year", l: 'Ano Passado' },
            { v: "all_time", l: 'Desde o Início' },
            { v: "custom", l: 'Personalizado' }
        ];

        options.forEach(opt => {
            const o = periodSelect.createEl('option', { value: opt.v, text: opt.l });
            if (this.isDemoMode && opt.v === 'this_year') o.selected = true;
            else if (!this.isDemoMode && opt.v === 'this_month') o.selected = true;
        });

        // 3. Demo Button (Compact)
        const demoBtn = container.createEl('button', {
            text: this.isDemoMode ? 'Demo: ON' : 'Demo: OFF',
            cls: this.isDemoMode ? 'mod-cta' : ''
        });
        demoBtn.style.marginLeft = 'auto'; // Push to right if needed, or keep inline

        demoBtn.onclick = () => {
            this.isDemoMode = !this.isDemoMode;
            demoBtn.setText(this.isDemoMode ? 'Demo: ON' : 'Demo: OFF');
            demoBtn.toggleClass('mod-cta', this.isDemoMode);

            if (this.isDemoMode) {
                // Force to 'all_time' to ensure all generated history (past 12 months) is visible
                periodSelect.value = 'all_time';
                this.startDate = moment(new Date(0));
                this.endDate = moment().add(2, 'years');
                this.renderDemoReports();
            } else {
                periodSelect.value = 'this_month'; // Reset to default
                this.startDate = moment().startOf('month');
                this.endDate = moment().endOf('month');
                this.generator = new ReportGenerator((this.plugin as any).settings);
                this.renderReports();
            }
        };

        // 4. Custom Date Inputs
        const customContainer = container.createDiv({ cls: "custom-date-container" });
        customContainer.style.display = "none";
        customContainer.style.gap = "5px";

        const startInput = customContainer.createEl('input', { type: 'date', cls: 'start-date' });
        startInput.value = this.startDate.format('YYYY-MM-DD');
        const endInput = customContainer.createEl('input', { type: 'date', cls: 'end-date' });
        endInput.value = this.endDate.format('YYYY-MM-DD');

        // Events
        periodSelect.onchange = () => {
            const val = periodSelect.value;
            customContainer.style.display = val === 'custom' ? 'flex' : 'none';

            if (val !== 'custom') {
                if (val === 'this_month') { this.startDate = moment().startOf('month'); this.endDate = moment().endOf('month'); }
                if (val === 'last_month') { this.startDate = moment().subtract(1, 'month').startOf('month'); this.endDate = moment().subtract(1, 'month').endOf('month'); }
                if (val === 'this_year') { this.startDate = moment().startOf('year'); this.endDate = moment().endOf('year'); }
                if (val === 'last_year') { this.startDate = moment().subtract(1, 'year').startOf('year'); this.endDate = moment().subtract(1, 'year').endOf('year'); }
                if (val === 'all_time') { this.startDate = moment(new Date(0)); this.endDate = moment(); }

                startInput.value = this.startDate.format('YYYY-MM-DD');
                endInput.value = this.endDate.format('YYYY-MM-DD');

                if (this.isDemoMode) this.renderDemoReports();
                else this.renderReports();
            }
        };

        const onDateChange = () => {
            this.startDate = moment(startInput.value);
            this.endDate = moment(endInput.value);
            if (this.isDemoMode) this.renderDemoReports();
            else this.renderReports();
        };
        startInput.onchange = onDateChange;
        endInput.onchange = onDateChange;
    }

    private renderDemoReports() {
        const mockHistory: { date: string; type: 'deposit' | 'withdrawal'; amount: number; balanceAfter: number; reason?: string; }[] = [];
        const today = moment();
        let currentBalance = 1800;

        // Generate 12 months of history for the emergency fund
        for (let i = 11; i >= 0; i--) {
            const date = today.clone().subtract(i, 'months').date(15).format('YYYY-MM-DD');
            // More frequent deposits
            if (i % 2 === 0) {
                const amount = 200 + (i * 20) + Math.random() * 50;
                currentBalance += amount;
                mockHistory.push({ date, type: 'deposit', amount, balanceAfter: currentBalance, reason: 'Depósito mensal' });
            }
            // More varied withdrawals
            if (i === 3 || i === 8) {
                const amount = 300 + Math.random() * 100;
                currentBalance -= amount;
                mockHistory.push({ date, type: 'withdrawal', amount, balanceAfter: currentBalance, reason: 'Reparo inesperado' });
            }
        }

        const mockSettings: NexusHubSettings = {
            ...(this.plugin as any).settings,
            transactions: [],
            goals: [
                {
                    id: 'g1',
                    name: 'Viagem para a Europa',
                    goalType: 'Saving',
                    targetAmount: 15000,
                    currentAmount: 4500,
                    targetDate: today.clone().add(12, 'months').format('YYYY-MM-DD'),
                    linkedAccountIds: [],
                    completed: false,
                    history: Array.from({ length: 12 }, (_, i) => ({
                        date: today.clone().subtract(11 - i, 'months').date(7).format('YYYY-MM-DD'),
                        amount: 375,
                        balanceAfter: 375 * (i + 1)
                    }))
                }
            ],
            emergencyFund: { targetAmount: 8000, currentBalance: currentBalance, monthlyContribution: 250, showInPending: false, history: mockHistory }
        };

        // Generate 365 days (12 months) of transactions
        for (let i = 11; i >= 0; i--) {
            const month = today.clone().subtract(i, 'months');
            const income = 5000 + Math.random() * 500; // Salary with slight variation
            mockSettings.transactions.push(
                { id: `d_inc_1_${i}`, description: 'Salário', amount: income, date: month.clone().date(5).format('YYYY-MM-DD'), category: 'Salário', type: 'income', status: 'paid', isRecurring: true, isInstallment: false },
                { id: `d_inc_2_${i}`, description: 'Freelance', amount: 750 * (i % 3 === 0 ? 1.5 : 1), date: month.clone().date(18).format('YYYY-MM-DD'), category: 'Renda Extra', type: 'income', status: 'paid', isRecurring: false, isInstallment: false },
                { id: `d_exp_1_${i}`, description: 'Aluguel', amount: 1200, date: month.clone().date(10).format('YYYY-MM-DD'), category: 'Moradia', type: 'expense', status: 'paid', isRecurring: false, isInstallment: false },
                { id: `d_exp_2_${i}`, description: 'Supermercado', amount: 850 + (Math.random() - 0.5) * 200, date: month.clone().date(15).format('YYYY-MM-DD'), category: 'Alimentação', type: 'expense', status: 'paid', isRecurring: false, isInstallment: false },
                { id: `d_exp_3_${i}`, description: 'Netflix', amount: 39.90, date: month.clone().date(20).format('YYYY-MM-DD'), category: 'Assinaturas', type: 'expense', status: 'paid', isRecurring: false, isInstallment: false },
                { id: `d_exp_4_${i}`, description: 'Restaurante', amount: 120 + (Math.random() * 80), date: month.clone().date(22).format('YYYY-MM-DD'), category: 'Lazer', type: 'expense', status: 'paid', isRecurring: false, isInstallment: false },
                { id: `d_exp_5_${i}`, description: 'Gasolina', amount: 200 + (Math.random() * 50), date: month.clone().date(25).format('YYYY-MM-DD'), category: 'Transporte', type: 'expense', status: 'paid', isRecurring: false, isInstallment: false },
                { id: `d_inv_1_${i}`, description: 'Aporte Fundo de Emergência', amount: 250, date: month.clone().date(6).format('YYYY-MM-DD'), category: 'Investimentos', type: 'expense', status: 'paid', isRecurring: true, isInstallment: false },
                { id: `d_inv_2_${i}`, description: 'Aporte Meta Viagem', amount: 375, date: month.clone().date(7).format('YYYY-MM-DD'), category: 'Investimentos', type: 'expense', status: 'paid', isRecurring: true, isInstallment: false }
            );
        }

        this.generator = new ReportGenerator(mockSettings);
        this.renderReports();
    }

    private createTabStructure(container: HTMLElement) {
        const tabContainer = container.createDiv({ cls: 'tabs-container' });
        const tabHeaders = tabContainer.createDiv({ cls: 'tabs-headers' });
        const tabContent = tabContainer.createDiv({ cls: 'tabs-content' });

        const tabs: { [key: string]: { header: HTMLElement, content: HTMLElement } } = {};
        const tabNames = ['Dashboard', 'Fluxo de Dinheiro', 'Histórico & Patrimônio', 'Insights'];

        const tabRenderers: { [key: string]: (container: HTMLElement) => void } = {
            'Dashboard': (c) => this.renderDashboardTab(c),
            'Fluxo de Dinheiro': (c) => this.renderSankeyTab(c),
            'Histórico & Patrimônio': (c) => this.renderHistoryTab(c),
            'Insights': (c) => this.renderInsightsTab(c),
        };

        tabNames.forEach((name) => {
            const header = tabHeaders.createEl('h3', { text: name, cls: 'tab-header' });
            const content = tabContent.createDiv({ cls: 'tab-content-item' });
            tabs[name] = { header, content };

            header.addEventListener('click', () => {
                if (this.activeTab === name) return;

                // Deactivate all tabs
                Object.values(tabs).forEach(t => {
                    t.header.removeClass('is-active');
                    t.content.addClass('is-hidden');
                    t.content.empty();
                });
                this.charts.forEach(chart => chart.destroy());
                this.charts = [];

                // Activate the new tab
                header.addClass('is-active');
                content.removeClass('is-hidden');
                this.activeTab = name;

                // Render its content
                tabRenderers[name](content);
            });
        });

        // Set initial active tab styles
        tabs[this.activeTab].header.addClass('is-active');
        tabs[this.activeTab].content.removeClass('is-hidden');

        // Render content for the initially active tab
        tabRenderers[this.activeTab](tabs[this.activeTab].content);
    }

    private renderReports() {
        this.reportContentEl.empty();
        this.charts.forEach(chart => chart.destroy());
        this.charts = [];
        // Note: this.activeTab is preserved on re-renders (e.g., date changes)
        // to stay on the currently selected tab.
        this.createTabStructure(this.reportContentEl);
    }

    private renderDashboardTab(container: HTMLElement) {
        const gridContainer = container.createDiv({ cls: "dashboard-grid-container" });

        // KPIs will be a single report-card that uses kpi-grid internally
        this.renderKPIs(gridContainer.createDiv({ cls: "report-card kpi-area" }));

        // Spending by Category and Monthly Flow will be two separate report-cards
        this.renderSpendingByCategory(gridContainer.createDiv({ cls: "report-card category-chart-area" }));
        this.renderMonthlyFlow(gridContainer.createDiv({ cls: "report-card flow-chart-area" }));
    }

    private renderSankeyTab(container: HTMLElement) {
        // The Sankey chart will be a single report-card
        // The main .nexus-report-content grid will handle its layout
        this.renderSankey(container.createDiv({ cls: "report-card sankey-card" }));
    }

    private renderHistoryTab(container: HTMLElement) {
        // Net Worth and Emergency Fund charts will be two separate report-cards
        // The main .nexus-report-content grid will handle their layout
        this.renderNetWorth(container.createDiv({ cls: "report-card" }));
        this.renderEmergencyFund(container.createDiv({ cls: "report-card" }));
    }

    private renderInsightsTab(container: HTMLElement) {
        // Insights will be a single report-card
        const insightsContainer = container.createDiv({ cls: "report-card insights-card" });
        insightsContainer.createEl('h3', { text: 'Insights Automáticos' });
        const insights = this.generator.getReportSummary(this.startDate, this.endDate);
        this.renderInsights(insights, insightsContainer);
    }

    private renderInsights(insights: { type: 'success' | 'warning' | 'info', text: string, title: string }[], container: HTMLElement) {
        if (!container) return;

        const grid = container.createDiv({ cls: 'insights-grid' });

        if (insights.length === 0) {
            grid.createDiv({ text: "Dados insuficientes para gerar insights neste período." });
            return;
        }

        insights.forEach(insight => {
            const card = grid.createDiv({ cls: `insight-card-item type-${insight.type}` });

            // Icon
            const iconContainer = card.createDiv({ cls: 'insight-icon-container' });
            let iconName = 'info';
            if (insight.type === 'success') iconName = 'trending-up';
            if (insight.type === 'warning') iconName = 'alert-triangle';
            if (insight.type === 'info') iconName = 'info';
            setIcon(iconContainer, iconName);

            // Content
            const content = card.createDiv({ cls: 'insight-content' });
            content.createEl('h4', { text: insight.title });
            content.createEl('p', { text: insight.text });
        });
    }

    private renderKPIs(container: HTMLElement) {
        container.createEl('h3', { text: 'Indicadores Chave' });
        const kpis = this.generator.getDashboardKPIs(this.startDate, this.endDate);

        const kpiGrid = container.createDiv({ cls: 'kpi-grid' });

        const createKpi = (label: string, value: string, subtext?: string, tooltip?: string) => {
            const kpiEl = kpiGrid.createDiv({ cls: 'kpi-item' });
            kpiEl.createDiv({ cls: 'kpi-value', text: value });

            const labelContainer = kpiEl.createDiv({ cls: 'kpi-label-container' });
            labelContainer.createSpan({ text: label, cls: 'kpi-label-text' });

            if (tooltip) {
                const helpIcon = labelContainer.createSpan({ cls: 'kpi-help-icon' });
                setIcon(helpIcon, 'help-circle');
                helpIcon.setAttr('title', tooltip);
                helpIcon.style.marginLeft = '5px';
                helpIcon.style.color = 'var(--text-muted)';
                helpIcon.style.cursor = 'help';
            }

            if (subtext) {
                kpiEl.createDiv({ cls: 'kpi-subtext', text: subtext });
            }
        };

        createKpi('Renda Total', formatAsCurrency(kpis.totalIncome));
        createKpi('Despesas Totais', formatAsCurrency(kpis.totalExpenses));
        createKpi('Saldo Final', formatAsCurrency(kpis.balance));
        createKpi('Taxa de Poupança', `${(kpis.savingsRate * 100).toFixed(1)}%`, undefined, 'Porcentagem da renda que foi economizada.\nCálculo: (Renda - Despesas) / Renda');
        createKpi('Gasto Médio Diário', formatAsCurrency(kpis.avgDailySpending));
        createKpi('Principal Categoria de Gasto', kpis.topSpendingCategory.name, formatAsCurrency(kpis.topSpendingCategory.amount));
    }

    private renderSpendingByCategory(container: HTMLElement) {
        container.createEl('h3', { text: 'Gastos por Categoria' });
        const chartWrapper = container.createDiv({ cls: 'chart-wrapper' });
        chartWrapper.style.height = '300px';
        const canvas = chartWrapper.createEl("canvas");
        const data = this.generator.getSpendingByCategory(this.startDate, this.endDate);

        if (data.labels.length === 0) {
            container.createEl('p', { text: 'Nenhum dado para exibir no período selecionado.', cls: 'no-data-message' });
            return;
        }

        if (!isChartJsLoaded) return;
        const chart = new Chartjs(canvas, {
            type: 'doughnut',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.data,
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.8)', 'rgba(54, 162, 235, 0.8)', 'rgba(255, 206, 86, 0.8)',
                        'rgba(75, 192, 192, 0.8)', 'rgba(153, 102, 255, 0.8)', 'rgba(255, 159, 64, 0.8)',
                        'rgba(199, 199, 199, 0.8)', 'rgba(83, 102, 255, 0.8)', 'rgba(100, 255, 80, 0.8)'
                    ],
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right' },
                    tooltip: {
                        callbacks: {
                            label: function (context: TooltipItem<'doughnut'>) {
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed !== null) {
                                    label += formatAsCurrency(context.parsed);
                                }
                                return label;
                            }
                        }
                    }
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const chartElement = elements[0];
                        const category = data.labels[chartElement.index];
                        this.renderCategoryDetail(category);
                    }
                }
            }
        });
        this.charts.push(chart);
    }

    private renderCategoryDetail(category: string) {
        const detailContainer = this.containerEl.querySelector('.category-detail-container');
        if (detailContainer) detailContainer.remove();

        const container = this.containerEl.children[1].createDiv({ cls: 'category-detail-container' });
        container.createEl('h3', { text: `Detalhes da Categoria: ${category}` });

        const closeButton = container.createEl('button', { cls: 'close-btn' });
        setIcon(closeButton, 'x');
        closeButton.addEventListener('click', () => container.remove());

        const categoryTransactions = (this.plugin as any).settings.transactions.filter((transaction: Transaction) =>
            transaction.category === category &&
            transaction.status === 'paid' &&
            moment(transaction.paymentMonth || transaction.date).isBetween(this.startDate, this.endDate, undefined, '[]')
        )
            .sort((a: Transaction, b: Transaction) => b.amount - a.amount);

        const list = container.createEl('ul');
        categoryTransactions.forEach((tx: Transaction) => {
            const item = list.createEl('li');
            item.createSpan({ text: tx.description, cls: 'transaction-description' });
            item.createSpan({ text: formatAsCurrency(tx.amount), cls: 'transaction-amount' });
        });
    }

    private renderMonthlyFlow(container: HTMLElement) {
        container.createEl('h3', { text: 'Fluxo Mensal (Renda vs. Despesa)' });
        const chartWrapper = container.createDiv({ cls: 'chart-wrapper' });
        chartWrapper.style.height = '300px';
        const canvas = chartWrapper.createEl("canvas");
        const data = this.generator.getMonthlyFlow(this.startDate, this.endDate);

        if (data.labels.length === 0) {
            container.createEl('p', { text: 'Nenhum dado para exibir no período selecionado.', cls: 'no-data-message' });
            return;
        }

        if (!isChartJsLoaded) return;
        const chart = new Chartjs(canvas, {
            type: 'bar',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { stacked: true },
                    y: { stacked: true, beginAtZero: true }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function (context: TooltipItem<'bar'>) {
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
        this.charts.push(chart);
    }

    private renderSankey(container: HTMLElement) {
        container.createEl('h3', { text: 'Fluxo de Renda (Sankey)' });

        const explanationEl = container.createEl('p', { cls: 'report-explanation' });
        explanationEl.innerHTML = 'Este gráfico demonstra visualmente o caminho do seu dinheiro.<br>Ele mostra como sua <b>Renda Total</b> flui para diferentes <b>Categorias de Despesa</b> e quanto sobra como <b>Economia</b>.';

        const chartWrapper = container.createDiv({ cls: 'chart-wrapper' });
        chartWrapper.style.height = '500px';
        const canvas = chartWrapper.createEl("canvas");
        const data = this.generator.getSankeyData(this.startDate, this.endDate);

        if (data.length === 0) {
            container.createEl('p', { text: 'Nenhum dado de renda e despesa para exibir no período selecionado.', cls: 'no-data-message' });
            return;
        }

        if (!isChartJsLoaded) return;
        const chart = new Chartjs(canvas, {
            type: 'sankey',
            data: {
                datasets: [{
                    data: data,
                    colorFrom: () => 'rgba(75, 192, 192, 0.6)',
                    colorTo: () => 'rgba(255, 99, 132, 0.6)',
                    colorMode: 'gradient',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context: TooltipItem<'sankey'>) {
                                const item = context.raw as SankeyDataPoint;
                                return `${item.from} -> ${item.to}: ${formatAsCurrency(item.flow)}`;
                            }
                        }
                    }
                }
            }
        });
        this.charts.push(chart);
    }

    private renderNetWorth(container: HTMLElement) {
        container.createEl('h3', { text: 'Histórico de Patrimônio Líquido' });
        container.createEl('small', {
            text: 'Soma total acumulada de: Reserva de Emergência + Metas de Economia',
            cls: 'chart-subtitle'
        });

        if (!this.generator.hasSufficientHistory(6)) {
            const msgContainer = container.createDiv({ cls: 'no-data-message' });
            msgContainer.createEl('p', { text: 'Gráfico indisponível: Necessário pelo menos 6 meses de histórico registrado.' });
            msgContainer.createEl('p', { text: 'Continue registrando seu progresso!', cls: 'text-muted small' });
            return;
        }

        const chartWrapper = container.createDiv({ cls: 'chart-wrapper' });
        chartWrapper.style.height = '300px';
        const canvas = chartWrapper.createEl("canvas");
        const data = this.generator.getNetWorthHistory(this.startDate, this.endDate);

        if (data.labels.length === 0) {
            container.createEl('p', { text: 'Nenhum dado para exibir no período selecionado.', cls: 'no-data-message' });
            return;
        }

        if (!isChartJsLoaded) return;
        const chart = new Chartjs(canvas, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Patrimônio Líquido',
                    data: data.data,
                    borderColor: 'rgba(153, 102, 255, 1)',
                    backgroundColor: 'rgba(153, 102, 255, 0.2)',
                    fill: true,
                    tension: 0.1,
                }]
            },
            options: this.getLineChartOptions()
        });
        this.charts.push(chart);
    }

    private renderEmergencyFund(container: HTMLElement) {
        container.createEl('h3', { text: 'Histórico do Fundo de Emergência' });

        if (!this.generator.hasSufficientHistory(6)) {
            const msgContainer = container.createDiv({ cls: 'no-data-message' });
            msgContainer.createEl('p', { text: 'Gráfico indisponível: Necessário pelo menos 6 meses de histórico registrado.' });
            msgContainer.createEl('p', { text: 'Continue construindo sua reserva!', cls: 'text-muted small' });
            return;
        }

        const chartWrapper = container.createDiv({ cls: 'chart-wrapper' });
        chartWrapper.style.height = '300px';
        const canvas = chartWrapper.createEl("canvas");
        const data = this.generator.getEmergencyFundHistory(this.startDate, this.endDate);

        if (data.labels.length === 0) {
            container.createEl('p', { text: 'Nenhum dado para exibir no período selecionado.', cls: 'no-data-message' });
            return;
        }

        if (!isChartJsLoaded) return;
        const chart = new Chartjs(canvas, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Saldo do Fundo de Emergência',
                    data: data.data,
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    fill: true,
                    tension: 0.1,
                }]
            },
            options: this.getLineChartOptions()
        });
        this.charts.push(chart);
    }

    private getLineChartOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: false } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context: TooltipItem<'line'>) {
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
        };
    }
}
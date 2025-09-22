import { ItemView, WorkspaceLeaf, moment, setIcon, Notice } from "obsidian";
import NexusHubPlugin from "./main";
import { t } from "./lang";
import { eventManager } from "./EventManager";
import { formatAsCurrency } from "./helpers";
import { ReportGenerator, SankeyDataPoint } from "./report-generator";
import { Chart, ChartTypeRegistry, TooltipItem, ScriptableContext, ActiveElement } from "chart.js/auto";
import { SankeyController, Flow } from 'chartjs-chart-sankey';
// Nota: Esta funcionalidade requer a biblioteca 'xlsx' (SheetJS).
// Em um projeto real, ela seria adicionada via: npm install xlsx
import * as XLSX from 'xlsx';

// Registra os novos tipos de gráfico
Chart.register(SankeyController, Flow);

export const NEXUS_REPORT_VIEW_TYPE = "nexus-report-view";

export class ReportView extends ItemView {
    plugin: NexusHubPlugin;
    private generator: ReportGenerator;
    private pieChart: Chart | null = null;
    private barChart: Chart<'bar', number[], string> | null = null;
    private sankeyChart: Chart<'sankey', SankeyDataPoint[], unknown> | null = null;
    private netWorthChart: Chart | null = null;
    private kpiElements: Record<string, HTMLElement> = {};
    private startDate: moment.Moment;
    private endDate: moment.Moment;
    private currentView: 'default' | 'drilldown' | 'annual' = 'default';
    private drilldownCategory: string | null = null; // Still needed for the category name

    constructor(leaf: WorkspaceLeaf, plugin: NexusHubPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.generator = new ReportGenerator(this.plugin.settings);
        this.endDate = moment().endOf('day');
        this.startDate = moment().subtract(30, 'days').startOf('day');
    }

    getViewType(): string {
        return NEXUS_REPORT_VIEW_TYPE;
    }

    getDisplayText(): string {
        return t('REPORT_VIEW_TITLE');
    }

    getIcon(): string {
        return "pie-chart";
    }

    async onClose() {
        this.pieChart?.destroy();
        this.barChart?.destroy();
        this.sankeyChart?.destroy();
        this.netWorthChart?.destroy();
        this.pieChart?.destroy(); // pieChart is reused for annual view, ensure it's destroyed
        this.kpiElements = {};
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass("nexus-report-container");

        container.createEl("h2", { text: t('REPORT_VIEW_TITLE') });

        // --- Filtros Avançados ---
        const filterContainer = container.createDiv({ cls: "report-filters" });

        const dateFilterGroup = filterContainer.createDiv();
        dateFilterGroup.createEl('label', { text: t('REPORT_VIEW_FROM_LABEL') });
        const startDateInput = dateFilterGroup.createEl('input', { type: 'date' });
        startDateInput.value = this.startDate.format('YYYY-MM-DD');
        
        dateFilterGroup.createEl('label', { text: t('REPORT_VIEW_TO_LABEL') });
        const endDateInput = dateFilterGroup.createEl('input', { type: 'date' });
        endDateInput.value = this.endDate.format('YYYY-MM-DD');

        const presetFilterGroup = filterContainer.createDiv();
        const btn30 = presetFilterGroup.createEl("button", { text: t('REPORT_VIEW_PRESET_30D') });
        const btn90 = presetFilterGroup.createEl("button", { text: t('REPORT_VIEW_PRESET_90D') });
        const btn365 = presetFilterGroup.createEl("button", { text: t('REPORT_VIEW_PRESET_1Y') });
        const btnYear = presetFilterGroup.createEl("button", { text: t('REPORT_VIEW_PRESET_YTD') });

        const exportBtn = filterContainer.createEl("button", { text: t('REPORT_VIEW_EXPORT_BUTTON') });
        setIcon(exportBtn, 'download');
        exportBtn.addClass('mod-cta');

        // --- Event Listeners ---
        const updateAndRender = () => {
            this.startDate = moment(startDateInput.value).startOf('day');
            this.endDate = moment(endDateInput.value).endOf('day');
            this.currentView = 'default';
            this.renderCharts();
        };

        startDateInput.addEventListener('change', updateAndRender);
        endDateInput.addEventListener('change', updateAndRender);

        btn30.addEventListener('click', () => {
            this.endDate = moment().endOf('day');
            this.startDate = moment().subtract(30, 'days').startOf('day');
            startDateInput.value = this.startDate.format('YYYY-MM-DD');
            endDateInput.value = this.endDate.format('YYYY-MM-DD');
            this.currentView = 'default';
            this.renderCharts();
        });
        btn90.addEventListener('click', () => {
            this.endDate = moment().endOf('day');
            this.startDate = moment().subtract(90, 'days').startOf('day');
            startDateInput.value = this.startDate.format('YYYY-MM-DD');
            endDateInput.value = this.endDate.format('YYYY-MM-DD');
            this.currentView = 'default';
            this.renderCharts();
        });
        btn365.addEventListener('click', () => {
            this.endDate = moment().endOf('day');
            this.startDate = moment().subtract(1, 'year').startOf('day');
            startDateInput.value = this.startDate.format('YYYY-MM-DD');
            endDateInput.value = this.endDate.format('YYYY-MM-DD');
            this.currentView = 'default';
            this.renderCharts();
        });
        btnYear.addEventListener('click', () => {
            this.currentView = 'annual';
            this.renderCharts();
        });

        exportBtn.addEventListener('click', () => this.exportToExcel());

        // --- KPIs ---
        const kpiContainer = container.createDiv({ cls: 'kpi-container' });
        
        const balanceCard = kpiContainer.createDiv({ cls: 'kpi-card' });
        this.kpiElements.balance = balanceCard.createDiv({ cls: 'kpi-value' });
        balanceCard.createDiv({ cls: 'kpi-label', text: t('REPORT_VIEW_KPI_BALANCE') });

        const savingsRateCard = kpiContainer.createDiv({ cls: 'kpi-card' });
        this.kpiElements.savingsRate = savingsRateCard.createDiv({ cls: 'kpi-value' });
        savingsRateCard.createDiv({ cls: 'kpi-label', text: t('REPORT_VIEW_KPI_SAVINGS_RATE') });

        const topCategoryCard = kpiContainer.createDiv({ cls: 'kpi-card' });
        this.kpiElements.topCategory = topCategoryCard.createDiv({ cls: 'kpi-value' });
        topCategoryCard.createDiv({ cls: 'kpi-label', text: t('REPORT_VIEW_KPI_TOP_SPEND') });

        const avgDailyCard = kpiContainer.createDiv({ cls: 'kpi-card' });
        this.kpiElements.avgDaily = avgDailyCard.createDiv({ cls: 'kpi-value' });
        avgDailyCard.createDiv({ cls: 'kpi-label', text: t('REPORT_VIEW_KPI_AVG_DAILY') });


        // --- Summary Text ---
        const summaryContainer = container.createDiv({ cls: 'report-summary-container' });
        summaryContainer.createEl('h3', { text: t('REPORT_VIEW_ANALYSIS_TITLE') });

        // --- Annual View Container (initially hidden) ---
        const annualContainer = container.createDiv({ cls: 'annual-summary-view is-hidden' });
        annualContainer.createEl("canvas", { attr: { id: "annual-category-chart" } });


        // --- Chart Grid ---
        const chartGrid = container.createDiv({ cls: 'chart-grid' });

        const pieChartContainer = chartGrid.createDiv({ cls: "chart-container" });
        const pieChartHeader = pieChartContainer.createDiv({ cls: 'chart-header' });
        pieChartHeader.createEl('h3', { text: t('REPORT_VIEW_SPENDING_BY_CAT_TITLE') });
        pieChartContainer.createEl("canvas", { attr: { id: "category-pie-chart" } });

        // Add a wrapper to easily hide/show the bar chart during drilldown
        const barChartWrapper = chartGrid.createDiv({ attr: { id: 'bar-chart-wrapper' }});
        const barChartContainer = barChartWrapper.createDiv({ cls: "chart-container" });
        barChartContainer.createEl('h3', { text: t('REPORT_VIEW_INCOME_VS_EXPENSE_TITLE') });
        barChartContainer.createEl("canvas", { attr: { id: "monthly-flow-chart" } });

        // Sankey Chart Container
        const sankeyChartContainer = chartGrid.createDiv({ cls: "chart-container full-width-chart" }); // Full width
        sankeyChartContainer.createEl('h3', { text: t('REPORT_VIEW_CASH_FLOW_TITLE') });
        sankeyChartContainer.createEl("canvas", { attr: { id: "sankey-flow-chart" } });

        // Net Worth Chart Container
        const netWorthChartContainer = chartGrid.createDiv({ cls: "chart-container full-width-chart" }); // Full width
        netWorthChartContainer.createEl('h3', { text: t('REPORT_VIEW_NET_WORTH_TITLE') });
        netWorthChartContainer.createEl("canvas", { attr: { id: "net-worth-chart" } });

        // Initial render
        this.renderCharts();
    }

    private renderCharts() {
        switch (this.currentView) {
            case 'annual':
                this.renderAnnualView();
                break;
            case 'drilldown':
                if (this.drilldownCategory) this.renderDrilldownView(this.drilldownCategory);
                break;
            case 'default':
            default:
                this.showDefaultView();
                this.renderKPIs();
                this.renderMainChartsView();
                break;
        }
    }


    private renderKPIs() {
        const kpis = this.generator.getDashboardKPIs(this.startDate, this.endDate);

        this.kpiElements.balance.setText(formatAsCurrency(kpis.balance));
        this.kpiElements.balance.toggleClass('is-negative', kpis.balance < 0);

        this.kpiElements.savingsRate.setText(`${(kpis.savingsRate * 100).toFixed(1)}%`);
        this.kpiElements.savingsRate.toggleClass('is-negative', kpis.savingsRate < 0);

        this.kpiElements.topCategory.setText(kpis.topSpendingCategory.name);
        this.kpiElements.topCategory.setAttr('title', formatAsCurrency(kpis.topSpendingCategory.amount));

        this.kpiElements.avgDaily.setText(formatAsCurrency(kpis.avgDailySpending));

        this.renderSummaryText();
    }

    private renderSummaryText() {
        const summaryContainer = this.containerEl.querySelector('.report-summary-container');
        if (!summaryContainer) return;

        // Clear previous summary
        summaryContainer.querySelectorAll('p').forEach(p => p.remove());

        const insights = this.generator.getReportSummary(this.startDate, this.endDate);
        insights.forEach(insight => {
            summaryContainer.createEl('p', { text: `• ${insight}` });
        });
    }

    private renderMainChartsView() {
        this.renderPieChart(); // Renders the main category pie chart
        this.renderBarChart(); // Renders the income/expense bar chart
        this.renderSankeyChart();
        this.renderNetWorthChart();
    }

    private renderPieChart() {
        if (this.pieChart) {
            this.pieChart.destroy();
        }
        const pieChartCanvas = this.containerEl.querySelector("#category-pie-chart") as HTMLCanvasElement;
        const spendingData = this.generator.getSpendingByCategory(this.startDate, this.endDate);

        // --- Header and Back Button ---
        const headerEl = pieChartCanvas.parentElement?.querySelector('.chart-header') as HTMLElement;
        if (headerEl) {
            (headerEl.querySelector('h3') as HTMLElement).setText(t('REPORT_VIEW_SPENDING_BY_CAT_TITLE'));
            headerEl.querySelector('.back-btn')?.remove();
        }

        this.pieChart = new Chart(pieChartCanvas, {
            type: 'pie',
            data: {
                labels: spendingData.labels,
                datasets: [{
                    label: t('REPORT_VIEW_SPENDING_BY_CAT_TITLE'),
                    data: spendingData.data,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const chartElement = elements[0];
                        const index = chartElement.index;
                        const category = spendingData.labels[index];
                        this.drilldownCategory = category; // Set the category for drilldown
                        this.currentView = 'drilldown'; // Change the view state
                        this.renderCharts();
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context: TooltipItem<'pie'>) {
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed !== null) {
                                    label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    private renderDrilldownView(category: string) {
        // 1. Hide the bar chart
        const barChartWrapper = this.containerEl.querySelector('#bar-chart-wrapper') as HTMLElement;
        if (barChartWrapper) barChartWrapper.addClass('is-hidden');
        // Hide Sankey chart as well
        const sankeyChartContainer = this.containerEl.querySelector('#sankey-flow-chart')?.parentElement as HTMLElement;
        if (sankeyChartContainer) sankeyChartContainer.addClass('is-hidden');
        // Hide Net Worth chart
        const netWorthChartContainer = this.containerEl.querySelector('#net-worth-chart')?.parentElement as HTMLElement;
        if (netWorthChartContainer) netWorthChartContainer.addClass('is-hidden');


        // 2. Destroy the old pie chart
        if (this.pieChart) this.pieChart.destroy();

        // 3. Prepare the canvas and data for the new bar chart
        const drilldownCanvas = this.containerEl.querySelector("#category-pie-chart") as HTMLCanvasElement;
        const drilldownData = this.generator.getSpendingByDescriptionForCategory(category, this.startDate, this.endDate);

        // 4. Update the header with the category name and a "Back" button
        const headerEl = drilldownCanvas.parentElement?.querySelector('.chart-header') as HTMLElement;
        if (headerEl) {
            (headerEl.querySelector('h3') as HTMLElement).setText(t('REPORT_VIEW_DRILLDOWN_TITLE', { category }));
            // Remove old button before adding a new one
            headerEl.querySelector('.back-btn')?.remove();
            const backBtn = headerEl.createEl('button', { text: t('REPORT_VIEW_BACK_BUTTON'), cls: 'back-btn' });
            backBtn.addEventListener('click', () => { // On back, return to default view
                this.currentView = 'default';
                this.renderCharts();
            });
        }

        // 5. Render the new bar chart in place of the pie chart
        this.pieChart = new Chart(drilldownCanvas, {
            type: 'bar',
            data: {
                labels: drilldownData.labels,
                datasets: [{
                    label: `Despesas em ${category}`,
                    data: drilldownData.data,
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y', // Horizontal bar chart for better readability
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: { beginAtZero: true } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context: TooltipItem<'bar'>) {
                                let label = context.label || '';
                                if (label) label += ': ';
                                if (context.parsed.x !== null) label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.x);
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    private renderBarChart() {
        if (this.barChart) {
            this.barChart.destroy();
        }
        const barChartCanvas = this.containerEl.querySelector("#monthly-flow-chart") as HTMLCanvasElement;
        const flowData = this.generator.getMonthlyFlow(this.startDate, this.endDate);

        // Ensure the bar chart wrapper is visible
        const barChartWrapper = this.containerEl.querySelector('#bar-chart-wrapper') as HTMLElement;
        if (barChartWrapper) barChartWrapper.removeClass('is-hidden');
        // Ensure Sankey chart is visible
        const sankeyChartContainer = this.containerEl.querySelector('#sankey-flow-chart')?.parentElement as HTMLElement;
        if (sankeyChartContainer) sankeyChartContainer.removeClass('is-hidden');
        // Ensure Net Worth chart is visible
        const netWorthChartContainer = this.containerEl.querySelector('#net-worth-chart')?.parentElement as HTMLElement;
        if (netWorthChartContainer) netWorthChartContainer.removeClass('is-hidden');


        this.barChart = new Chart(barChartCanvas, {
            type: 'bar',
            data: flowData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const chartElement = elements[0];
                        const index = chartElement.index;
                        const monthLabel = flowData.labels[index]; // Ex: "Jan/24"
                        const targetMonth = moment(monthLabel, 'MMM/YY');
                        eventManager.emit('navigate-to-month', targetMonth); // Navigate to the main view for that month
                        this.plugin.activateView();
                    }
                },
                scales: { y: { beginAtZero: true } },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context: TooltipItem<'bar'>) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    private renderSankeyChart() {
        if (this.sankeyChart) {
            this.sankeyChart.destroy();
        }
        const sankeyCanvas = this.containerEl.querySelector("#sankey-flow-chart") as HTMLCanvasElement;
        if (!sankeyCanvas) return;

        const parent = sankeyCanvas.parentElement;
        const sankeyData = this.generator.getSankeyData(this.startDate, this.endDate);

        if (sankeyData.length === 0 && parent) {
            parent.addClass('is-hidden');
            return;
        }
        if (parent) parent.removeClass('is-hidden');

        this.sankeyChart = new Chart(sankeyCanvas, {
            type: 'sankey',
            data: {
                datasets: [{
                    label: t('REPORT_VIEW_SANKEY_CHART_LABEL'),
                    data: sankeyData,
                    colorFrom: (_c: ScriptableContext<'sankey'>) => 'rgba(75, 192, 192, 0.6)',
                    colorTo: (c: ScriptableContext<'sankey'>) => {
                        const raw = c.raw as SankeyDataPoint;
                        if (raw.to === t('REPORT_VIEW_SANKEY_SAVED')) return 'rgba(153, 102, 255, 0.6)';
                        return 'rgba(255, 99, 132, 0.6)';
                    },
                    colorMode: 'gradient',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const rawData = (elements[0].element as any).$context.raw as SankeyDataPoint;
                        
                        if (rawData && rawData.to) {
                            const category = rawData.to;
                            // Permite o drill-down apenas em categorias de despesa reais, ignorando os nós de origem/fim.
                            if (category !== t('REPORT_VIEW_SANKEY_TOTAL_INCOME') && category !== t('REPORT_VIEW_SANKEY_SAVED')) {
                                this.drilldownCategory = category;
                                this.currentView = 'drilldown'; // Define o modo de visualização para drilldown
                                this.renderCharts(); // Dispara a renderização da visão de drill-down
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (context: TooltipItem<'sankey'>) => {
                                const item = context.raw as SankeyDataPoint;
                                return t('REPORT_VIEW_SANKEY_TOOLTIP', { from: item.from, to: item.to, flow: formatAsCurrency(item.flow) });
                            }
                        }
                    }
                }
            }
        });
    }

    private renderNetWorthChart() {
        if (this.netWorthChart) {
            this.netWorthChart.destroy();
        }
        const netWorthCanvas = this.containerEl.querySelector("#net-worth-chart") as HTMLCanvasElement;
        if (!netWorthCanvas) return;

        const historyData = this.generator.getNetWorthHistory(this.startDate, this.endDate);

        this.netWorthChart = new Chart(netWorthCanvas, {
            type: 'line',
            data: {
                labels: historyData.labels,
                datasets: [{
                    label: t('REPORT_VIEW_NET_WORTH_CHART_LABEL'),
                    data: historyData.data,
                    fill: true,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatAsCurrency(Number(value));
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context: TooltipItem<'line'>) {
                                const currentValue = context.parsed.y;
                                if (currentValue === null) return '';
                                return t('REPORT_VIEW_NET_WORTH_TOOLTIP_BALANCE', { balance: formatAsCurrency(currentValue) });
                            },
                            afterLabel: function(context: TooltipItem<'line'>) {
                                // Mostra a variação em relação ao ponto anterior
                                if (context.dataIndex > 0) {
                                    const currentValue = context.parsed.y;
                                    const previousValue = context.dataset.data[context.dataIndex - 1] as number;
                                    const change = currentValue - previousValue;
                                    
                                    const sign = change >= 0 ? '+' : '';
                                    const changeText = formatAsCurrency(change);
                                    return t('REPORT_VIEW_NET_WORTH_TOOLTIP_CHANGE', { change: `${sign}${changeText}` });
                                }
                                return '';
                            }
                        }
                    }
                }
            }
        });
    }

    private renderAnnualView() {
        // 1. Hide the default view elements
        this.hideDefaultView();

        // 2. Show the annual view container
        const annualContainer = this.containerEl.querySelector('.annual-summary-view') as HTMLElement;
        if (!annualContainer) return;
        annualContainer.removeClass('is-hidden');
        annualContainer.empty(); // Clear previous content

        // 3. Get annual data
        const currentYear = moment().year();
        const annualData = this.generator.getAnnualSummary(currentYear);

        // 4. Render Annual Header and Back Button
        const header = annualContainer.createDiv({ cls: 'chart-header' });
        header.createEl('h3', { text: t('REPORT_VIEW_ANNUAL_SUMMARY_TITLE', { year: currentYear }) });
        const backBtn = header.createEl('button', { text: t('REPORT_VIEW_BACK_BUTTON'), cls: 'back-btn' });
        backBtn.addEventListener('click', () => {
            this.currentView = 'default';
            this.renderCharts();
        });

        // 5. Render Annual KPIs
        const kpiContainer = annualContainer.createDiv({ cls: 'kpi-container' });
        
        const incomeCard = kpiContainer.createDiv({ cls: 'kpi-card' });
        incomeCard.createDiv({ cls: 'kpi-value', text: formatAsCurrency(annualData.totalIncome) });
        incomeCard.createDiv({ cls: 'kpi-label', text: t('REPORT_VIEW_ANNUAL_KPI_INCOME') });

        const expenseCard = kpiContainer.createDiv({ cls: 'kpi-card' });
        expenseCard.createDiv({ cls: 'kpi-value', text: formatAsCurrency(annualData.totalExpenses) });
        expenseCard.createDiv({ cls: 'kpi-label', text: t('REPORT_VIEW_ANNUAL_KPI_EXPENSE') });

        const balanceCard = kpiContainer.createDiv({ cls: 'kpi-card' });
        const balanceValue = balanceCard.createDiv({ cls: 'kpi-value', text: formatAsCurrency(annualData.balance) });
        balanceValue.toggleClass('is-negative', annualData.balance < 0);
        balanceCard.createDiv({ cls: 'kpi-label', text: t('REPORT_VIEW_ANNUAL_KPI_BALANCE') });

        const savingsCard = kpiContainer.createDiv({ cls: 'kpi-card' });
        const savingsValue = savingsCard.createDiv({ cls: 'kpi-value', text: formatAsCurrency(annualData.avgMonthlySavings) });
        savingsValue.toggleClass('is-negative', annualData.avgMonthlySavings < 0);
        savingsCard.createDiv({ cls: 'kpi-label', text: t('REPORT_VIEW_ANNUAL_KPI_AVG_SAVINGS') });

        // 6. Render Annual Spending Chart
        const chartCanvas = annualContainer.createEl("canvas");
        if (this.pieChart) this.pieChart.destroy(); // Reuse pieChart variable

        this.pieChart = new Chart(chartCanvas, {
            type: 'bar',
            data: {
                labels: annualData.spendingLabels,
                datasets: [{
                    label: t('REPORT_VIEW_ANNUAL_CHART_LABEL', { year: currentYear }),
                    data: annualData.spendingData,
                    backgroundColor: 'rgba(153, 102, 255, 0.6)',
                    borderColor: 'rgba(153, 102, 255, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: { beginAtZero: true } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context: TooltipItem<'bar'>) => formatAsCurrency(context.parsed.x)
                        }
                    }
                }
            }
        });
    }

    private hideDefaultView() {
        (this.containerEl.querySelector('.kpi-container') as HTMLElement)?.addClass('is-hidden');
        (this.containerEl.querySelector('.report-summary-container') as HTMLElement)?.addClass('is-hidden');
        (this.containerEl.querySelector('.chart-grid') as HTMLElement)?.addClass('is-hidden');
        (this.containerEl.querySelector('.annual-summary-view') as HTMLElement)?.addClass('is-hidden');
    }

    private showDefaultView() {
        (this.containerEl.querySelector('.kpi-container') as HTMLElement)?.removeClass('is-hidden');
        (this.containerEl.querySelector('.report-summary-container') as HTMLElement)?.removeClass('is-hidden');
        (this.containerEl.querySelector('.chart-grid') as HTMLElement)?.removeClass('is-hidden');
        (this.containerEl.querySelector('.annual-summary-view') as HTMLElement)?.addClass('is-hidden');
    }

    private async exportToExcel() {
        new Notice(t('REPORT_VIEW_EXPORT_NOTICE_GENERATING'));
    
        try {
            // 1. Dados para a Aba 1: Despesas por Categoria
            const spendingData = this.generator.getSpendingByCategory(this.startDate, this.endDate);
            const spendingSheetData = [
                [t('REPORT_VIEW_EXPORT_HEADER_CATEGORY'), t('REPORT_VIEW_EXPORT_HEADER_SPENT')],
                ...spendingData.labels.map((label, index) => [label, spendingData.data[index]])
            ];
            const spendingWorksheet = XLSX.utils.aoa_to_sheet(spendingSheetData);
    
            // 2. Dados para a Aba 2: Fluxo de Caixa Mensal
            const flowData = this.generator.getMonthlyFlow(this.startDate, this.endDate);
            const flowSheetData = [
                [t('REPORT_VIEW_EXPORT_HEADER_MONTH'), t('REPORT_VIEW_EXPORT_HEADER_INCOME'), t('REPORT_VIEW_EXPORT_HEADER_EXPENSE')],
                ...flowData.labels.map((label, index) => [
                    label,
                    flowData.datasets[0].data[index], // Receitas
                    flowData.datasets[1].data[index]  // Despesas
                ])
            ];
            const flowWorksheet = XLSX.utils.aoa_to_sheet(flowSheetData);

            // 3. Dados para a Aba 3: Todas as Transações
            const allTransactions = this.plugin.settings.transactions
                .filter(transaction => moment(transaction.date).isBetween(this.startDate, this.endDate, undefined, '[]'))
                .sort((a, b) => moment(a.date).diff(moment(b.date)))
                .map(tx => [
                    moment(tx.date).format('YYYY-MM-DD'),
                    tx.description,
                    tx.category,
                    tx.type === 'income' ? t('REPORT_VIEW_EXPORT_TYPE_INCOME') : t('REPORT_VIEW_EXPORT_TYPE_EXPENSE'),
                    tx.amount,
                    tx.status === 'paid' ? t('REPORT_VIEW_EXPORT_STATUS_PAID') : t('REPORT_VIEW_EXPORT_STATUS_PENDING')
                ]);

            const allTransactionsSheetData = [
                [t('REPORT_VIEW_EXPORT_HEADER_DATE'), t('REPORT_VIEW_EXPORT_HEADER_DESC'), t('REPORT_VIEW_EXPORT_HEADER_CATEGORY'), t('REPORT_VIEW_EXPORT_HEADER_TYPE'), t('REPORT_VIEW_EXPORT_HEADER_VALUE'), t('REPORT_VIEW_EXPORT_HEADER_STATUS')],
                ...allTransactions
            ];
            const allTransactionsWorksheet = XLSX.utils.aoa_to_sheet(allTransactionsSheetData);
    
            // 4. Cria o Workbook e inicia o download
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, spendingWorksheet, t('REPORT_VIEW_EXPORT_SHEET_SPENDING'));
            XLSX.utils.book_append_sheet(workbook, flowWorksheet, t('REPORT_VIEW_EXPORT_SHEET_FLOW'));
            XLSX.utils.book_append_sheet(workbook, allTransactionsWorksheet, t('REPORT_VIEW_EXPORT_SHEET_ALL_TX'));
    
            const fileName = t('REPORT_VIEW_EXPORT_FILENAME', { date: moment().format('YYYY-MM-DD') }) + '.xlsx';
            XLSX.writeFile(workbook, fileName);
    
        } catch (error) {
            console.error("Erro ao exportar para Excel:", error);
            new Notice(t('REPORT_VIEW_EXPORT_NOTICE_ERROR'));
        }
    }
}
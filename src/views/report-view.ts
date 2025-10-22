// Force re-compile
import { moment, ItemView, WorkspaceLeaf, setIcon, Setting } from "obsidian";
import NexusHubPlugin from "../main";

import { eventManager } from "../helpers/EventManager";
import { formatAsCurrency } from "../helpers/helpers";
import { ReportGenerator, SankeyDataPoint } from "../services/report-generator";
import { Chart, TooltipItem } from "chart.js/auto";
import 'chartjs-chart-sankey';
import { Transaction } from "./settings";

export const NEXUS_REPORT_VIEW_TYPE = "nexus-report-view";

export class ReportView extends ItemView {
    plugin: NexusHubPlugin;
    private generator: ReportGenerator;
    private charts: Chart[] = [];
    private startDate: moment.Moment;
    private endDate: moment.Moment;

    constructor(leaf: WorkspaceLeaf, plugin: NexusHubPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.generator = new ReportGenerator(this.plugin.settings);
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
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass("nexus-reports-container");

        this.renderDateFilters(container);
        this.renderReports(container);

        const onDataChange = () => {
            this.generator = new ReportGenerator(this.plugin.settings);
            this.renderReports(container);
        };
        eventManager.on('data-changed', onDataChange);
        this.register(() => eventManager.off('data-changed', onDataChange));
    }

    private renderDateFilters(container: Element) {
        const filterContainer = container.createDiv({ cls: "report-filters" });

        new Setting(filterContainer)
            .setName('Período')
            .addDropdown(dropdown => {
                dropdown.addOption("this_month", 'Este Mês');
                dropdown.addOption("last_month", 'Mês Passado');
                dropdown.addOption("this_year", 'Este Ano');
                dropdown.addOption("last_year", 'Ano Passado');
                dropdown.addOption("all_time", 'Desde o Início');
                dropdown.addOption("custom", 'Personalizado');
                dropdown.setValue("this_month");
                dropdown.onChange(value => {
                    const customContainer = filterContainer.querySelector('.custom-date-container') as HTMLElement;
                    if (value === "custom") {
                        customContainer.removeClass("is-hidden");
                        return;
                    }
                    customContainer.addClass("is-hidden");

                    switch (value) {
                        case "this_month":
                            this.startDate = moment().startOf('month');
                            this.endDate = moment().endOf('month');
                            break;
                        case "last_month":
                            this.startDate = moment().subtract(1, 'month').startOf('month');
                            this.endDate = moment().subtract(1, 'month').endOf('month');
                            break;
                        case "this_year":
                            this.startDate = moment().startOf('year');
                            this.endDate = moment().endOf('year');
                            break;
                        case "last_year":
                            this.startDate = moment().subtract(1, 'year').startOf('year');
                            this.endDate = moment().subtract(1, 'year').endOf('year');
                            break;
                        case "all_time":
                            this.startDate = moment(new Date(0)); // Epoch
                            this.endDate = moment();
                            break;
                    }
                    const startDateInput = filterContainer.querySelector('.start-date') as HTMLInputElement;
                    const endDateInput = filterContainer.querySelector('.end-date') as HTMLInputElement;
                    startDateInput.value = this.startDate.format('YYYY-MM-DD');
                    endDateInput.value = this.endDate.format('YYYY-MM-DD');
                    this.renderReports(this.containerEl.children[1]);
                });
            });

        const customDateContainer = filterContainer.createDiv({ cls: "custom-date-container is-hidden" });
        
        new Setting(customDateContainer)
            .setName('Data Inicial')
            .addText(text => {
                text.inputEl.type = 'date';
                text.inputEl.addClass('start-date');
                text.setValue(this.startDate.format('YYYY-MM-DD'));
                text.onChange(() => {
                    this.startDate = moment(text.getValue());
                    this.renderReports(this.containerEl.children[1]);
                });
            });

        new Setting(customDateContainer)
            .setName('Data Final')
            .addText(text => {
                text.inputEl.type = 'date';
                text.inputEl.addClass('end-date');
                text.setValue(this.endDate.format('YYYY-MM-DD'));
                text.onChange(() => {
                    this.endDate = moment(text.getValue());
                    this.renderReports(this.containerEl.children[1]);
                });
            });
    }

    private renderReports(container: Element) {
        // Clear existing reports and charts
        const reportsGrid = container.querySelector('.reports-grid');
        if (reportsGrid) reportsGrid.remove();
        this.charts.forEach(chart => chart.destroy());
        this.charts = [];

        const grid = container.createDiv({ cls: "reports-grid" });

        // 1. KPIs
        this.renderKPIs(grid.createDiv({ cls: "report-card kpi-card" }));

        // 2. Spending by Category
        this.renderSpendingByCategory(grid.createDiv({ cls: "report-card" }));

        // 3. Monthly Flow
        this.renderMonthlyFlow(grid.createDiv({ cls: "report-card" }));

        // 4. Sankey
        this.renderSankey(grid.createDiv({ cls: "report-card sankey-card" }));

        // 5. Net Worth
        this.renderNetWorth(grid.createDiv({ cls: "report-card" }));

        // 6. Emergency Fund
        this.renderEmergencyFund(grid.createDiv({ cls: "report-card" }));

        // 7. Insights
        const insightsContainer = grid.createDiv({ cls: "report-card insights-card" });
        insightsContainer.createEl('h3', { text: 'Insights Automáticos' });
        const insights = this.generator.getReportSummary(this.startDate, this.endDate);
        this.renderInsights(insights.map(insight => insight));
    }

    private renderInsights(insights: string[]) {
        const container = this.containerEl.querySelector('.insights-card');
        if (!container) return;

        const list = container.createEl('ul');
        insights.forEach(insight => {
            const item = list.createEl('li');
            const icon = item.createSpan({ cls: 'insight-icon' });
            setIcon(icon, 'sparkles');
            item.createSpan({ text: insight });
        });
    }

    private renderKPIs(container: HTMLElement) {
        container.createEl('h3', { text: 'Indicadores Chave' });
        const kpis = this.generator.getDashboardKPIs(this.startDate, this.endDate);

        const kpiGrid = container.createDiv({ cls: 'kpi-grid' });

        const createKpi = (label: string, value: string, subtext?: string) => {
            const kpiEl = kpiGrid.createDiv({ cls: 'kpi-item' });
            kpiEl.createDiv({ cls: 'kpi-value', text: value });
            kpiEl.createDiv({ cls: 'kpi-label', text: label });
            if (subtext) {
                kpiEl.createDiv({ cls: 'kpi-subtext', text: subtext });
            }
        };

        createKpi('Renda Total', formatAsCurrency(kpis.totalIncome));
        createKpi('Despesas Totais', formatAsCurrency(kpis.totalExpenses));
        createKpi('Saldo Final', formatAsCurrency(kpis.balance));
        createKpi('Taxa de Poupança', `${(kpis.savingsRate * 100).toFixed(1)}%`);
        createKpi('Gasto Médio Diário', formatAsCurrency(kpis.avgDailySpending));
        createKpi('Principal Categoria de Gasto', kpis.topSpendingCategory.name, formatAsCurrency(kpis.topSpendingCategory.amount));
    }

    private renderSpendingByCategory(container: HTMLElement) {
        container.createEl('h3', { text: 'Gastos por Categoria' });
        const canvas = container.createEl("canvas");
        const data = this.generator.getSpendingByCategory(this.startDate, this.endDate);

        if (data.labels.length === 0) {
            container.createEl('p', { text: 'Nenhum dado para exibir no período selecionado.', cls: 'no-data-message' });
            return;
        }

        const chart = new Chart(canvas, {
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
                            label: function(context: TooltipItem<'doughnut'>) {
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

        const categoryTransactions = this.plugin.settings.transactions.filter((transaction: Transaction) =>
            transaction.category === category &&
            transaction.status === 'paid' &&
            moment(transaction.date).isBetween(this.startDate, this.endDate, undefined, '[]')
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
        const canvas = container.createEl("canvas");
        const data = this.generator.getMonthlyFlow(this.startDate, this.endDate);

        if (data.labels.length === 0) {
            container.createEl('p', { text: 'Nenhum dado para exibir no período selecionado.', cls: 'no-data-message' });
            return;
        }

        const chart = new Chart(canvas, {
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
                            label: function(context: TooltipItem<'bar'>) {
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
        const canvas = container.createEl("canvas");
        const data = this.generator.getSankeyData(this.startDate, this.endDate);

        if (data.length === 0) {
            container.createEl('p', { text: 'Nenhum dado para exibir no período selecionado.', cls: 'no-data-message' });
            return;
        }

        const chart = new Chart(canvas, {
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
                            label: function(context: TooltipItem<'sankey'>) {
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
        const canvas = container.createEl("canvas");
        const data = this.generator.getNetWorthHistory(this.startDate, this.endDate);

        if (data.labels.length === 0) {
            container.createEl('p', { text: 'Nenhum dado para exibir no período selecionado.', cls: 'no-data-message' });
            return;
        }

        const chart = new Chart(canvas, {
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
        const canvas = container.createEl("canvas");
        const data = this.generator.getEmergencyFundHistory(this.startDate, this.endDate);

        if (data.labels.length === 0) {
            container.createEl('p', { text: 'Nenhum dado para exibir no período selecionado.', cls: 'no-data-message' });
            return;
        }

        const chart = new Chart(canvas, {
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
                        label: function(context: TooltipItem<'line'>) {
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
import { Modal, App, Setting, Notice } from 'obsidian';
import type NexusHubPlugin from '../main';
import { eventManager } from '../helpers/EventManager';
import * as XLSX from 'xlsx';
import { Transaction } from '../views/settings';
import { formatAsCurrency, parseCurrency } from '../helpers/helpers';
import moment from 'moment';

export class ImportCsvModal extends Modal {
    plugin: NexusHubPlugin;
    file: File | null = null;
    parsedData: any[] = [];
    headers: string[] = [];

    // Mapeamento
    private dateColumn: string | null = null;
    private descriptionColumn: string | null = null;
    private amountColumn: string | null = null;
    private dateFormat: string = 'YYYY-MM-DD';

    constructor(app: App, plugin: NexusHubPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Importar Transações de CSV' });

        this.renderStep1_FileUpload(contentEl);
    }

    renderStep1_FileUpload(container: HTMLElement) {
        new Setting(container)
            .setName('Arquivo CSV')
            .setDesc('Selecione o arquivo .csv exportado do seu banco.')
            .addButton(btn => {
                const input = createEl('input', {
                    attr: {
                        type: 'file',
                        accept: '.csv, .txt',
                        style: 'display: none'
                    }
                });
                btn.buttonEl.appendChild(input);
                btn.setButtonText('Selecionar Arquivo');
                btn.onClick(() => input.click());

                input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;

                    this.file = file;
                    btn.setButtonText(file.name).setDisabled(true);
                    this.parseFile();
                };
            });
    }

    async parseFile() {
        if (!this.file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const fileContent = event.target?.result;
            if (typeof fileContent !== 'string') return;

            try {
                const workbook = XLSX.read(fileContent, { type: 'string' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                this.parsedData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (this.parsedData.length > 0) {
                    this.headers = this.parsedData[0] as string[];
                    this.renderStep2_ColumnMapping(this.contentEl);
                } else {
                    new Notice('Erro: O arquivo CSV está vazio ou em um formato inválido.');
                }
            } catch (error) {
                console.error("Nexus Hub - Erro ao parsear CSV:", error);
                new Notice('Ocorreu um erro ao ler o arquivo. Verifique se é um CSV válido.');
            }
        };
        reader.readAsText(this.file);
    }

    renderStep2_ColumnMapping(container: HTMLElement) {
        container.empty(); // Limpa o passo 1
        container.createEl('h2', { text: 'Mapear Colunas' });
        container.createEl('p', { text: 'Associe as colunas do seu arquivo aos campos de transação do Nexus Hub.' });

        const createMappingDropdown = (name: string, description: string, onchange: (value: string) => void) => {
            new Setting(container)
                .setName(name)
                .setDesc(description)
                .addDropdown(dd => {
                    dd.addOption('__none__', '-- Ignorar --');
                    this.headers.forEach((header, index) => {
                        dd.addOption(String(index), header);
                    });
                    dd.onChange(onchange);
                });
        };

        createMappingDropdown('Coluna da Data', 'Coluna que contém a data da transação.', val => this.dateColumn = val === '__none__' ? null : val);
        createMappingDropdown('Coluna da Descrição', 'Coluna que contém a descrição/nome da transação.', val => this.descriptionColumn = val === '__none__' ? null : val);
        createMappingDropdown('Coluna do Valor', 'Coluna que contém o valor monetário da transação.', val => this.amountColumn = val === '__none__' ? null : val);

        new Setting(container)
            .setName('Formato da Data')
            .setDesc('Ex: DD/MM/YYYY, YYYY-MM-DD. Use a sintaxe do Moment.js.')
            .addText(text => text
                .setValue(this.dateFormat)
                .onChange(val => this.dateFormat = val));

        new Setting(container)
            .addButton(btn => btn
                .setButtonText('Pré-visualizar Importação')
                .setCta()
                .onClick(() => this.renderStep3_Preview(container)));
    }

    renderStep3_Preview(container: HTMLElement) {
        if (!this.dateColumn || !this.descriptionColumn || !this.amountColumn) {
            new Notice('Por favor, mapeie as colunas de data, descrição e valor.');
            return;
        }

        container.empty();
        container.createEl('h2', { text: 'Pré-visualização dos Dados' });

        const previewTable = container.createEl('table', { cls: 'nexus-hub-table' });
        const thead = previewTable.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: 'Data' });
        headerRow.createEl('th', { text: 'Descrição' });
        headerRow.createEl('th', { text: 'Valor' });

        const tbody = previewTable.createEl('tbody');
        const dataToPreview = this.parsedData.slice(1, 6); // Preview 5 rows

        dataToPreview.forEach(row => {
            const tableRow = tbody.createEl('tr');
            const dateStr = row[this.dateColumn!];
            const formattedDate = moment(dateStr, this.dateFormat).format('DD/MM/YYYY');
            const amount = parseCurrency(String(row[this.amountColumn!]));

            tableRow.createEl('td', { text: formattedDate });
            tableRow.createEl('td', { text: row[this.descriptionColumn!] });
            tableRow.createEl('td', { text: formatAsCurrency(amount) });
        });

        new Setting(container)
            .addButton(btn => btn
                .setButtonText('Confirmar e Importar')
                .setCta()
                .onClick(() => this.importData()));
    }

    async importData() {
        if (!this.dateColumn || !this.descriptionColumn || !this.amountColumn) return;

        const transactionsToImport: Transaction[] = [];
        const dataToImport = this.parsedData.slice(1);

        for (const row of dataToImport) {
            const dateStr = row[this.dateColumn];
            const date = moment(dateStr, this.dateFormat);
            const amount = parseCurrency(String(row[this.amountColumn]));
            const description = String(row[this.descriptionColumn]);

            if (!date.isValid() || isNaN(amount) || !description) {
                console.warn("Nexus Hub: Pulando linha do CSV por dados inválidos:", row);
                continue;
            }

            const newTransaction: Transaction = {
                id: `csv_${Date.now()}_${Math.random()}`,
                description: description,
                amount: Math.abs(amount), // Assume expenses are negative, incomes positive
                date: date.format('YYYY-MM-DD'),
                category: 'Importado', // Categoria padrão
                type: amount < 0 ? 'expense' : 'income',
                status: 'paid', // Assume que transações importadas já foram pagas
                isRecurring: false,
                isInstallment: false,
            };
            transactionsToImport.push(newTransaction);
        }

        this.plugin.settings.transactions.push(...transactionsToImport);
        await this.plugin.saveSettings();
        eventManager.emit('data-changed');

        new Notice(`${transactionsToImport.length} transações importadas com sucesso!`);
        this.close();
    }
}
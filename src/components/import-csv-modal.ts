import { Modal, App, Setting, Notice } from 'obsidian';
import type NexusHubPlugin from '../main';
// import { eventManager } from '../helpers/EventManager';
// Para uma implementação robusta, usaríamos uma biblioteca como 'papaparse'.
// Por enquanto, vamos criar a estrutura do modal.

export class ImportCsvModal extends Modal {
    plugin: NexusHubPlugin;
    fileContent = "";

    constructor(app: App, plugin: NexusHubPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Importar Transações de CSV' });

        new Setting(contentEl)
            .setName('Arquivo CSV')
            .setDesc('Selecione o arquivo .csv do seu banco.')
            .addButton(btn => {
                const input = createEl('input', {
                    attr: {
                        type: 'file',
                        accept: '.csv, .txt', // Aceita .csv e .txt
                        class: 'visually-hidden'
                    }
                });
                btn.buttonEl.appendChild(input);
                btn.setButtonText('Selecionar Arquivo');
                btn.onClick(() => input.click());

                input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;

                    // Validado: file.text() é API Web segura para mobile.
                    this.fileContent = await file.text();
                    btn.setButtonText(file.name);
                    new Notice(`Arquivo "${file.name}" carregado. Próximo passo: mapear colunas.`);
                    // A implementação real da lógica de parse está no modal principal (modals.ts) ou deve ser implementada aqui futuramente.
                    // Por enquanto este modal é apenas um placeholder ou ponto de entrada simplificado.
                };
            });
    }
}
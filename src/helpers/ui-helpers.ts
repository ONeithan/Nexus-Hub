import { App, Modal, Setting, Notice, TextComponent, setIcon, MarkdownRenderer, Component } from 'obsidian';
import { eventManager } from './EventManager';
import type NexusHubPlugin from '../main';
import { formatAsCurrency, parseCurrency } from './helpers';

/**
 * Configura um campo de texto para aceitar e formatar valores monetários, melhorando a UX.
 * @param text O componente de texto do Obsidian.
 * @param onValueChange Callback para atualizar o estado com o valor numérico.
 * @param initialValue O valor inicial a ser formatado e exibido.
 */
export function setupCurrencyInput(text: TextComponent, onValueChange: (value: number) => void, initialValue = 0, customPlaceholder?: string) {
    text.setPlaceholder(customPlaceholder || formatAsCurrency(0));
    if (initialValue > 0) {
        text.setValue(formatAsCurrency(initialValue));
    }

    text.inputEl.addEventListener('input', () => {
        onValueChange(parseCurrency(text.getValue()));
    });

    text.inputEl.addEventListener('blur', (e) => {
        const value = parseCurrency((e.target as HTMLInputElement).value);
        onValueChange(value); // Garante que o valor final seja passado ao desfocar
        if (value > 0) {
            text.setValue(formatAsCurrency(value));
        } else {
            text.setValue(''); // Limpa se for zero ou inválido
        }
    });
}

/**
 * Renderiza um dropdown de categorias com a opção de criar uma nova dinamicamente.
 * @param containerEl O elemento pai onde o Setting será adicionado.
 * @param plugin A instância do plugin.
 * @param getCurrentCategory Função para obter o valor atual da categoria.
 * @param setCurrentCategory Função para definir o novo valor da categoria.
 */
export function renderCategoryDropdown(
    containerEl: HTMLElement,
    plugin: NexusHubPlugin,
    getCurrentCategory: () => string,
    setCurrentCategory: (category: string) => void
) {
    const categorySetting = new Setting(containerEl).setName("Categoria");

    const render = (container: Setting) => {
        container.controlEl.empty();
        container.addDropdown(dropdown => {
            plugin.settings.categories.forEach(cat => dropdown.addOption(cat.name, cat.name));
            dropdown.addOption('__add_new__', '[+] Criar nova categoria...');
            dropdown.setValue(getCurrentCategory());
            dropdown.onChange(async (value) => {
                if (value === '__add_new__') {
                    // Impede que o dropdown mude para "[+] Criar..."
                    dropdown.setValue(getCurrentCategory());

                    new PromptModal(
                        plugin.app,
                        'Criar Nova Categoria',
                        'Nome da categoria',
                        async (newCategoryName) => {
                            const trimmedName = newCategoryName.trim();
                            if (plugin.settings.categories.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
                                new Notice(`A categoria "${trimmedName}" já existe.`);
                                return;
                            }
                            const newCategory = { id: `cat_${Date.now()}`, name: trimmedName };
                            plugin.settings.categories.push(newCategory);
                            await plugin.saveSettings();
                            eventManager.emit('data-changed');
                            new Notice(`Categoria "${trimmedName}" criada.`);
                            setCurrentCategory(trimmedName);
                            render(container); // Re-renderiza o dropdown com a nova opção
                        }
                    ).open();
                } else { setCurrentCategory(value); }
            });
        });
    };
    render(categorySetting);
}

/**
 * Um modal genérico para confirmação de ações.
 */
export class ConfirmationModal extends Modal {
    title: string;
    message: string;
    onConfirm: () => void;

    constructor(app: App, title: string, message: string, onConfirm: () => void) {
        super(app);
        this.title = title;
        this.message = message;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: this.title });
        contentEl.createEl('p', { text: this.message });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Cancelar')
                .onClick(() => {
                    this.close();
                }))
            .addButton(btn => btn
                .setButtonText('Confirmar')
                .setClass('mod-warning')
                .setCta()
                .onClick(() => {
                    this.onConfirm();
                    this.close();
                }));
    }

    onClose() { this.contentEl.empty(); }

}



/**

 * Um modal genérico para exibir informações de ajuda.

 */

export class InfoModal extends Modal {

    title: string;

    content: string | ((contentEl: HTMLElement) => void);



    constructor(app: App, title: string, content: string | ((contentEl: HTMLElement) => void)) {

        super(app);

        this.title = title;

        this.content = content;

    }



    onOpen() {



        const { contentEl } = this;



        contentEl.empty();



        this.contentEl.addClass('nexus-help-modal');







        contentEl.createEl('h2', { text: this.title });







        const contentContainer = contentEl.createDiv({ cls: 'nexus-help-modal-content' });







        if (typeof this.content === 'string') {
            // Check if content looks like HTML
            if (this.content.trim().startsWith('<')) {
                const wrapper = contentContainer.createDiv();
                wrapper.innerHTML = this.content;
            } else {
                // Use MarkdownRenderer to correctly parse markdown syntax
                MarkdownRenderer.renderMarkdown(this.content, contentContainer, '', null as unknown as Component);
            }
        } else {
            this.content(contentContainer);
        }







        const footer = contentEl.createDiv({ cls: 'modal-footer' });



        new Setting(footer)



            .addButton(btn => btn



                .setButtonText('Entendido')



                .setCta()



                .onClick(() => {



                    this.close();



                }));



    }



    onClose() {

        this.contentEl.empty();

    }

}



/**

 * Adiciona um botão de ajuda a um elemento Setting.

 * @param setting O Setting ao qual o botão será adicionado.

 * @param title O título para o modal de ajuda.
 * @param content O conteúdo para o modal de ajuda (string ou função de renderização).
 */
export function addHelpButton(app: App, target: Setting | HTMLElement, title: string, content: string | ((contentEl: HTMLElement) => void)) {
    if (target instanceof Setting) {
        target.addExtraButton(button => {
            button.setIcon('help-circle')
                .setTooltip('O que é isso?')
                .onClick(() => {
                    new InfoModal(app, title, content).open();
                });
        });
    } else if (target instanceof HTMLElement) {
        const btn = target.createEl('button', { cls: 'clickable-icon extra-setting-button' });
        // Add some margin if it's a plain element to not stick close to text
        btn.style.marginLeft = '8px';
        setIcon(btn, 'help-circle');
        btn.setAttribute('aria-label', 'O que é isso?');
        btn.addEventListener('click', () => {
            new InfoModal(app, title, content).open();
        });
    }
}

/**
 * Um modal genérico para entrada de texto, substituindo window.prompt.
 */
export class PromptModal extends Modal {
    title: string;
    placeholder: string;
    onSubmit: (result: string) => void;
    private value = "";

    constructor(app: App, title: string, placeholder: string, onSubmit: (result: string) => void, initialValue = "") {
        super(app);
        this.title = title;
        this.placeholder = placeholder;
        this.onSubmit = onSubmit;
        this.value = initialValue;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.title });

        new Setting(contentEl).addText(text => {
            text.setPlaceholder(this.placeholder).onChange(value => this.value = value);
            text.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.submit(); } });
            text.inputEl.focus();
        });

        new Setting(contentEl)
            .addButton(btn => btn.setButtonText('Cancelar').onClick(() => this.close()))
            .addButton(btn => btn.setButtonText('Criar').setCta().onClick(() => this.submit()));
    }

    private submit() {
        if (this.value.trim()) {
            this.onSubmit(this.value.trim());
            this.close();
        }
    }

    onClose() { this.contentEl.empty(); }
}
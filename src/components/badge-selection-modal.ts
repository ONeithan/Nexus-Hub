
import { App, Modal, setIcon, Notice } from 'obsidian';
import NexusHubPlugin from '../main';
import { NEXUS_BADGES, NexusBadge } from '../services/achievements';
import { isBadgeUnlocked } from '../helpers/gamification-helpers';

export class BadgeSelectionModal extends Modal {
    plugin: NexusHubPlugin;
    onSelect: () => void;

    constructor(app: App, plugin: NexusHubPlugin, onSelect: () => void) {
        super(app);
        this.plugin = plugin;
        this.onSelect = onSelect;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('nexus-badge-selection-modal');

        // Styles
        const style = contentEl.createEl('style');
        style.textContent = `
            .nexus-badge-selection-modal .modal-content {
                max-width: 800px; width: 90vw; background: #09090b; border: 1px solid #333;
                display: flex; flex-direction: column; gap: 20px; padding: 30px; border-radius: 12px;
            }
            .badge-modal-header { text-align: center; margin-bottom: 20px; }
            .badge-modal-header h2 { font-size: 1.8rem; margin: 0 0 10px 0; color: #fff; }
            .badge-modal-header p { color: #888; margin: 0; }

            .badges-grid-full {
                display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 20px;
                max-height: 60vh; overflow-y: auto; padding-right: 5px;
            }

            .badge-selection-card {
                background: #111; border: 1px solid #333; border-radius: 10px; padding: 20px;
                display: flex; flex-direction: column; align-items: center; text-align: center;
                transition: all 0.2s ease; cursor: pointer; position: relative;
            }
            .badge-selection-card:hover { border-color: #6366f1; background: #161618; }
            .badge-selection-card.selected { border-color: #a855f7; box-shadow: 0 0 15px rgba(168, 85, 247, 0.2); }
            .badge-selection-card.locked { opacity: 0.5; filter: grayscale(1); cursor: not-allowed; }
            .badge-selection-card.locked:hover { border-color: #333; background: #111; }

            .badge-icon-large { margin-bottom: 15px; }
            .badge-icon-large svg { width: 48px; height: 48px; color: #fbbf24; }
            .badge-name { font-weight: bold; color: #fff; margin-bottom: 5px; font-size: 1.1rem; }
            .badge-desc { font-size: 0.85rem; color: #aaa; line-height: 1.3; }

            .status-indicator {
                margin-top: 15px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; font-weight: bold;
            }
            .status-unlocked { color: #10b981; }
            .status-locked { color: #ef4444; }
            .status-selected { color: #a855f7; }
        `;

        // Header
        const header = contentEl.createDiv({ cls: 'badge-modal-header' });
        header.createEl('h2', { text: 'Insígnias de Perfil' });
        header.createEl('p', { text: 'Selecione uma insígnia para exibir no seu perfil.' });

        // Grid
        const grid = contentEl.createDiv({ cls: 'badges-grid-full' });
        const currentSelected = this.plugin.settings.selectedBadge;

        NEXUS_BADGES.forEach(badge => {
            const unlocked = isBadgeUnlocked(badge.id, this.plugin.settings);
            const isSelected = currentSelected === badge.id;

            const card = grid.createDiv({
                cls: `badge-selection-card ${unlocked ? 'unlocked' : 'locked'} ${isSelected ? 'selected' : ''}`
            });

            // Icon
            const iconDiv = card.createDiv({ cls: 'badge-icon-large' });
            setIcon(iconDiv, badge.icon);

            // Text
            card.createDiv({ cls: 'badge-name', text: badge.name });
            // Remove description from grid to clean it up, show only in detail
            // card.createDiv({ cls: 'badge-desc', text: badge.description });

            // Status
            const statusDiv = card.createDiv({ cls: 'status-indicator' });
            if (isSelected) {
                statusDiv.addClass('status-selected');
                statusDiv.setText('EQUIPADA');
            } else if (unlocked) {
                statusDiv.addClass('status-unlocked');
                statusDiv.setText('DESBLOQUEADA');
            } else {
                statusDiv.addClass('status-locked');
                statusDiv.setText('BLOQUEADA');
                // SHOW UNLOCK CRITERIA
                if (badge.unlockCriteria) {
                    card.createDiv({ cls: 'badge-unlock-hint', text: `Como obter: ${badge.unlockCriteria}`, attr: { style: 'font-size: 0.7em; margin-top: 5px; color: #777;' } });
                }
            }

            // Click Handler -> Open Detail View
            card.onclick = () => {
                this.renderDetailView(badge, unlocked, isSelected);
            };
        });
    }

    renderDetailView(badge: NexusBadge, unlocked: boolean, isSelected: boolean) {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('nexus-badge-detail-view');

        const container = contentEl.createDiv({ cls: 'badge-detail-container' });

        // Header / Back
        const header = container.createDiv({ cls: 'detail-header' });
        const backBtn = header.createDiv({ cls: 'back-btn' });
        setIcon(backBtn, 'arrow-left');
        backBtn.createSpan({ text: 'Voltar' });
        backBtn.onclick = () => this.onOpen(); // Re-render grid

        // Content
        const content = container.createDiv({ cls: 'detail-content' });

        // Icon
        const iconBox = content.createDiv({ cls: `detail-icon-box ${unlocked ? 'unlocked' : 'locked'}` });
        setIcon(iconBox, badge.icon);

        // Info
        content.createEl('h2', { text: badge.name });
        content.createDiv({ cls: 'detail-desc', text: badge.description });

        const criteriaBox = content.createDiv({ cls: 'criteria-box' });
        criteriaBox.createDiv({ cls: 'criteria-label', text: 'Como obter:' });
        criteriaBox.createDiv({ cls: 'criteria-text', text: badge.unlockCriteria });

        // Action Button
        if (unlocked) {
            if (isSelected) {
                const btn = content.createEl('button', { text: 'Já Equipado', cls: 'mod-cta disabled' });
                btn.disabled = true;
            } else {
                const btn = content.createEl('button', { text: 'Equipar Insígnia', cls: 'mod-cta' });
                btn.onclick = async () => {
                    this.plugin.settings.selectedBadge = badge.id;
                    await this.plugin.saveSettings();
                    new Notice(`Insígnia "${badge.name}" equipada!`);
                    this.onSelect();
                    this.close();
                };
            }
        } else {
            const btn = content.createEl('button', { text: 'Bloqueado', cls: 'mod-warning disabled' });
            btn.disabled = true;
        }

        // Styles for Detail View
        const style = contentEl.createEl('style');
        style.textContent = `
            .nexus-badge-detail-view .modal-content {
                max-width: 500px;
            }
            .badge-detail-container {
                display: flex; flex-direction: column; gap: 20px;
            }
            .detail-header {
                display: flex; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1);
                padding-bottom: 15px; margin-bottom: 10px;
            }
            .back-btn {
                display: flex; align-items: center; gap: 8px; cursor: pointer; opacity: 0.7; font-size: 0.9rem;
            }
            .back-btn:hover { opacity: 1; color: #a855f7; }
            
            .detail-content {
                display: flex; flex-direction: column; align-items: center; text-align: center; gap: 15px;
            }
            .detail-icon-box {
                width: 100px; height: 100px; border-radius: 20px;
                display: flex; align-items: center; justify-content: center;
                background: rgba(255,255,255,0.05); border: 2px solid rgba(255,255,255,0.1);
            }
            .detail-icon-box svg { width: 50px; height: 50px; color: #666; }
            .detail-icon-box.unlocked {
                border-color: #a855f7; box-shadow: 0 0 30px rgba(168, 85, 247, 0.2);
                background: linear-gradient(135deg, rgba(168, 85, 247, 0.1), transparent);
            }
            .detail-icon-box.unlocked svg { color: #fff; }

            .detail-desc { color: #ccc; font-size: 1.1rem; }
            
            .criteria-box {
                background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; width: 100%;
                border: 1px dashed rgba(255,255,255,0.1);
            }
            .criteria-label { font-size: 0.8rem; color: #888; text-transform: uppercase; margin-bottom: 5px; }
            .criteria-text { font-size: 0.95rem; color: #eab308; font-weight: bold; }
            
            button.mod-cta { width: 100%; margin-top: 10px; padding: 12px; font-size: 1rem; }
            button.disabled { opacity: 0.5; cursor: default; }
        `;
    }

    onClose() {
        this.contentEl.empty();
    }
}

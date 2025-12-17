
import { Modal, App } from 'obsidian';
import NexusHubPlugin from '../main';
import { NEXUS_TRADING_CARDS } from '../services/achievements';
import { setIcon } from 'obsidian';

export class TradingCardsModal extends Modal {
    plugin: NexusHubPlugin;

    constructor(app: App, plugin: NexusHubPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('nexus-trading-cards-modal');

        // Header
        const header = contentEl.createDiv({ cls: 'modal-header' });
        header.createEl('h2', { text: 'Sua Coleção de Cartas' });

        // Grid
        const grid = contentEl.createDiv({ cls: 'trading-cards-grid-full' });
        const collectedIds = new Set((this.plugin as any).settings.collectedCards || []);

        NEXUS_TRADING_CARDS.forEach(card => {
            const isCollected = collectedIds.has(card.id);
            const cardEl = grid.createDiv({ cls: `nexus-trading-card ${isCollected ? 'collected' : 'locked'}` });

            // Visual
            const visual = cardEl.createDiv({ cls: 'card-visual' });

            if (isCollected) {
                // Fix: Use CSS variable for color to keep it clean, set via style attribute on cardEl or visual
                visual.style.setProperty('--card-glow', card.color);

                const iconContainer = visual.createDiv({ cls: 'visual-icon' });
                const iconName = card.series === 'Financial Origin' ? 'coins' : 'cpu';
                setIcon(iconContainer, iconName);

                const svg = iconContainer.querySelector('svg');
                if (svg) svg.style.color = card.color;
            } else {
                visual.addClass('locked-visual');
                const lockIcon = visual.createDiv({ cls: 'locked-icon' });
                setIcon(lockIcon, 'lock');
            }

            // Info
            const info = cardEl.createDiv({ cls: 'card-info' });
            info.createEl('h3', { text: isCollected ? card.name : 'Bloqueado' });

            const rarityMap: Record<string, string> = { 'Common': 'Comum', 'Uncommon': 'Incomum', 'Rare': 'Rara', 'Epic': 'Épica', 'Legendary': 'Lendária' };
            info.createDiv({ cls: 'card-rarity', text: isCollected ? (rarityMap[card.rarity] || card.rarity) : '???' });

            // Unlock Source / Description
            const methodDiv = info.createDiv({ cls: 'card-method' });
            if (isCollected) {
                methodDiv.createSpan({ text: 'Obtido via: ', cls: 'method-label' });
                methodDiv.createSpan({ text: 'Drop Aleatório', cls: 'method-value' });
            } else {
                methodDiv.createSpan({ text: 'Como obter: ', cls: 'method-label' });
                methodDiv.createSpan({ text: 'Recompensa de Transação', cls: 'method-value' });
            }

            if (isCollected) cardEl.setAttribute('title', card.description);
        });

        // Styles
        const style = contentEl.createEl('style');
        style.textContent = `
            .nexus-trading-cards-modal .modal-content { 
                max-width: 1000px; width: 95vw; background: #050505; border: 1px solid #222; 
                padding: 40px; border-radius: 16px; box-shadow: 0 0 50px rgba(0,0,0,0.5);
            }
            .modal-header h2 { text-align: center; font-size: 2rem; margin-bottom: 5px; color: #fff; text-transform: uppercase; letter-spacing: 2px; }
            .modal-header::after { content: ''; display: block; width: 60px; height: 3px; background: #a855f7; margin: 15px auto 30px; border-radius: 3px; }

            .trading-cards-grid-full { 
                display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 30px; padding: 20px;
                max-height: 70vh; overflow-y: auto;
            }

            /* Card Container */
            .nexus-trading-card { 
                background: #111; border: 1px solid #1a1a1a; border-radius: 16px; padding: 20px; 
                display: flex; flex-direction: column; gap: 20px; transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                position: relative; overflow: hidden;
            }
            .nexus-trading-card:hover { transform: translateY(-8px); border-color: #333; box-shadow: 0 10px 40px rgba(0,0,0,0.4); }
            
            .nexus-trading-card.collected { 
                border-color: #333; 
                background: linear-gradient(180deg, #161618 0%, #0a0a0a 100%); 
            }
            .nexus-trading-card.collected:hover { border-color: #6366f1; }

            /* Visual Section */
            .card-visual { 
                aspect-ratio: 1; background: #080808; border-radius: 12px; 
                display: flex; align-items: center; justify-content: center;
                position: relative; border: 1px solid #1a1a1a;
                box-shadow: inset 0 0 20px rgba(0,0,0,0.5);
            }
            .card-visual.locked-visual { background: #050505; opacity: 0.4; }
            
            .visual-icon svg { width: 80px; height: 80px; filter: drop-shadow(0 0 25px var(--card-glow)); transition: transform 0.3s ease; }
            .nexus-trading-card:hover .visual-icon svg { transform: scale(1.1); }
            .locked-icon svg { width: 40px; height: 40px; color: #333; }

            /* Info Section */
            .card-info { text-align: center; display: flex; flex-direction: column; gap: 5px; }
            .card-info h3 { margin: 0; font-size: 1.1rem; color: #fff; font-weight: 700; letter-spacing: 0.5px; }
            .card-rarity { font-size: 0.7rem; color: #888; text-transform: uppercase; letter-spacing: 2px; font-weight: 800; margin-bottom: 5px; }
            
            .nexus-trading-card.collected .card-rarity { color: #a855f7; } /* Purple/Gold accent */

            .card-method { font-size: 0.8rem; border-top: 1px solid #222; paddingTop: 10px; margin-top: 5px; color: #666; }
            .method-label { display: block; font-size: 0.7rem; text-transform: uppercase; margin-bottom: 2px; }
            .method-value { color: #aaa; font-style: italic; }
         `;
    }

    onClose() {
        this.contentEl.empty();
    }
}

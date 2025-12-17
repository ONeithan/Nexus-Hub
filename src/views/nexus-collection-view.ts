
import { ItemView, WorkspaceLeaf, setIcon, Notice } from "obsidian";
import NexusHubPlugin from "../main";
import { NEXUS_TRADING_CARDS } from "../services/achievements";

export const NEXUS_COLLECTION_VIEW_TYPE = "nexus-collection-view";

export class NexusCollectionView extends ItemView {
    plugin: NexusHubPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: NexusHubPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return NEXUS_COLLECTION_VIEW_TYPE;
    }

    getDisplayText() {
        return "Nexus Collection";
    }

    getIcon() {
        return "layers";
    }

    async onOpen() {
        this.render();
    }

    async onClose() {
        // Nothing to cleanup
    }

    render() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass("nexus-collection-view");

        // 1. Header & Stats
        const collectedIds = new Set((this.plugin as any).settings.collectedCards || []);
        const totalCards = NEXUS_TRADING_CARDS.length;
        const collectedCount = collectedIds.size;
        const percentage = Math.round((collectedCount / totalCards) * 100);

        const header = container.createDiv({ cls: "collection-header" });
        header.createEl("h1", { text: "Minha Coleção" });

        const statsRow = header.createDiv({ cls: "header-stats" });
        statsRow.createDiv({ cls: "stat-pill", text: `${collectedCount}/${totalCards} Cartas` });
        statsRow.createDiv({ cls: "stat-pill percent", text: `${percentage}% Completo` });

        // 2. Filters (Placeholder for now, keeping it simple as per user request to just "show properly")
        // We can add simple tabs later if needed.

        // 3. Group by Series (with Translation)
        const seriesMap: Record<string, typeof NEXUS_TRADING_CARDS> = {};

        // Translation Map
        const seriesTranslations: Record<string, string> = {
            'Financial Origin': 'Origem Financeira',
            'Cyberpunk Ethos': 'Ética Cyberpunk',
            'Crypto Legends': 'Lendas Cripto',
            'Luxury Lifestyle': 'Estilo de Vida Luxuoso',
            // Fallbacks if already translated
            'Origem Financeira': 'Origem Financeira',
            'Ética Cyberpunk': 'Ética Cyberpunk',
            'Lendas Cripto': 'Lendas Cripto',
            'Estilo de Vida Luxuoso': 'Estilo de Vida Luxuoso'
        };

        NEXUS_TRADING_CARDS.forEach(card => {
            // Ensure we use the translated name for grouping if possible, or raw if not found
            // The card.series might be English or PT depending on source, let's normalize.
            // Check if card.series is one of the English keys
            let seriesName = seriesTranslations[card.series] || card.series;

            if (!seriesMap[seriesName]) seriesMap[seriesName] = [];
            seriesMap[seriesName].push(card);
        });

        // 4. Render Groups
        const scrollContainer = container.createDiv({ cls: "collection-scroll-container" });

        for (const [seriesName, cards] of Object.entries(seriesMap)) {
            const groupSection = scrollContainer.createDiv({ cls: "series-section" });
            groupSection.createEl("h2", { text: seriesName, cls: "series-title" });

            const grid = groupSection.createDiv({ cls: "cards-grid" });

            cards.forEach(card => {
                const isCollected = collectedIds.has(card.id);
                const cardEl = grid.createDiv({
                    cls: `nexus-card-item ${isCollected ? 'unlocked' : 'locked'} rarity-${card.rarity.toLowerCase()}`
                });

                // Top Visual
                const visual = cardEl.createDiv({ cls: "card-visual" });

                // Determine Icon based on series
                let iconName = "box";
                const s = card.series.toLowerCase() + seriesName.toLowerCase();
                if (s.includes("origin") || s.includes("financeira")) iconName = "coins";
                if (s.includes("cyberpunk") || s.includes("ética")) iconName = "cpu";
                if (s.includes("crypto") || s.includes("lendas")) iconName = "server";
                if (s.includes("luxury") || s.includes("luxuoso")) iconName = "gem";

                if (isCollected) {
                    visual.style.setProperty("--card-accent", card.color);
                    const iconBox = visual.createDiv({ cls: "icon-box" });
                    setIcon(iconBox, iconName);
                } else {
                    visual.addClass("locked-visual");
                    const iconBox = visual.createDiv({ cls: "locked-icon-ghost" });
                    setIcon(iconBox, iconName); // Show the thematic icon but ghosted

                    // Optional: Small lock overlay
                    const lockOverlay = visual.createDiv({ cls: "lock-overlay" });
                    setIcon(lockOverlay, "lock");
                }

                // Info Section
                const info = cardEl.createDiv({ cls: "card-info" });
                const rarityTranslate: Record<string, string> = { 'Common': 'Comum', 'Uncommon': 'Incomum', 'Rare': 'Rara', 'Epic': 'Épica', 'Legendary': 'Lendária' };
                info.createDiv({ cls: "rarity-tag", text: rarityTranslate[card.rarity] || card.rarity });
                info.createEl("h3", { text: isCollected ? card.name : "???" });

                if (isCollected) {
                    const meta = info.createDiv({ cls: "card-meta" });
                    meta.createDiv({ cls: "meta-desc", text: card.description });
                } else {
                    const hint = card.unlockHint || "Continue evoluindo para desbloquear";
                    info.createDiv({ cls: "card-meta" }).createDiv({ cls: "meta-hint", text: hint, attr: { style: 'color: #888; font-style: italic; font-size: 0.8em;' } });
                }
            });
        }

        // 5. Inject Styles
        const style = container.createEl("style");
        style.textContent = `
            .nexus-collection-view {
                padding: 40px; background: #050505; height: 100%; overflow-y: auto;
            }
            .collection-header {
                display: flex; flex-direction: column; align-items: center; margin-bottom: 40px;
            }
            .collection-header h1 { 
                font-size: 3rem; margin: 0 0 15px 0; background: linear-gradient(to right, #fff, #aaa); 
                -webkit-background-clip: text; color: transparent; letter-spacing: -1px;
            }
            .header-stats { display: flex; gap: 15px; }
            .stat-pill {
                padding: 5px 15px; background: #1a1a1a; border-radius: 20px; 
                font-size: 0.9rem; font-weight: 600; color: #888; border: 1px solid #333;
            }
            .stat-pill.percent { color: #a855f7; border-color: rgba(168, 85, 247, 0.3); }

            .series-section { margin-bottom: 50px; }
            .series-title { 
                font-size: 1.2rem; color: #aaa; margin-bottom: 20px; border-bottom: 1px solid #222; 
                padding-bottom: 10px; text-transform: uppercase; letter-spacing: 2px; font-weight: 600;
            }

            .cards-grid {
                display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 20px;
            }

            .nexus-card-item {
                background: linear-gradient(135deg, #111, #0a0a0a); 
                border: 1px solid #222; border-radius: 12px; overflow: hidden;
                transition: all 0.3s ease; position: relative;
                display: flex; flex-direction: column; height: 100%;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            }
            .nexus-card-item:hover { transform: translateY(-7px); border-color: #555; box-shadow: 0 10px 25px rgba(0,0,0,0.5); z-index: 2; }
            
            .nexus-card-item.unlocked { border-color: #333; }
            .nexus-card-item.unlocked:hover { border-color: var(--card-accent, #fff); box-shadow: 0 0 20px var(--card-accent-dim, rgba(255,255,255,0.1)); }

            /* Visual */
            .card-visual {
                aspect-ratio: 16/10; background: #000; position: relative;
                display: flex; align-items: center; justify-content: center;
                border-bottom: 1px solid #1a1a1a; overflow: hidden;
            }
            .card-visual.locked-visual { background: #080808; }
            
            /* Icons */
            .icon-box { z-index: 2; position: relative; }
            .icon-box svg { width: 48px; height: 48px; color: var(--card-accent); filter: drop-shadow(0 0 15px var(--card-accent)); }

            /* Locked Ghost Icon */
            .locked-icon-ghost svg { 
                width: 48px; height: 48px; color: #222; 
                filter: grayscale(1) opacity(0.3); 
                transform: scale(0.9);
            }

            /* Lock Overlay */
            .lock-overlay {
                position: absolute; bottom: 10px; right: 10px; 
                background: rgba(0,0,0,0.6); padding: 5px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
            }
            .lock-overlay svg { width: 14px; height: 14px; color: #555; }

            /* Info */
            .card-info { padding: 15px; flex-grow: 1; display: flex; flex-direction: column; gap: 8px; justify-content: space-between; }
            .card-info h3 { margin: 0; font-size: 1rem; color: #eee; line-height: 1.3; }
            
            .rarity-tag { 
                align-self: flex-start; font-size: 0.65rem; text-transform: uppercase; 
                letter-spacing: 1px; font-weight: 700; padding: 3px 8px; border-radius: 4px;
                background: #1a1a1a; color: #666; margin-bottom: 5px;
            }
            
            /* Rarity Colors */
            .nexus-card-item.rarity-common .rarity-tag { color: #9ca3af; }
            .nexus-card-item.rarity-uncommon .rarity-tag { color: #10b981; }
            .nexus-card-item.rarity-rare .rarity-tag { color: #3b82f6; }
            .nexus-card-item.rarity-epic .rarity-tag { color: #a855f7; }
            .nexus-card-item.rarity-legendary .rarity-tag { color: #f59e0b; background: rgba(245, 158, 11, 0.1); }

            /* Meta */
            .card-meta { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #222; font-size: 0.8rem; }
            .meta-desc { color: #888; margin-bottom: 5px; font-style: italic; font-size: 0.75rem; }
            .meta-hint { font-size: 0.7rem; color: #444; font-style: italic; } 
        `;
    }

    translateRarity(rarity: string): string {
        const map: any = { 'Common': 'Comum', 'Uncommon': 'Incomum', 'Rare': 'Rara', 'Epic': 'Épica', 'Legendary': 'Lendária' };
        return map[rarity] || rarity;
    }
}

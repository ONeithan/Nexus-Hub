
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

                if (isCollected) {
                    // APPLY ACCENT COLOR TO MAIN CARD ELEMENT FOR BORDERS/SHADOWS
                    cardEl.style.setProperty("--card-accent", card.color);
                    // Also create a dim version for shadows
                    cardEl.style.setProperty("--card-accent-dim", card.color + "40"); // 25% opacity
                }

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
                    const iconBox = visual.createDiv({ cls: "icon-box" });
                    setIcon(iconBox, iconName);
                } else {
                    visual.addClass("locked-visual");
                    const iconBox = visual.createDiv({ cls: "locked-icon-ghost" });
                    setIcon(iconBox, iconName);

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
                    info.createDiv({ cls: "card-meta" }).createDiv({ cls: "meta-hint", text: hint });
                }
            });
        }

        // 5. Inject Styles
        const style = container.createEl("style");
        style.textContent = `
            .nexus-collection-view {
                padding: 40px; background: var(--background-primary); height: 100%; overflow-y: auto;
                font-family: 'Inter', sans-serif;
            }
            .collection-header {
                display: flex; flex-direction: column; align-items: center; margin-bottom: 40px;
            }
            .collection-header h1 { 
                font-size: 3rem; margin: 0 0 15px 0; 
                color: var(--text-normal);
                letter-spacing: -1px; font-weight: 800;
            }
            .header-stats { display: flex; gap: 15px; }
            .stat-pill {
                padding: 5px 15px; background: var(--background-modifier-form-field); border-radius: 20px; 
                font-size: 0.9rem; font-weight: 600; color: var(--text-muted); border: 1px solid var(--background-modifier-border);
            }
            .stat-pill.percent { color: var(--interactive-accent); border-color: var(--interactive-accent); background: rgba(var(--interactive-accent-rgb), 0.1); }

            .series-section { margin-bottom: 50px; }
            .series-title { 
                font-size: 1.2rem; color: var(--text-normal); margin-bottom: 20px; border-bottom: 1px solid var(--background-modifier-border); 
                padding-bottom: 10px; text-transform: uppercase; letter-spacing: 2px; font-weight: 600; opacity: 1;
            }

            .cards-grid {
                display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 20px;
            }

            .nexus-card-item {
                background: var(--background-secondary); 
                border: 1px solid var(--background-modifier-border); border-radius: 12px; overflow: hidden;
                transition: transform 0.3s ease, box-shadow 0.3s ease; position: relative;
                display: flex; flex-direction: column; height: 100%;
                box-shadow: var(--shadow-s);
                opacity: 1 !important;
            }
            .nexus-card-item:hover { transform: translateY(-5px); border-color: var(--interactive-accent); box-shadow: var(--shadow-l); z-index: 2; }
            
            /* UNLOCKED STATE - VISUAL MAGIC */
            .nexus-card-item.unlocked { 
                border: 1px solid var(--card-accent) !important; 
                box-shadow: 0 0 15px var(--card-accent-dim, rgba(0,0,0,0.1));
                background: linear-gradient(to bottom, var(--background-secondary), rgba(var(--card-accent-rgb), 0.05));
                cursor: pointer;
                overflow: hidden; /* Shine containment */
            }
            
            /* HOLOGRAPHIC SHINE EFFECT */
            .nexus-card-item.unlocked::before {
                content: "";
                position: absolute;
                top: 0;
                left: -100%;
                width: 50%;
                height: 100%;
                background: linear-gradient(to right, transparent, rgba(255,255,255,0.2) 50%, transparent);
                transform: skewX(-25deg);
                transition: 1.2s;
                z-index: 5;
                pointer-events: none;
            }
            
            .nexus-card-item.unlocked:hover::before, .nexus-card-item.unlocked:active::before {
                left: 150%;
                transition: 1.2s ease-in-out;
            }
            
            .nexus-card-item.unlocked:hover, .nexus-card-item.unlocked:active { 
                transform: translateY(-8px) scale(1.05); 
                border-color: var(--card-accent) !important; 
                box-shadow: 0 15px 40px var(--card-accent-dim, rgba(0,0,0,0.3)); 
                z-index: 10; 
            }
            
            /* Visual */
            .card-visual {
                aspect-ratio: 16/10; background: var(--background-secondary-alt); position: relative;
                display: flex; align-items: center; justify-content: center;
                border-bottom: 1px solid var(--background-modifier-border); overflow: hidden;
            }
            .nexus-card-item.unlocked .card-visual {
                background: radial-gradient(circle at center, var(--card-accent-dim), transparent 70%);
            }
            
            .card-visual.locked-visual { background: var(--background-primary); }
            
            /* Icons */
            .icon-box { z-index: 2; position: relative; }
            .icon-box svg { width: 48px; height: 48px; color: var(--card-accent, var(--text-normal)); filter: drop-shadow(0 0 10px var(--card-accent, transparent)); }

            /* Locked Ghost Icon */
            .locked-icon-ghost svg { 
                width: 48px; height: 48px; color: var(--text-muted); 
                opacity: 0.5;
                transform: scale(0.9);
            }

            /* Lock Overlay */
            .lock-overlay {
                position: absolute; bottom: 10px; right: 10px; 
                background: var(--background-primary); padding: 5px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                box-shadow: var(--shadow-s);
                border: 1px solid var(--background-modifier-border);
            }
            .lock-overlay svg { width: 14px; height: 14px; color: var(--text-muted); }

            /* Info */
            .card-info { padding: 15px; flex-grow: 1; display: flex; flex-direction: column; gap: 8px; justify-content: space-between; }
            .card-info h3 { margin: 0; font-size: 1rem; color: var(--text-normal) !important; line-height: 1.3; font-weight: 700; opacity: 1 !important; }
            
            .rarity-tag { 
                align-self: flex-start; font-size: 0.65rem; text-transform: uppercase; 
                letter-spacing: 1px; font-weight: 800; padding: 4px 8px; border-radius: 4px;
                background: var(--background-modifier-border); color: var(--text-normal); margin-bottom: 5px;
                border: 1px solid var(--background-modifier-border-hover);
                opacity: 1;
            }
            
            /* Rarity Colors - Text Enhanced */
            .nexus-card-item.rarity-common .rarity-tag { color: var(--text-muted); }
            .nexus-card-item.rarity-uncommon .rarity-tag { color: #10b981; background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.3); }
            .nexus-card-item.rarity-rare .rarity-tag { color: #3b82f6; background: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.3); }
            .nexus-card-item.rarity-epic .rarity-tag { color: #a855f7; background: rgba(168, 85, 247, 0.1); border-color: rgba(168, 85, 247, 0.3); }
            .nexus-card-item.rarity-legendary .rarity-tag { color: #f59e0b; background: rgba(245, 158, 11, 0.15); border-color: rgba(245, 158, 11, 0.3); }

            /* Meta */
            .card-meta { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--background-modifier-border); font-size: 0.8rem; }
            .meta-desc { color: var(--text-muted); margin-bottom: 5px; font-style: italic; font-size: 0.75rem; }
            .meta-hint { font-size: 0.75rem; color: var(--text-muted) !important; font-style: italic; opacity: 1 !important; font-weight: 500; } 
            
            /* Mobile Mobile */
            @media screen and (max-width: 768px) {
                .nexus-collection-view { padding: 20px; }
                .collection-header h1 { font-size: 2rem; }
                .cards-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
                .nexus-card-item { min-height: 180px; }
                .card-visual { aspect-ratio: 1/1; }
            }
        `;
    }

    translateRarity(rarity: string): string {
        const map: any = { 'Common': 'Comum', 'Uncommon': 'Incomum', 'Rare': 'Rara', 'Epic': 'Épica', 'Legendary': 'Lendária' };
        return map[rarity] || rarity;
    }
}

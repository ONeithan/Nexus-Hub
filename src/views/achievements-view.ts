import { ItemView, WorkspaceLeaf, setIcon, moment, Modal } from "obsidian";
import NexusHubPlugin from "../main";
import { ALL_ACHIEVEMENTS, Achievement, NEXUS_TRADING_CARDS } from "../services/achievements";
import { eventManager } from "../helpers/EventManager";
import { InfoModal } from "../helpers/ui-helpers";

export const NEXUS_ACHIEVEMENTS_VIEW_TYPE = "nexus-achievements-view";

export class AchievementsView extends ItemView {
    plugin: NexusHubPlugin;
    activeCategory: string | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: NexusHubPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return NEXUS_ACHIEVEMENTS_VIEW_TYPE; }
    getDisplayText() { return 'Nexus Collection'; }
    getIcon() { return "gem"; }

    async onOpen() {
        this.render();
        const onDataChange = () => this.render();
        eventManager.on('data-changed', onDataChange);
        this.register(() => eventManager.off('data-changed', onDataChange));
    }

    private render() {
        // Ensure container is clean
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass("nexus-crystal-ui");

        this.injectStyles();

        if (this.activeCategory) {
            this.renderCategoryDetail(container);
        } else {
            this.renderMainView(container);
        }
    }

    private renderMainView(container: HTMLElement) {
        // 1. Header (Unified Profile)
        this.renderHeader(container);

        // --- SECTION 1: ACHIEVEMENTS (MEDALS) - NOW ON TOP ---
        container.createEl('h2', { text: 'Medalhas & Categorias', cls: 'section-title' });
        const grid = container.createDiv({ cls: 'crystal-grid' });
        this.renderCategoryCards(grid);

        container.createEl('hr');

        // --- SECTION 2: TRADING CARDS - NOW ON BOTTOM ---
        const cardsHeader = container.createEl('h2', { text: 'Cartas Colecionáveis Nexus', cls: 'section-title' });

        // Help Icon (Moved here)
        const helpIcon = cardsHeader.createSpan({ cls: 'section-help-icon' });
        setIcon(helpIcon, 'help-circle');
        helpIcon.onclick = () => {
            new InfoModal(this.app, 'Nexus Trading Cards', `
                <h3>O que são?</h3>
                <p>Cartas colecionáveis digitais exclusivas do universo Nexus.</p>
                <br>
                <h3>Como ganhar?</h3>
                <p>Realize ações financeiras (registrar transações, pagar contas, economizar) para ter a chance de encontrar uma carta.</p>
                <br>
                <h3>Raridades:</h3>
                <p>
                    <span style="color:#aaa">Comum</span> • 
                    <span style="color:#10B981">Incomum</span> • 
                    <span style="color:#3B82F6">Rara</span> • 
                    <span style="color:#8B5CF6">Épica</span> • 
                    <span style="color:#F59E0B">Lendária</span>
                </p>
            `).open();
        };

        const cardsGrid = container.createDiv({ cls: 'trading-cards-grid' });
        this.renderTradingCards(cardsGrid);

        // "View All" Button (Moved back to BOTTOM)
        const viewAllContainer = container.createDiv({ cls: 'view-all-container' });
        const viewAllBtn = viewAllContainer.createEl('button', { cls: 'mod-cta view-all-btn' });
        // Correct way to show Icon + Text in Obsidian Button
        const btnIcon = viewAllBtn.createSpan({ cls: 'btn-icon' });
        setIcon(btnIcon, 'layers');
        viewAllBtn.createSpan({ text: 'VER COLEÇÃO', cls: 'btn-text' });

        viewAllBtn.onclick = () => {
            (this.plugin as any).activateCollectionView();
        }
    }

    private renderCategoryDetail(container: HTMLElement) {
        if (!this.activeCategory) return;

        // Header / Back
        const header = container.createDiv({ cls: 'detail-view-header' });
        const backBtn = header.createDiv({ cls: 'back-btn-large' });
        setIcon(backBtn, 'arrow-left');
        backBtn.createSpan({ text: 'Voltar para Conquistas' });
        backBtn.onclick = () => {
            this.activeCategory = null;
            this.render();
        };

        header.createEl('h1', { text: this.activeCategory });

        // Logic
        const userAchievementsMap = new Map(((this.plugin as any).settings.achievements || []).map((a: any) => [a.id, a]));
        const allInCategory = ALL_ACHIEVEMENTS.filter(a => (a.category || 'Geral') === this.activeCategory);

        // Group by Tier
        const byTier: Record<string, Achievement[]> = {
            'Bronze': allInCategory.filter(a => a.tier === 'Bronze'),
            'Silver': allInCategory.filter(a => a.tier === 'Silver'),
            'Gold': allInCategory.filter(a => a.tier === 'Gold'),
            'Platinum': allInCategory.filter(a => a.tier === 'Platinum')
        };

        // Render Tiers
        const tiersContainer = container.createDiv({ cls: 'tiers-container' });

        const renderTier = (tierName: string, items: Achievement[], colorClass: string) => {
            if (items.length === 0) return;

            const unlockedCount = items.filter(a => userAchievementsMap.has(a.id)).length;
            const total = items.length;

            const tierSection = tiersContainer.createDiv({ cls: `tier-section ${colorClass}` });

            // Tier Header
            const tHead = tierSection.createDiv({ cls: 'tier-header' });
            tHead.createEl('h3', { text: tierName }); // "Bronze", "Prata"...
            tHead.createDiv({ cls: 'tier-counter', text: `${unlockedCount}/${total}` });

            // Grid
            const tGrid = tierSection.createDiv({ cls: 'tier-grid' });

            items.forEach(ach => {
                const isUnlocked = userAchievementsMap.has(ach.id);
                const card = tGrid.createDiv({ cls: `tier-card ${isUnlocked ? 'unlocked' : 'locked'}` });

                // Icon
                const iconBox = card.createDiv({ cls: 'tier-icon' });
                setIcon(iconBox, isUnlocked ? ach.icon || 'star' : 'lock');

                // Info
                const info = card.createDiv({ cls: 'tier-info' });
                info.createDiv({ cls: 'tier-ach-name', text: ach.name });
                info.createDiv({ cls: 'tier-ach-desc', text: ach.description });

                // Meta
                const footer = card.createDiv({ cls: 'tier-footer' });
                footer.createDiv({ cls: 'tier-xp', text: `+${ach.points} XP` });

                if (isUnlocked) {
                    const ua = userAchievementsMap.get(ach.id) as any;
                    if (ua && ua.unlockedDate) {
                        footer.createDiv({ cls: 'tier-date', text: moment(ua.unlockedDate).format('DD/MM') });
                    }
                }
            });
        };

        // Render in order
        renderTier('Bronze', byTier['Bronze'], 'tier-bronze');
        renderTier('Prata', byTier['Silver'], 'tier-silver');
        renderTier('Ouro', byTier['Gold'], 'tier-gold');
        renderTier('Platina', byTier['Platinum'], 'tier-platinum');
    }

    private renderHeader(container: HTMLElement) {
        // Correctly fetch user data from settings with SAME fallback as ProfileView
        const userName = (this.plugin as any).settings.userName || 'Viajante';
        const userPic = (this.plugin as any).settings.profilePicture || 'https://github.com/shadcn.png';

        // Calculate Stats
        const userAchievements = (this.plugin as any).settings.achievements || [];
        const level = 1; // Simplified for build stability
        const totalXP = 0;

        const header = container.createDiv({ cls: 'crystal-header' });

        // Avatar with Halo
        const avatarContainer = header.createDiv({ cls: 'avatar-halo' });
        const img = avatarContainer.createEl('img', { attr: { src: userPic } });
        img.addClass('avatar-img');

        // Border Config integration
        const borderColor = (this.plugin as any).settings.profileBorderColor;
        if (borderColor) {
            avatarContainer.style.background = `linear-gradient(135deg, ${borderColor}, #3b82f6)`;
            avatarContainer.style.boxShadow = `0 0 25px ${borderColor} 60`;
        }

        avatarContainer.createDiv({ cls: 'level-tag', text: `LVL ${level}` });

        // Text Info
        const info = header.createDiv({ cls: 'header-info' });
        info.createEl('h1', { text: userName });

        const statsRow = info.createDiv({ cls: 'stats-row' });

        const xpPill = statsRow.createDiv({ cls: 'stat-pill xp-pill' });
        setIcon(xpPill, 'zap');
        xpPill.createSpan({ text: `${totalXP} XP` });

        const trophyPill = statsRow.createDiv({ cls: 'stat-pill trophy-pill' });
        setIcon(trophyPill, 'trophy');
        trophyPill.createSpan({ text: `${userAchievements.length} Conquistas` });

        // Count Cards
        const collectedCount = ((this.plugin as any).settings.collectedCards || []).length;
        const totalCards = NEXUS_TRADING_CARDS.length;
        const cardPill = statsRow.createDiv({ cls: 'stat-pill card-pill' });
        setIcon(cardPill, 'layers');
        cardPill.createSpan({ text: `${collectedCount}/${totalCards} Cartas` });
    }

    private renderTradingCards(container: HTMLElement) {
        const collectedIds = new Set((this.plugin as any).settings.collectedCards || []);

        // Show only first 6 cards for preview
        const firstSix = NEXUS_TRADING_CARDS.slice(0, 6);

        firstSix.forEach(cardData => {
            const isCollected = collectedIds.has(cardData.id);
            const cardEl = container.createDiv({ cls: `nexus-trading-card ${isCollected ? 'collected' : 'locked'}` });

            if (isCollected) {
                cardEl.createDiv({ cls: 'foil-layer' });
                cardEl.style.setProperty('--card-accent', cardData.color);
            }

            const inner = cardEl.createDiv({ cls: 'card-inner' });

            // Top: Rarity
            const topRow = inner.createDiv({ cls: 'card-top' });
            const rarityMap: Record<string, string> = {
                'Common': 'COMUM', 'Uncommon': 'INCOMUM', 'Rare': 'RARA', 'Epic': 'ÉPICA', 'Legendary': 'LENDÁRIA'
            };
            topRow.createSpan({ cls: `rarity-badge ${cardData.rarity.toLowerCase()}`, text: rarityMap[cardData.rarity] || cardData.rarity });

            // Visual
            const visual = inner.createDiv({ cls: 'card-visual' });
            const iconContainer = visual.createDiv({ cls: 'visual-icon' });

            // Using Portuguese Series Names for Icon Mapping
            let iconName = 'box';
            if (cardData.series.includes('Origin') || cardData.series.includes('Financeira')) iconName = 'coins';
            else if (cardData.series.includes('Cyberpunk') || cardData.series.includes('Ética')) iconName = 'cpu';
            else if (cardData.series.includes('Crypto') || cardData.series.includes('Lendas')) iconName = 'server';
            else if (cardData.series.includes('Luxury') || cardData.series.includes('Luxuoso')) iconName = 'gem';

            setIcon(iconContainer, iconName);

            if (isCollected) {
                visual.style.background = `radial-gradient(circle, ${cardData.color}20, transparent)`;
                const svg = iconContainer.querySelector('svg');
                if (svg) svg.style.color = cardData.color;
            } else {
                visual.addClass('locked-visual');
                // Ghost Icon
                const ico = visual.createDiv({ cls: 'locked-icon-ghost' });
                setIcon(ico, iconName);
            }

            // Bottom: Info
            const info = inner.createDiv({ cls: 'card-bottom' });
            info.createEl('h3', { text: isCollected ? cardData.name : '???' });

            if (!isCollected) {
                const hint = cardData.unlockHint || "Continue evoluindo para desbloquear";
                info.createDiv({ cls: 'card-desc-locked', text: hint });
            }

            if (isCollected) {
                cardEl.setAttribute('title', cardData.description);
            }
        });
    }

    private renderCategoryCards(container: HTMLElement) {
        const userAchievements = new Map(((this.plugin as any).settings.achievements || []).map((a: any) => [a.id, a]));
        const categories = this.groupByCategory(ALL_ACHIEVEMENTS);

        Object.keys(categories).forEach((categoryName) => {
            const achievements = categories[categoryName];
            const unlockedCount = achievements.filter(a => userAchievements.has(a.id)).length;
            const totalCount = achievements.length;
            const progress = (totalCount > 0) ? (unlockedCount / totalCount) * 100 : 0;

            // Main Card Structure
            const card = container.createDiv({ cls: 'crystal-card' });

            // Click -> Switch to Detail View (Navigation)
            card.onclick = () => {
                this.activeCategory = categoryName;
                this.render();
            };

            const front = card.createDiv({ cls: 'card-front' });
            front.createDiv({ cls: 'shine-effect' });

            // Card Header
            const cardHead = front.createDiv({ cls: 'card-head' });
            const iconBox = cardHead.createDiv({ cls: 'card-icon' });
            setIcon(iconBox, achievements[0]?.icon || 'star');

            const cardTitle = cardHead.createDiv({ cls: 'card-title' });
            cardTitle.createEl('h3', { text: categoryName });
            if (progress === 100) cardTitle.createDiv({ cls: 'mastery-badge', text: 'MASTERIZADO' });

            // Progress Bar
            const progressContainer = front.createDiv({ cls: 'card-progress' });
            const barBg = progressContainer.createDiv({ cls: 'prog-bg' });
            const barFill = barBg.createDiv({ cls: 'prog-fill' });
            barFill.style.width = `${progress}%`;
            if (progress === 100) barFill.addClass('mastery-fill');

            progressContainer.createDiv({ cls: 'prog-text', text: `${Math.floor(progress)}% Completo` });
        });
    }

    private groupByCategory(achievements: Achievement[]) {
        return achievements.reduce((acc, ach) => {
            const cat = ach.category || 'Geral';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(ach);
            return acc;
        }, {} as Record<string, Achievement[]>);
    }

    private injectStyles() {
        const styleId = 'nexus-crystal-ui';
        const existing = document.getElementById(styleId);
        if (existing) existing.remove();

        const styleEl = document.head.createEl('style', { attr: { id: styleId } });
        styleEl.innerHTML = `
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;700&display=swap');

            .nexus-crystal-ui {
                --bg-dark: #050505;
                --card-glass: rgba(20, 20, 22, 0.4);
                --card-border: rgba(255, 255, 255, 0.06);
                --shine-color: rgba(255, 255, 255, 0.08);
                --accent: #8b5cf6; 
                --accent-glow: rgba(139, 92, 246, 0.4);
                
                font-family: 'Outfit', sans-serif;
                background-color: var(--bg-dark);
                background-image: 
                    radial-gradient(circle at 15% 50%, rgba(139, 92, 246, 0.08), transparent 25%),
                    radial-gradient(circle at 85% 30%, rgba(59, 130, 246, 0.08), transparent 25%);
                color: #fff;
                height: 100%;
                overflow-y: auto;
                padding: 40px;
            }
            
            .section-title {
                color: rgba(255,255,255,0.7);
                font-size: 1rem;
                text-transform: uppercase;
                letter-spacing: 2px;
                margin: 40px 0 20px 0;
                border-bottom: 1px solid rgba(255,255,255,0.05);
                padding-bottom: 10px;
                display: flex; align-items: center; gap: 10px;
            }
            .section-help-icon { opacity: 0.5; cursor: pointer; display: flex; }
            .section-help-icon:hover { opacity: 1; color: var(--accent); }
            .section-help-icon svg { width: 16px; height: 16px; }

            /* Header Styles */
            .crystal-header {
                display: flex; align-items: center; gap: 35px;
                margin-bottom: 30px; padding: 30px;
                background: rgba(255,255,255,0.02);
                border-radius: 24px; border: 1px solid var(--card-border);
                backdrop-filter: blur(10px);
            }
            .avatar-halo {
                width: 110px; height: 110px; position: relative;
                border-radius: 50%;
                background: linear-gradient(135deg, var(--accent), #3b82f6);
                padding: 3px; box-shadow: 0 0 25px var(--accent-glow);
            }
            .avatar-img {
                width: 100%; height: 100%; border-radius: 50%;
                background: #000; object-fit: cover;
                border: 4px solid #09090b; 
            }
            .level-tag {
                position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%);
                background: #09090b; border: 1px solid var(--accent); color: var(--accent);
                font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: 20px;
                z-index: 2; box-shadow: 0 4px 10px rgba(0,0,0,0.5); letter-spacing: 1px;
            }
            .header-info h1 { margin: 0 0 12px 0; font-size: 2.8rem; font-weight: 700; color: #fff; }
            .stats-row { display: flex; gap: 12px; flex-wrap: wrap; }
            .stat-pill {
                display: flex; align-items: center; gap: 8px;
                background: rgba(255,255,255,0.03); padding: 8px 16px; border-radius: 12px;
                font-size: 0.95rem; border: 1px solid rgba(255,255,255,0.05); color: #ccc;
            }
            .xp-pill svg { color: #f59e0b; }
            .trophy-pill svg { color: #3b82f6; }
            .card-pill svg { color: #ec4899; }

            /* Trading Cards */
            .trading-cards-grid {
                display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 20px; margin-bottom: 50px;
            }
            .nexus-trading-card {
                aspect-ratio: 2/3; background: #0c0c0c; border-radius: 12px;
                border: 1px solid #333; position: relative; transition: transform 0.3s ease;
            }
            .nexus-trading-card.collected {
                border-color: var(--card-accent, #fff); box-shadow: 0 0 15px rgba(0,0,0,0.5); cursor: pointer;
            }
            .nexus-trading-card.collected:hover {
                transform: translateY(-8px) scale(1.05); box-shadow: 0 20px 40px rgba(0,0,0,0.6); z-index: 5;
            }
            .rarity-badge {
                align-self: flex-end; font-size: 0.7rem; text-transform: uppercase; font-weight: 800;
                padding: 2px 6px; border-radius: 4px; background: #333; color: #aaa; margin-bottom: 10px;
            }
            .card-inner { height: 100%; display: flex; flex-direction: column; padding: 12px; }
            .card-visual {
                flex: 1; border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 10px;
                display: flex; align-items: center; justify-content: center; background: #050505;
            }
            .visual-icon svg { width: 40px; height: 40px; }
            .nexus-trading-card.locked { opacity: 0.4; filter: grayscale(1); border-style: dashed; }

            /* View All Link */
            .view-all-container {
                display: flex; justify-content: flex-start; margin-bottom: 40px;
                padding-left: 5px; /* Slight offset to align with grid cards */
            }
            .view-all-link {
                background: rgba(255,255,255,0.05); color: #ccc; border: 1px solid rgba(255,255,255,0.1);
                font-size: 0.9rem; padding: 8px 16px; border-radius: 6px; /* Less rounded */
                display: flex; align-items: center; gap: 8px; transition: all 0.2s;
                cursor: pointer; font-weight: 500;
            }
            .view-all-link svg { width: 14px; height: 14px; opacity: 0.7; }
            .view-all-link:hover { color: #fff; border-color: var(--accent); background: rgba(139, 92, 246, 0.1); }
            
            /* Categories (Main View) */
            .crystal-grid {
                display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px;
            }
            .crystal-card {
                background: var(--card-glass); border: 1px solid var(--card-border);
                border-radius: 20px; position: relative; overflow: hidden;
                transition: transform 0.3s; cursor: pointer;
            }
            .crystal-card:hover { transform: translateY(-5px); border-color: rgba(255,255,255,0.2); }
            .card-front { padding: 25px; }
            .card-head { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
            .card-icon {
                width: 50px; height: 50px; background: rgba(255,255,255,0.05); border-radius: 14px;
                display: flex; align-items: center; justify-content: center; font-size: 1.2em;
            }
            .mastery-badge {
                font-size: 0.65rem; background: #eab308; color: #000; font-weight: 800;
                padding: 2px 8px; border-radius: 10px; display: inline-block; margin-top: 4px;
            }
            .prog-bg { height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; }
            .prog-fill { height: 100%; background: var(--accent); }
            .mastery-fill { background: #eab308; box-shadow: 0 0 10px #eab308; }
            .prog-text { font-size: 0.8rem; color: #888; margin-top: 8px; text-align: right; }

            /* DETAIL VIEW (MISSION LOG MOCKUP) */
            .detail-view-header {
                display: flex; flex-direction: column; gap: 20px; margin-bottom: 40px;
            }
            .back-btn-large {
                display: flex; align-items: center; gap: 10px; cursor: pointer; color: #aaa; align-self: flex-start;
                font-size: 1.1rem; transition: color 0.2s;
            }
            .back-btn-large:hover { color: #fff; }
            .back-btn-large svg { width: 24px; height: 24px; }
            .detail-view-header h1 { font-size: 2.5rem; margin: 0; color: #fff; text-transform: uppercase; letter-spacing: 2px; }

            .tiers-container { display: flex; flex-direction: column; gap: 40px; }
            .tier-section { background: rgba(255,255,255,0.02); border-radius: 20px; padding: 25px; border: 1px solid rgba(255,255,255,0.05); }
            
            .tier-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 25px; }
            .tier-header h3 { margin: 0; font-size: 1.5rem; }
            .tier-counter { font-family: monospace; font-size: 1.2rem; opacity: 0.7; }

            /* Tier Colors */
            .tier-bronze { border-left: 4px solid #cd7f32; } .tier-bronze h3 { color: #cd7f32; }
            .tier-silver { border-left: 4px solid #c0c0c0; } .tier-silver h3 { color: #c0c0c0; }
            .tier-gold { border-left: 4px solid #ffd700; } .tier-gold h3 { color: #ffd700; }
            .tier-platinum { border-left: 4px solid #e5e4e2; } .tier-platinum h3 { color: #e5e4e2; }

            .tier-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
            
            .tier-card {
                background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
                padding: 20px; display: flex; flex-direction: column; gap: 15px; position: relative; overflow: hidden;
            }
            .tier-card.unlocked { border-color: var(--accent); background: linear-gradient(to bottom right, rgba(139, 92, 246, 0.05), transparent); }
            
            .tier-icon { 
                width: 40px; height: 40px; background: #111; border-radius: 8px; display: flex; align-items: center; justify-content: center;
                margin-bottom: 5px;
            }
            .tier-card.unlocked .tier-icon { background: var(--accent); color: #fff; }
            .tier-card.locked .tier-icon { color: #555; }

            .tier-ach-name { font-weight: bold; font-size: 1.1rem; }
            .tier-ach-desc { font-size: 0.9rem; color: #888; flex: 1; }
            
            .tier-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px; }
            .tier-xp { font-weight: bold; color: var(--accent); font-size: 0.85rem; }
            .tier-date { font-size: 0.8rem; color: #666; font-family: monospace; }
        `;
    }
}

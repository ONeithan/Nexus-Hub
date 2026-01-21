import { ItemView, WorkspaceLeaf, setIcon, Notice, moment } from "obsidian";
import NexusHubPlugin from "../main";
import { ALL_ACHIEVEMENTS, NEXUS_TRADING_CARDS, NEXUS_BADGES } from "../services/achievements";
import { calculateLevel, getExperienceForLevel, getRankTitle, isBadgeUnlocked } from "../helpers/gamification-helpers";
import { ProfileSettingsModal } from "../components/modals";
import { BadgeSelectionModal } from "../components/badge-selection-modal";
import { PackOpeningModal } from "../components/pack-opening-modal";

export const NEXUS_PROFILE_VIEW_TYPE = "nexus-profile-view";

export class ProfileView extends ItemView {
    plugin: NexusHubPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: NexusHubPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return NEXUS_PROFILE_VIEW_TYPE; }
    getDisplayText() { return 'Perfil'; }
    getIcon() { return "user"; }

    async onOpen() {
        this.render();
    }

    private render() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass("nexus-profile-v3");

        // MOBILE FIX: Apply padding inline to bypass CSS conflicts
        if ((this as any).app.isMobile) {
            container.style.paddingBottom = '100px';
        }

        this.injectStyles();

        // 1. Hero Card (Unified)
        const hero = container.createDiv({ cls: 'bento-card hero-card' });
        this.renderHero(hero);

        // 2. Main Grid
        const grid = container.createDiv({ cls: 'bento-grid' });

        // Left Column: Stats
        const leftCol = grid.createDiv({ cls: 'bento-col left-col' });
        this.renderStatsRow(leftCol);
        this.renderShowcase(leftCol); // Show Cards + Trophies
        // this.renderBadgesCard(leftCol); // Removed per user request (only show featured)

        // Right Column: Activity
        const rightCol = grid.createDiv({ cls: 'bento-col right-col' });
        this.renderActivityCard(rightCol);
    }

    private renderHero(container: HTMLElement) {
        // Banner Logic
        if ((this.plugin as any).settings.profileBanner) {
            container.style.backgroundImage = `linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.9)), url(${(this.plugin as any).settings.profileBanner})`;
            container.addClass('has-banner');
        } else {
            // REMOVED HARDCODED DARK BACKGROUND
            // Now relies on CSS .hero-card default background (theme adaptive)
            container.removeClass('has-banner');
        }

        const content = container.createDiv({ cls: 'hero-content' });
        // Use Flexbox for Left (Avatar+Info) and Right (Featured Badge) alignment
        content.style.display = 'flex';
        content.style.alignItems = 'center';
        content.style.justifyContent = 'space-between';
        content.style.width = '100%';

        // --- LEFT SIDE: AVATAR & INFO ---
        const leftSide = content.createDiv({ cls: 'hero-left' });
        leftSide.style.display = 'flex';
        leftSide.style.alignItems = 'center';
        leftSide.style.gap = '30px';

        // Avatar + Border Config
        // Avatar + Border Config (Standardized Halo + Level)
        const totalPointsForLevel = ((this.plugin as any).settings.achievements || []).reduce((sum: number, aa: any) => sum + aa.points, 0);
        const playerLevelCalc = calculateLevel(totalPointsForLevel);

        const avatarHalo = leftSide.createDiv({ cls: 'avatar-halo' }); // Replaces simple wrapper
        avatarHalo.style.cursor = 'pointer';

        // Avatar Image
        const avatarImg = avatarHalo.createEl('img', { cls: 'avatar-img' });
        avatarImg.src = (this.plugin as any).settings.profilePicture || 'https://github.com/shadcn.png';

        // Level Tag
        const levelTag = avatarHalo.createDiv({ cls: 'level-tag' });
        levelTag.setText(`LVL ${playerLevelCalc}`);

        // Border Styles - Use CSS variable for default border if none set, or dynamic
        const borderColor = (this.plugin as any).settings.profileBorderColor || 'var(--interactive-accent)';
        // Apply halo border color if custom
        if (borderColor !== 'var(--interactive-accent)') {
            avatarHalo.style.background = `linear-gradient(135deg, ${borderColor}, ${borderColor})`;
            avatarHalo.style.boxShadow = `0 0 25px ${borderColor}60`;
            levelTag.style.borderColor = borderColor;
            levelTag.style.color = borderColor;
        }

        if ((this.plugin as any).settings.profileBorderEffect === 'shine') avatarHalo.addClass('effect-shine');
        if ((this.plugin as any).settings.profileBorderEffect === 'glow') avatarHalo.addClass('effect-glow');

        // Click to Edit
        avatarHalo.onclick = () => new ProfileSettingsModal(this.app, this.plugin, () => this.render()).open();

        // Info Side
        const info = leftSide.createDiv({ cls: 'hero-text' });

        // Name & Edit
        const nameRow = info.createDiv({ cls: 'hero-name-row' });
        nameRow.createEl('h1', { text: (this.plugin as any).settings.userName || 'Viajante Nexus' });

        const editBtn = nameRow.createDiv({ cls: 'edit-btn-icon' });
        setIcon(editBtn, 'settings');
        editBtn.setAttribute('aria-label', 'Editar Perfil');
        editBtn.onclick = () => new ProfileSettingsModal(this.app, this.plugin, () => this.render()).open();

        // Level & Rank
        const metaRow = info.createDiv({ cls: 'hero-meta-row' });
        const rankBadge = metaRow.createDiv({ cls: 'rank-badge' });
        rankBadge.setText(getRankTitle(playerLevelCalc)); // e.g., "Novato", "Veterano"

        // Cards Collection Summary
        const collectedCards = (this.plugin as any).settings.collectedCards?.length || 0;
        const totalCards = NEXUS_TRADING_CARDS.length;
        const cardInfo = metaRow.createDiv({ cls: 'hero-card-info' });
        const cIcon = cardInfo.createDiv({ cls: 'mini-icon' }); setIcon(cIcon, 'layers');
        cardInfo.createSpan({ text: `${collectedCards}/${totalCards} Cartas` });


        // --- RIGHT SIDE: FEATURED BADGE (Clickable) ---
        const rightSide = content.createDiv({ cls: 'hero-right' });

        const badgeContainer = rightSide.createDiv({ cls: 'hero-badge-container' });
        badgeContainer.setAttribute('title', 'Clique para alterar insígnia');
        badgeContainer.style.cursor = 'pointer';

        // Add Click Handler
        badgeContainer.onclick = () => {
            new BadgeSelectionModal(this.app, this.plugin, () => this.render()).open();
        };

        const selectedBadgeId = (this.plugin as any).settings.selectedBadge;
        const badgeObj = NEXUS_BADGES.find(b => b.id === selectedBadgeId);

        if (badgeObj && isBadgeUnlocked(badgeObj.id, (this.plugin as any).settings)) {
            const badgeIcon = badgeContainer.createDiv({ cls: 'hero-badge-icon' });
            setIcon(badgeIcon, badgeObj.icon);
            // Optional: Add glow effect based on tier?
            const bLabel = badgeContainer.createDiv({ cls: 'featured-label' });
            bLabel.setText(badgeObj.name);
            badgeContainer.setAttribute('title', `Insígnia em Destaque: ${badgeObj.description}`);
        } else {
            // Placeholder if none selected or not unlocked
            const badgeIcon = badgeContainer.createDiv({ cls: 'hero-badge-icon placeholder' });
            setIcon(badgeIcon, 'shield');
            const bLabel = badgeContainer.createDiv({ cls: 'featured-label' });
            bLabel.setText('Nenhuma Insígnia');
            badgeContainer.setAttribute('title', 'Nenhuma insígnia selecionada ou desbloqueada.');
        }
    }

    private renderStatsRow(container: HTMLElement) {
        const row = container.createDiv({ cls: 'stats-grid' });

        const userAchievements = (this.plugin as any).settings.achievements || [];
        const totalXP = userAchievements.reduce((sum: any, aa: any) => sum + aa.points, 0);

        this.createStatCard(row, 'XP Total', `${totalXP}`, 'zap');
        this.createStatCard(row, 'Conquistas', `${userAchievements.length}`, 'trophy');
        // Calculate Streak logic could go here
        const streak = (this.plugin as any).settings.currentStreak || 0;
        const streakLabel = streak === 1 ? '1 Dia' : `${streak} Dias`;
        this.createStatCard(row, 'Sequência', streakLabel, 'flame');
    }

    private createStatCard(container: HTMLElement, label: string, value: string, icon: string) {
        const card = container.createDiv({ cls: 'bento-card mini-stat' });

        // MOBILE FIX: Apply background inline
        card.style.background = 'var(--background-secondary)';

        const iconDiv = card.createDiv({ cls: 'stat-icon' });

        // MOBILE FIX: Apply icon background inline
        iconDiv.style.background = 'var(--background-secondary-alt)';
        iconDiv.style.padding = '10px';
        iconDiv.style.borderRadius = '12px';

        setIcon(iconDiv, icon);

        // MOBILE FIX: Apply icon color inline (SVG-safe)
        const svgEl = iconDiv.querySelector('svg');
        if (svgEl) {
            svgEl.setAttribute('style', 'color: var(--interactive-accent);');
        }

        const textDiv = card.createDiv({ cls: 'stat-info' });
        textDiv.createDiv({ cls: 'stat-value', text: value });
        textDiv.createDiv({ cls: 'stat-label', text: label });
    }

    private renderShowcase(container: HTMLElement) {
        const showcase = container.createDiv({ cls: 'profile-showcase-section' });

        // --- COLUMN 1: BEST CARDS ---
        const cardsCol = showcase.createDiv({ cls: 'showcase-col' });
        const cHeader = cardsCol.createDiv({ cls: 'showcase-header' });
        cHeader.createEl('h3', { text: 'Melhores Cartas' });
        const cEdit = cHeader.createDiv({ cls: 'edit-icon', attr: { 'aria-label': 'Editar Destaques' } });
        setIcon(cEdit, 'pencil');
        cEdit.onclick = () => new Notice("Editar Destaques de Cartas: Em Breve!");

        this.renderBestCardsGrid(cardsCol);


        // --- COLUMN 2: BEST TROPHIES ---
        const trophiesCol = showcase.createDiv({ cls: 'showcase-col' });
        const tHeader = trophiesCol.createDiv({ cls: 'showcase-header' });
        tHeader.createEl('h3', { text: 'Melhores Conquistas' });
        const tEdit = tHeader.createDiv({ cls: 'edit-icon', attr: { 'aria-label': 'Editar Destaques' } });
        setIcon(tEdit, 'pencil');
        tEdit.onclick = () => new Notice("Editar Destaques de Conquistas: Em Breve!");

        this.renderBestTrophiesGrid(trophiesCol);
    }

    private renderBestCardsGrid(container: HTMLElement) {
        const collectedIds = new Set((this.plugin as any).settings.collectedCards || []);
        if (collectedIds.size === 0) {
            container.createDiv({ cls: 'empty-msg-small', text: 'Nenhuma carta.' });
            return;
        }

        // Top 3 Real Logic
        const myCards = NEXUS_TRADING_CARDS.filter(c => collectedIds.has(c.id));
        const rarityWeights: Record<string, number> = { 'Legendary': 5, 'Epic': 4, 'Rare': 3, 'Uncommon': 2, 'Common': 1 };
        const topCards = myCards.sort((a, b) => rarityWeights[b.rarity] - rarityWeights[a.rarity]).slice(0, 3);

        const grid = container.createDiv({ cls: 'showcase-grid' });

        topCards.forEach(cardData => {
            const el = grid.createDiv({ cls: 'nexus-trading-card showcase-item' });
            el.style.setProperty('--card-accent', cardData.color);
            el.createDiv({ cls: 'foil-layer' });

            const inner = el.createDiv({ cls: 'card-inner' });

            // Simplified for Showcase (Icon Only + Rarity)
            const visual = inner.createDiv({ cls: 'card-visual' });
            const iconContainer = visual.createDiv({ cls: 'visual-icon' });

            let iconName = 'box';
            if (cardData.series.includes('Origin') || cardData.series.includes('Financeira')) iconName = 'coins';
            else if (cardData.series.includes('Cyberpunk') || cardData.series.includes('Ética')) iconName = 'cpu';
            else if (cardData.series.includes('Crypto') || cardData.series.includes('Lendas')) iconName = 'server';
            else if (cardData.series.includes('Luxury') || cardData.series.includes('Luxuoso')) iconName = 'gem';

            setIcon(iconContainer, iconName);
            visual.style.background = `radial-gradient(circle, ${cardData.color}20, transparent)`;

            const svg = iconContainer.querySelector('svg');
            if (svg) svg.style.color = cardData.color;

            // Name at bottom (Truncated)
            const b = inner.createDiv({ cls: 'card-bottom compact' });
            b.createEl('span', { text: cardData.name });

            el.onclick = () => {
                new PackOpeningModal(this.plugin.app, cardData).open();
            }
        });
    }

    private renderBestTrophiesGrid(container: HTMLElement) {
        const userAchievements = (this.plugin as any).settings.achievements || [];
        if (userAchievements.length === 0) {
            container.createDiv({ cls: 'empty-msg-small', text: 'Nenhuma conquista.' });
            return;
        }

        // Top 3 (Sorted by Points/Tier)
        const topTrophies = [...userAchievements].sort((a: any, b: any) => b.points - a.points).slice(0, 3);

        const grid = container.createDiv({ cls: 'showcase-grid' });

        topTrophies.forEach((ach: any) => {
            const el = grid.createDiv({ cls: 'showcase-trophy-card' });

            // Icon
            const iconBox = el.createDiv({ cls: 'trophy-icon' });
            setIcon(iconBox, ach.icon || 'trophy');

            // Info
            const info = el.createDiv({ cls: 'trophy-info' });
            info.createDiv({ cls: 'trophy-name', text: ach.name });
            info.createDiv({ cls: 'trophy-xp', text: `+${ach.points} XP` });
        });
    }

    private renderBadgesCard(container: HTMLElement) {
        const card = container.createDiv({ cls: 'bento-card badges-card' });
        card.createEl('h3', { text: 'Insígnias' });

        const badgesGrid = card.createDiv({ cls: 'badges-grid' });

        NEXUS_BADGES.forEach(badge => {
            const unlocked = isBadgeUnlocked(badge.id, (this.plugin as any).settings);
            const badgeEl = badgesGrid.createDiv({ cls: `badge-item ${unlocked ? 'unlocked' : 'locked'}` });
            const iconEl = badgeEl.createDiv({ cls: 'badge-icon' });
            setIcon(iconEl, badge.icon);
            badgeEl.setAttribute('title', `${badge.name}: ${badge.description}`);

            // Highlight if selected
            if ((this.plugin as any).settings.selectedBadge === badge.id) {
                badgeEl.addClass('selected-badge-highlight');
                badgeEl.style.borderColor = '#a855f7';
                badgeEl.style.boxShadow = '0 0 10px rgba(168, 85, 247, 0.4)';
            }
        });
    }

    private renderActivityCard(container: HTMLElement) {
        const card = container.createDiv({ cls: 'bento-card activity-card' });
        card.createEl('h3', { text: 'Atividade Recente' });

        const list = card.createDiv({ cls: 'activity-list' });
        const userAchievements = (this.plugin as any).settings.achievements || [];
        const sorted = [...userAchievements]
            .sort((a, b) => new Date(b.unlockedDate).getTime() - new Date(a.unlockedDate).getTime())
            .slice(0, 10); // Show top 10

        if (sorted.length === 0) {
            list.createDiv({ cls: 'empty-msg', text: 'Nenhuma atividade recente.' });
            return;
        }

        sorted.forEach(ua => {
            const temp = ALL_ACHIEVEMENTS.find(x => x.id === ua.id);
            if (!temp) return;

            const row = list.createDiv({ cls: 'activity-row' });
            const icon = row.createDiv({ cls: 'act-icon' }); setIcon(icon, temp.icon);

            const info = row.createDiv({ cls: 'act-info' });
            info.createDiv({ cls: 'act-name', text: temp.name });
            info.createDiv({ cls: 'act-time', text: moment(ua.unlockedDate).fromNow() });

            row.createDiv({ cls: 'act-xp', text: `+${temp.points} XP` });
        });
    }

    private injectStyles() {
        const id = 'nexus-profile-styles-v8'; // Force reload v8
        const existing = document.getElementById(id);
        if (existing) existing.remove();

        const s = document.head.createEl('style', { attr: { id } });
        s.textContent = `
            .nexus-profile-v3 {
                padding: 20px;
                padding-bottom: 100px; /* Extra space for mobile toolbar */
                margin: 0;
                max-width: 100%;
                font-family: 'Inter', sans-serif;
                background-color: var(--background-primary);
                min-height: 100%;
                color: var(--text-normal);
            }
            .bento-card {
                background-color: var(--background-secondary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 24px;
                padding: 30px;
                overflow: hidden;
                box-shadow: var(--shadow-s);
            }
            
            /* Hero Wrapper */
            .hero-card {
                min-height: 250px;
                background-size: cover; background-position: center;
                display: flex; align-items: center; justify-content: flex-start;
                margin-bottom: 30px;
                position: relative;
                /* Adaptive Gradient Background (Light/Dark Safe) */
                background: linear-gradient(135deg, var(--background-secondary), var(--background-secondary-alt));
                border: 1px solid var(--background-modifier-border);
            }
            /* Only show overlay if there IS a background image (handled by JS adding .has-banner) */
            .hero-card.has-banner::before {
                content: '';
                position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                background: linear-gradient(to right, var(--background-primary), transparent);
                opacity: 0.8;
                z-index: 1;
                border-radius: 24px;
            }
            
            
            .hero-content {
                display: flex; align-items: center; gap: 40px; z-index: 2; width: 100%;
                position: relative; 
            }
            
            /* Standardized Avatar Halo (matches Dashboard/Achievements) */
            .avatar-halo {
                position: relative;
                width: 140px;
                height: 140px;
                border-radius: 50%;
                border: 4px solid var(--interactive-accent);
                box-shadow: 0 0 25px rgba(168, 85, 247, 0.4);
                cursor: pointer;
                transition: transform 0.3s;
                overflow: visible;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                background: var(--background-secondary);
            }
            .avatar-halo:hover { transform: scale(1.05); }
            
            .avatar-img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                border-radius: 50%;
            }
            
            .level-tag {
                position: absolute;
                bottom: -8px;
                left: 50%;
                transform: translateX(-50%);
                background: #09090b;
                color: var(--interactive-accent);
                font-size: 11px;
                font-weight: 800;
                padding: 4px 12px;
                border-radius: 20px;
                border: 1px solid var(--interactive-accent);
                z-index: 20;
                box-shadow: 0 4px 10px rgba(0,0,0,0.5);
                text-transform: uppercase;
                letter-spacing: 1px;
                white-space: nowrap;
            }
            
            /* Effects */
            .effect-shine { position: relative; overflow: hidden; }
            .effect-shine::after {
                content: ''; position: absolute; top:0; left:-100%; width: 50%; height: 100%;
                background: linear-gradient(to right, transparent, var(--text-accent), transparent);
                opacity: 0.3;
                transform: skewX(-25deg); animation: shineAnim 3s infinite;
            }
            @keyframes shineAnim { 0% { left: -100%; } 20% { left: 200%; } 100% { left: 200%; } }
            
            .hero-text { color: var(--text-normal); }
            .hero-name-row { display: flex; align-items: center; gap: 15px; margin-bottom: 10px; }
            .hero-name-row h1 { margin: 0; font-size: 2.5rem; font-weight: 800; line-height: 1; letter-spacing: -1px; color: var(--text-normal); }
            
            .edit-btn-icon { color: var(--text-muted); cursor: pointer; transition: color 0.2s; }
            .edit-btn-icon:hover { color: var(--interactive-accent); }

            .hero-meta-row { display: flex; align-items: center; gap: 15px; flex-wrap: wrap; }
            
            .rank-badge {
                background: var(--interactive-accent); color: var(--text-on-accent); padding: 4px 12px; border-radius: 20px;
                font-weight: 700; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.2);
            }
            
            .hero-card-info {
                display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: var(--text-muted);
                background: var(--background-modifier-form-field); padding: 4px 10px; border-radius: 6px;
            }
            .mini-icon svg { width: 14px; height: 14px; color: var(--text-muted); }

            /* Highlighted Badge */
            .hero-badge-container {
                width: 90px; height: 110px;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                transition: transform 0.2s; cursor: pointer;
                margin-left: auto; /* Push to right */
            }
            .hero-badge-container:hover { transform: scale(1.1); }
            
            .hero-badge-icon { 
                width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; 
                margin-bottom: 8px; filter: drop-shadow(0 0 10px var(--background-modifier-box-shadow));
            }
            .hero-badge-icon svg { width: 100%; height: 100%; color: var(--interactive-accent); }
            
            .hero-badge-icon.placeholder { opacity: 0.3; filter: none; }
            .hero-badge-icon.placeholder svg { color: var(--text-muted); }

            .featured-label { 
                font-size: 0.85rem; color: var(--text-normal); text-align: center; 
                line-height: 1.1; font-weight: 600;
            }

            /* Layout Columns */
            .bento-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
            .left-col { display: flex; flex-direction: column; gap: 30px; }
            
            /* Stats */
            .stats-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
            .mini-stat { padding: 20px; display: flex; align-items: center; gap: 15px; }
            .stat-icon { 
                background: var(--background-secondary-alt); /* Respects theme */
                padding: 10px; 
                border-radius: 12px; 
            }
            .stat-icon svg { color: var(--interactive-accent); } /* Theme accent color */
            .stat-value { font-size: 1.4rem; font-weight: 700; color: var(--text-normal); }
            .stat-label { font-size: 0.8rem; color: var(--text-muted); }
            
            /* Showcases */
            .showcase-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
            .showcase-header h3 { margin: 0; font-size: 1.1em; color: var(--text-normal); }
            .edit-icon { color: var(--text-muted); cursor: pointer; }
            
            .showcase-grid { display: flex; gap: 10px; justify-content: space-around; flex-wrap: wrap; }
            
            /* Use Specific Selector to Override Global Card Styles */
            .nexus-trading-card.showcase-item {
                width: 90px !important; height: 130px !important;
                background-color: var(--background-primary) !important;
                border: 1px solid var(--background-modifier-border) !important; 
                border-radius: 8px !important;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                cursor: pointer; position: relative; overflow: hidden;
                margin: 0 !important;
            }
            .nexus-trading-card.showcase-item .card-inner {
                padding: 0 !important; width: 100% !important; height: 100% !important;
                display: flex; flex-direction: column;
            }
            
            .card-visual { background: transparent; width: 100%; flex: 1; display: flex; align-items: center; justify-content: center; }
            .visual-icon svg { width: 32px; height: 32px; color: var(--text-normal); }
            .card-bottom.compact { font-size: 0.7em; padding: 4px; text-align: center; width: 100%; background: var(--background-secondary); color: var(--text-normal); }

            /* Rarity Glows */
            .nexus-trading-card.showcase-item.rarity-legendary { border-color: #f59e0b !important; box-shadow: 0 0 10px rgba(245, 158, 11, 0.2) !important; }
            .nexus-trading-card.showcase-item.rarity-epic { border-color: #a855f7 !important; box-shadow: 0 0 10px rgba(168, 85, 247, 0.2) !important; }
            .nexus-trading-card.showcase-item.rarity-rare { border-color: #3b82f6 !important; box-shadow: 0 0 10px rgba(59, 130, 246, 0.2) !important; }

            /* Trophy Card Styles (Missing in V4) */
            .showcase-trophy-card {
                width: 100px;
                background-color: var(--background-primary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 12px;
                padding: 10px;
                display: flex; flex-direction: column; align-items: center; gap: 8px;
                text-align: center;
            }
            .trophy-icon svg { width: 28px; height: 28px; color: #f59e0b; }
            .trophy-name { font-size: 0.8rem; font-weight: 600; line-height: 1.2; color: var(--text-normal); }
            .trophy-xp { font-size: 0.7rem; color: var(--text-muted); }

            /* Activity List */
            .activity-list { display: flex; flex-direction: column; gap: 0; }
            .activity-row { 
                display: flex; align-items: center; gap: 15px; 
                padding: 12px 0;
                border-bottom: 1px solid var(--background-modifier-border); 
            }
            .activity-row:last-child { border-bottom: none; }
            .act-icon { color: var(--text-muted); }
            .act-info { flex: 1; }
            .act-name { font-weight: 600; font-size: 0.95rem; color: var(--text-normal); }
            .act-time { font-size: 0.8rem; color: var(--text-muted); }
            .act-xp { font-weight: 700; color: var(--interactive-accent); font-size: 0.9rem; }

            /* --- MOBILE RESPONSIVENESS (POLISHED) --- */
            @media screen and (max-width: 768px) {
                .nexus-profile-v3 {
                    padding: 15px;
                }
                .bento-grid {
                    grid-template-columns: 1fr; /* Stack columns */
                    gap: 15px;
                }
                .hero-content {
                    flex-direction: column;
                    text-align: center;
                    gap: 15px;
                }
                
                /* HERO ON MOBILE: NO GRADIENT OVERLAY IF NO BANNER */
                /* If banner exists, keep it subtle. If not, rely on card bg. */
                .hero-card.has-banner::before {
                     background: linear-gradient(to bottom, var(--background-primary) 10%, transparent 90%);
                     opacity: 0.5;
                }
                
                .hero-left {
                    flex-direction: column;
                    text-align: center;
                }
                .hero-name-row {
                    justify-content: center;
                }
                .hero-meta-row {
                    justify-content: center;
                }
                .hero-badge-container {
                    margin-left: 0; 
                    margin-top: 10px;
                }
                
                /* COMPACT STATS: 3 Columns on Mobile */
                .stats-grid {
                    grid-template-columns: 1fr 1fr 1fr; /* Force 3 columns */
                    gap: 8px;
                }
                .mini-stat {
                    flex-direction: column;
                    padding: 10px;
                    justify-content: center;
                    text-align: center;
                    gap: 5px;
                    background-color: var(--background-secondary-alt); /* Theme respected */
                    border-radius: 12px;
                }
                .stat-icon { padding: 6px; border-radius: 8px; }
                .stat-value { font-size: 1.1rem; }
                .stat-label { font-size: 0.7rem; }
            }
        `;
    }
}

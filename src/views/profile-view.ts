import { ItemView, WorkspaceLeaf, setIcon, Notice, moment } from "obsidian";
import NexusHubPlugin from "../main";
import { ALL_ACHIEVEMENTS, NEXUS_TRADING_CARDS, NEXUS_BADGES } from "../services/achievements";
import { calculateLevel, getExperienceForLevel, getRankTitle, isBadgeUnlocked } from "../helpers/gamification-helpers";
import { ProfileSettingsModal } from "../components/modals";
import { BadgeSelectionModal } from "../components/badge-selection-modal";

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
        } else {
            container.style.background = `linear-gradient(135deg, #09090b 0%, #1a1a2e 100%)`;
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
        const avatarContainer = leftSide.createDiv({ cls: 'hero-avatar-wrapper' });
        const avatarImg = avatarContainer.createEl('img', { cls: 'hero-avatar' });
        avatarImg.src = (this.plugin as any).settings.profilePicture || 'https://github.com/shadcn.png';

        // Border Styles
        const borderColor = (this.plugin as any).settings.profileBorderColor || '#a855f7';
        avatarContainer.style.borderColor = borderColor;
        avatarContainer.style.boxShadow = `0 0 30px ${borderColor}40`; // Glow base
        if ((this.plugin as any).settings.profileBorderEffect === 'shine') avatarContainer.addClass('effect-shine');
        if ((this.plugin as any).settings.profileBorderEffect === 'glow') avatarContainer.addClass('effect-glow');

        // Click to Edit
        avatarContainer.onclick = () => new ProfileSettingsModal(this.app, this.plugin, () => this.render()).open();

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
        const totalPoints = ((this.plugin as any).settings.achievements || []).reduce((sum: number, aa: any) => sum + aa.points, 0);
        const playerLevel = calculateLevel(totalPoints);

        const metaRow = info.createDiv({ cls: 'hero-meta-row' });
        const rankBadge = metaRow.createDiv({ cls: 'rank-badge' });
        rankBadge.setText(getRankTitle(playerLevel)); // e.g., "Novato", "Veterano"

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
        const totalXP = userAchievements.reduce((sum, aa) => sum + aa.points, 0);

        this.createStatCard(row, 'XP Total', `${totalXP}`, 'zap');
        this.createStatCard(row, 'Conquistas', `${userAchievements.length}`, 'trophy');
        // Calculate Streak logic could go here
        const streak = (this.plugin as any).settings.currentStreak || 0;
        const streakLabel = streak === 1 ? '1 Dia' : `${streak} Dias`;
        this.createStatCard(row, 'Sequência', streakLabel, 'flame');
    }

    private createStatCard(container: HTMLElement, label: string, value: string, icon: string) {
        const card = container.createDiv({ cls: 'bento-card mini-stat' });
        const iconDiv = card.createDiv({ cls: 'stat-icon' }); setIcon(iconDiv, icon);
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
            const el = grid.createDiv({ cls: 'nexus-trading-card collected showcase-item' });
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
                const { PackOpeningModal } = require('../components/pack-opening-modal');
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
        const id = 'nexus-profile-styles-v4';
        const existing = document.getElementById(id);
        if (existing) existing.remove();

        const s = document.head.createEl('style', { attr: { id } });
        s.textContent = `
            .nexus-profile-v3 {
                padding: 20px; margin: 0; max-width: 100%;
                font-family: 'Inter', sans-serif;
                background: linear-gradient(to bottom, #09090b, #000);
                min-height: 100%;
                color: #fff;
            }
            .bento-card {
                background: rgba(255,255,255,0.03);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 24px;
                padding: 30px;
                overflow: hidden;
            }
            
            /* Hero */
            .hero-card {
                min-height: 250px;
                background-size: cover; background-position: center;
                display: flex; align-items: center; justify-content: flex-start;
                margin-bottom: 30px;
                position: relative;
            }
            .hero-content {
                display: flex; align-items: center; gap: 40px; z-index: 2; width: 100%;
            }
            .hero-avatar-wrapper {
                width: 140px; height: 140px;
                border: 4px solid #fff; /* Default override by JS */
                border-radius: 50%;
                cursor: pointer;
                transition: transform 0.3s;
                overflow: hidden;
            }
            .hero-avatar-wrapper:hover { transform: scale(1.05); }
            .hero-avatar { width: 100%; height: 100%; object-fit: cover; }
            
            /* Effects */
            .effect-shine { position: relative; overflow: hidden; }
            .effect-shine::after {
                content: ''; position: absolute; top:0; left:-100%; width: 50%; height: 100%;
                background: linear-gradient(to right, transparent, rgba(255,255,255,0.5), transparent);
                transform: skewX(-25deg); animation: shineAnim 3s infinite;
            }
            @keyframes shineAnim { 0% { left: -100%; } 20% { left: 200%; } 100% { left: 200%; } }
            
            .hero-text h1 { font-size: 3rem; margin: 0; line-height:                margin-bottom: 5px;
            }
            .hero-name-row { display: flex; align-items: center; gap: 15px; margin-bottom: 10px; }
            .hero-name-row h1 { margin: 0; font-size: 2.5rem; font-weight: 800; line-height: 1; letter-spacing: -1px; }
            
            .hero-meta-row { display: flex; align-items: center; gap: 15px; }
            
            .rank-badge {
                background: #a855f7; color: white; padding: 4px 12px; border-radius: 20px;
                font-weight: 700; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px;
                box-shadow: 0 4px 10px rgba(168, 85, 247, 0.4);
            }
            
            .hero-card-info {
                display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: #aaa;
                background: rgba(255,255,255,0.05); padding: 4px 10px; border-radius: 6px;
            }
            .mini-icon svg { width: 14px; height: 14px; color: #ccc; }

            .hero-featured-badge {
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                background: rgba(0,0,0,0.4); padding: 15px 25px; border-radius: 16px;
                border: 1px solid rgba(168, 85, 247, 0.3); backdrop-filter: blur(5px);
                transition: transform 0.3s;
            }
            .hero-featured-badge:hover { transform: scale(1.05); border-color: #a855f7; }
            .featured-icon svg { width: 40px; height: 40px; color: #a855f7; margin-bottom: 5px; filter: drop-shadow(0 0 8px rgba(168,85,247,0.6)); }
            .featured-label { font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #ddd; }

            /* Highlighted Badge */
            .hero-badge-container {
                width: 90px; height: 110px;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                transition: transform 0.2s; cursor: pointer;
            }
            .hero-badge-container:hover { transform: scale(1.1); }
            
            .hero-badge-icon { 
                width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; 
                margin-bottom: 8px; filter: drop-shadow(0 0 15px rgba(255,255,255,0.25));
            }
            .hero-badge-icon svg { width: 100%; height: 100%; }
            
            .hero-badge-icon.placeholder { opacity: 0.3; filter: none; }
            .hero-badge-icon.placeholder svg { color: #555; }

            .featured-label { 
                font-size: 0.85rem; color: #fff; text-align: center; 
                line-height: 1.1; font-weight: 600; text-shadow: 0 2px 4px rgba(0,0,0,0.8);
            }

            /* Layout Columns */
            .bento-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
            .left-col { display: flex; flex-direction: column; gap: 30px; }
            
            /* Stats */
            .stats-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
            .mini-stat { padding: 20px; display: flex; align-items: center; gap: 15px; }
            .stat-icon { background: rgba(255,255,255,0.05); padding: 10px; border-radius: 12px; }
            .stat-value { font-size: 1.4rem; font-weight: 700; }
            .stat-label { font-size: 0.8rem; color: #888; }
            
            /* Badges */
            .badges-card h3 { margin-top: 0; opacity: 0.7; }
            /* ... (badge styles kept if needed for restore) ... */

            /* Best Cards */
            .best-cards-card h3 { margin-top: 0; margin-bottom: 20px; opacity: 0.7; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px; }
            .best-cards-grid { 
                display: flex; gap: 15px; justify-content: center; /* Center them */
            }
            .mini-card {
                flex: 0 0 100px; /* Fixed width */
                aspect-ratio: 2/3; /* Vertical card shape */
                background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.8) 100%);
                border: 1px solid #333; border-radius: 8px;
                padding: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
                cursor: pointer; transition: all 0.3s ease;
                position: relative;
                overflow: hidden;
            }
            .mini-card:hover { transform: translateY(-5px) scale(1.05); z-index: 2; box-shadow: 0 10px 20px rgba(0,0,0,0.5); }
            
            .mini-card-icon {
                flex: 1; display: flex; align-items: center; justify-content: center; width: 100%;
                background: rgba(0,0,0,0.2); border-radius: 4px; margin-bottom: 5px;
            }
            .mini-card-icon svg { width: 32px; height: 32px; filter: drop-shadow(0 0 5px currentColor); }
            
            .mini-card-name { 
                font-size: 0.7rem; text-align: center; color: #eee; font-weight: 700; line-height: 1.1; 
                width: 100%; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
            }
            
            /* Rarity Glows */
            .mini-card.rarity-legendary { border-color: #f59e0b; box-shadow: 0 0 15px rgba(245, 158, 11, 0.15); }
            .mini-card.rarity-epic { border-color: #a855f7; box-shadow: 0 0 15px rgba(168, 85, 247, 0.15); }
            .mini-card.rarity-rare { border-color: #3b82f6; box-shadow: 0 0 15px rgba(59, 130, 246, 0.15); }

            /* Activity */
            .activity-list { display: flex; flex-direction: column; gap: 15px; margin-top: 20px; }
            .activity-row { display: flex; align-items: center; gap: 15px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 12px; }
            .activity-row:last-child { border-bottom: none; }
            .act-icon { color: #888; }
            .act-info { flex: 1; }
            .act-name { font-weight: 500; font-size: 0.95rem; color: #eee; }
            .act-time { font-size: 0.8rem; color: #666; }
            .act-xp { font-weight: 700; color: #a855f7; font-size: 0.9rem; }
        `;
    }
}

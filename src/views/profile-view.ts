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

        // this.injectStyles(); // Removed for compliance

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

    // private injectStyles() { ... } // Removed for compliance
}

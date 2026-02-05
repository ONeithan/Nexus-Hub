import { moment, ItemView, WorkspaceLeaf, Notice, setIcon, App, Modal, Setting, ButtonComponent, Menu, Platform } from "obsidian";
import { generateSavingOpportunities } from "../services/virtual-transaction-generator";
import { PromptModal } from "../components/modals";

import NexusHubPlugin from "../main";
import { ReportGenerator } from "../services/report-generator";
import {
    AddTransactionModal,
    ManageCreditCardsModal,
    AddCreditCardFormModal,
    CardBillDetailModal,
    AccountDetailModal,
    ConfirmationModal,
    AddExtraIncomeModal,
    ManageExtraIncomeModal,
    EditTransactionModal,
    GoalsModal,
    EmergencyFundModal,
    ManageBudgetsModal,
    NexusScoreHistoryModal,
    CreateEditGoalModal,
    ManageCategoriesModal,
    ProfilePictureModal,
    RegenerateRecurrencesModal // ADDED: New Modal for Fixing Recurrences
} from "../components/modals";
// import { ConfirmationModal } from "../helpers/ui-helpers"; // Removed to avoid duplicate
import { formatAsCurrency, calculateCardBill } from "../helpers/helpers";
import { eventManager } from '../helpers/EventManager';
import { Transaction, CreditCard } from "./settings";
import { calculateLevel } from "../helpers/gamification-helpers";

export const NEXUS_HUB_VIEW_TYPE = "nexus-hub-view";



// Adiciona uma interface para evitar o uso de 'any' ao acessar as configurações
interface AppWithSettings extends App {
    setting: {
        open: () => void;
        openTabById: (id: string) => void;
    };
}

export class NexusHubView extends ItemView {
    plugin: NexusHubPlugin;
    // Elementos do dashboard para atualização em tempo real
    private generator: ReportGenerator;
    private receitaValueEl: HTMLElement;
    private despesasValueEl: HTMLElement;
    private welcomeEl: HTMLElement;
    private nexusScoreEl: HTMLElement;
    private saldoValueEl: HTMLElement;
    private monthlySurplusEl: HTMLElement;
    private baseIncomeEl: HTMLElement;
    private extraIncomeEl: HTMLElement;
    private totalIncomeHeaderEl: HTMLElement;
    private accountViewMode: 'pending' | 'paid' = 'pending';
    private budgetContainer: HTMLElement;
    private alertsContainer: HTMLElement;
    private currentMonth: moment.Moment = moment();

    constructor(leaf: WorkspaceLeaf, plugin: NexusHubPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.generator = new ReportGenerator((this.plugin as any).settings);
    }

    getViewType() {
        return NEXUS_HUB_VIEW_TYPE;
    }

    getDisplayText() {
        return "Nexus Hub";
    }

    getIcon() {
        return "piggy-bank";
    }

    private injectStyles() {
        const styleId = 'nexus-hub-view-styles';
        const existingStyleEl = document.getElementById(styleId);
        if (existingStyleEl) {
            existingStyleEl.remove();
        }

        const styleEl = document.head.createEl('style', { attr: { id: styleId } });
        styleEl.innerHTML = `
            .player-avatar {
                --profile-border-color: var(--interactive-accent);
                width: 80px;
                height: 80px;
                border-radius: 50%;
                background-color: var(--background-secondary);
                border: 3px solid var(--background-modifier-border);
                cursor: pointer;
                /* overflow: hidden; REMOVED to allow Badge */
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
                flex-shrink: 0;
                position: relative;
            }
            .player-avatar:hover {
                transform: scale(1.05);
            }
            .player-avatar img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                border-radius: 50%; /* Added because container overflow is gone */
            }
            .player-avatar img.is-default-svg {
                width: 60%;
                height: 60%;
                filter: brightness(2.5);
            }

            @keyframes shine-animation {
                0%, 100% { box-shadow: 0 0 4px 1px var(--profile-border-color); }
                50% { box-shadow: 0 0 10px 3px #fff, 0 0 15px 5px var(--profile-border-color); }
            }

            .player-avatar.effect-shine:hover {
                animation: shine-animation 1.8s ease-in-out infinite;
            }

            @keyframes glow-animation {
                0%, 100% { box-shadow: 0 0 5px -2px var(--profile-border-color); }
                50% { box-shadow: 0 0 12px 4px var(--profile-border-color); }
            }


            .player-avatar.effect-glow:hover {
                animation: glow-animation 2.5s ease-in-out infinite;
            }

            /* --- Main Dashboard Avatar Fix --- */
            .main-avatar-wrapper {
                width: 100px;
                height: 100px;
                min-width: 100px; /* Prevent shrinking */
                min-height: 100px;
                position: relative; /* Ensure badges stick to avatar */
                aspect-ratio: 1 / 1; /* enforce circle */
                aspect-ratio: 1 / 1; /* enforce circle */
                border-radius: 50%;
                overflow: hidden;
                border: 3px solid var(--profile-border-color, #a855f7);
                box-shadow: 0 0 15px var(--profile-border-glow, rgba(168, 85, 247, 0.4));
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                background-color: var(--background-secondary);
                margin-right: 15px;
            }
            
            .main-avatar-img {
                width: 100%;
                height: 100%;
                object-fit: cover; /* crucial for non-square images */
                border-radius: 50%;
            }

            .main-avatar-wrapper.effect-shine { position: relative; overflow: hidden; }
            .main-avatar-wrapper.effect-shine::after {
                content: ''; position: absolute; top: 0; left: -100%; width: 50%; height: 100%;
                background: linear-gradient(to right, transparent, rgba(255,255,255,0.6), transparent);
                transform: skewX(-25deg); animation: mainAvatarShine 3s infinite;
            }
            @keyframes mainAvatarShine { 0% { left: -100%; } 20% { left: 200%; } 100% { left: 200%; } }

            .main-avatar-wrapper.effect-glow { animation: mainAvatarGlow 2s infinite alternate; }
            @keyframes mainAvatarGlow {
                0% { box-shadow: 0 0 10px var(--profile-border-glow); }
                100% { box-shadow: 0 0 20px var(--profile-border-glow), 0 0 5px var(--profile-border-color); }
            }


            .level-pill-badge {
                position: absolute;
                bottom: -8px;
                left: 50%;
                transform: translateX(-50%);
                background: #09090b; /* Fixed Black */
                color: var(--profile-border-color, #fff); /* Colored Text */
                font-size: 11px; /* Match Achievements */
                font-weight: 800;
                padding: 4px 12px;
                border-radius: 20px;
                border: 1px solid var(--profile-border-color, #333); /* 1px Border */
                z-index: 20;
                box-shadow: 0 4px 10px rgba(0,0,0,0.5);
                text-transform: uppercase;
                letter-spacing: 1px;
                white-space: nowrap;
                transition: all 0.3s ease;


            /* --- CRITICAL: MOBILE CLASS BASED STYLING (NO MEDIA QUERIES) --- */
            
            /* Mobile: Styling Only, Logic handled by JS */
            .nexus-hub-mobile .grid-actions .actions-content {
                /* Removed forced display none, using JS inline style instead */
                margin-top: 10px;
                padding-top: 10px;
                border-top: 1px solid var(--background-modifier-border);
            }

            /* Show when expanded - handled by JS inline style now, just keeping animation */
            .nexus-hub-mobile .grid-actions .actions-content {
                 animation: slideDown 0.2s ease-out;
            }

            /* Mobile Actions Header Styling */
            .mobile-actions-header {
                display: flex !important;
                justify-content: space-between;
                align-items: center;
                padding: 10px;
                background-color: var(--background-secondary); 
                border-radius: 8px;
                cursor: pointer;
                margin-bottom: 5px;
            }
            
            .mobile-actions-header h2 {
                margin: 0 !important;
                font-size: 1.1em;
            }


            /* --- NUCLEAR GRID RESET FOR MOBILE (A54 FIX) --- */
            /* This overrides the 280px sidebar grid template */
            .nexus-hub-mobile.nexus-hub-grid-container {
                display: flex !important;
                flex-direction: column !important;
                padding: 10px !important;
                height: auto !important;
                grid-template-columns: 1fr !important;
                grid-template-rows: auto !important;
                gap: 15px !important;
            }
            
            .nexus-hub-mobile .grid-area {
                width: 100% !important;
                padding: 15px !important;
                margin-bottom: 0px !important;
                box-sizing: border-box !important;
                height: auto !important;
            }

            .nexus-hub-mobile .grid-header,
            .nexus-hub-mobile .grid-summary,
            .nexus-hub-mobile .grid-actions,
            .nexus-hub-mobile .grid-main-content {
                grid-area: auto !important;
            }
            /* ----------------------------------------------- */

            /* --- BETTER TRANSACTION LIST --- */
            /* Apply this style if it's mobile OR if screen is small (fallback) */
            .nexus-hub-mobile .nexus-hub-account-item,
            @media screen and (max-width: 768px) {
                .nexus-hub-account-item {
                    background-color: var(--background-primary);
                    border: 1px solid var(--background-modifier-border);
                    border-radius: 12px;
                    margin-bottom: 12px;
                    padding: 16px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.05);
                    flex-direction: row; 
                    align-items: center;
                }
            }

            .nexus-hub-mobile .account-name,
             @media screen and (max-width: 768px) { .account-name { font-size: 1.1em; font-weight: 600; } }
            

            .nexus-hub-mobile .account-item-icon,
             @media screen and (max-width: 768px) { .account-item-icon { width: 32px; height: 32px; background: var(--background-modifier-hover); border-radius: 50%; padding: 6px; } }
            
            /* FIX SQUASHED LIST - MAKE IT HUGE */
            .nexus-hub-mobile .grid-main-content,
             @media screen and (max-width: 768px) { 
                .grid-main-content { 
                    min-height: 70vh !important; /* Take up 70% of viewport height at least */
                    padding-bottom: 80px; 
                    display: flex;
                    flex-direction: column;
                } 
                .accounts-list-container {
                    flex: 1; /* Grow to fill space */
                    display: flex;
                    flex-direction: column;
                }
            }
            
            /* NAV BUTTON STYLE FOR MOBILE - HIGH CONTRAST */
            .nexus-hub-mobile .nav-item {
                border: 1px solid var(--background-modifier-border-hover) !important;
                background-color: var(--background-secondary) !important; /* Distinct from main background */
                padding: 16px !important;
                margin-bottom: 12px !important;
                border-radius: 12px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                font-weight: 600;
                display: flex !important;
                align-items: center;
                gap: 15px;
            }
            .nexus-hub-mobile .nav-item:active {
                background-color: var(--interactive-accent) !important;
                color: var(--text-on-accent) !important;
                transform: scale(0.98);
            }
            .nexus-hub-mobile .nav-item-icon {
                 /* Make icons pop too */
                 color: var(--text-normal);
            }
            .nexus-hub-mobile .nav-item:active {
                background-color: var(--background-modifier-hover);
                transform: scale(0.98);
            }

            /* Ensure FAB is visible fix - SCOPED TO MOBILE CLASS */
            .nexus-hub-mobile .mobile-fab-add-transaction {
                display: flex !important;
                position: fixed;
                bottom: 25px;
                right: 25px;
                width: 56px;
                height: 56px;
                background-color: var(--interactive-accent);
                color: white;
                border-radius: 50%;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                z-index: 9999; /* Higher z-index just in case */
                cursor: pointer;
            }
             .nexus-hub-mobile .mobile-fab-add-transaction svg {
                width: 30px;
                height: 30px;
             }
             
            /* --- MODAL INPUT FIX (REMOVE UGLY DARK BG) --- */
            .modal-content input[type="text"],
            .modal-content input[type="number"],
            .modal-content select {
               background-color: var(--background-modifier-form-field) !important;
               border: 1px solid var(--background-modifier-border) !important;
               color: var(--text-normal) !important;
            }
             .modal-content input[type="text"]:focus,
            .modal-content input[type="number"]:focus,
            .modal-content select:focus {
               border-color: var(--interactive-accent) !important;
               box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2);
            }

            @keyframes slideDown {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }


            
            /* --- CRITICAL: PARANOID MOBILE HIDING (Desktop) --- */
            .mobile-fab-add-transaction,
            .mobile-actions-header {
                display: none !important;
            }
            /* -------------------------------------- */
        `;
    }

    async onOpen() {
        this.containerEl.addClass('nexus-hub-view');
        this.injectStyles();

        // Add Actions ONLY ONCE
        if (this.app.workspace.activeLeaf === this.leaf) {
            // Basic check, though addAction usually handles duplication if we don't clear? 
            // Actually, NexusHubView instance persists.
            // We should clear actions first? No API for that.
            // But since onOpen is called only on INIT usually, the issue is that we were calling it manually.
            // Converting manual calls to 'refreshDashboard()' will solve it.
        }

        // This action should strictly stay here and NOT be in the refresh loop
        this.addAction(
            'settings',
            'Abrir configurações',
            () => {
                (this.app as AppWithSettings).setting.open();
                (this.app as AppWithSettings).setting.openTabById((this.plugin as any).manifest.id);
            }
        );

        await this.refreshDashboard();
    }

    async refreshDashboard() {
        const { contentEl } = this;
        contentEl.empty();

        // ... (Rest of the previous onOpen logic starts here)

        const gridContainer = contentEl.createDiv({ cls: 'nexus-hub-grid-container' });

        // CRITICAL: MOBILE CLASS INJECTION
        if (Platform.isMobile) {
            gridContainer.addClass('nexus-hub-mobile');
        }



        const headerEl = gridContainer.createDiv({ cls: 'grid-area grid-header' });


        const headerContainer = headerEl.createDiv({ cls: 'header-container' });



        // Profile Picture (Standardized)
        const profileContainer = headerContainer.createDiv({ cls: 'main-profile-container' }); // New Parent
        profileContainer.style.position = 'relative';
        profileContainer.style.marginRight = '15px';

        const profileWrapper = profileContainer.createDiv({ cls: 'main-avatar-wrapper is-clickable' });
        // Remove margin from wrapper as it's now on container
        profileWrapper.style.marginRight = '0';

        const profilePictureEl = profileWrapper.createEl('img', { cls: 'main-avatar-img' });

        // Initial set
        const userPic = (this.plugin as any).settings.profilePicture || 'https://github.com/shadcn.png';
        profilePictureEl.src = userPic;

        // Level Indicator (Now outside wrapper to avoid clipping)
        const totalPoints = ((this.plugin as any).settings.achievements || []).reduce((sum: number, aa: any) => sum + aa.points, 0);
        const level = calculateLevel(totalPoints);

        const levelTag = profileContainer.createDiv({ cls: 'level-pill-badge' });
        levelTag.setText(`LVL ${level}`);

        // Click to Open Profile
        profileWrapper.addEventListener('click', () => {
            (this.plugin as any).activateProfileView();
        });

        // Ensure styles are applied to the new wrapper
        this.updateAvatarStyles(profileWrapper);



        this.welcomeEl = headerContainer.createEl('h1');



        // const headerActions = headerContainer.createDiv({ cls: 'header-actions' });



        this.nexusScoreEl = headerEl.createDiv({ cls: 'nexus-score is-clickable' });

        this.nexusScoreEl.setAttr('title', 'Clique para ver seu histórico de pontuação.');

        this.nexusScoreEl.addEventListener('click', () => {

            new NexusScoreHistoryModal(this.app, this.plugin).open();

        });



        const incomeSummaryHeader = headerEl.createDiv({ cls: 'income-summary-header' });



        const baseIncomeContainer = incomeSummaryHeader.createDiv({ cls: 'income-summary-item' });

        baseIncomeContainer.createDiv({ cls: 'income-summary-label', text: 'Salário' });

        this.baseIncomeEl = baseIncomeContainer.createDiv({ cls: 'income-summary-value' });



        const extraIncomeContainer = incomeSummaryHeader.createDiv({ cls: 'income-summary-item' });

        extraIncomeContainer.createDiv({ cls: 'income-summary-label', text: 'Renda Extra' });

        this.extraIncomeEl = extraIncomeContainer.createDiv({ cls: 'income-summary-value' });



        const totalIncomeContainer = incomeSummaryHeader.createDiv({ cls: 'income-summary-item' });

        totalIncomeContainer.createDiv({ cls: 'income-summary-label', text: 'Total' });

        this.totalIncomeHeaderEl = totalIncomeContainer.createDiv({ cls: 'income-summary-value' });



        const summaryEl = gridContainer.createDiv({ cls: 'grid-area grid-summary' });

        summaryEl.createEl('h2', { text: 'Resumo do Mês' });

        const summaryContainer = summaryEl.createDiv({ cls: 'stat-card-container' });



        const receitaCard = summaryContainer.createDiv({ cls: 'stat-card', attr: { 'id': 'receita-total-card' } });

        this.receitaValueEl = receitaCard.createDiv({ cls: "stat-value" });

        this.receitaValueEl.setText("R$ 0,00");

        const receitaLabel = receitaCard.createDiv({ cls: "stat-label" });

        receitaLabel.setText('Receita Total');



        const despesasCard = summaryContainer.createDiv({ cls: 'stat-card', attr: { 'id': 'despesas-pendentes-card' } });

        this.despesasValueEl = despesasCard.createDiv({ cls: "stat-value" });

        this.despesasValueEl.setText("R$ 0,00");

        const despesasLabel = despesasCard.createDiv({ cls: "stat-label" });

        despesasLabel.setText('Despesas Pendentes');



        const paidCard = summaryContainer.createDiv({ cls: 'stat-card', attr: { 'id': 'pago-no-mes-card' } });

        this.saldoValueEl = paidCard.createDiv({ cls: "stat-value" });

        this.saldoValueEl.setText("R$ 0,00");

        const paidLabel = paidCard.createDiv({ cls: "stat-label" });

        paidLabel.setText('Pago no Mês');



        const monthlySurplusCard = summaryContainer.createDiv({ cls: 'stat-card', attr: { 'id': 'saldo-projetado-card' } });

        this.monthlySurplusEl = monthlySurplusCard.createDiv({ cls: "stat-value" });

        this.monthlySurplusEl.setText("R$ 0,00");

        const surplusLabel = monthlySurplusCard.createDiv({ cls: "stat-label" });

        surplusLabel.setText('Saldo Projetado');




        const actionsEl = gridContainer.createDiv({ cls: 'grid-area grid-actions' });

        // Mobile Toggle for Actions - HARD PLATFORM CHECK
        // If this is Desktop, these elements will NEVER exist in the DOM.
        // This is the ultimate fix for the "Leakage".
        let mobileActionsHeader: HTMLElement | null = null;
        let mobileToggleIcon: HTMLElement | null = null;

        if (Platform.isMobile) {
            mobileActionsHeader = actionsEl.createDiv({ cls: 'mobile-actions-header' });
            mobileActionsHeader.createEl('h2', { text: 'Gerenciamento' });
            mobileToggleIcon = mobileActionsHeader.createDiv({ cls: 'mobile-toggle-icon' });
            setIcon(mobileToggleIcon, 'chevron-right'); // Start as collapsed icon
        }

        const actionsContent = actionsEl.createDiv({ cls: 'actions-content' });

        // CRITICAL: JS-BASED MOBILE TOGGLE LOGIC (CSS FREE)
        if (Platform.isMobile && mobileActionsHeader) {
            // 1. Force Hide Initially
            actionsContent.style.display = 'none';

            // 2. Attach Listener
            mobileActionsHeader.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const isHidden = actionsContent.style.display === 'none';

                if (isHidden) {
                    // Show
                    actionsContent.style.display = 'flex';
                    actionsContent.style.flexDirection = 'column';
                    actionsContent.style.gap = '10px';
                    if (mobileToggleIcon) { mobileToggleIcon.empty(); setIcon(mobileToggleIcon, 'chevron-down'); }
                } else {
                    // Hide
                    actionsContent.style.display = 'none';
                    if (mobileToggleIcon) { mobileToggleIcon.empty(); setIcon(mobileToggleIcon, 'chevron-right'); }
                }
            });
        }


        // On Mobile, content is hidden by default (handled by CSS .nexus-hub-mobile .actions-content { display: none })
        // On Desktop, it's visible.

        const addTransactionBtn = actionsContent.createEl('button', { cls: 'nexus-hub-button-primary' });

        // Ensure "Add Transaction" gets the Mobile Card treatment too
        if (Platform.isMobile) {
            addTransactionBtn.style.width = '100%';
            addTransactionBtn.style.padding = '16px';
            addTransactionBtn.style.borderRadius = '12px';
            addTransactionBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'; // Slightly stronger shadow
            addTransactionBtn.style.fontWeight = '700';
            addTransactionBtn.style.fontSize = '1.1em';
            addTransactionBtn.style.marginBottom = '20px'; // Extra space below
            addTransactionBtn.style.marginTop = '10px';
            addTransactionBtn.style.border = 'none';
            // Maintain primary color but enforce it inline
            addTransactionBtn.style.backgroundColor = 'var(--interactive-accent)';
            addTransactionBtn.style.color = 'var(--text-on-accent)';
        }

        addTransactionBtn.setText('Adicionar Transação');

        addTransactionBtn.addEventListener('click', () => new AddTransactionModal(this.app, this.plugin, this.currentMonth, () => this.updateDashboardCalculations()).open());

        // REMOVED FAB AS REQUESTED

        actionsContent.createEl('hr');

        const navContainer = actionsContent.createDiv({ cls: 'nav-container' });

        // Helper to force mobile styles immediately
        const applyMobileNavStyle = (el: HTMLElement) => {
            if (Platform.isMobile) {
                el.style.border = '1px solid var(--background-modifier-border-hover)';
                el.style.backgroundColor = 'var(--background-secondary)';
                el.style.padding = '16px';
                el.style.marginBottom = '12px';
                el.style.borderRadius = '12px';
                el.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
                el.style.display = 'flex';
                el.style.alignItems = 'center';
                el.style.gap = '15px';
                el.style.fontWeight = '600';
            }
        };

        const budgetBtn = navContainer.createDiv({ cls: 'nav-item' });
        applyMobileNavStyle(budgetBtn);
        setIcon(budgetBtn.createDiv({ cls: 'nav-item-icon' }), 'target');
        budgetBtn.createDiv({ cls: 'nav-item-label', text: 'Orçamentos' });

        budgetBtn.addEventListener('click', () => new ManageBudgetsModal(this.app, this.plugin).open());





        const categoriesBtn = navContainer.createDiv({ cls: 'nav-item' });
        applyMobileNavStyle(categoriesBtn);
        setIcon(categoriesBtn.createDiv({ cls: 'nav-item-icon' }), 'tag');

        categoriesBtn.createDiv({ cls: 'nav-item-label', text: 'Categorias' });

        categoriesBtn.addEventListener('click', () => new ManageCategoriesModal(this.app, this.plugin).open());



        const extraIncomeBtn = navContainer.createDiv({ cls: 'nav-item' });
        applyMobileNavStyle(extraIncomeBtn);
        setIcon(extraIncomeBtn.createDiv({ cls: 'nav-item-icon' }), 'plus-circle');

        extraIncomeBtn.createDiv({ cls: 'nav-item-label', text: 'Renda Extra' });

        extraIncomeBtn.addEventListener('click', () => new ManageExtraIncomeModal(this.app, this.plugin, () => this.refreshDashboard()).open());



        const goalsBtn = navContainer.createDiv({ cls: 'nav-item' });
        applyMobileNavStyle(goalsBtn);
        setIcon(goalsBtn.createDiv({ cls: 'nav-item-icon' }), 'flag');

        goalsBtn.createDiv({ cls: 'nav-item-label', text: 'Metas' });

        goalsBtn.addEventListener('click', () => new GoalsModal(this.app, this.plugin, 'All').open());



        const futureLedgerBtn = navContainer.createDiv({ cls: 'nav-item' });
        applyMobileNavStyle(futureLedgerBtn);
        setIcon(futureLedgerBtn.createDiv({ cls: 'nav-item-icon' }), 'calendar-clock');

        futureLedgerBtn.createDiv({ cls: 'nav-item-label', text: 'Lançamentos Futuros' });

        futureLedgerBtn.addEventListener('click', () => (this.plugin as any).activateFutureLedgerView());



        const cardsBtn = navContainer.createDiv({ cls: 'nav-item' });
        applyMobileNavStyle(cardsBtn);
        setIcon(cardsBtn.createDiv({ cls: 'nav-item-icon' }), 'credit-card');

        cardsBtn.createDiv({ cls: 'nav-item-label', text: 'Cartões' });

        cardsBtn.addEventListener('click', () => new ManageCreditCardsModal(this.app, this.plugin, this.currentMonth).open());



        const emergencyBtn = navContainer.createDiv({ cls: 'nav-item' });
        applyMobileNavStyle(emergencyBtn);
        setIcon(emergencyBtn.createDiv({ cls: 'nav-item-icon' }), 'shield');

        emergencyBtn.createDiv({ cls: 'nav-item-label', text: 'Fundo de Emergência' });

        emergencyBtn.addEventListener('click', () => new EmergencyFundModal(this.app, this.plugin).open());



        const reportsBtn = navContainer.createDiv({ cls: 'nav-item' });
        applyMobileNavStyle(reportsBtn);
        setIcon(reportsBtn.createDiv({ cls: 'nav-item-icon' }), 'pie-chart');

        reportsBtn.createDiv({ cls: 'nav-item-label', text: 'Relatórios' });

        reportsBtn.addEventListener('click', () => (this.plugin as any).activateReportView());



        const achievementsBtn = navContainer.createDiv({ cls: 'nav-item' });
        applyMobileNavStyle(achievementsBtn);
        setIcon(achievementsBtn.createDiv({ cls: 'nav-item-icon' }), 'award');

        achievementsBtn.createDiv({ cls: 'nav-item-label', text: 'Conquistas' });

        achievementsBtn.addEventListener('click', () => (this.plugin as any).activateAchievementsView());



        actionsEl.createEl('hr');

        actionsEl.createEl('h2', { text: 'Orçamentos do Mês' });

        this.budgetContainer = actionsEl.createDiv({ cls: 'budgets-container' });



        const mainEl = gridContainer.createDiv({ cls: 'grid-area grid-main-content' });

        // Fix for "Squashed List" on Mobile - INLINE STYLE
        if (Platform.isMobile) {
            mainEl.style.minHeight = '75vh'; // Force it to be huge
            mainEl.style.display = 'flex';
            mainEl.style.flexDirection = 'column';
        }

        mainEl.createEl('h2', { text: 'Transações do Mês' });



        this.alertsContainer = mainEl.createDiv({ cls: 'alerts-container' });



        const monthSelectorContainer = mainEl.createDiv({ cls: 'month-selector-container' });



        const prevMonthBtn = monthSelectorContainer.createEl('button', { text: '‹' });

        const monthInput = monthSelectorContainer.createEl('input', { type: 'month' });

        const nextMonthBtn = monthSelectorContainer.createEl('button', { text: '›' });

        const backToTodayBtn = monthSelectorContainer.createEl('button', { cls: 'clickable-icon nav-reset-btn' });
        setIcon(backToTodayBtn, 'rotate-ccw');
        backToTodayBtn.setAttr('title', 'Voltar para o Mês Atual');
        backToTodayBtn.addEventListener('click', () => {
            this.currentMonth = moment();
            this.updateViewForNewMonth();
        });



        monthInput.addEventListener('change', () => {

            if (monthInput.value) {

                this.currentMonth = moment(monthInput.value, 'YYYY-MM');

                this.updateViewForNewMonth();

            }

        });



        prevMonthBtn.addEventListener('click', () => {

            this.currentMonth.subtract(1, 'month');

            this.updateViewForNewMonth();

        });



        nextMonthBtn.addEventListener('click', () => {

            this.currentMonth.add(1, 'month');

            this.updateViewForNewMonth();

        });



        const viewModeContainer = mainEl.createDiv({ cls: 'view-mode-container' });

        const pendingBtn = viewModeContainer.createEl('button');

        pendingBtn.setText('Pendentes');

        pendingBtn.addClass('view-mode-btn');

        const paidBtn = viewModeContainer.createEl('button');

        paidBtn.setText('Pagas');

        paidBtn.addClass('view-mode-btn');



        if (this.accountViewMode === 'pending') pendingBtn.addClass('active'); else paidBtn.addClass('active');



        const focusToggleContainer = mainEl.createDiv({ cls: 'focus-toggle-container' });

        const focusBtn: HTMLButtonElement = focusToggleContainer.createEl('button');

        focusBtn.addClass('focus-mode-btn');

        focusBtn.setAttr('title', 'Alternar Modo Foco');

        setIcon(focusBtn, 'maximize');

        focusBtn.addEventListener('click', () => {

            gridContainer.classList.toggle('focus-mode-active');

            const newIcon = gridContainer.classList.contains('focus-mode-active') ? 'minimize' : 'maximize';

            // GAMIFICATION: Track Full Screen usage
            if (newIcon === 'minimize') { // Active
                this.plugin.settings.fullScreenUsageCount = (this.plugin.settings.fullScreenUsageCount || 0) + 1;
                this.plugin.saveSettings();
                this.plugin.dropSystem.checkForDrop({ id: 'focus_mode', description: 'Modo Foco', amount: 0, date: moment().format('YYYY-MM-DD'), type: 'expense', category: 'System', status: 'paid', isRecurring: false, isInstallment: false });
            }

            focusBtn.empty();

            setIcon(focusBtn, newIcon);

        });



        pendingBtn.addEventListener('click', () => {

            if (this.accountViewMode === 'pending') return;

            this.accountViewMode = 'pending';

            pendingBtn.addClass('active');

            paidBtn.removeClass('active');

            this.renderTransactions();

        });



        paidBtn.addEventListener('click', () => {

            if (this.accountViewMode === 'paid') return;

            this.accountViewMode = 'paid';

            paidBtn.addClass('active');

            pendingBtn.removeClass('active');

            this.renderTransactions();

        });




        this.updateHeader();

        this.updateViewForNewMonth();

        this.checkForUpcomingBills();

        // AUTO-FIX: Removing duplicate salary entries (Hotfix)
        this.deduplicateRecurringTransactions();

        const onDataChange = () => {

            this.updateHeader();

            this.updateDashboardCalculations();

            this.renderTransactions();

            this.updateAvatarStyles();

        };

        eventManager.on('data-changed', onDataChange);



        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const onNavigate = (...args: any[]) => {

            const month = args[0] as moment.Moment;

            this.currentMonth = month;

            this.updateViewForNewMonth();

        };

        eventManager.on('navigate-to-month', onNavigate);



        this.register(() => {

            eventManager.off('data-changed', onDataChange);

            eventManager.off('navigate-to-month', onNavigate);

        });

    }

    /**
     * Centralized filter to get all transactions relevant to a specific month.
     * @param month The month to filter transactions for.
     * @returns An array of transactions for that month.
     */
    private getTransactionsForMonth(month: moment.Moment): Transaction[] {
        const startOfMonth = month.clone().startOf('month');
        const endOfMonth = month.clone().endOf('month');
        return ((this.plugin as any).settings.transactions || []).filter((transaction: any) => {
            // Priority: Check paymentMonth property
            if (transaction.paymentMonth) {
                return transaction.paymentMonth === month.format('YYYY-MM');
            }

            // Fallback: Date range check (for legacy or simple items)
            const transactionDate = moment(transaction.date, 'YYYY-MM-DD');
            return transactionDate.isBetween(startOfMonth, endOfMonth, null, '[]');
        });
    }

    /**
     * Atualiza a UI para refletir um novo mês selecionado.
     */
    private updateViewForNewMonth() {
        // Garante que o seletor de mês reflita o estado atual
        const monthInput = this.contentEl.querySelector('.month-selector-container input[type="month"]') as HTMLInputElement;
        if (monthInput) {
            monthInput.value = this.currentMonth.format('YYYY-MM');
        }

        this.updateDashboardCalculations();
    }

    /**
     * Verifica transações pendentes próximas do vencimento e exibe uma notificação.
     */
    private async checkForUpcomingBills() {
        // Garante que a propriedade exista nas configurações
        if (!(this.plugin as any).settings.notifiedTransactionIds) {
            (this.plugin as any).settings.notifiedTransactionIds = [];
        }

        const upcomingTransactions = (this.plugin as any).settings.transactions.filter((tx: any) => {
            if (tx.status !== 'pending') return false;
            // Evita re-notificar
            if ((this.plugin as any).settings.notifiedTransactionIds?.includes(tx.id)) return false;

            const dueDate = moment(tx.date);
            const daysUntilDue = dueDate.diff(moment(), 'days');
            return daysUntilDue >= 0 && daysUntilDue <= 3; // Vencendo hoje ou nos próximos 3 dias
        });

        if (upcomingTransactions.length > 0) {
            const notifiedIds: string[] = [];
            upcomingTransactions.forEach((transaction: any) => {
                // new Notice(`Conta próxima do vencimento: ${transaction.description} vence ${moment(transaction.date).fromNow()} `, 10000); // Notificação dura 10s
                notifiedIds.push(transaction.id);
            });
            (this.plugin as any).settings.notifiedTransactionIds.push(...notifiedIds);
            await (this.plugin as any).saveSettings();
        }
    }

    /**
     * Atualiza o cabeçalho com o nome do usuário e o score.
     */
    private updateHeader() {
        const userName = (this.plugin as any).settings.userName;
        this.welcomeEl.setText(userName ? `Olá, ${userName}!` : 'Bem-vindo ao Nexus Hub');
        this.nexusScoreEl.setText(`Nexus Score: ${(this.plugin as any).settings.nexusScore || 0} `);
    }

    /**
     * Busca as contas no array de settings e as renderiza na tela.
     */
    private renderTransactionItem(transaction: Transaction, container: HTMLElement) {
        const itemEl = container.createDiv({ cls: "nexus-hub-account-item" });
        // DEBUG FLIGHT RECORDER: Show raw data on hover to diagnosis drift/month issues
        itemEl.setAttr('title', `Date: ${transaction.date} | PM: ${transaction.paymentMonth || 'N/A'} | ID: ${transaction.id} `);
        // Only apply 'is-paid' style if it's NOT income (user wants income to look normal/informative)
        if (transaction.type !== 'income') {
            itemEl.toggleClass('is-paid', transaction.status === 'paid');
        }

        const isPaused = transaction.pausedUntil && moment(transaction.pausedUntil).isSameOrAfter(moment(transaction.date), 'day');
        if (isPaused) {
            itemEl.addClass('is-paused');
            itemEl.setAttr('title', `Pausado até ${moment(transaction.pausedUntil).format('DD/MM/YYYY')} `);
        }

        const leftPanel = itemEl.createDiv({ cls: 'account-left-panel' });

        const iconContainer = leftPanel.createDiv({ cls: 'account-item-icon' });
        if (transaction.type === 'income') {
            setIcon(iconContainer, 'plus-circle');
            iconContainer.setAttr('title', 'Receita');
        } else if (transaction.isRecurring) {
            setIcon(iconContainer, 'repeat');
            iconContainer.setAttr('title', 'Transação Recorrente');
        } else {
            setIcon(iconContainer, 'file-text');
            iconContainer.setAttr('title', 'Transação Única');
        }

        // Checkbox Logic: Only for Expenses (Income is informative)
        if (transaction.type !== 'income') {
            const checkbox = leftPanel.createEl('input', { type: 'checkbox' });
            checkbox.checked = transaction.status === 'paid';
            checkbox.addEventListener('change', async (e) => {
                e.stopPropagation(); // Prevent row click from interfering

                const transactionInSettings = (this.plugin as any).settings.transactions.find((tx: any) => tx.id === transaction.id);
                if (transactionInSettings) {
                    const newStatus = checkbox.checked ? 'paid' : 'pending';

                    // Apply visual feedback immediately
                    if (newStatus === 'paid') {
                        itemEl.addClass('is-paid');
                    } else {
                        itemEl.removeClass('is-paid');
                    }

                    // Update data
                    transactionInSettings.status = newStatus;
                    transaction.status = newStatus; // Update the local transaction object too

                    if (newStatus === 'paid') {
                        await (this.plugin as any).handlePayment(transactionInSettings);
                    } else {
                        await (this.plugin as any).saveSettings();
                        eventManager.emit('data-changed'); // This will trigger a full re-render
                    }
                    // Re-calculate dashboard. This will also trigger a re-render,
                    // so the immediate visual feedback might be overwritten, which is fine.
                    this.updateDashboardCalculations();
                }
            });
        }

        const nameContainer = leftPanel.createDiv({ cls: 'account-name' });
        const descriptionEl = nameContainer.createDiv();

        let displayText = transaction.description;
        if (transaction.isInstallment && transaction.currentInstallment && transaction.totalInstallments) {
            // Check if description already has it (legacy or auto-generated)
            if (!displayText.includes(`(${transaction.currentInstallment}/${transaction.totalInstallments})`)) {
                displayText += ` (${transaction.currentInstallment}/${transaction.totalInstallments})`;
            }
        }
        descriptionEl.setText(displayText);

        if (isPaused) {
            const pausedIndicator = nameContainer.createSpan({ cls: 'paused-indicator' });
            setIcon(pausedIndicator, 'pause-circle');
            pausedIndicator.setAttr('title', `Pausado até ${moment(transaction.pausedUntil).format('DD/MM/YYYY')} `);
        }

        if (transaction.isRecurring || transaction.isInstallment) {
            nameContainer.addClass('is-clickable');
            nameContainer.addEventListener('click', () => {
                let groupKey: string;
                if (transaction.isInstallment && transaction.installmentOf) {
                    groupKey = transaction.installmentOf;
                } else {
                    groupKey = transaction.description;
                }
                new AccountDetailModal(this.app, this.plugin, groupKey, transaction.isInstallment).open();
            });
        }

        const dueDateText = `Vence em: ${moment(transaction.date).format('DD/MM/YYYY')} `;
        const dueDateEl = nameContainer.createDiv({ cls: "account-due-date" });
        dueDateEl.setText(dueDateText);

        const dueDate = moment(transaction.date);
        const now = moment();
        const daysUntilDue = dueDate.diff(now, 'days');

        if (transaction.status === 'pending') {
            if (dueDate.isBefore(now, 'day')) {
                dueDateEl.addClass('is-overdue');
            } else if (daysUntilDue <= 3) {
                const dueSoonIndicator = nameContainer.createSpan({ cls: 'due-soon-indicator' });
                setIcon(dueSoonIndicator, 'bell');
                const days = daysUntilDue + 1;
                const tooltipText = days === 1
                    ? 'Vence amanhã!'
                    : `Vence em ${days} dias.`;
                dueSoonIndicator.setAttr('title', tooltipText);
            }
        }

        const rightPanel = itemEl.createDiv({ cls: "account-right-panel" });
        const amountEl = rightPanel.createSpan();
        amountEl.setText(formatAsCurrency(transaction.amount));

        const duplicateBtn = rightPanel.createEl('button', { cls: 'action-btn' });
        setIcon(duplicateBtn, 'copy');
        duplicateBtn.setAttr('title', 'Duplicar Transação');
        duplicateBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Evita que o clique se propague para o item pai
            new AddTransactionModal(this.app, this.plugin, this.currentMonth, () => this.updateDashboardCalculations(), transaction).open();
        });

        const editBtn = rightPanel.createEl('button', { cls: 'action-btn' });
        setIcon(editBtn, 'pencil');
        editBtn.setAttr('title', 'Editar Transação');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            new EditTransactionModal(this.app, this.plugin, transaction, () => this.updateDashboardCalculations()).open();
        });

        const deleteBtn = rightPanel.createEl('button', { cls: 'action-btn' });
        setIcon(deleteBtn, 'trash');
        deleteBtn.setAttr('title', 'Apagar Transação');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (transaction.isRecurring) {
                // Custom confirm for recurring
                const modal = new Modal(this.app);
                modal.contentEl.addClass('nexus-fintech-modal');
                modal.contentEl.createEl('h2', { text: 'Apagar Recorrência' });
                modal.contentEl.createEl('p', { text: `Esta é uma transação recorrente(${transaction.recurrence || 'Recorrente'}).Como deseja apagar ? ` });

                const btnContainer = modal.contentEl.createDiv({ cls: 'modal-footer' });
                btnContainer.style.justifyContent = 'space-between'; // Spread buttons

                new Setting(btnContainer)
                    .addButton(btn => btn.setButtonText('Apenas esta').onClick(async () => {
                        (this.plugin as any).settings.transactions = (this.plugin as any).settings.transactions.filter((t: any) => t.id !== transaction.id);
                        await (this.plugin as any).saveSettings();
                        eventManager.emit('data-changed');
                        modal.close();
                    }))
                    .addButton(btn => btn.setButtonText('Todas as futuras').setWarning().onClick(async () => {
                        const txs = (this.plugin as any).settings.transactions;
                        (this.plugin as any).settings.transactions = txs.filter((t: any) => {
                            if (t.id === transaction.id) return false; // Remove target
                            // Logic: Remove all future matching recurrence
                            if (t.isRecurring && t.description === transaction.description && t.amount === transaction.amount && moment(t.date).isSameOrAfter(moment(transaction.date))) {
                                return false;
                            }
                            return true;
                        });
                        await (this.plugin as any).saveSettings();
                        eventManager.emit('data-changed');
                        modal.close();
                    }))
                    .addButton(btn => btn.setButtonText('Encerrar (Manter esta)').onClick(async () => {
                        // Logic: Remove ONLY future matching recurrence (Date > This). Keep this valid.
                        const txs = (this.plugin as any).settings.transactions;
                        (this.plugin as any).settings.transactions = txs.filter((t: any) => {
                            if (t.id === transaction.id) return true; // KEEP target

                            if (t.isRecurring && t.description === transaction.description && t.amount === transaction.amount && moment(t.date).isAfter(moment(transaction.date))) {
                                return false; // Remove ONLY future
                            }
                            return true;
                        });
                        await (this.plugin as any).saveSettings();
                        eventManager.emit('data-changed');
                        modal.close();
                    }));

                modal.open();
            } else if (transaction.isInstallment && transaction.installmentOf) {
                // Installment Logic
                const modal = new Modal(this.app);
                modal.contentEl.addClass('nexus-fintech-modal');
                modal.contentEl.createEl('h2', { text: 'Apagar Parcelamento' });
                modal.contentEl.createEl('p', { text: `Esta é uma parcela de ${transaction.description}.` });

                const btnContainer = modal.contentEl.createDiv({ cls: 'modal-footer' });
                new Setting(btnContainer)
                    .addButton(btn => btn.setButtonText('Apenas esta').onClick(async () => {
                        (this.plugin as any).settings.transactions = (this.plugin as any).settings.transactions.filter((t: any) => t.id !== transaction.id);
                        await (this.plugin as any).saveSettings();
                        eventManager.emit('data-changed');
                        modal.close();
                    }))
                    .addButton(btn => btn.setButtonText('Todas as parcelas').setWarning().onClick(async () => {
                        (this.plugin as any).settings.transactions = (this.plugin as any).settings.transactions.filter((t: any) => t.installmentOf !== transaction.installmentOf);
                        await (this.plugin as any).saveSettings();
                        eventManager.emit('data-changed');
                        modal.close();
                    }));
                modal.open();
            } else {
                new ConfirmationModal(
                    this.app,
                    'Apagar Transação',
                    `Tem certeza que deseja apagar a transação '${transaction.description}' ? `,
                    async () => {
                        (this.plugin as any).settings.transactions = (this.plugin as any).settings.transactions.filter((t: any) => t.id !== transaction.id);
                        await (this.plugin as any).saveSettings();
                        eventManager.emit('data-changed');
                    }
                ).open();
            }
        });

        // Botão para pagar com a reserva de emergência
        if (transaction.status === 'pending' && transaction.type === 'expense') {
            const payWithEFBtn = rightPanel.createEl('button', { cls: 'action-btn' });
            setIcon(payWithEFBtn, 'shield-check');
            payWithEFBtn.setAttr('title', 'Pagar com Fundo de Emergência');
            payWithEFBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await (this.plugin as any).payFromEmergencyFund(transaction.id);
            });
        }
        // A cor já é tratada pelo CSS geral para despesas, não precisa de classe extra.
    }

    private renderCardBillItem(card: CreditCard, bill: { total: number, dueDate: moment.Moment, transactions: Transaction[] }, container: HTMLElement) {
        const itemEl = container.createDiv({ cls: "nexus-hub-account-item is-credit-card-invoice" });

        const leftPanel = itemEl.createDiv({ cls: 'account-left-panel' }); // Adiciona o checkbox aqui

        const iconContainer = leftPanel.createDiv({ cls: 'account-item-icon' });
        setIcon(iconContainer, 'credit-card');
        iconContainer.setAttr('title', 'Fatura de Cartão de Crédito');

        // Checkbox para marcar a fatura como paga
        const checkbox = leftPanel.createEl('input', { type: 'checkbox' });
        const isBillFullyPaid = bill.transactions.every(t => t.status === 'paid');
        checkbox.checked = isBillFullyPaid;
        itemEl.toggleClass('is-paid', isBillFullyPaid); // Aplica o estilo de "pago" ao item

        checkbox.addEventListener('change', async () => {
            const newStatus = checkbox.checked ? 'paid' : 'pending';
            const transactionsToUpdate: Transaction[] = [];

            for (const billTransaction of bill.transactions) {
                const transactionInSettings = (this.plugin as any).settings.transactions.find((ts: any) => ts.id === billTransaction.id);
                if (transactionInSettings && transactionInSettings.status !== newStatus) { // Evita mudar status se já for o mesmo
                    transactionInSettings.status = newStatus;
                    transactionsToUpdate.push(transactionInSettings);
                }
            }

            if (transactionsToUpdate.length === 0) return;

            if (newStatus === 'paid') {
                await (this.plugin as any).handleBulkPayment(transactionsToUpdate);
            } else {
                // If un-paying, just save and refresh
                await (this.plugin as any).saveSettings();
                eventManager.emit('data-changed');
            }
        });

        const nameContainer = leftPanel.createDiv({ cls: 'account-name is-clickable' });
        nameContainer.addEventListener('click', () => new CardBillDetailModal(this.app, this.plugin, card.id, this.currentMonth, () => this.refreshDashboard()).open());
        const cardNameEl = nameContainer.createDiv();
        cardNameEl.setText(`Fatura ${card.name} `);

        const dueDateText = `Vence em: ${bill.dueDate.format('DD/MM/YYYY')} `;
        const dueDateEl = nameContainer.createDiv({ cls: "account-due-date" });
        dueDateEl.setText(dueDateText);

        const now = moment();
        const daysUntilDue = bill.dueDate.diff(now, 'days');

        if (!isBillFullyPaid) { // Só mostra alertas para faturas pendentes
            if (bill.dueDate.isBefore(now, 'day')) {
                dueDateEl.addClass('is-overdue');
            } else if (daysUntilDue <= 3) {
                const dueSoonIndicator = nameContainer.createSpan({ cls: 'due-soon-indicator' });
                setIcon(dueSoonIndicator, 'bell');
                const days = daysUntilDue + 1;
                const tooltipText = days === 1
                    ? 'Vence amanhã!'
                    : `Vence em ${days} dias.`;
                dueSoonIndicator.setAttr('title', tooltipText);
            }
        }

        const rightPanel = itemEl.createDiv({ cls: "account-right-panel" });
        const billTotalEl = rightPanel.createSpan();
        billTotalEl.setText(formatAsCurrency(bill.total));
    }

    async renderTransactions() {
        const mainEl = this.contentEl.querySelector('.grid-main-content') as HTMLElement;
        if (!mainEl) return;

        this.contentEl.querySelector('.accounts-list-container')?.remove();
        const container = mainEl.createDiv({ cls: 'accounts-list-container' });

        let transactionsInMonth = this.getTransactionsForMonth(this.currentMonth);

        // Generate and merge virtual transactions if in 'pending' view
        if (this.accountViewMode === 'pending') {
            const virtualTransactions = generateSavingOpportunities((this.plugin as any).settings, this.currentMonth);
            transactionsInMonth = [...transactionsInMonth, ...virtualTransactions];
        }

        // --- Render Expenses ---
        const expensesToDisplay = transactionsInMonth.filter(t =>
            t.type === 'expense' &&
            t.status === this.accountViewMode
        );

        expensesToDisplay.sort((a, b) => moment(a.date).diff(moment(b.date)));

        if (expensesToDisplay.length > 0) {
            container.createEl('h3', { text: 'Despesas', cls: 'transaction-section-title' });
            expensesToDisplay
                .filter(t => !t.cardId) // We still filter out card transactions to be grouped below
                .forEach(transaction => {
                    if (transaction.isVirtual) {
                        this.renderVirtualTransactionItem(transaction, container);
                    } else {
                        this.renderTransactionItem(transaction, container);
                    }
                });
        }

        // --- Render Credit Card Bills ---
        const billsToRender = new Map<string, { card: CreditCard, transactions: Transaction[], dueDate: moment.Moment }>();
        const cardTransactions = expensesToDisplay.filter(t => t.cardId && !t.isVirtual);

        for (const tx of cardTransactions) {
            const card = ((this.plugin as any).settings.creditCards || []).find((c: any) => c.id === tx.cardId);
            if (!card) continue;

            // Group by Card ID (since we are already filtered to a specific payment month)
            const billIdentifier = card.id;

            let billGroup = billsToRender.get(billIdentifier);
            if (!billGroup) {
                // ✅ FIX: Usar calculateCardBill para obter a data de vencimento CORRETA
                // A função já implementa a lógica: se vencimento < fechamento, vence no mês seguinte
                const billData = calculateCardBill(
                    (this.plugin as any).settings.transactions,
                    card,
                    this.currentMonth
                );
                const dueDate = billData.dueDate; // ✅ Data correta do helper

                billGroup = { card: card, transactions: [], dueDate: dueDate };
                billsToRender.set(billIdentifier, billGroup);
            }
            billGroup.transactions.push(tx as any);
        }

        billsToRender.forEach(({ card, transactions, dueDate }) => {
            if (transactions.length === 0) return;
            const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
            this.renderCardBillItem(card, { total, dueDate, transactions }, container);
        });


        // --- Render Income ---
        // STRICT: Only show PAID income that is indeed in the past/present.
        // Hides future "Paid" salary (user might have pre-filled 'paid' status).
        const incomeToDisplay = transactionsInMonth.filter(t =>
            t.type === 'income' &&
            t.status === 'paid' &&
            moment(t.date).isSameOrBefore(moment(), 'day')
        );

        incomeToDisplay.sort((a, b) => moment(a.date).diff(moment(b.date)));

        if (incomeToDisplay.length > 0) {
            container.createEl('h3', { text: 'Receitas', cls: 'transaction-section-title' });
            incomeToDisplay.forEach(transaction => {
                this.renderTransactionItem(transaction, container);
            });
        }


        // Display empty message if needed
        if (container.childElementCount === 0) {
            const message = this.accountViewMode === 'pending'
                ? 'Nenhuma transação pendente para este mês.'
                : 'Nenhuma transação paga para este mês.';
            container.createEl("p", { text: message, cls: 'empty-list-message' });
        }
    }

    /**
     * Renders a special item for a virtual saving opportunity (goal or emergency fund).
     */
    private renderVirtualTransactionItem(transaction: Transaction, container: HTMLElement) {
        const itemEl = container.createDiv({ cls: "nexus-hub-account-item is-virtual" });

        // Left Panel: Icon + Description
        const leftPanel = itemEl.createDiv({ cls: 'account-left-panel' });

        const iconContainer = leftPanel.createDiv({ cls: 'account-item-icon' });
        const icon = transaction.virtualType === 'goal' ? 'flag' : 'shield';
        setIcon(iconContainer, icon);
        iconContainer.setAttr('title', transaction.virtualType === 'goal' ? 'Meta de Economia' : 'Fundo de Emergência');

        const nameContainer = leftPanel.createDiv({ cls: 'account-name' });
        nameContainer.createDiv().setText(transaction.description);

        // FIX: Display Due Date for Debt Installments
        if (transaction.isInstallment && transaction.date) {
            const dateEl = nameContainer.createDiv({ cls: "account-due-date" });
            const today = moment().startOf('day');
            const dueDate = moment(transaction.date);
            dateEl.setText(`Vence em: ${dueDate.format('DD/MM/YYYY')}`);
            if (dueDate.isBefore(today)) {
                dateEl.addClass('is-overdue'); // Optional styling
                dateEl.style.color = 'var(--text-error)';
            }
        } else {
            nameContainer.createDiv({ cls: "account-due-date" }).setText('Oportunidade de economia para este mês');
        }

        // Right Panel: Amount + Actions
        const rightPanel = itemEl.createDiv({ cls: 'account-right-panel' });

        const amountEl = rightPanel.createSpan();
        amountEl.style.fontWeight = 'bold';
        amountEl.style.marginRight = '10px';
        amountEl.setText(formatAsCurrency(transaction.amount));

        // Container for buttons to align them properly
        const actionButtonsContainer = rightPanel.createDiv({ cls: 'account-action-buttons' });
        // Override vertical stacking for these specific buttons to be horizontal
        actionButtonsContainer.style.flexDirection = 'row';
        actionButtonsContainer.style.gap = '5px';

        const confirmBtn = actionButtonsContainer.createEl('button', { cls: 'action-btn' });
        setIcon(confirmBtn, 'check');
        confirmBtn.setAttr('title', 'Confirmar Economia');
        confirmBtn.addEventListener('click', async () => {
            await this.handleConfirmSaving(transaction, transaction.amount);
        });

        const editBtn = actionButtonsContainer.createEl('button', { cls: 'action-btn' });
        setIcon(editBtn, 'pencil');
        editBtn.setAttr('title', 'Editar Valor');
        editBtn.addEventListener('click', () => {
            if (transaction.virtualType === 'goal') {
                const goal = (this.plugin as any).settings.goals.find((g: any) => g.id === transaction.virtualId);
                if (goal) {
                    new CreateEditGoalModal(this.app, this.plugin, () => {
                        this.updateDashboardCalculations();
                    }, goal).open();
                } else {
                    // new Notice('Meta não encontrada.');
                }
            } else {
                new PromptModal(this.app, 'Editar Valor', 'Novo valor a ser guardado', async (newAmountStr) => {
                    const newAmount = parseFloat(newAmountStr.replace(/[^0-9,.-]+/g, "").replace(",", "."));
                    if (isNaN(newAmount) || newAmount <= 0) {
                        // new Notice('Valor inválido.');
                        return;
                    }
                    await this.handleConfirmSaving(transaction, newAmount);
                }, String(transaction.amount)).open();
            }
        });

        const skipBtn = actionButtonsContainer.createEl('button', { cls: 'action-btn' });
        setIcon(skipBtn, 'x');
        skipBtn.setAttr('title', 'Ignorar este Mês');
        skipBtn.addEventListener('click', async () => {
            const monthKey = this.currentMonth.format('YYYY-MM');
            if (transaction.virtualType === 'goal') {
                const goal = (this.plugin as any).settings.goals.find((g: any) => g.id === transaction.virtualId);
                if (goal) {
                    if (!goal.skippedMonths) goal.skippedMonths = [];
                    goal.skippedMonths.push(monthKey);
                }
            } else if (transaction.virtualType === 'fund') {
                const fund = (this.plugin as any).settings.emergencyFund;
                if (fund) {
                    if (!fund.skippedMonths) fund.skippedMonths = [];
                    fund.skippedMonths.push(monthKey);
                }
            }
            await (this.plugin as any).saveSettings();
            eventManager.emit('data-changed');
            // new Notice('Economia ignorada para este mês.');
        });
    }

    /**
     * Handles the logic for confirming a saving opportunity, creating real transactions and updating goal/fund state.
     */
    private async handleConfirmSaving(virtualTx: Transaction, amount: number) {
        let category = 'Metas';
        let goal: any = undefined;

        if (virtualTx.virtualType === 'goal') {
            goal = (this.plugin as any).settings.goals.find((g: any) => g.id === virtualTx.virtualId);
            if (goal && goal.goalType === 'Debt') {
                category = 'Dívidas';
            }
        } else if (virtualTx.virtualType === 'fund') {
            category = 'Investimentos';
        }

        const realTxDescription = `Aporte para: ${virtualTx.description.replace('Economia para a meta: ', '').replace('Pagamento de Dívida: ', '')} `;
        const newRealTransaction: Transaction = {
            id: `txn_${Date.now()}`,
            description: realTxDescription,
            amount: amount,
            // FIX: Preserve the Virtual Date (Due Date)
            date: virtualTx.date || moment().format('YYYY-MM-DD'),
            category: category,
            type: 'expense',
            status: 'paid',
            isRecurring: false,
            isInstallment: virtualTx.isInstallment || false,
            installmentOf: virtualTx.installmentOf,
            currentInstallment: virtualTx.currentInstallment,
            totalInstallments: virtualTx.totalInstallments,
            paymentMonth: this.currentMonth.format('YYYY-MM'),
            isVirtual: false, // Explicitly false
        };

        (this.plugin as any).settings.transactions.push(newRealTransaction);

        // Feedback to user
        new Notice(`Economia registrada com sucesso em ${this.currentMonth.format('MM/YYYY')}!`);

        if (virtualTx.virtualType === 'goal' && goal) {
            if (goal) {
                goal.currentAmount += amount;
                if (!goal.history) goal.history = [];
                goal.history.push({
                    date: new Date().toISOString(),
                    amount: amount,
                    balanceAfter: goal.currentAmount,
                    referenceMonth: this.currentMonth.format('YYYY-MM') // FIX: Link payment to VIEWED month
                });
                if (goal.currentAmount >= goal.targetAmount) {
                    goal.completed = true;
                    // new Notice(`Parabéns! Você completou sua meta '${goal.name}'!`);
                }
            }
        } else if (virtualTx.virtualType === 'fund') {
            const fund = (this.plugin as any).settings.emergencyFund;
            if (fund) {
                fund.currentBalance += amount;
                if (!fund.history) fund.history = [];
                fund.history.push({
                    type: 'deposit',
                    amount: amount,
                    date: new Date().toISOString(),
                    balanceAfter: fund.currentBalance,
                    reason: 'Contribuição mensal',
                    referenceMonth: this.currentMonth.format('YYYY-MM') // FIX: Link payment to VIEWED month 
                });
            }
        }

        await (this.plugin as any).saveSettings();
        eventManager.emit('data-changed');
        // new Notice(`Valor de ${formatAsCurrency(amount)} guardado com sucesso!`);
    }

    /**
     * O coração do dashboard. Calcula e atualiza os valores dos cards de resumo.
     */
    async updateDashboardCalculations() {
        // --- DATA CALCULATION ---

        // 1. Get current official salary from settings for header display
        const { salarioLiquido, salarioLiquido2, salaryFrequency } = (this.plugin as any).settings;
        const currentOfficialSalary = salaryFrequency === 'bi-weekly'
            ? (salarioLiquido || 0) + (salarioLiquido2 || 0)
            : (salarioLiquido || 0);

        // 2. Process transactions for the currently viewed month in a single pass
        const monthSummary = {
            baseIncome: 0,
            extraIncome: 0,
            pendingExpenses: 0,
            paidExpenses: 0,
            committedSpendingByCategory: new Map<string, number>()
        };

        let transactionsInMonth = this.getTransactionsForMonth(this.currentMonth);
        // FIX: Always include virtual transactions in calculation scope regardless of view mode
        // This ensures "Despesas Pendentes" counts Future Goals/Bills correctly even if user is on "Paid" tab.
        const virtualTransactions = generateSavingOpportunities((this.plugin as any).settings, this.currentMonth);
        transactionsInMonth = [...transactionsInMonth, ...virtualTransactions];

        for (const transaction of transactionsInMonth) {
            if (transaction.type === 'income') {
                if (transaction.isRecurring) {
                    monthSummary.baseIncome += transaction.amount;
                } else {
                    monthSummary.extraIncome += transaction.amount;
                }
            } else { // type === 'expense'
                // For budget calculation
                const category = ((this.plugin as any).settings.categories || []).find((c: any) => c.name === transaction.category);
                if (category) {
                    const currentSpending = monthSummary.committedSpendingByCategory.get(category.id) || 0;
                    monthSummary.committedSpendingByCategory.set(category.id, currentSpending + transaction.amount);
                }

                // For summary cards
                if (transaction.status === 'paid') {
                    // FIX: Only count REAL paid expenses. Virtual ones should have become real, but double check.
                    if (!transaction.isVirtual) {
                        monthSummary.paidExpenses += transaction.amount;
                    }
                } else if (transaction.status === 'pending') {
                    const isPaused = transaction.pausedUntil && moment(transaction.pausedUntil).isSameOrAfter(moment(transaction.date), 'day');
                    if (!isPaused) {
                        // FIX: Count ALL pending (Real + Virtual Bills/Goals)
                        monthSummary.pendingExpenses += transaction.amount;
                    }
                }
            }
        }

        // FIX: If no recurring income transaction was found for the current month (e.g., new user),
        // use the official total salary as the base income.
        // FIX: If no recurring income transaction was found for the current month (or any future month),
        // use the official total salary as the base income projection.
        // This ensures the dashboard never looks "empty" even if specific transactions aren't generated yet.
        if (monthSummary.baseIncome === 0) {
            monthSummary.baseIncome = currentOfficialSalary;
        }

        const totalIncomeForMonth = monthSummary.baseIncome + monthSummary.extraIncome;

        // 3. Calculate monthly surplus projection
        // 3. User Request: "Saldo Projetado só pode mostrar o valor q vai sobrar quando marcar como pago"
        // This means it starts at Total Income and decreases ONLY as you Pay (Paid Expenses increase).
        // Wait, if "Paid increases", then "Income - Paid" would decrease.
        // User said: "só pode mudar quando as coisas forem marcado como pago e dai ele vai mostrando o tanto que vai sobrar por isso ele tem o valor do valor total da conta."
        // Example: Income 3000. Nothing Paid. Balance = 3000.
        // Pay 100. Paid = 100. Balance = 2900.
        // This is strictly "Current Cash Available" logic, ignoring pending bills.

        // OLD LOGIC (Projected): Income - (Pending + Paid) => Shows final month result.
        // NEW LOGIC (Cash Flow): Income - Paid => Shows current available money.

        const monthlySurplus = totalIncomeForMonth - monthSummary.paidExpenses;

        // --- UI UPDATE ---

        // Header: Show current official salary, but month-specific extras and total
        this.baseIncomeEl.setText(formatAsCurrency(currentOfficialSalary));
        this.extraIncomeEl.setText(formatAsCurrency(monthSummary.extraIncome));
        this.totalIncomeHeaderEl.setText(formatAsCurrency(totalIncomeForMonth));

        // Summary cards: Use the calculated summary for the selected month
        this.receitaValueEl.setText(formatAsCurrency(totalIncomeForMonth));
        this.despesasValueEl.setText(formatAsCurrency(monthSummary.pendingExpenses));
        // FIX: 'saldoValueEl' corresponds to 'Pago no Mês' card in the constructor. 
        // It should show paidExpenses, NOT monthlySurplus.
        this.saldoValueEl.setText(formatAsCurrency(monthSummary.paidExpenses));
        this.monthlySurplusEl.setText(formatAsCurrency(monthlySurplus));

        this.monthlySurplusEl.toggleClass('is-negative', monthlySurplus < 0);

        // Alert for negative projection
        if (monthlySurplus < 0) {
            this.renderNegativeBalanceAlert(monthlySurplus);
        } else {
            this.clearAlerts();
        }

        // --- RENDER CHILD COMPONENTS ---
        // Pass calculated data down to avoid re-calculation
        await this.renderTransactions();
        this.renderBudgets(monthSummary.committedSpendingByCategory);
    }

    private updateAvatarStyles(wrapperEl?: HTMLElement) {
        // Find the wrapper if not passed (useful for data-changed events)
        const wrapper = wrapperEl || this.containerEl.querySelector('.main-avatar-wrapper') as HTMLElement;
        if (!wrapper) return;

        const profilePictureEl = wrapper.querySelector('img') as HTMLImageElement;

        // Update Image Source Reactive
        const userPic = (this.plugin as any).settings.profilePicture || 'https://github.com/shadcn.png';
        if (profilePictureEl) {
            profilePictureEl.src = userPic;
            profilePictureEl.classList.remove('is-default-svg');
        }

        // Reset
        wrapper.style.borderColor = '';
        wrapper.style.boxShadow = '';
        wrapper.classList.remove('effect-shine', 'effect-glow');
        wrapper.style.removeProperty('--profile-border-color');
        wrapper.style.removeProperty('--profile-border-glow');

        // Get Settings
        const { profileBorderColor, profileBorderEffect } = (this.plugin as any).settings;
        const color = profileBorderColor || '#a855f7'; // Default Purple

        // Apply to Container (so Level Tag inherits)
        const container = wrapper.parentElement;
        if (container) {
            container.style.setProperty('--profile-border-color', color);
            container.style.setProperty('--profile-border-glow', `${color}40`);

            // BRUTE FORCE: Directly set background on Level Tag to guarantee update
            const levelTag = container.querySelector('.level-pill-badge') as HTMLElement; // Updated Class
            if (levelTag) {
                levelTag.style.backgroundColor = '#09090b'; // Fixed Black
                levelTag.style.color = color; // Colored Text
                levelTag.style.borderColor = color; // Colored Border
                levelTag.style.boxShadow = `0 4px 10px rgba(0,0,0,0.5)`; // Standard Shadow
            }
        }

        // Keep applying direct styles to wrapper
        wrapper.style.setProperty('--profile-border-color', color);
        wrapper.style.borderColor = color;
        // Base Glow
        wrapper.style.boxShadow = `0 0 15px ${color}40`;

        if (profileBorderEffect && profileBorderEffect !== 'none') {
            wrapper.classList.add(`effect-${profileBorderEffect}`);
        }
    }


    private renderNegativeBalanceAlert(negativeAmount: number) {
        this.clearAlerts(); // Limpa alertas antigos
        const alertBox = this.alertsContainer.createDiv({ cls: 'alert-box is-warning' });
        const iconEl = alertBox.createDiv({ cls: 'alert-icon' });
        setIcon(iconEl, 'alert-triangle');
        const textEl = alertBox.createDiv({ cls: 'alert-text' });
        textEl.createEl('strong', { text: 'Atenção:' });
        textEl.appendText(` Seu saldo projetado para o mês está negativo em ${formatAsCurrency(negativeAmount)}.`);
    }

    private clearAlerts() {
        this.alertsContainer.empty();
    }

    private renderBudgets(spendingMap: Map<string, number>) {
        this.budgetContainer.empty();
        const budgets = (this.plugin as any).settings.budgets || [];

        if (budgets.length === 0) {
            this.budgetContainer.createEl('p', { text: 'Nenhum orçamento definido. Crie um na tela de gerenciamento.', cls: 'mod-subtle' });
            return;
        }

        // The spendingMap is now passed directly from updateDashboardCalculations
        // which avoids re-calculating the same data.

        budgets.forEach((budget: any) => {
            const category = ((this.plugin as any).settings.categories || []).find((c: any) => c.id === budget.categoryId);
            if (!category) return;

            const spentAmount = spendingMap.get(budget.categoryId) || 0;
            const budgetAmount = budget.amount;
            const percentage = budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;

            const remainingAmount = budgetAmount - spentAmount;

            const cardEl = this.budgetContainer.createDiv({ cls: 'budget-card' });

            const headerEl = cardEl.createDiv({ cls: 'budget-card-header' });
            headerEl.createSpan({ text: category.name, cls: 'budget-category-name' });
            headerEl.createSpan({ text: `${Math.min(percentage, 100).toFixed(0)}% `, cls: 'budget-percentage' });

            const progressBarWrapper = cardEl.createDiv({ cls: 'progress-bar-wrapper' });
            const progressBarFill = progressBarWrapper.createDiv({ cls: 'progress-bar-fill' });
            progressBarFill.style.setProperty('--progress-percent', `${Math.min(percentage, 100)}% `);

            if (percentage > 100) progressBarFill.addClass('is-over-limit');
            else if (percentage > 80) progressBarFill.addClass('is-warning');

            const detailsEl = cardEl.createDiv({ cls: 'budget-card-details' });
            detailsEl.createDiv({ text: `Gasto: ${formatAsCurrency(spentAmount)} de ${formatAsCurrency(budgetAmount)} ` });
            const remainingEl = detailsEl.createDiv({ text: `Restante: ${formatAsCurrency(remainingAmount)} ` });
            remainingEl.toggleClass('is-negative', remainingAmount < 0);
        });
    }

    /**
     * AUTO-FIX: Scans for duplicate recurring income transactions in the same month and removes them.
     */
    private async deduplicateRecurringTransactions() {
        const txs = (this.plugin as any).settings.transactions;
        const map = new Map<string, Transaction[]>();
        let hasDuplicates = false;

        // Group by Description + Amount + PaymentMonth
        txs.forEach((t: Transaction) => {
            if (t.isRecurring && t.type === 'income') {
                const key = `${t.description}| ${t.amount}| ${t.paymentMonth || moment(t.date).format('YYYY-MM')} `;
                if (!map.has(key)) map.set(key, []);
                map.get(key)?.push(t);
            }
        });

        const idsToDelete: string[] = [];

        map.forEach((group) => {
            if (group.length > 1) {
                hasDuplicates = true;
                // Keep the LAST item (assuming it is the most recent/fixed one)
                const keeper = group[group.length - 1];
                group.forEach(t => {
                    if (t !== keeper) idsToDelete.push(t.id);
                });
            }
        });

        if (idsToDelete.length > 0) {
            (this.plugin as any).settings.transactions = txs.filter((t: Transaction) => !idsToDelete.includes(t.id));
            await (this.plugin as any).saveSettings();
            // new Notice(`Nexus Hub: ${idsToDelete.length} transações duplicadas foram removidas.`);
            eventManager.emit('data-changed');
        }
    }
}
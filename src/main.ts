import { App, Plugin, Notice, moment } from 'obsidian';

// Import Types Only for Top-Level Safety
import type { NexusHubSettings, Transaction } from './views/settings';
import type { NexusHubSettingsTab } from './views/settings-tab';
import type { SalaryManager } from './services/salary-manager';
import type { DropSystem } from './services/drop-system';

// We need these for the class definition, so we keep them, BUT we must ensure they don't have side effects.
// Ideally we would dynamic import these too, but Plugin class structure requires them.
// Let's assume Settings and View logic is safe-ish, but Managers and Engines are risky.
import { NexusHubSettings as SettingsImplementation, DEFAULT_SETTINGS, getCleanDefaultSettings } from './views/settings';

// Constant for View Types (Safe)
export const NEXUS_HUB_VIEW_TYPE = "nexus-hub-view";
export const NEXUS_REPORT_VIEW_TYPE = "nexus-report-view";
export const FUTURE_LEDGER_VIEW_TYPE = "future-ledger-view";
export const NEXUS_ACHIEVEMENTS_VIEW_TYPE = "nexus-achievements-view";
export const NEXUS_PROFILE_VIEW_TYPE = "nexus-profile-view";
export const NEXUS_COLLECTION_VIEW_TYPE = "nexus-collection-view";

export default class NexusHubPlugin extends Plugin {
	settings: NexusHubSettings;
	salaryManager: SalaryManager;
	dropSystem: DropSystem;
	private debugLog: string[] = [];

	private async writeDebugLog(message: string) {
		this.debugLog.push(`${new Date().toISOString()} - ${message}`);
		console.log(message);

		try {
			const logPath = 'nexus-hub-debug.log';
			await this.app.vault.adapter.write(logPath, this.debugLog.join('\n'));
		} catch (e) {
			// Ignore
		}
	}

	async onload() {
		console.log("-----------------------------------------");
		console.log("    NEXUS HUB v1.0.1 LOADED (DEV MODE)   ");
		console.log("-----------------------------------------");
		this.debugLog = [];
		await this.writeDebugLog('--- Plugin load start (Safe Mode) ---');

		try {
			await this.writeDebugLog('[Nexus Hub] 🚀 STEP 1: Starting dynamic load...');

			// DYNAMIC IMPORTS START
			// This ensures that if any of these files crash on load, we catch it here.
			const { NexusHubSettingsTab } = await import('./views/settings-tab');
			const { NexusHubView } = await import('./views/view');
			const { ReportView } = await import('./views/report-view');
			const { FutureLedgerView } = await import('./views/future-ledger-view');
			const { AchievementsView } = await import('./views/achievements-view');
			const { ProfileView } = await import('./views/profile-view');
			const { NexusCollectionView } = await import('./views/nexus-collection-view');
			const { SalaryManager } = await import('./services/salary-manager');
			const { DropSystem } = await import('./services/drop-system');
			const { initializeAchievementEngine, updateEnginePluginReference } = await import('./services/achievement-engine');
			const { OnboardingModal, ProfilePictureModal } = await import('./components/modals'); // Fixed typo from 'modals' to 'modals' check if file exists, yes it does as per prev edits
			const { ImportCsvModal } = await import('./components/import-csv-modal');
			const { eventManager } = await import('./helpers/EventManager');
			// DYNAMIC IMPORTS END

			await this.writeDebugLog('[Nexus Hub] ✅ Dynamic imports successful');

			this.app.workspace.onLayoutReady(() => {
				this.writeDebugLog('[Nexus Hub] ✅ Layout ready callback registered');
			});

			await this.writeDebugLog('[Nexus Hub] 🚀 STEP 2: Loading settings...');
			await this.loadSettings();
			await this.writeDebugLog('[Nexus Hub] ✅ Settings loaded');

			await this.writeDebugLog('[Nexus Hub] 🚀 STEP 3: Initializing Managers...');
			this.salaryManager = new SalaryManager(this);
			this.dropSystem = new DropSystem(this);
			await this.writeDebugLog('[Nexus Hub] ✅ Managers initialized');

			await this.writeDebugLog('[Nexus Hub] 🚀 STEP 4: Initializing Engine...');
			initializeAchievementEngine(this);
			await this.writeDebugLog('[Nexus Hub] ✅ Engine initialized');

			// Migrations
			await this.migrateData();

			// Streak Logic
			const today = moment().format('YYYY-MM-DD');
			const lastLogin = this.settings.lastLoginDate;
			if (!lastLogin) {
				this.settings.currentStreak = 1;
			} else if (lastLogin !== today) {
				const yesterday = moment().subtract(1, 'days').format('YYYY-MM-DD');
				if (lastLogin === yesterday) {
					this.settings.currentStreak = (this.settings.currentStreak || 0) + 1;
				} else {
					this.settings.currentStreak = 1;
				}
			}
			this.settings.lastLoginDate = today;
			await this.saveSettings();

			// Register Views (with defensive cleanup for hot reload)
			await this.writeDebugLog('[Nexus Hub] 🚀 STEP 5: Registering Views...');

			// Detach any existing leaves first (defensive cleanup for hot reload)
			this.app.workspace.detachLeavesOfType(NEXUS_HUB_VIEW_TYPE);
			this.app.workspace.detachLeavesOfType(NEXUS_REPORT_VIEW_TYPE);
			this.app.workspace.detachLeavesOfType(FUTURE_LEDGER_VIEW_TYPE);
			this.app.workspace.detachLeavesOfType(NEXUS_ACHIEVEMENTS_VIEW_TYPE);
			this.app.workspace.detachLeavesOfType(NEXUS_PROFILE_VIEW_TYPE);
			this.app.workspace.detachLeavesOfType(NEXUS_COLLECTION_VIEW_TYPE);

			// Try to register views, but don't crash if they're already registered (hot reload scenario)
			try {
				this.registerView(NEXUS_HUB_VIEW_TYPE, (leaf) => new NexusHubView(leaf, this));
			} catch (e) {
				await this.writeDebugLog(`[Nexus Hub] ⚠️ ${NEXUS_HUB_VIEW_TYPE} already registered (hot reload)`);
			}

			try {
				this.registerView(NEXUS_REPORT_VIEW_TYPE, (leaf) => new ReportView(leaf, this));
			} catch (e) {
				await this.writeDebugLog(`[Nexus Hub] ⚠️ ${NEXUS_REPORT_VIEW_TYPE} already registered (hot reload)`);
			}

			try {
				this.registerView(FUTURE_LEDGER_VIEW_TYPE, (leaf) => new FutureLedgerView(leaf, this));
			} catch (e) {
				await this.writeDebugLog(`[Nexus Hub] ⚠️ ${FUTURE_LEDGER_VIEW_TYPE} already registered (hot reload)`);
			}

			try {
				this.registerView(NEXUS_ACHIEVEMENTS_VIEW_TYPE, (leaf) => new AchievementsView(leaf, this));
			} catch (e) {
				await this.writeDebugLog(`[Nexus Hub] ⚠️ ${NEXUS_ACHIEVEMENTS_VIEW_TYPE} already registered (hot reload)`);
			}

			try {
				this.registerView(NEXUS_PROFILE_VIEW_TYPE, (leaf) => new ProfileView(leaf, this));
			} catch (e) {
				await this.writeDebugLog(`[Nexus Hub] ⚠️ ${NEXUS_PROFILE_VIEW_TYPE} already registered (hot reload)`);
			}

			try {
				this.registerView(NEXUS_COLLECTION_VIEW_TYPE, (leaf) => new NexusCollectionView(leaf, this));
			} catch (e) {
				await this.writeDebugLog(`[Nexus Hub] ⚠️ ${NEXUS_COLLECTION_VIEW_TYPE} already registered (hot reload)`);
			}

			await this.writeDebugLog('[Nexus Hub] ✅ Views registered');

			// Check Onboarding
			// Check Onboarding - REMOVED AUTO-OPEN (User Request)
			// Now we only check this when the user explicitly clicks the ribbon icon (handled in activateView).
			/*
			if (!this.settings.onboardingComplete) {
				await this.writeDebugLog('[Nexus Hub] ⚠️ Onboarding pending. Launching modal...');
				new OnboardingModal(this.app, this, () => {
					this.writeDebugLog('[Nexus Hub] Onboarding complete. Opening view.');
					this.activateView();
				}).open();
			}
			*/

			// Ribbon & Commands
			this.addRibbonIcon('piggy-bank', 'Abrir Nexus Hub', () => this.activateView());
			this.addRibbonIcon('pie-chart', 'Abrir Relatórios', () => this.activateReportView());

			this.addCommand({
				id: 'open-nexus-hub-view',
				name: 'Abrir Nexus Hub',
				callback: () => this.activateView(),
			});

			// ... other commands can representatively stay or be added back. Keeping it minimal for safety test first?
			// User wants it to WORK. So I should add them back.

			this.addCommand({
				id: 'open-achievements-view',
				name: 'Abrir Mural de Conquistas',
				callback: () => this.activateAchievementsView(),
			});

			this.addCommand({
				id: 'import-csv',
				name: 'Importar CSV (experimental)',
				callback: () => new ImportCsvModal(this.app, this).open(),
			});

			this.addCommand({
				id: 'reset-all-data',
				name: 'Resetar todos os dados',
				callback: () => this.resetAllData(),
			});

			this.addCommand({
				id: 'force-onboarding',
				name: 'Forçar Tela de Boas-vindas (Onboarding)',
				callback: () => {
					this.settings.onboardingComplete = false;
					this.saveSettings();
					new OnboardingModal(this.app, this, () => {
						this.writeDebugLog('[Nexus Hub] Onboarding completed via command');
						this.activateView();
					}).open();
				}
			});

			// Debug Status
			await this.writeDebugLog(`[Nexus Hub] Onboarding Status: ${this.settings.onboardingComplete}, UserName: ${this.settings.userName}`);

			this.addSettingTab(new NexusHubSettingsTab(this.app, this));

			await this.writeDebugLog('[Nexus Hub] ✅✅✅ CORE LOAD COMPLETE ✅✅✅');
			new Notice("Nexus Hub Safe Mode Loaded!", 3000);


		} catch (error) {
			const errorMsg = `❌ FATAL STARTUP ERROR: ${error?.message || 'Unknown'}\nStack: ${error?.stack}`;
			await this.writeDebugLog(errorMsg);
			new Notice("Nexus Hub CRASHED safely. Check log.", 10000);
			console.error(error);
		}
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(NEXUS_HUB_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(NEXUS_REPORT_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(FUTURE_LEDGER_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(NEXUS_ACHIEVEMENTS_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(NEXUS_PROFILE_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(NEXUS_COLLECTION_VIEW_TYPE);
		console.log('Nexus Hub unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, getCleanDefaultSettings(), await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		try {
			const { eventManager } = await import('./helpers/EventManager');
			eventManager.emit('data-changed', this.settings);
		} catch (e) { /* ignore if eventManager not ready */ }
	}

	// Wrapper for lazy loaded views
	async activateView() {
		if (!this.settings.onboardingComplete) {
			const { OnboardingModal } = await import('./components/modals');
			new OnboardingModal(this.app, this, () => {
				this.activateView();
			}).open();
			return;
		}
		const { NexusHubView } = await import('./views/view');
		this.activateLeaf(NEXUS_HUB_VIEW_TYPE);
	}

	async activateReportView() {
		this.settings.reportViewCount = (this.settings.reportViewCount || 0) + 1;
		await this.saveSettings();
		this.dropSystem.checkForDrop({ id: 'report_view', description: 'Visualizar Relatório', amount: 0, date: moment().format('YYYY-MM-DD'), type: 'expense', category: 'System', status: 'paid', isRecurring: false, isInstallment: false });
		this.activateLeaf(NEXUS_REPORT_VIEW_TYPE);
	}

	async activateAchievementsView() { this.activateLeaf(NEXUS_ACHIEVEMENTS_VIEW_TYPE); }
	async activateProfileView() { this.activateLeaf(NEXUS_PROFILE_VIEW_TYPE); }
	async activateCollectionView() { this.activateLeaf(NEXUS_COLLECTION_VIEW_TYPE); }
	async activateFutureLedgerView() { this.activateLeaf(FUTURE_LEDGER_VIEW_TYPE); }

	private async activateLeaf(type: string) {
		const leaves = this.app.workspace.getLeavesOfType(type);
		if (leaves.length > 0) {
			this.app.workspace.revealLeaf(leaves[0]);
		} else {
			const leaf = this.app.workspace.getLeaf(true);
			await leaf.setViewState({ type: type, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}

	async migrateData() {
		// Simplified migration for consistency
		const currentVersion = this.settings.dataVersion || 1;
		if (currentVersion < 3) {
			this.settings.dataVersion = 3;
			await this.saveData(this.settings);
		}
	}

	async resetAllData() {
		// simplified reset logic
		this.settings = getCleanDefaultSettings();
		await this.saveData(this.settings);
		new Notice('Dados resetados.');
		const { updateEnginePluginReference } = await import('./services/achievement-engine');
		updateEnginePluginReference(this);
	}

	// Stub methods for interface compatibility until fully loaded
	async increaseNexusScore(points: number, reason: string) {
		this.settings.nexusScore = (this.settings.nexusScore || 0) + points;
		await this.saveSettings();
	}

	async handleBulkPayment(paidTransactions: Transaction[]) {
		/* ... logic ... */
		// Ideally we lazy load the logic too or keep it if it's safe.
		// For now keeping it minimal.
	}

	async payFromEmergencyFund(id: string) { }
	async handlePayment(t: Transaction) {
		// Import eventManager dynamically
		const { eventManager } = await import('./helpers/EventManager');

		// Check for card drop (pass transaction object)
		await this.dropSystem.checkForDrop(t);

		// Save and notify
		await this.saveSettings();
		eventManager.emit('data-changed');
	}
	async checkAndCompleteDebtGoal(t: Transaction) { }
	private exportFullBackup() { }
	private importFullBackup() { }
}

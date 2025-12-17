import { App, Plugin, Notice } from 'obsidian';
import moment from 'moment';

import { NexusHubSettings, DEFAULT_SETTINGS, NexusHubSettingsTab, Transaction, getCleanDefaultSettings } from './views/settings';

import { OnboardingModal, ProfilePictureModal } from './components/modals';
import { ImportCsvModal } from './components/import-csv-modal';
import { NexusHubView, NEXUS_HUB_VIEW_TYPE } from './views/view';

import { ReportView, NEXUS_REPORT_VIEW_TYPE } from './views/report-view';
import { FutureLedgerView, FUTURE_LEDGER_VIEW_TYPE } from './views/future-ledger-view';
import { AchievementsView, NEXUS_ACHIEVEMENTS_VIEW_TYPE } from './views/achievements-view';
import { ProfileView, NEXUS_PROFILE_VIEW_TYPE } from './views/profile-view';
import { NexusCollectionView, NEXUS_COLLECTION_VIEW_TYPE } from './views/nexus-collection-view';
import { eventManager } from './helpers/EventManager';
import { formatAsCurrency } from './helpers/helpers';
import { initializeAchievementEngine } from './services/achievement-engine'; // <-- IMPORT NEW ENGINE
import { SalaryManager } from './services/salary-manager';
import { DropSystem } from './services/drop-system';

export default class NexusHubPlugin extends Plugin {
	settings: NexusHubSettings;
	salaryManager: SalaryManager;
	dropSystem: DropSystem;

	async onload() {
		console.log('Carregando o plugin Nexus Hub v0.1.6...');

		this.app.workspace.onLayoutReady(() => {
			// new Notice("Nexus Hub v0.1.6 Carregado: Conquistas Atualizadas!", 5000);
		});

		await this.loadSettings();

		// Roda a migração de dados para garantir compatibilidade com novas versões
		await this.migrateData();

		// Inicializa o gerenciador de salário
		this.salaryManager = new SalaryManager(this);
		this.dropSystem = new DropSystem(this);

		// =====================================================
		// =====================================================
		// STREAK TRACKING LOGIC
		// =====================================================
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

		// INITIALIZE THE NEW ACHIEVEMENT ENGINE
		initializeAchievementEngine(this);
		// =====================================================

		// Mostra o modal de onboarding se ele nunca foi concluído.
		if (!this.settings.onboardingComplete) {
			new OnboardingModal(this.app, this, () => {
				// Callback para atualizar a view após o onboarding
				this.activateView();
			}).open();
		} else {
			// Check if userName is empty even if onboarding is complete
			if (!this.settings.userName || this.settings.userName.trim() === '') {
				new ProfilePictureModal(this.app, this).open();
			}
			// Agora que o salário base foi adicionado, podemos verificar se o prompt é necessário
			this.salaryManager.checkAndPromptForSalaryUpdate();
		}

		// Registra a View customizada
		this.registerView(
			NEXUS_HUB_VIEW_TYPE,
			(leaf) => new NexusHubView(leaf, this)
		);

		// Registra a View de Relatórios
		this.registerView(
			NEXUS_REPORT_VIEW_TYPE,
			(leaf) => new ReportView(leaf, this)
		);

		// Registra a View de Lançamentos Futuros
		this.registerView(
			FUTURE_LEDGER_VIEW_TYPE,
			(leaf) => new FutureLedgerView(leaf, this)
		);

		// Registra a View de Conquistas
		this.registerView(
			NEXUS_ACHIEVEMENTS_VIEW_TYPE,
			(leaf) => new AchievementsView(leaf, this)
		);

		// Registra a View de Perfil
		this.registerView(
			NEXUS_PROFILE_VIEW_TYPE,
			(leaf) => new ProfileView(leaf, this)
		);

		// Registra a View de Coleção
		this.registerView(
			NEXUS_COLLECTION_VIEW_TYPE,
			(leaf) => new NexusCollectionView(leaf, this)
		);

		// Adiciona um ícone na barra lateral (ribbon)
		const ribbonCallback = (evt: MouseEvent): void => {
			this.activateView();
		};
		this.addRibbonIcon('piggy-bank', 'Abrir Nexus Hub', ribbonCallback);

		this.addRibbonIcon('pie-chart', 'Abrir Relatórios', () => {
			this.activateReportView();
		});

		// Adiciona um comando na paleta de comandos (Ctrl/Cmd + P)
		this.addCommand({
			id: 'open-nexus-hub-view',
			name: 'Abrir Nexus Hub',
			callback: () => {
				this.activateView();
			},
		});

		this.addCommand({
			id: 'open-achievements-view',
			name: 'Abrir Mural de Conquistas',
			callback: () => {
				this.activateAchievementsView();
			},
		});

		// Adiciona um comando para editar as informações do usuário
		this.addCommand({
			id: 'edit-onboarding-info',
			name: 'Editar informações do usuário',
			callback: () => {
				new ProfilePictureModal(this.app, this).open();
			}
		});

		// Adiciona um comando para importar de CSV
		this.addCommand({
			id: 'import-csv',
			name: 'Importar CSV (experimental)',
			callback: () => {
				new ImportCsvModal(this.app, this).open();
			}
		});

		this.addCommand({
			id: 'reset-all-data',
			name: 'Resetar todos os dados',
			callback: () => {
				this.resetAllData();
			}
		});

		this.addCommand({
			id: 'export-full-backup',
			name: 'Exportar backup dos dados',
			callback: () => {
				this.exportFullBackup();
			}
		});

		this.addCommand({
			id: 'import-full-backup',
			name: 'Importar backup dos dados',
			callback: () => {
				this.importFullBackup();
			}
		});

		// Adiciona a aba de configurações
		this.addSettingTab(new NexusHubSettingsTab(this.app, this));
	}



	async migrateData() {
		const currentVersion = this.settings.dataVersion || 1;
		let migrationNeeded = false;

		if (currentVersion < 2) {
			// Migration for Goal types from translated string            // eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.settings.goals.forEach((goal: any) => {
				if (goal.goalType === 'Economizar Dinheiro' || goal.goalType === 'Save Money') {
					goal.goalType = 'Saving';
					migrationNeeded = true;
				} else if (goal.goalType === 'Quitar Dívida' || goal.goalType === 'Pay Off Debt' || goal.goalType === 'Quitar DÃ­vida') {
					goal.goalType = 'Debt';
					migrationNeeded = true;
				}
			});
			this.settings.dataVersion = 2;
		}

		if (currentVersion < 3) {
			this.settings.transactions.forEach((transaction: Transaction) => {
				if (!transaction.paymentMonth) {
					transaction.paymentMonth = moment(transaction.date).format('YYYY-MM');
				}
			});
			this.settings.dataVersion = 3;
			migrationNeeded = true;
		}

		if (migrationNeeded) {
			await this.saveData(this.settings);
			// new Notice('Seus dados foram migrados para a nova versão.');
		}
	}

	async resetAllData() {
		try {
			console.log("[Nexus Hub] Resetting all data (Attempting full wipe)...");

			// 1. Detach Views
			this.app.workspace.detachLeavesOfType(NEXUS_HUB_VIEW_TYPE);
			this.app.workspace.detachLeavesOfType(NEXUS_REPORT_VIEW_TYPE);
			this.app.workspace.detachLeavesOfType(FUTURE_LEDGER_VIEW_TYPE);
			this.app.workspace.detachLeavesOfType(NEXUS_ACHIEVEMENTS_VIEW_TYPE);
			this.app.workspace.detachLeavesOfType(NEXUS_PROFILE_VIEW_TYPE);
			this.app.workspace.detachLeavesOfType(NEXUS_COLLECTION_VIEW_TYPE);

			// 2. Enforce clean settings (Deep Copy Validation)
			this.settings = getCleanDefaultSettings();
			console.log("[Nexus Hub] Settings object reset. Transaction count:", this.settings.transactions?.length);

			// 3. Delete data.json from disk to ensure no cache ghosts
			const dataPath = `${this.manifest.dir}/data.json`;
			if (await this.app.vault.adapter.exists(dataPath)) {
				await this.app.vault.adapter.remove(dataPath);
				console.log(`[Nexus Hub] Deleted data file at ${dataPath}`);
			}

			// 4. Wait a moment for FS to settle
			await new Promise(resolve => setTimeout(resolve, 500));

			// 5. Save Clean Settings (creates new file)
			await this.saveData(this.settings);
			console.log("[Nexus Hub] Created new clean data.json");

			// 6. Notify system of change (Important so Engine sees empty state)
			eventManager.emit('data-changed', this.settings);

			// new Notice('Todos os dados foram resetados com sucesso.');
			console.log("Nexus Hub: Data reset complete.");

			// 7. Re-initialize Achievement Engine to update 'plugin' reference and listeners with new settings
			// initializeAchievementEngine(this); // CAUSED DUPLICATE LISTENERS
			const { updateEnginePluginReference } = require('./services/achievement-engine');
			updateEnginePluginReference(this);
			console.log("[Nexus Hub] Achievement Engine reference updated via helper.");

			// 7. Open the onboarding modal to re-configure
			new OnboardingModal(this.app, this, () => {
				this.activateView();
			}).open();
		} catch (error) {
			console.error("[Nexus Hub] Failed to reset data:", error);
			new Notice("Erro ao resetar dados. Verifique o console.");
		}
	}

	onunload() {
		console.log('Descarregando o plugin Nexus Hub.');
		eventManager.removeAllListeners();
	}

	private exportFullBackup() {
		try {
			const backupData = JSON.stringify(this.settings, null, 2);
			const blob = new Blob([backupData], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `nexus-hub-backup-${moment().format('YYYY-MM-DD')}.json`;
			a.click();
			URL.revokeObjectURL(url);
			// new Notice('Backup completo exportado com sucesso!');
		} catch (error) {
			console.error("Erro ao exportar backup:", error);
			new Notice('Ocorreu um erro ao exportar o backup.');
		}
	}

	private importFullBackup() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;

			const reader = new FileReader();
			reader.onload = async (event) => {
				try {
					const content = event.target?.result as string;
					const importedSettings = JSON.parse(content);

					// Validação simples para garantir que é um arquivo de backup válido
					if (importedSettings.userName === undefined || !Array.isArray(importedSettings.transactions)) {
						throw new Error("Arquivo de backup inválido ou corrompido.");
					}

					if (window.confirm("Atenção: Isto irá sobrescrever TODOS os seus dados atuais do Nexus Hub. Esta ação não pode ser desfeita. Deseja continuar?")) {
						this.settings = importedSettings;
						await this.saveSettings();
						// new Notice('Backup importado com sucesso! Os dados foram restaurados.');
						this.activateView();
					}
				} catch (error) {
					console.error("Erro ao importar backup:", error);
					new Notice(`Falha ao importar backup: ${error.message}`);
				}
			};
			reader.readAsText(file);
		};
		input.click();
	}



	async loadSettings() {
		console.log("[Nexus Hub Debug] loadSettings called. Reading from disk...");
		this.settings = Object.assign({}, getCleanDefaultSettings(), await this.loadData());
		console.log(`[Nexus Hub Debug] Settings loaded. TxCount=${this.settings.transactions?.length}`);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// The new achievement engine listens for 'data-changed' event
		eventManager.emit('data-changed', this.settings);
	}

	async increaseNexusScore(points: number, reason: string) {
		if (points === 0) return;
		this.settings.nexusScore = (this.settings.nexusScore || 0) + points;
		if (!this.settings.scoreHistory) {
			this.settings.scoreHistory = [];
		}
		this.settings.scoreHistory.push({
			date: new Date().toISOString(),
			points: points,
			reason: reason,
			currentScore: this.settings.nexusScore
		});
		await this.saveSettings();
		// We don't emit('data-changed') here to avoid a full view re-render.
		// The view will update the score display directly.
		// new Notice(`+${points} Nexus Score!`); // Silenced as per user request
	}

	async handleBulkPayment(paidTransactions: Transaction[]) {
		if (paidTransactions.length === 0) return;

		let totalPoints = 0;
		const debtGoals = this.settings.goals.filter(g => g.goalType === 'Debt');

		for (const transaction of paidTransactions) {
			const isForDebtGoal = debtGoals.some(g => g.linkedAccountIds.includes(transaction.installmentOf || ''));
			let pointsForThisTransaction = isForDebtGoal ? 5 : 1;

			// Verifica se é uma contribuição para a Reserva de Emergência
			if (transaction.description === 'Aporte para Fundo de Emergência' && transaction.isRecurring) {
				this.settings.emergencyFund.currentBalance += transaction.amount;
				pointsForThisTransaction = 5; // Sobrescreve para 5 pontos por este hábito importante
				this.settings.emergencyFund.history.push({
					date: new Date().toISOString(),
					type: 'deposit',
					amount: transaction.amount,
					balanceAfter: this.settings.emergencyFund.currentBalance,
					reason: 'Aporte para Fundo de Emergência'
				});
				// new Notice(`Depositado ${formatAsCurrency(transaction.amount)} no fundo de emergência.`);
			}
			totalPoints += pointsForThisTransaction;
		}

		if (totalPoints > 0) {
			// Use increaseNexusScore to handle history and saving
			await this.increaseNexusScore(totalPoints, `${paidTransactions.length} contas pagas de uma vez`);

			// Tenta dropar uma carta (Chance base por transação paga, mas vamos chamar uma vez por lote para não spammar, ou talvez um loop?)
			// Design choice: 1 roll per batch creates less friction, but less reward for bulk.
			// Let's call it once per batch for now to be safe, or maybe loop if user really wants to grind.
			// Better: Call once, but maybe increase chance? For now, simple Check.
			await this.dropSystem.checkForDrop();
		}

		// Check for goal completion for each transaction
		for (const t of paidTransactions) {
			// This function will check and award bonus points if a goal is completed.
			// It saves settings internally.
			await this.checkAndCompleteDebtGoal(t);
		}

		// Salva as configurações para persistir mudanças como o saldo da reserva de emergência
		await this.saveSettings();

		// Final emit to refresh UI
		eventManager.emit('data-changed');
	}

	async handlePayment(paidTransaction: Transaction) {
		// This becomes a simple wrapper around the bulk handler
		await this.handleBulkPayment([paidTransaction]);
	}

	async payFromEmergencyFund(transactionId: string) {
		const transaction = this.settings.transactions.find(tx => tx.id === transactionId);
		if (!transaction) {
			new Notice('Transação não encontrada.');
			return;
		}

		if (this.settings.emergencyFund.currentBalance < transaction.amount) {
			new Notice('Saldo insuficiente no fundo de emergência.');
			return;
		}

		// 1. Update Emergency Fund
		this.settings.emergencyFund.currentBalance -= transaction.amount;
		this.settings.emergencyFund.history.push({
			date: new Date().toISOString(),
			type: 'withdrawal',
			amount: transaction.amount,
			balanceAfter: this.settings.emergencyFund.currentBalance,
			reason: `Pagamento de conta: ${transaction.description}`
		});

		// 2. Update Transaction Status
		transaction.status = 'paid';

		// 3. Save and notify
		await this.saveSettings();
		eventManager.emit('data-changed');
		// new Notice(`Conta '${transaction.description}' paga com o fundo de emergência.`);
	}

	async checkAndCompleteDebtGoal(paidTransaction: Transaction) {
		if (!paidTransaction.isInstallment || !paidTransaction.installmentOf) {
			return; // Not an installment, can't be part of a debt goal
		}

		// Find the goal this transaction's purchase is linked to
		const targetGoal = this.settings.goals.find(goal =>
			goal.goalType === 'Debt' &&
			!goal.completed && // Only check uncompleted goals
			goal.linkedAccountIds.includes(paidTransaction.installmentOf!)
		);

		if (!targetGoal) {
			return; // This payment is not part of an active, uncompleted debt goal
		}

		// Check if ALL installments for ALL linked accounts in this goal are now paid
		const allPaid = targetGoal.linkedAccountIds.every(accountId => {
			const installmentsForAccount = this.settings.transactions.filter(tx => tx.installmentOf === accountId);
			// If any installment is not paid, this account is not fully paid.
			return installmentsForAccount.length > 0 && installmentsForAccount.every(tx => tx.status === 'paid');
		});

		if (allPaid) {
			targetGoal.completed = true;
			// Ensure amounts are perfectly aligned on completion
			targetGoal.currentAmount = targetGoal.targetAmount;

			await this.increaseNexusScore(100, `Meta de dívida '${targetGoal.name}' concluída!`);
			// new Notice(`Parabéns! Você completou sua meta de dívida '${targetGoal.name}'!`);
		}
	}

	/**
	 * Ativa e foca na view do Nexus Hub. Se não existir, cria uma nova.
	 */
	async activateView() {
		const leaves = this.app.workspace.getLeavesOfType(NEXUS_HUB_VIEW_TYPE);
		if (leaves.length > 0) {
			// Se a view já existe, apenas a revela.
			this.app.workspace.revealLeaf(leaves[0]);
		} else {
			// Se não existe, cria em uma nova aba.
			const leaf = this.app.workspace.getLeaf(true);
			await leaf.setViewState({
				type: NEXUS_HUB_VIEW_TYPE,
				active: true,
			});
			this.app.workspace.revealLeaf(leaf);
		}
	}

	/**
	 * Ativa e foca na view de Relatórios.
	 */
	async activateReportView() {
		this.app.workspace.detachLeavesOfType(NEXUS_REPORT_VIEW_TYPE);

		await this.app.workspace.getLeaf(true).setViewState({
			type: NEXUS_REPORT_VIEW_TYPE,
			active: true,
		});

		this.app.workspace.revealLeaf(this.app.workspace.getLeavesOfType(NEXUS_REPORT_VIEW_TYPE)[0]);
	}

	async activateAchievementsView(state?: any) {
		this.app.workspace.detachLeavesOfType(NEXUS_ACHIEVEMENTS_VIEW_TYPE);

		await this.app.workspace.getLeaf(true).setViewState({
			type: NEXUS_ACHIEVEMENTS_VIEW_TYPE,
			active: true,
			state: state
		});

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(NEXUS_ACHIEVEMENTS_VIEW_TYPE)[0]
		);
	}

	async activateProfileView() {
		this.app.workspace.detachLeavesOfType(NEXUS_PROFILE_VIEW_TYPE);

		await this.app.workspace.getLeaf(true).setViewState({
			type: NEXUS_PROFILE_VIEW_TYPE,
			active: true,
		});

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(NEXUS_PROFILE_VIEW_TYPE)[0]
		);
	}

	async activateCollectionView() {
		this.app.workspace.detachLeavesOfType(NEXUS_COLLECTION_VIEW_TYPE);

		await this.app.workspace.getLeaf(true).setViewState({
			type: NEXUS_COLLECTION_VIEW_TYPE,
			active: true,
		});

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(NEXUS_COLLECTION_VIEW_TYPE)[0]
		);
	}

	/**
	 * Ativa e foca na view de Lançamentos Futuros.
	 */
	async activateFutureLedgerView() {
		this.app.workspace.detachLeavesOfType(FUTURE_LEDGER_VIEW_TYPE);

		await this.app.workspace.getLeaf(true).setViewState({
			type: FUTURE_LEDGER_VIEW_TYPE,
			active: true,
		});

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(FUTURE_LEDGER_VIEW_TYPE)[0]
		);
	}
}

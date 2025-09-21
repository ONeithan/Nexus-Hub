import { Plugin, WorkspaceLeaf, Notice, moment } from 'obsidian';
import { NexusHubSettings, DEFAULT_SETTINGS, NexusHubSettingsTab, Transaction, Goal } from './settings';
import { setLanguage, t } from './lang';
import { OnboardingModal, EditUserModal } from './modals';
import { ImportCsvModal } from './import-csv-modal';
import { NexusHubView, NEXUS_HUB_VIEW_TYPE } from './view';
import { ReportView, NEXUS_REPORT_VIEW_TYPE } from './report-view';
import { FutureLedgerView, FUTURE_LEDGER_VIEW_TYPE } from './future-ledger-view';
import { eventManager } from './EventManager';
import { formatAsCurrency } from './helpers';
import { checkAchievements } from './achievements';
export default class NexusHubPlugin extends Plugin {
	settings: NexusHubSettings;

	async onload() {
		console.log('Carregando o plugin Nexus Hub...');

		await this.loadSettings();

		// Roda a migração de dados para garantir compatibilidade com novas versões
		await this.migrateData();

		// Inicializa o sistema de tradução com o idioma salvo
		setLanguage(this.settings.language);

		// Mostra o modal de onboarding se ele nunca foi concluído.
		if (!this.settings.onboardingComplete) {
			new OnboardingModal(this.app, this, () => {
				// Callback para atualizar a view após o onboarding
				this.activateView(); 
			}).open();
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

		// Adiciona um ícone na barra lateral (ribbon)
		const ribbonCallback = (evt: MouseEvent): void => {
			this.activateView();
		};
		this.addRibbonIcon('piggy-bank', t('RIBBON_OPEN_NEXUS_HUB'), ribbonCallback);

		this.addRibbonIcon('pie-chart', t('RIBBON_OPEN_REPORTS'), () => {
			this.activateReportView();
		});

		// Adiciona um comando na paleta de comandos (Ctrl/Cmd + P)
		this.addCommand({
			id: 'open-nexus-hub-view',
			name: t('COMMAND_OPEN_NEXUS_HUB'),
			callback: () => {
				this.activateView();
			},
		});

		// Adiciona um comando para editar as informações do usuário
		this.addCommand({
			id: 'edit-onboarding-info',
			name: t('COMMAND_EDIT_USER_INFO'),
			callback: () => {
				new EditUserModal(this.app, this).open();
			}
		});

		// Adiciona um comando para importar de CSV
		this.addCommand({
			id: 'import-csv',
			name: t('COMMAND_IMPORT_CSV'),
			callback: () => {
				new ImportCsvModal(this.app, this).open();
			}
		});

		this.addCommand({
			id: 'reset-all-data',
			name: t('COMMAND_RESET_DATA'),
			callback: () => {
				this.resetAllData();
			}
		});

		this.addCommand({
			id: 'export-full-backup',
			name: t('COMMAND_EXPORT_BACKUP'),
			callback: () => {
				this.exportFullBackup();
			}
		});

		this.addCommand({
			id: 'import-full-backup',
			name: t('COMMAND_IMPORT_BACKUP'),
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
			// Migration for Goal types from translated string to key
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

		if (migrationNeeded) {
			await this.saveData(this.settings);
			new Notice(t('DATA_MIGRATION_NOTICE'));
		}
	}

	async resetAllData() {
		const confirmation = window.prompt(t('RESET_DATA_CONFIRM_1', { keyword: t('RESET_DATA_CONFIRM_KEYWORD_1') }));
		if (confirmation === t('RESET_DATA_CONFIRM_KEYWORD_1')) {
			const secondConfirmation = window.prompt(t('RESET_DATA_CONFIRM_2', { keyword: t('RESET_DATA_CONFIRM_KEYWORD_2') }));
			if (secondConfirmation === t('RESET_DATA_CONFIRM_KEYWORD_2')) {
				// Detach all views before changing data underneath them
				this.app.workspace.detachLeavesOfType(NEXUS_HUB_VIEW_TYPE);
				this.app.workspace.detachLeavesOfType(NEXUS_REPORT_VIEW_TYPE);
				this.app.workspace.detachLeavesOfType(FUTURE_LEDGER_VIEW_TYPE);

				this.settings = DEFAULT_SETTINGS;
				// Use saveData to avoid triggering achievement check on empty data
				await this.saveData(this.settings); 
				
				new Notice(t('RESET_DATA_SUCCESS'));

				// Open the onboarding modal to re-configure
				new OnboardingModal(this.app, this, () => {
					this.activateView(); 
				}).open();
			}
		}
	}

	onunload() {
		console.log('Descarregando o plugin Nexus Hub.');
		// Garante que a view seja destacada do workspace ao desabilitar o plugin
		this.app.workspace.detachLeavesOfType(NEXUS_HUB_VIEW_TYPE);
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
			new Notice('Backup completo exportado com sucesso!');
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
						eventManager.emit('data-changed');
						new Notice('Backup importado com sucesso! Os dados foram restaurados.');
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
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
        // After saving, check for new achievements
        await this.checkAndUnlockAchievements();
	}

	async checkAndUnlockAchievements() {
		const { unlocked, newAchievements } = checkAchievements(this.settings);
		
		if (unlocked.length > 0) {
			this.settings.achievements = newAchievements;
			// We save directly here to not cause a recursive loop with saveSettings -> checkAchievements
			await this.saveData(this.settings);
			
			// Show a notice for the first unlocked achievement in this batch
			new Notice(t('ACHIEVEMENT_UNLOCKED_NOTICE', { name: unlocked[0] }), 5000);
		}
	}

	async increaseNexusScore(points: number, reason: string) {
		if (points === 0) return;
		this.settings.nexusScore += points;
		this.settings.scoreHistory.push({
			date: new Date().toISOString(),
			points: points,
			reason: reason,
			currentScore: this.settings.nexusScore
		});
		await this.saveSettings();
		// We don't emit 'data-changed' here to avoid a full view re-render.
		// The view will update the score display directly.
		new Notice(`+${points} Nexus Score!`);
	}

	async handleBulkPayment(paidTransactions: Transaction[]) {
		if (paidTransactions.length === 0) return;
	
		let totalPoints = 0;
		const debtGoals = this.settings.goals.filter(g => g.goalType === 'Debt');
	
		for (const transaction of paidTransactions) {
			const isForDebtGoal = debtGoals.some(g => g.linkedAccountIds.includes(transaction.installmentOf || ''));
			let pointsForThisTransaction = isForDebtGoal ? 5 : 1;

			// Verifica se é uma contribuição para a Reserva de Emergência
			if (transaction.description === t('TRANSACTION_EMERGENCY_FUND_CONTRIBUTION') && transaction.isRecurring) {
				this.settings.emergencyFund.currentBalance += transaction.amount;
				pointsForThisTransaction = 5; // Sobrescreve para 5 pontos por este hábito importante
				this.settings.emergencyFund.history.push({
					date: new Date().toISOString(),
					type: 'deposit',
					amount: transaction.amount,
					balanceAfter: this.settings.emergencyFund.currentBalance,
					reason: t('TRANSACTION_EMERGENCY_FUND_CONTRIBUTION')
				});
				new Notice(t('MODAL_EMERGENCY_FUND_DEPOSIT_SUCCESS_NOTICE', { amount: formatAsCurrency(transaction.amount) }));
			}
			totalPoints += pointsForThisTransaction;
		}
	
		if (totalPoints > 0) {
			// Use increaseNexusScore to handle history and saving
			await this.increaseNexusScore(totalPoints, t('NEXUS_SCORE_REASON_BULK_PAYMENT', { count: paidTransactions.length }));
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
			new Notice(t('TRANSACTION_NOT_FOUND'));
			return;
		}

		if (this.settings.emergencyFund.currentBalance < transaction.amount) {
			new Notice(t('MODAL_EMERGENCY_FUND_INSUFFICIENT_FUNDS_NOTICE'));
			return;
		}

		// 1. Update Emergency Fund
		this.settings.emergencyFund.currentBalance -= transaction.amount;
		this.settings.emergencyFund.history.push({
			date: new Date().toISOString(),
			type: 'withdrawal',
			amount: transaction.amount,
			balanceAfter: this.settings.emergencyFund.currentBalance,
			reason: t('EMERGENCY_FUND_PAYMENT_REASON', { description: transaction.description })
		});

		// 2. Update Transaction Status
		transaction.status = 'paid';

		// 3. Save and notify
		await this.saveSettings();
		eventManager.emit('data-changed');
		new Notice(t('EMERGENCY_FUND_PAYMENT_SUCCESS', { description: transaction.description }));
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

			await this.increaseNexusScore(100, t('NEXUS_SCORE_REASON_DEBT_GOAL_COMPLETED', { goalName: targetGoal.name }));
			new Notice(t('DEBT_GOAL_COMPLETED_NOTICE', { goalName: targetGoal.name }));
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
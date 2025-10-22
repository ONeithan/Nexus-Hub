import { moment } from 'obsidian';
import NexusHubPlugin from '../main';
import { UpdateSalaryModal } from '../components/modals';

export class SalaryManager {
    plugin: NexusHubPlugin;

    constructor(plugin: NexusHubPlugin) {
        this.plugin = plugin;
    }

    /**
     * This function is called from the UpdateSalaryModal.
     * It finds the recurring income transaction(s) for the current month and updates their amount.
     * If no specific amount is provided (e.g., user clicks "Use Default"), it just marks them as paid.
     */
    public async updateCurrentMonthSalary(amountOverride?: number): Promise<void> {
        const settings = this.plugin.settings;
        const today = moment();
        const currentMonthStr = today.format('YYYY-MM');

        const salaryTransactions = settings.transactions.filter(t =>
            t.isRecurring &&
            t.type === 'income' &&
            moment(t.date).format('YYYY-MM') === currentMonthStr
        );

        if (salaryTransactions.length === 0) {
            console.warn(`Nexus Hub: Could not find a recurring salary transaction for ${currentMonthStr} to update.`);
            return;
        }

        if (amountOverride && amountOverride > 0) {
            if (settings.salaryFrequency === 'bi-weekly' && salaryTransactions.length > 1) {
                const firstHalf = amountOverride / 2;
                const secondHalf = amountOverride - firstHalf;
                // A bit naive, assumes order.
                salaryTransactions.sort((a, b) => moment(a.date).date() - moment(b.date).date());
                salaryTransactions[0].amount = firstHalf;
                salaryTransactions[1].amount = secondHalf;
            } else {
                salaryTransactions[0].amount = amountOverride;
            }
        }

        // Mark all of this month's salary transactions as 'paid'
        salaryTransactions.forEach(t => t.status = 'paid');

        await this.plugin.saveSettings();
    }

    /**
     * Checks if the salary update prompt should be shown and opens the modal if necessary.
     */
    public async checkAndPromptForSalaryUpdate(): Promise<void> {
        const settings = this.plugin.settings;
        const today = moment();
        const currentMonthStr = today.format('YYYY-MM');

        if (!settings.promptForSalaryUpdate || settings.lastSalaryUpdatePromptMonth === currentMonthStr) {
            return;
        }

        const paydays = [settings.salaryPayday1];
        if (settings.salaryFrequency === 'bi-weekly' && settings.salaryPayday2) {
            paydays.push(settings.salaryPayday2);
        }

        const hasPaydayPassedThisMonth = paydays.some(day => today.date() >= day);

        if (hasPaydayPassedThisMonth) {
            // Check if the salary for this month is still pending
            const isSalaryPending = settings.transactions.some(t =>
                t.isRecurring &&
                t.type === 'income' &&
                moment(t.date).format('YYYY-MM') === currentMonthStr &&
                t.status === 'pending'
            );

            if (isSalaryPending) {
                new UpdateSalaryModal(this.plugin.app, this.plugin).open();
                // Prevent re-prompting this month
                this.plugin.settings.lastSalaryUpdatePromptMonth = currentMonthStr;
                await this.plugin.saveSettings();
            }
        }
    }
}

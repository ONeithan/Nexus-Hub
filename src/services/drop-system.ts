import NexusHubPlugin from '../main';
import { NEXUS_TRADING_CARDS, NexusTradingCard } from './achievements';
import { PackOpeningModal } from '../components/pack-opening-modal';

const DROP_CHANCE = 0.10; // 10% chance per transaction
const DAILY_LIMIT = 3; // Max 3 drops per day to prevent spam/abuse if we ever add limits

export class DropSystem {
    plugin: NexusHubPlugin;

    constructor(plugin: NexusHubPlugin) {
        this.plugin = plugin;
    }

    /**
     * Main entry point to check for a card drop.
     * Should be called after a successful transaction payment or bulk payment.
     */
    async checkForDrop(): Promise<void> {
        // RNG Check
        // Guarantee drop if user has no cards yet
        const hasCards = this.plugin.settings.collectedCards && this.plugin.settings.collectedCards.length > 0;

        if (hasCards) {
            const roll = Math.random();
            if (roll > DROP_CHANCE) {
                console.log(`Drop RNG failed: ${roll.toFixed(2)} > ${DROP_CHANCE}`);
                return;
            }
        } else {
            console.log("First drop guaranteed! Force Legendary.");
        }

        console.log("DROP! Rolling for card rarity...");
        // Fallback to normal roll if has cards, else force Legendary
        const card = hasCards ? this.rollForCard() : this.rollForSpecificRarity('Legendary');

        if (card) {
            await this.awardCard(card);
        }
    }

    /**
     * Selects a card from the pool based on weighted rarity.
     */
    private rollForCard(): NexusTradingCard | null {
        // Filter cards by rarity weight
        // Common: 60%, Uncommon: 25%, Rare: 10%, Epic: 4%, Legendary: 1%

        const rarityRoll = Math.random();
        let rarityPool: string;

        if (rarityRoll < 0.60) rarityPool = 'Common';
        else if (rarityRoll < 0.85) rarityPool = 'Uncommon';
        else if (rarityRoll < 0.95) rarityPool = 'Rare';
        else if (rarityRoll < 0.99) rarityPool = 'Epic';
        else rarityPool = 'Legendary';

        const candidates = NEXUS_TRADING_CARDS.filter(c => c.rarity === rarityPool);

        if (candidates.length === 0) {
            // Fallback if no cards of that likelihood exist (shouldn't happen with full data)
            return NEXUS_TRADING_CARDS[Math.floor(Math.random() * NEXUS_TRADING_CARDS.length)];
        }

        // Pick random card from the rarity pool
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    private rollForSpecificRarity(rarity: string): NexusTradingCard | null {
        const candidates = NEXUS_TRADING_CARDS.filter(c => c.rarity === rarity);
        if (candidates.length === 0) return null;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    /**
     * Awards the card, saves to settings, and opens the modal.
     */
    async awardCard(card: NexusTradingCard) {
        if (!this.plugin.settings.collectedCards) {
            this.plugin.settings.collectedCards = [];
        }

        // Add to collection (allow duplicates? For now, we just store everything, logic can handle count later)
        // Actually, let's just use a Set logic for "Unlocked" vs "Locked" for now. 
        // If we want duplicates, we might need a map { id: count }.
        // Sticking to simple list of IDs for v1.

        if (!this.plugin.settings.collectedCards.includes(card.id)) {
            this.plugin.settings.collectedCards.push(card.id);
            await this.plugin.saveSettings();
        }

        // Triggers the visual Pack Opening
        new PackOpeningModal(this.plugin.app, card).open();
    }

    /**
     * DEBUG: Forces a specific drop for testing
     */
    async forceDrop() {
        const card = this.rollForCard();
        if (card) {
            await this.awardCard(card);
        }
    }
}

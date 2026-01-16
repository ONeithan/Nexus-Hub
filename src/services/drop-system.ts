import NexusHubPlugin from '../main';
import { NEXUS_TRADING_CARDS, NexusTradingCard } from './achievements';
import { PackOpeningModal } from '../components/pack-opening-modal';
import { CARD_RULES } from './card-drop-rules';
import { Transaction } from '../views/settings';
import { shouldCheckCard } from './card-triggers';

/**
 * Sistema de Drop Determinístico
 * 
 * Ao invés de RNG puro, verifica regras lógicas para cada carta.
 * Se uma carta não foi coletada E sua regra retorna true, ela é desbloqueada.
 */
export class DropSystem {
    plugin: NexusHubPlugin;
    private previouslyEligibleCards: Set<string> = new Set(); // Cache para detectar novidades

    constructor(plugin: NexusHubPlugin) {
        this.plugin = plugin;
    }

    /**
     * Verifica se alguma carta deve ser desbloqueada com base na transação atual.
     * Chamado após criar/editar/pagar uma transação.
     */
    async checkForDrop(transaction?: Transaction): Promise<void> {
        // Se nenhuma transação for passada (ex: Onboarding), criar uma dummy segura
        // para permitir verificar regras que não dependem de transação específica (ex: Setup Completo)
        const txToCheck = transaction || {
            id: 'system_check',
            amount: 0,
            date: new Date().toISOString(),
            description: 'System Check',
            category: 'System',
            type: 'income',
            status: 'paid',
            isRecurring: false,
            isInstallment: false
        } as Transaction;

        console.log('[DropSystem] checkForDrop called with:', txToCheck.id, txToCheck.category);

        const collectedCardIds = new Set(this.plugin.settings.collectedCards || []);
        const allTransactions = this.plugin.settings.transactions || [];
        const candidates: NexusTradingCard[] = [];

        // 1. Identificar TODAS as cartas elegíveis agora (COM FILTRAGEM CONTEXTUAL)
        for (const card of NEXUS_TRADING_CARDS) {
            if (collectedCardIds.has(card.id)) continue;

            // NOVO: Verificar se esta carta é relevante para a transação atual
            if (!shouldCheckCard(card.id, txToCheck)) {
                console.log(`[DropSystem] Skipping ${card.id} (not relevant for ${txToCheck.type}/${txToCheck.category})`);
                continue;
            }

            const rule = CARD_RULES[card.id];
            if (!rule) continue;

            try {
                const shouldUnlock = rule(txToCheck, this.plugin.settings, allTransactions);
                if (shouldUnlock) {
                    candidates.push(card);
                }
            } catch (error) {
                console.error(`[DropSystem] Error checking rule for ${card.id}:`, error);
            }
        }

        if (candidates.length === 0) return;

        // 2. Ordenar por prioridade (Raridade) para garantir que cartas especiais (Satoshi) 
        // apareçam antes de cartas de backlog (Setup)
        // Ordem: Legendary > Epic > Rare > Uncommon > Common
        const rarityWeights: Record<string, number> = {
            'Legendary': 5,
            'Epic': 4,
            'Rare': 3,
            'Uncommon': 2,
            'Common': 1
        };


        // 1a. Detectar cartas NOVAS (Novelty)
        // Se uma carta entrou na lista de candidatos AGORA e não estava antes, ela tem prioridade absoluta.
        const newCandidates = candidates.filter(c => !this.previouslyEligibleCards.has(c.id));

        // Atualizar cache
        candidates.forEach(c => this.previouslyEligibleCards.add(c.id));

        // 2. Ordenar
        if (newCandidates.length > 0) {
            console.log(`[DropSystem] Novelty Detected! Prioritizing: ${newCandidates.map(c => c.name).join(', ')}`);
            // Se houver novidades, elas ganham. Se houver mais de uma nova, desempata por raridade.
            newCandidates.sort((a, b) => {
                const weightA = rarityWeights[a.rarity as string] || 0;
                const weightB = rarityWeights[b.rarity as string] || 0;
                return weightB - weightA;
            });
            candidates.unshift(...newCandidates); // Coloca as novas no topo
        } else {
            // Se não houver novidade, segue a ordem do backlog (Raridade)
            candidates.sort((a, b) => {
                const weightA = rarityWeights[a.rarity as string] || 0;
                const weightB = rarityWeights[b.rarity as string] || 0;
                return weightB - weightA;
            });
        }

        // 3a. EXCEÇÃO DE UX: Se 'card_ledger' (Setup) estiver na lista, ela DEVE ser a primeira
        // para dar as boas-vindas corretas, independente de raridade ou novidade.
        const ledgerIndex = candidates.findIndex(c => c.id === 'card_ledger');
        if (ledgerIndex !== -1) {
            const ledgerCard = candidates.splice(ledgerIndex, 1)[0];
            candidates.unshift(ledgerCard);
        }

        // 3. Conceder APENAS a carta de maior prioridade
        // Isso evita spam de 10 cartas de uma vez e cria um fluxo mais suave.
        // As outras cartas permanecem no backlog para a próxima ação de trigger.
        const winner = candidates[0];
        console.log(`[DropSystem] 🏆 Winner Drop: ${winner.name} (${winner.rarity}). Backlog remaining: ${candidates.length - 1}`);

        await this.awardCard(winner);
    }


    /**
     * Inicializa o sistema, populando o cache de cartas elegíveis SEM disparar drops.
     * Isso evita que ao abrir o plugin todas as cartas do backlog sejam consideradas "Novas".
     */
    async initialize() {
        console.log('[DropSystem] Initializing cache...');
        const collectedCardIds = new Set(this.plugin.settings.collectedCards || []);
        const allTransactions = this.plugin.settings.transactions || [];

        // Dummy tx for static checks
        const dummyTx = { id: 'init', amount: 0, date: new Date().toISOString(), description: 'Init', category: 'System', type: 'income', status: 'paid', isRecurring: false, isInstallment: false } as Transaction;

        for (const card of NEXUS_TRADING_CARDS) {
            if (collectedCardIds.has(card.id)) continue;
            const rule = CARD_RULES[card.id];
            if (rule) {
                try {
                    if (rule(dummyTx, this.plugin.settings, allTransactions)) {
                        this.previouslyEligibleCards.add(card.id);
                    }
                } catch (e) { /* ignore */ }
            }
        }
        console.log(`[DropSystem] Cache initialized with ${this.previouslyEligibleCards.size} pending eligible cards.`);
    }

    async checkAllCards(): Promise<void> {
        const collectedCardIds = new Set(this.plugin.settings.collectedCards || []);
        const allTransactions = this.plugin.settings.transactions || [];
        const unlockedCards: NexusTradingCard[] = [];

        // Criar uma transação "dummy" para regras que não dependem de tx específica
        const dummyTransaction: Transaction = {
            id: 'check-all-dummy',
            type: 'income',
            amount: 0,
            date: new Date().toISOString(),
            description: 'System Check',
            category: 'Geral',
            status: 'paid',
            isRecurring: false,
            isInstallment: false
        };

        for (const card of NEXUS_TRADING_CARDS) {
            if (collectedCardIds.has(card.id)) continue;

            const rule = CARD_RULES[card.id];
            if (!rule) continue;

            try {
                const shouldUnlock = rule(dummyTransaction, this.plugin.settings, allTransactions);
                if (shouldUnlock) {
                    unlockedCards.push(card);
                }
            } catch (error) {
                console.error(`[DropSystem] Error in checkAllCards for ${card.id}:`, error);
            }
        }

        for (const card of unlockedCards) {
            await this.awardCard(card);
        }

        console.log(`[DropSystem] Retroactive check completed. Unlocked: ${unlockedCards.length} cards`);
    }

    /**
     * Adiciona a carta à coleção e mostra o modal.
     */
    private async awardCard(card: NexusTradingCard) {
        if (!this.plugin.settings.collectedCards) {
            this.plugin.settings.collectedCards = [];
        }

        // Evitar duplicatas
        if (!this.plugin.settings.collectedCards.includes(card.id)) {
            this.plugin.settings.collectedCards.push(card.id);
            await this.plugin.saveSettings();

            // Mostrar modal de desbloqueio
            new PackOpeningModal(this.plugin.app, card).open();
        }
    }

    /**
     * DEBUG: Força desbloqueio de uma carta específica (para testes)
     */
    async forceUnlock(cardId: string) {
        const card = NEXUS_TRADING_CARDS.find(c => c.id === cardId);
        if (card) {
            await this.awardCard(card);
            console.log(`[DropSystem] Force unlocked: ${card.name}`);
        } else {
            console.error(`[DropSystem] Card not found: ${cardId}`);
        }
    }
}

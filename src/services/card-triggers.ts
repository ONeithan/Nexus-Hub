import { Transaction } from '../views/settings';

/**
 * Sistema de Triggers Contextuais
 * 
 * Define QUANDO cada carta deve ser verificada.
 * Isso evita verificar "Casa da Moeda" (receita) ao pagar despesa de alimentação.
 */

export type CardTrigger =
    | 'income'              // Qualquer receita
    | 'expense'             // Qualquer despesa
    | 'always'              // Sempre verifica (milestones, streak, etc.)
    | 'onboarding'          // Só no onboarding
    | 'manual'              // Nunca verifica automaticamente
    | `category:${string}`; // Categoria específica

export const CARD_TRIGGERS: Record<string, CardTrigger[]> = {
    // ===================================================================
    // FINANCIAL ORIGIN
    // ===================================================================
    'card_ancient_coins': ['expense', 'category:Alimentação', 'category:Mercado', 'category:Restaurante'],
    'card_ledger': ['onboarding'],
    'card_mint': ['income'],
    'card_banker': ['always'], // Verifica saldo diariamente

    // ===================================================================
    // CYBERPUNK ETHOS
    // ===================================================================
    'card_data_stream': ['always'], // Streak
    'card_subnet': ['expense'], // Despesa madrugada
    'card_ai_advisor': ['always'], // Metas
    'card_surveillance': ['always'], // Contador de relatórios
    'card_mainframe': ['always'], // Nexus Score

    // ===================================================================
    // CRYPTO LEGENDS
    // ===================================================================
    'card_satoshi': ['income', 'expense'], // R$ 21 exato
    'card_diamond_hands': ['income', 'expense'], // Economia 20%
    'card_bull_run': ['income', 'category:Renda Extra'],
    'card_rocket': ['income'],

    // ===================================================================
    // LUXURY LIFESTYLE
    // ===================================================================
    'card_private_jet': ['expense'], // Despesa > 5k
    'card_yacht': ['always'], // Reserva
    'card_penthouse': ['expense'], // Pagar antes

    // ===================================================================
    // ARTIFACTS
    // ===================================================================
    'card_golden_calc': ['income', 'expense'], // Saldo zero
    'card_abacus': ['always'], // 50 transações
    'card_scroll': ['always'], // Orçamentos
    'card_kings_coin': ['always'], // Nível 20

    // ===================================================================
    // MEDIEVAL FORTUNE
    // ===================================================================
    'card_chest': ['manual'], // Criar fundo (não verifica em pagamentos)
    'card_shield': ['expense', 'category:Lazer'], // Sem lazer
    'card_crown': ['income', 'expense'], // Patrimônio

    // ===================================================================
    // SPACE ODYSSEY
    // ===================================================================
    'card_alien_artifact': ['always'], // 100 transações
    'card_black_hole': ['income', 'expense'], // Gastar > ganhar

    // ===================================================================
    // RPG CLASS
    // ===================================================================
    'card_hero_sword': ['always'], // Dívida paga
    'card_wizard_staff': ['income', 'category:Renda Extra'],
    'card_rogue_dagger': ['expense'], // R$ 1,00

    // ===================================================================
    // ELEMENTAL STONES
    // ===================================================================
    'card_ruby': ['expense', 'category:Lazer'],
    'card_sapphire': ['expense', 'category:Moradia'],
    'card_emerald': ['income', 'expense'], // Saldo positivo
    'card_diamond': ['expense'], // Fatura alta

    // ===================================================================
    // RETRO TECH
    // ===================================================================
    'card_floppy': ['always'], // 10 transações
    'card_crt': ['always'], // Tela cheia (contador)
    'card_cartridge': ['manual'], // Easter egg

    // ===================================================================
    // ZODIAC
    // ===================================================================
    'card_aries': ['expense'], // 3 despesas/dia
    'card_taurus': ['expense', 'category:Investimentos'],
    'card_leo': ['expense', 'category:Beleza'],
};

/**
 * Verifica se uma carta deve ser checada para a transação atual
 */
export function shouldCheckCard(cardId: string, transaction: Transaction): boolean {
    const triggers = CARD_TRIGGERS[cardId];
    if (!triggers) return true; // Se não tem trigger definido, verifica (fallback seguro)

    // Manual: nunca verifica
    if (triggers.includes('manual')) return false;

    // Always: sempre verifica
    if (triggers.includes('always')) return true;

    // Onboarding: só no onboarding (não em pagamentos)
    if (triggers.includes('onboarding')) return false;

    // Verificar tipo de transação
    if (transaction.type === 'income' && !triggers.includes('income')) return false;
    if (transaction.type === 'expense' && !triggers.includes('expense')) return false;

    // Verificar categoria específica
    const categoryTriggers = triggers.filter(t => t.startsWith('category:'));
    if (categoryTriggers.length > 0) {
        const hasMatchingCategory = categoryTriggers.some(t => {
            const category = t.replace('category:', '');
            return transaction.category === category;
        });
        if (!hasMatchingCategory) return false;
    }

    return true;
}

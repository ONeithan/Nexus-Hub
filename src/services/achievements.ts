
// --- ACHIEVEMENT DEFINITIONS ---
export interface Achievement {
    id: string;
    name: string;
    description: string;
    icon: string;
    tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
    points: number;
    unlocked?: boolean;
    unlockedDate?: string;
    category: string;
}

export interface NexusTradingCard {
    id: string;
    name: string;
    description: string;
    rarity: 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
    color: string;
    dropChance: number;
    series: string;
    unlockHint?: string; // Hint/Challenge to unlock
}

export interface NexusBadge {
    id: string;
    name: string;
    description: string;
    icon: string;
    unlockCriteria: string; // Text description for now
}

// --- HELPER TO GENERATE ACHIEVEMENTS ---
const generateCategoryAchievements = (): Achievement[] => {
    const categories = [
        { id: 'cat_1', name: 'Moradia', icon: 'home' },
        { id: 'cat_2', name: 'Alimentação', icon: 'utensils' },
        { id: 'cat_3', name: 'Transporte', icon: 'car' },
        { id: 'cat_4', name: 'Saúde', icon: 'activity' },
        { id: 'cat_5', name: 'Lazer', icon: 'party-popper' },
        { id: 'cat_6', name: 'Assinaturas', icon: 'credit-card' },
        { id: 'cat_7', name: 'Educação', icon: 'graduation-cap' },
        { id: 'cat_8', name: 'Investimentos', icon: 'trending-up' },
        { id: 'cat_tech', name: 'Tecnologia', icon: 'monitor' },
        { id: 'cat_games', name: 'Games', icon: 'gamepad' }
    ];

    const list: Achievement[] = [];

    categories.forEach(cat => {
        // Count Tiers
        [1, 5, 10, 25, 50, 100, 250, 500].forEach(count => {
            list.push({
                id: `cat_${cat.id}_count_${count}`,
                name: `Especialista em ${cat.name} ${count}`,
                description: `Registre ${count} despesas em ${cat.name}.`,
                icon: cat.icon,
                tier: count >= 100 ? 'Gold' : (count >= 25 ? 'Silver' : 'Bronze'),
                points: count * 2,
                category: 'Especialização'
            });
        });

        // Value Tiers (Accumulated)
        [500, 1000, 5000, 10000, 50000, 100000].forEach(val => {
            list.push({
                id: `cat_${cat.id}_val_${val}`,
                name: `Investidor em ${cat.name} ${val / 1000}k`,
                description: `Gaste um total de R$ ${val} em ${cat.name}.`,
                icon: 'dollar-sign',
                tier: val >= 50000 ? 'Platinum' : (val >= 5000 ? 'Gold' : 'Silver'),
                points: Math.floor(val / 100),
                category: 'Patronato'
            });
        });
    });

    return list;
};

// --- STATIC ACHIEVEMENTS ---
const STATIC_ACHIEVEMENTS: Achievement[] = [
    // --- ONBOARDING ---
    { id: 'first_steps', name: 'Primeiros Passos', description: 'Complete a configuração inicial.', icon: 'flag', tier: 'Bronze', points: 10, category: 'Iniciação' },
    { id: 'identity_set', name: 'Identidade Definida', description: 'Defina seu nome e avatar.', icon: 'user', tier: 'Bronze', points: 5, category: 'Iniciação' },

    // --- MILESTONES (Volume) ---
    ...[1, 10, 50, 100, 250, 500, 1000, 2500, 5000, 10000].map(n => ({
        id: `total_tx_${n}`,
        name: `Lenda do Registro ${n}`,
        description: `Registre ${n} transações no total.`,
        icon: 'list',
        tier: n >= 1000 ? 'Platinum' : (n >= 100 ? 'Gold' : 'Silver') as any,
        points: Math.floor(n / 2),
        category: 'Volume'
    })),

    // --- WEALTH (Savings) ---
    ...[1000, 5000, 10000, 50000, 100000, 250000, 500000, 1000000].map(n => ({
        id: `wealth_${n}`,
        name: `Barão ${n / 1000}k`,
        description: `Acumule R$ ${n} em patrimônio (Saldo + Investimentos).`,
        icon: 'briefcase',
        tier: n >= 100000 ? 'Diamond' : (n >= 10000 ? 'Platinum' : 'Gold') as any,
        points: Math.floor(n / 500),
        category: 'Patrimônio'
    })),

    // --- STREAK ---
    ...[3, 7, 14, 21, 30, 60, 90, 180, 365].map(n => ({
        id: `streak_${n}`,
        name: `Foco Supremo ${n} Dias`,
        description: `Acesse o Nexus Hub por ${n} dias consecutivos.`,
        icon: 'flame',
        tier: n >= 90 ? 'Diamond' : (n >= 30 ? 'Platinum' : 'Gold') as any,
        points: n * 5,
        category: 'Disciplina'
    })),

    // --- FUN / RNG / MYSTERY (50+ ITEMS) ---
    // Amounts
    { id: 'rng_199', name: 'Promoção', description: 'Transação de R$ 1,99.', icon: 'tag', tier: 'Bronze', points: 10, category: 'Mistério' },
    { id: 'rng_12345', name: 'Sequência', description: 'Transação de R$ 123,45.', icon: 'list-ordered', tier: 'Silver', points: 50, category: 'Mistério' },
    { id: 'rng_314', name: 'Pi', description: 'Transação de R$ 3,14.', icon: 'divide', tier: 'Bronze', points: 31, category: 'Mistério' },
    { id: 'rng_42', name: 'A Resposta', description: 'Transação de R$ 42,00.', icon: 'help-circle', tier: 'Silver', points: 42, category: 'Mistério' },
    { id: 'rng_777', name: 'Jackpot', description: 'Transação de R$ 777,00.', icon: 'coins', tier: 'Gold', points: 77, category: 'Mistério' },
    { id: 'rng_1001', name: 'Mil e Uma Noites', description: 'Transação de R$ 1.001,00.', icon: 'moon', tier: 'Silver', points: 50, category: 'Mistério' },
    { id: 'rng_001', name: 'Centavinho', description: 'Transação de R$ 0,01.', icon: 'circle', tier: 'Bronze', points: 5, category: 'Mistério' },
    { id: 'rng_888', name: 'Infinito', description: 'Transação de R$ 888,00.', icon: 'infinity', tier: 'Gold', points: 88, category: 'Mistério' },
    { id: 'rng_9999', name: 'Quase 100', description: 'Transação de R$ 99,99.', icon: 'tag', tier: 'Bronze', points: 10, category: 'Mistério' },
    { id: 'rng_5050', name: 'Metade', description: 'Transação de R$ 50,50.', icon: 'percent', tier: 'Bronze', points: 15, category: 'Mistério' },

    // Times (Random Schedules)
    { id: 'time_0404', name: 'Error 404', description: 'Transação às 04:04 da manhã.', icon: 'alert-triangle', tier: 'Platinum', points: 100, category: 'Hábitos' },
    { id: 'time_1200', name: 'Pontual', description: 'Transação ao meio-dia em ponto (12:00).', icon: 'watch', tier: 'Silver', points: 30, category: 'Hábitos' },
    { id: 'time_2359', name: 'No Limite', description: 'Transação às 23:59.', icon: 'hourglass', tier: 'Gold', points: 50, category: 'Hábitos' },
    { id: 'time_1620', name: 'Hora do Chá', description: 'Transação às 16:20.', icon: 'coffee', tier: 'Bronze', points: 20, category: 'Hábitos' },
    { id: 'time_1111', name: 'Make a Wish', description: 'Transação às 11:11.', icon: 'star', tier: 'Silver', points: 30, category: 'Hábitos' },
    { id: 'time_0000', name: 'Meia Noite', description: 'Transação às 00:00.', icon: 'moon', tier: 'Gold', points: 60, category: 'Hábitos' },

    // Keywords (Descriptions)
    { id: 'key_pizza', name: 'Cowabunga', description: 'Descrição contém "Pizza".', icon: 'pizza', tier: 'Bronze', points: 10, category: 'Lifestyle' },
    { id: 'key_uber', name: 'Motorista Particular', description: 'Descrição contém "Uber" ou "99".', icon: 'car', tier: 'Bronze', points: 10, category: 'Lifestyle' },
    { id: 'key_steam', name: 'Gaben', description: 'Descrição contém "Steam".', icon: 'gamepad', tier: 'Silver', points: 20, category: 'Lifestyle' },
    { id: 'key_ifood', name: 'Tá na Mão', description: 'Descrição contém "iFood".', icon: 'utensils', tier: 'Bronze', points: 10, category: 'Lifestyle' },
    { id: 'key_netflix', name: 'Maratona', description: 'Descrição contém "Netflix".', icon: 'tv', tier: 'Bronze', points: 10, category: 'Lifestyle' },
    { id: 'key_spotify', name: 'DJ', description: 'Descrição contém "Spotify".', icon: 'music', tier: 'Bronze', points: 10, category: 'Lifestyle' },
    { id: 'key_gym', name: 'No Pain No Gain', description: 'Descrição contém "Academia" ou "Gym".', icon: 'dumbbell', tier: 'Silver', points: 25, category: 'Lifestyle' },
    { id: 'key_beer', name: 'Sextou', description: 'Descrição contém "Cerveja" ou "Bar".', icon: 'beer', tier: 'Bronze', points: 15, category: 'Lifestyle' },
    { id: 'key_book', name: 'Intelectual', description: 'Descrição contém "Livro" ou "Kindle".', icon: 'book', tier: 'Silver', points: 30, category: 'Lifestyle' },
    { id: 'key_gift', name: 'Generoso', description: 'Descrição contém "Presente".', icon: 'gift', tier: 'Silver', points: 25, category: 'Lifestyle' },
    { id: 'key_pet', name: 'Pai de Pet', description: 'Descrição contém "Ração" ou "Vet".', icon: 'heart', tier: 'Silver', points: 25, category: 'Lifestyle' }, // Added Pet
    { id: 'key_doctor', name: 'Checkup', description: 'Descrição contém "Médico" ou "Exame".', icon: 'activity', tier: 'Silver', points: 30, category: 'Lifestyle' }, // Added Medical

    // Secret / Cryptic
    { id: 'secret_negative', name: '???', description: 'Registre uma despesa negativa (estorno?).', icon: 'help-circle', tier: 'Gold', points: 50, category: 'Mistério' },
    { id: 'secret_rich', name: 'Elon Musk?', description: 'Registre uma receita de R$ 1.000.000,00.', icon: 'rocket', tier: 'Diamond', points: 500, category: 'Mistério' },
    { id: 'secret_penny', name: 'Pão Duro', description: 'Cinco transações de R$ 1,00 ou menos no mesmo dia.', icon: 'lock', tier: 'Silver', points: 30, category: 'Mistério' },

    // Random silly ones
    { id: 'rng_1337', name: 'Elite Hacker', description: 'Transação de R$ 1337,00.', icon: 'terminal', tier: 'Gold', points: 137, category: 'Mistério' },
    { id: 'rng_420', name: 'Hora do Lanche', description: 'Transação de R$ 4,20.', icon: 'smile', tier: 'Bronze', points: 42, category: 'Easter Egg' },

    { id: 'rng_1990', name: 'Anos 90', description: 'Transação de R$ 19,90.', icon: 'cassette-tape', tier: 'Bronze', points: 19, category: 'Easter Egg' },
    { id: 'rng_007', name: 'Espião', description: 'Transação de R$ 0,07.', icon: 'glasses', tier: 'Silver', points: 70, category: 'Easter Egg' },
    { id: 'rng_1010', name: 'Binário', description: 'Transação de R$ 10,10.', icon: 'cpu', tier: 'Bronze', points: 10, category: 'Easter Egg' },
    { id: 'rng_9000', name: 'Over 9000', description: 'Transação de R$ 9.001,00.', icon: 'zap', tier: 'Diamond', points: 900, category: 'Easter Egg' },
    { id: 'rng_123', name: 'Básico', description: 'Transação de R$ 1,23.', icon: 'hash', tier: 'Bronze', points: 5, category: 'Easter Egg' },
];

export const ALL_ACHIEVEMENTS: Achievement[] = [
    ...STATIC_ACHIEVEMENTS,
    ...generateCategoryAchievements()
];

// --- NEXUS TRADING CARDS DEFINITION ---
export const NEXUS_TRADING_CARDS: NexusTradingCard[] = [
    // Series: Financial Origin (Rustic)
    { id: 'card_ancient_coins', name: 'Moedas Antigas', description: 'O começo de toda fortuna.', rarity: 'Common', color: '#a16207', dropChance: 0.15, series: 'Financial Origin', unlockHint: 'Registre 5 despesas na categoria "Alimentação".' },
    { id: 'card_ledger', name: 'O Livro Razão', description: 'Registros de um império perdido.', rarity: 'Common', color: '#a16207', dropChance: 0.15, series: 'Financial Origin', unlockHint: 'Complete o setup inicial e defina seu nome.' },
    { id: 'card_mint', name: 'A Casa da Moeda', description: 'Onde o valor é criado.', rarity: 'Uncommon', color: '#a16207', dropChance: 0.10, series: 'Financial Origin', unlockHint: 'Acumule R$ 500,00 em receitas.' },
    { id: 'card_banker', name: 'O Banqueiro', description: 'Mestre dos juros compostos.', rarity: 'Rare', color: '#a16207', dropChance: 0.05, series: 'Financial Origin', unlockHint: 'Mantenha o saldo positivo por 30 dias.' },

    // Series: Cyberpunk Ethos (Futuristic)
    { id: 'card_data_stream', name: 'Fluxo de Dados', description: 'Informação é poder.', rarity: 'Common', color: '#10b981', dropChance: 0.15, series: 'Cyberpunk Ethos', unlockHint: 'Acesse o plugin por 3 dias consecutivos.' },
    { id: 'card_subnet', name: 'Sub-rede Oculta', description: 'Transações indetectáveis.', rarity: 'Uncommon', color: '#10b981', dropChance: 0.10, series: 'Cyberpunk Ethos', unlockHint: 'Registre uma despesa entre 00:00 e 06:00.' },
    { id: 'card_ai_advisor', name: 'Conselheiro IA', description: 'Otimizando seus gastos.', rarity: 'Rare', color: '#06b6d4', dropChance: 0.05, series: 'Cyberpunk Ethos', unlockHint: 'Complete 3 Metas Financeiras.' },
    { id: 'card_surveillance', name: 'Drone de Vigilância', description: 'Olhos em todos os lugares.', rarity: 'Uncommon', color: '#10b981', dropChance: 0.10, series: 'Cyberpunk Ethos', unlockHint: 'Veja seu Relatório Mensal 5 vezes.' },
    { id: 'card_mainframe', name: 'O Mainframe', description: 'O cérebro da operação.', rarity: 'Epic', color: '#8b5cf6', dropChance: 0.02, series: 'Cyberpunk Ethos', unlockHint: 'Alcance o Nível 10 de Nexus Score.' },

    // Series: Crypto Legends
    { id: 'card_satoshi', name: 'O Criador', description: 'Um espectro digital.', rarity: 'Legendary', color: '#f59e0b', dropChance: 0.005, series: 'Crypto Legends', unlockHint: 'Faça uma transação exata de R$ 21,00.' },
    { id: 'card_diamond_hands', name: 'Mãos de Diamante', description: 'A paciência é recompensada.', rarity: 'Epic', color: '#3b82f6', dropChance: 0.02, series: 'Crypto Legends', unlockHint: 'Economize 20% da sua renda mensal.' },
    { id: 'card_bull_run', name: 'Corrida dos Touros', description: 'Alta infinita.', rarity: 'Rare', color: '#10b981', dropChance: 0.05, series: 'Crypto Legends', unlockHint: 'Aumente sua Renda Extra em 50% num mês.' },

    // Series: Luxury Lifestyle
    { id: 'card_private_jet', name: 'Jato Particular', description: 'O céu não é o limite.', rarity: 'Legendary', color: '#ec4899', dropChance: 0.005, series: 'Luxury Lifestyle', unlockHint: 'Registre uma despesa única acima de R$ 5.000,00.' },
    { id: 'card_yacht', name: 'Super Iate', description: 'Liberdade em alto mar.', rarity: 'Epic', color: '#ec4899', dropChance: 0.02, series: 'Luxury Lifestyle', unlockHint: 'Tenha mais de R$ 10.000,00 na Reserva.' },
    { id: 'card_penthouse', name: 'Cobertura', description: 'Vista do topo.', rarity: 'Rare', color: '#ec4899', dropChance: 0.05, series: 'Luxury Lifestyle', unlockHint: 'Pague todas as contas do mês antes do vencimento.' },

    // Series: Artifacts (New - Magic/History)
    { id: 'card_golden_calc', name: 'Calculadora Dourada', description: 'Soma sempre a seu favor.', rarity: 'Legendary', color: '#fbbf24', dropChance: 0.005, series: 'Artifacts', unlockHint: 'Tenha exatos R$ 0,00 de saldo no fim do mês (Zero-Based Budget).' },
    { id: 'card_abacus', name: 'Ábaco Eterno', description: 'Calculando desde 3000 A.C.', rarity: 'Rare', color: '#78350f', dropChance: 0.05, series: 'Artifacts', unlockHint: 'Registre 50 Transações no total.' },
    { id: 'card_scroll', name: 'Pergaminho Mercantil', description: 'Contratos inquebráveis.', rarity: 'Uncommon', color: '#fcd34d', dropChance: 0.10, series: 'Artifacts', unlockHint: 'Crie um orçamento para todas as categorias.' },
    { id: 'card_kings_coin', name: 'Moeda do Rei', description: 'Aceita em qualquer reino.', rarity: 'Epic', color: '#ef4444', dropChance: 0.02, series: 'Artifacts', unlockHint: 'Atingir Nível 20.' },

    // Series: Medieval Fortune (NEW)
    { id: 'card_chest', name: 'Baú de Madeira', description: 'Segurança rústica.', rarity: 'Common', color: '#854d0e', dropChance: 0.15, series: 'Medieval Fortune', unlockHint: 'Crie um Fundo de Emergência.' },
    { id: 'card_shield', name: 'Escudo do Tesouro', description: 'Proteção contra gastos.', rarity: 'Uncommon', color: '#94a3b8', dropChance: 0.10, series: 'Medieval Fortune', unlockHint: 'Não gaste nada em "Lazer" por 1 semana.' },
    { id: 'card_crown', name: 'Coroa de Ouro', description: 'Para quem governa o dinheiro.', rarity: 'Legendary', color: '#facc15', dropChance: 0.005, series: 'Medieval Fortune', unlockHint: 'Atinja R$ 100.000,00 de Patrimônio.' },

    // Series: Space Odyssey (NEW)
    { id: 'card_rocket', name: 'Foguete Lunar', description: 'To the moon!', rarity: 'Rare', color: '#6366f1', dropChance: 0.05, series: 'Space Odyssey', unlockHint: 'Aumente sua renda em 20%.' },
    { id: 'card_alien_artifact', name: 'Artefato Alien', description: 'Tecnologia desconhecida.', rarity: 'Epic', color: '#8b5cf6', dropChance: 0.02, series: 'Space Odyssey', unlockHint: 'Faça 100 transações.' },
    { id: 'card_black_hole', name: 'Buraco Negro', description: 'Onde o dinheiro some...', rarity: 'Uncommon', color: '#1f2937', dropChance: 0.10, series: 'Space Odyssey', unlockHint: 'Gaste mais do que ganhou em um mês.' },

    // Series: RPG Class (NEW)
    { id: 'card_hero_sword', name: 'Espada do Herói', description: 'Corta juros altos.', rarity: 'Rare', color: '#ef4444', dropChance: 0.05, series: 'RPG Class', unlockHint: 'Pague uma dívida total.' },
    { id: 'card_wizard_staff', name: 'Cajado Arcano', description: 'Conjura saldo extra.', rarity: 'Epic', color: '#a855f7', dropChance: 0.02, series: 'RPG Class', unlockHint: 'Receba Renda Extra 3 meses seguidos.' },
    { id: 'card_rogue_dagger', name: 'Adaga Ladina', description: 'Rápido e discreto.', rarity: 'Uncommon', color: '#14b8a6', dropChance: 0.10, series: 'RPG Class', unlockHint: 'Gaste exatamente R$ 1,00.' },

    // Series: Elemental Stones
    { id: 'card_ruby', name: 'Rubi de Fogo', description: 'Paixão ardente.', rarity: 'Rare', color: '#ef4444', dropChance: 0.05, series: 'Elemental Stones', unlockHint: 'Gaste muito em Lazer.' },
    { id: 'card_sapphire', name: 'Safira de Água', description: 'Calma e fluidez.', rarity: 'Rare', color: '#3b82f6', dropChance: 0.05, series: 'Elemental Stones', unlockHint: 'Economize em Contas.' },
    { id: 'card_emerald', name: 'Esmeralda de Terra', description: 'Estabilidade.', rarity: 'Epic', color: '#10b981', dropChance: 0.02, series: 'Elemental Stones', unlockHint: 'Mantenha saldo positivo.' },
    { id: 'card_diamond', name: 'Diamante de Ar', description: 'Liberdade absoluta.', rarity: 'Legendary', color: '#b6e3f4', dropChance: 0.005, series: 'Elemental Stones', unlockHint: 'Zere uma fatura alta.' },

    // Series: Retro Tech
    { id: 'card_floppy', name: 'Disquete 1.44MB', description: 'Armazenamento clássico.', rarity: 'Common', color: '#64748b', dropChance: 0.15, series: 'Retro Tech', unlockHint: 'Salve 5 transações.' },
    { id: 'card_crt', name: 'Monitor CRT', description: 'Resolução 640x480.', rarity: 'Uncommon', color: '#475569', dropChance: 0.10, series: 'Retro Tech', unlockHint: 'Use o plugin em tela cheia.' },
    { id: 'card_cartridge', name: 'Cartucho Dourado', description: 'Sopre para funcionar.', rarity: 'Legendary', color: '#eab308', dropChance: 0.005, series: 'Retro Tech', unlockHint: 'Descubra um bug (brincadeira).' },

    // Series: Zodiac
    { id: 'card_aries', name: 'Moeda de Áries', description: 'Impulsividade.', rarity: 'Common', color: '#ef4444', dropChance: 0.10, series: 'Zodiac', unlockHint: 'Gaste sem pensar.' },
    { id: 'card_taurus', name: 'Touro de Ouro', description: 'Estabilidade material.', rarity: 'Epic', color: '#166534', dropChance: 0.02, series: 'Zodiac', unlockHint: 'Invista R$ 500,00.' },
    { id: 'card_leo', name: 'Juba de Leão', description: 'Realeza e brilho.', rarity: 'Rare', color: '#f59e0b', dropChance: 0.05, series: 'Zodiac', unlockHint: 'Gaste com Beleza.' },
];

// --- BADGES DEFINITION ---
export const NEXUS_BADGES: NexusBadge[] = [
    { id: 'badge_newbie', name: 'Iniciado', description: 'Bem-vindo ao Nexus Hub.', icon: 'zap', unlockCriteria: 'Instalar o plugin.' },
    { id: 'badge_saver', name: 'Poupador', description: 'Mestre da economia.', icon: 'piggy-bank', unlockCriteria: 'Atingir Nível 5.' },
    { id: 'badge_investor', name: 'Investidor', description: 'Fazendo o dinheiro trabalhar.', icon: 'trending-up', unlockCriteria: 'Atingir Nível 10.' },
    { id: 'badge_tycoon', name: 'Magnata', description: 'No topo do mundo financeiro.', icon: 'crown', unlockCriteria: 'Atingir Nível 20.' },
    { id: 'badge_collector', name: 'Colecionador', description: 'Amante de raridades.', icon: 'layers', unlockCriteria: 'Coletar 10 Cartas Únicas.' },
    { id: 'badge_guardian', name: 'Guardião', description: 'Protetor da reserva.', icon: 'shield', unlockCriteria: 'Fundo de Emergência Completo.' },
    { id: 'badge_legend', name: 'Lenda', description: 'Conquiste tudo.', icon: 'star', unlockCriteria: 'Todas as conquistas desbloqueadas.' },
];

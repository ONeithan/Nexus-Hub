import { CreditCard, Transaction } from '../views/settings';
import { moment } from 'obsidian';

/**
 * Converte uma string formatada como moeda (ex: "R$ 1.500,00") para um número.
 * @param value A string a ser convertida.
 * @returns O valor numérico.
 */
export function parseCurrency(value: string): number {
	const sanitized = String(value).replace(/[R$\s.]/g, '').replace(',', '.');
	return parseFloat(sanitized) || 0;
}

export function formatAsCurrency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function calculateCardBill(card: CreditCard, allTransactions: Transaction[], currentMonth: moment.Moment): { total: number, dueDate: moment.Moment, transactions: Transaction[] } {
    // A fatura de um mês contém todas as transações de cartão cuja data de vencimento está nesse mês.
    // Esta é a fonte da verdade, usando a propriedade 'date' da transação.
    const transactionsForBill = allTransactions.filter(t =>
        t.cardId === card.id &&
        moment(t.date).isSame(currentMonth, 'month')
    );

    // O valor salvo na transação já é o da parcela, então apenas somamos.
    const billTotal = transactionsForBill.reduce((sum, t) => sum + t.amount, 0);

    // A data de vencimento da fatura é o dia de vencimento do cartão no mês atual.
    // Lógica de data à prova de falhas para evitar rolagem de mês (ex: dia 31 em Fevereiro).
    const targetMonth = currentMonth.clone();
    const daysInTargetMonth = targetMonth.daysInMonth();
    const dueDay = Math.min(card.dueDate, daysInTargetMonth);
    const billDueDate = targetMonth.date(dueDay);

    return {
        total: billTotal,
        dueDate: billDueDate,
        transactions: transactionsForBill
    };
}

const categoryKeywords: { [keyword: string]: string } = {
    // Moradia
    'aluguel': 'Moradia',
    'condominio': 'Moradia',
    'iptu': 'Moradia',
    'luz': 'Moradia',
    'água': 'Moradia',
    'gas': 'Moradia', // sem acento
    'gás': 'Moradia', // com acento
    'internet': 'Moradia',
    'net': 'Moradia',
    'claro': 'Moradia',
    'vivo': 'Moradia',
    'tim': 'Moradia',
    
    // Alimentação
    'supermercado': 'Alimentação',
    'mercado': 'Alimentação',
    'ifood': 'Alimentação',
    'rappi': 'Alimentação',
    'restaurante': 'Alimentação',
    'padaria': 'Alimentação',

    // Transporte
    'uber': 'Transporte',
    '99': 'Transporte',
    'gasolina': 'Transporte',
    'posto': 'Transporte',
    'ipiranga': 'Transporte',
    'shell': 'Transporte',
    'petrobras': 'Transporte',
    'etanol': 'Transporte',
    'estacionamento': 'Transporte',

    // Lazer & Assinaturas
    'netflix': 'Assinaturas',
    'spotify': 'Assinaturas',
    'disney+': 'Assinaturas',
    'hbo': 'Assinaturas',
    'prime video': 'Assinaturas',
    'cinema': 'Lazer',
    'show': 'Lazer',

    // Saúde
    'farmácia': 'Saúde',
    'farmacia': 'Saúde',
    'drogaria': 'Saúde',
    'médico': 'Saúde',
    'dentista': 'Saúde',
    'plano de saúde': 'Saúde',
};

export function suggestCategory(description: string, availableCategories: {id: string, name: string}[]): string | null {
    const lowerCaseDescription = description.toLowerCase();
    const availableCategoryNames = new Set(availableCategories.map(c => c.name));

    for (const keyword in categoryKeywords) {
        if (lowerCaseDescription.includes(keyword)) {
            const suggestedCategory = categoryKeywords[keyword];
            // Verifica se a categoria sugerida realmente existe nas configurações do usuário
            if (availableCategoryNames.has(suggestedCategory)) {
                return suggestedCategory;
            }
        }
    }
    return null;
}
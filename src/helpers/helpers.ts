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

export function calculateCardBill(allTransactions: Transaction[], card: CreditCard, month: moment.Moment): { total: number, transactions: Transaction[], closingDate: moment.Moment, dueDate: moment.Moment } {
    const targetPaymentMonth = month.format('YYYY-MM');

    const transactionsForBill = allTransactions.filter(t =>
        t.cardId === card.id &&
        t.paymentMonth === targetPaymentMonth
    );

    const billTotal = transactionsForBill.reduce((sum, t) => sum + t.amount, 0);

    // Determine the actual dates for this specific bill
    const closingDate = month.clone().date(card.closingDay);

    const dueDate = month.clone().date(card.dueDate);
    // If due date is before closing day (e.g., closes day 20, due day 5), the due date is in the next month.
    if (card.dueDate < card.closingDay) {
        dueDate.add(1, 'month');
    }

    return {
        total: billTotal,
        transactions: transactionsForBill,
        closingDate: closingDate,
        dueDate: dueDate,
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

export function suggestCategory(description: string, availableCategories: { id: string, name: string }[]): string | null {
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

export function calculatePaymentMonth(
    transactionDate: string,
    cardId?: string,
    cards?: CreditCard[]
): string {
    const txMoment = moment(transactionDate);

    // Se é uma transação de cartão, aplicar lógica específica
    if (cardId && cards) {
        const card = cards.find(c => c.id === cardId);
        if (card) {
            const closingDay = card.closingDay;
            const purchaseDay = txMoment.date();

            // Se comprou ANTES ou NO dia de fechamento
            if (purchaseDay <= closingDay) {
                // Fatura fecha neste mês → Vence início do próximo mês
                // Paga com salário deste mês → paymentMonth = mês atual
                return txMoment.format('YYYY-MM');
            } else {
                // Comprou DEPOIS do fechamento
                // Fatura fecha no próximo mês → Vence em 2 meses
                // Paga com salário do próximo mês → paymentMonth = próximo mês
                return txMoment.add(1, 'month').format('YYYY-MM');
            }
        }
    }

    // Para despesas normais (não-cartão):
    // A regra do usuário é: o salário do Mês N paga as contas que vencem no Mês N+1.
    // Portanto, para uma transação que vence no Mês N+1, seu paymentMonth é o Mês N.
    return txMoment.subtract(1, 'month').format('YYYY-MM');
}
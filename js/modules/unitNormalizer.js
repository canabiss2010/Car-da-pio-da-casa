// js/modules/unitNormalizer.js
// Normaliza unidades de medida para padrões: g (gramas), ml (mililitros), un (unidades)

// Mapa de conversões para unidades padrão
const conversionMap = {
    // Conversões para GRAMAS
    'kg': { factor: 1000, standardUnit: 'g' },
    'quilograma': { factor: 1000, standardUnit: 'g' },
    'quilogramas': { factor: 1000, standardUnit: 'g' },
    'g': { factor: 1, standardUnit: 'g' },
    'grama': { factor: 1, standardUnit: 'g' },
    'gramas': { factor: 1, standardUnit: 'g' },
    'mg': { factor: 0.001, standardUnit: 'g' },
    'miligrama': { factor: 0.001, standardUnit: 'g' },
    'miligramas': { factor: 0.001, standardUnit: 'g' },

    // Conversões para MILILITROS
    'l': { factor: 1000, standardUnit: 'ml' },
    'litro': { factor: 1000, standardUnit: 'ml' },
    'litros': { factor: 1000, standardUnit: 'ml' },
    'ml': { factor: 1, standardUnit: 'ml' },
    'mililitro': { factor: 1, standardUnit: 'ml' },
    'mililitros': { factor: 1, standardUnit: 'ml' },

    // Conversões para UNIDADES
    'un': { factor: 1, standardUnit: 'un' },
    'unidade': { factor: 1, standardUnit: 'un' },
    'unidades': { factor: 1, standardUnit: 'un' },
};

/**
 * Normaliza uma unidade de medida inserida pelo usuário
 * @param {number} quantity - Quantidade
 * @param {string} unit - Unidade (pode ser Kg, kg, kg, Litro, L, Unidade, etc)
 * @returns {Object|null} { qty: number, unit: string } ou null se unidade inválida
 */
export function normalizeUnit(quantity, unit) {
    if (!quantity || isNaN(quantity)) {
        return { qty: 0, unit: 'un' };
    }

    // Normaliza a string da unidade: remove espaços, converte pra minúsculas
    const normalizedUnit = String(unit).trim().toLowerCase();

    // Procura na tabela de conversão
    const conversion = conversionMap[normalizedUnit];

    if (conversion) {
        // Aplica o fator de conversão e retorna com unidade padrão
        const convertedQty = quantity * conversion.factor;
        return {
            qty: Math.round(convertedQty * 1000) / 1000, // Arredonda pra 3 casas decimais
            unit: conversion.standardUnit
        };
    }

    // Se não encontrar conversão, retorna null (unidade inválida)
    return null;
}

/**
 * Retorna as unidades válidas suportadas pelo sistema
 * @returns {Array} Array com as unidades válidas
 */
export function getValidUnits() {
    return ['g', 'kg', 'ml', 'l', 'un'];
}

/**
 * Verifica se uma unidade é válida/suportada
 * @param {string} unit - Unidade a verificar
 * @returns {boolean} true se válida, false caso contrário
 */
export function isValidUnit(unit) {
    if (!unit) return false;
    const normalizedUnit = String(unit).trim().toLowerCase();
    return normalizedUnit in conversionMap;
}

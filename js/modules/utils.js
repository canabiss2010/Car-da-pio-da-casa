// js/modules/utils.js
import { DENSITIES, DEFAULTS } from '../config.js';

// Cache para unidades normalizadas
const unitCache = new Map();

// Mapa de unidades de medida
const UNIT_MAP = {
  'kg': 'kg', 'kilo': 'kg', 'g': 'g', 'grama': 'g', 'gr': 'g',
  'l': 'l', 'litro': 'l', 'ml': 'ml', 'xic': 'xic', 'xicara': 'xic',
  'xícara': 'xic', 'cs': 'cs', 'colher_de_sopa': 'cs', 'ch': 'ch',
  'colher_cha': 'ch', 'un': 'un', 'lat': 'lat', 'cx': 'cx',
  'caixa': 'cx', 'pacote': 'pacote'
};

// Conjunto de unidades válidas
const VALID_UNITS = new Set(Object.values(UNIT_MAP));

/**
 * Seletor rápido de elementos do DOM
 * @param {string} selector - Seletor CSS
 * @returns {Element|null} Elemento encontrado ou null
 */
export const qs = selector => {
  try {
    return document.querySelector(selector);
  } catch (error) {
    console.error('Erro ao buscar elemento:', error);
    return null;
  }
};

/**
 * Normaliza unidades de medida para um formato padrão
 * @param {string} u - Unidade a ser normalizada
 * @returns {string} Unidade normalizada
 */
export function normalizeUnit(u) {
  if (!u) return 'un';
  
  try {
    const key = u.toString().toLowerCase()
      .replace(/\s+/g, '_')  // Substitui espaços por underscore
      .replace(/[.,]/g, '')
      .trim();
    
    if (unitCache.has(key)) {
      return unitCache.get(key);
    }
    
    const result = UNIT_MAP[key] || key;
    unitCache.set(key, result);
    return result;
  } catch (error) {
    console.error('Erro ao normalizar unidade:', error);
    return 'un';
  }
}

/**
 * Verifica se uma unidade é válida
 * @param {string} unit - Unidade a ser validada
 * @returns {boolean} True se a unidade for válida
 */
export function isValidUnit(unit) {
  return VALID_UNITS.has(normalizeUnit(unit));
}

/**
 * Converte uma quantidade para gramas
 * @param {number} qty - Quantidade a ser convertida
 * @param {string} unit - Unidade de origem
 * @param {string} [name] - Nome do item para cálculo de densidade
 * @returns {number|null} Quantidade em gramas ou null em caso de erro
 */
export function toGrams(qty, unit, name) {
  if (qty == null || isNaN(qty)) {
    console.warn('Quantidade inválida:', qty);
    return null;
  }

  const u = normalizeUnit(unit || 'un');
  const c = DEFAULTS.conv;

  try {
    if (u === 'g') return qty;
    if (u === 'kg') return qty * c.kg_to_g;
    if (u === 'mg') return qty / c.g_to_mg;

    const normalizedItemName = (name || '').toString().trim().toLowerCase();
    const d = DENSITIES[normalizedItemName] || null;

    if (d === null) {
      console.warn(`Densidade não encontrada para: "${name}". Usando densidade padrão para conversão.`);
      // Retorna null apenas para unidades que precisam de densidade
      if (['ml', 'l', 'xic', 'cs', 'ch'].includes(u)) {
        return null;
      }
      // Para outras unidades, continua a execução
    }

    switch (u) {
      case 'ml': return qty * d;
      case 'l': return (qty * c.l_to_ml) * d;
      case 'xic': return (qty * c.cup_ml) * d;
      case 'cs': return (qty * c.tbsp_ml) * d;
      case 'ch': return (qty * c.tsp_ml) * d;
      default:
        console.warn('Conversão não suportada para unidade:', u);
        return null;
    }
  } catch (error) {
    console.error('Erro na conversão para gramas:', error);
    return null;
  }
}

/**
/**
 * Converte uma quantidade de gramas para outra unidade
 * @param {number} grams - Quantidade em gramas
 * @param {string} targetUnit - Unidade de destino
 * @param {string} [name] - Nome do item para cálculo de densidade
 * @returns {number|null} Quantidade convertida ou null em caso de erro
 */
export function fromGrams(grams, targetUnit, name) {
  if (grams == null || isNaN(grams)) {
    console.warn('Quantidade em gramas inválida:', grams);
    return null;
  }

  const u = normalizeUnit(targetUnit);
  const c = DEFAULTS.conv;

  try {
    if (u === 'g') return grams;
    if (u === 'kg') return grams / c.kg_to_g;
    if (u === 'mg') return grams * c.g_to_mg;
    // ... resto da função fromGrams
  } catch (error) {
    console.error('Erro na conversão de gramas:', error);
    return null;
  }
}

/**
 * Processa uma linha de texto em um objeto de ingrediente
 * @param {string} line - Linha de texto no formato "nome,quantidade,unidade"
 * @returns {Object|null} Objeto com nome, quantidade e unidade ou null em caso de erro
 */
export function parseLine(line) {
  try {
    const parts = line.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    
    if (parts.length === 1) {
      return { 
        name: parts[0].toLowerCase(), 
        qty: 1, 
        unit: 'un' 
      };
    }
    
    const qty = parseFloat(parts[1]);
    if (isNaN(qty)) {
      console.warn('Quantidade inválida na linha:', line);
      return null;
    }
    
    return { 
      name: parts[0].toLowerCase(), 
      qty, 
      unit: normalizeUnit(parts[2] || 'un') 
    };
  } catch (error) {
    console.error('Erro ao processar linha:', error);
    return null;
  }
}

/*
 * Valida e analisa uma string JSON
 * @param {string} data - String JSON a ser validada
 * @param {*} [defaultReturn=[]] - Valor padrão em caso de erro
 * @returns {Array|*} Dados analisados ou valor padrão em caso de erro
 */
export function validateJSON(data, defaultReturn = []) {
  if (!data || data === 'null' || data === 'undefined') {
    return defaultReturn;
  }

  try {
    const parsed = JSON.parse(data);
    // Remova a verificação de array para aceitar objetos também
    return parsed || defaultReturn;
  } catch (error) {
    console.warn('Erro ao analisar JSON:', error);
    return defaultReturn;
  }
}

// Testes unitários básicos (comentados por padrão)
// Para executar os testes, descomente o bloco abaixo
(function runTests() {
  // Teste para parseLine
  (function testParseLine() {
    const testCases = [
      { input: 'arroz,2,kg', expected: { name: 'arroz', qty: 2, unit: 'kg' } },
      { input: 'feijão', expected: { name: 'feijão', qty: 1, unit: 'un' } },
      { input: 'leite,1,l', expected: { name: 'leite', qty: 1, unit: 'l' } }
    ];

    testCases.forEach(({ input, expected }, i) => {
      const result = parseLine(input);
      const passed = JSON.stringify(result) === JSON.stringify(expected);
      console.log(`Teste ${i + 1}: ${passed ? '✅' : '❌'}`, {
        input,
        expected,
        result,
        passed
      });
    });
  })();

  // Teste para normalizeUnit
  (function testNormalizeUnit() {
    const testCases = [
      { input: 'KG', expected: 'kg' },
      { input: 'grama', expected: 'g' },
      { input: 'xicara', expected: 'xic' },
      { input: 'colher de sopa', expected: 'cs' },
      { input: 'invalid', expected: 'invalid' }
    ];

    testCases.forEach(({ input, expected }) => {
      const result = normalizeUnit(input);
      const passed = result === expected;
      console.log(`Teste "${input}": ${passed ? '✅' : '❌'}`, {
        expected,
        result,
        passed
      });
    });
  })(); // fim do teste para normalizeUnit  

  // Teste para validateJSON
  (function testValidateJSON() {
    const testCases = [
      { input: '[]', expected: [] },
      { input: '[1,2,3]', expected: [1,2,3] },
      { input: '{"name":"arroz","qty":2,"unit":"kg"}', expected: { name: 'arroz', qty: 2, unit: 'kg' } },
      { input: 'invalid', expected: [] }
    ];

    testCases.forEach(({ input, expected }) => {
      const result = validateJSON(input);
      const passed = JSON.stringify(result) === JSON.stringify(expected);
      console.log(`Teste "${input}": ${passed ? '✅' : '❌'}`, {
        expected,
        result,
        passed
      });
    });
  })(); // fim do teste para validateJSON
})(); // fim do runTests
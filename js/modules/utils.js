import { DENSITIES, DEFAULTS } from '../config.js';

// Seletor rápido
export const qs = selector => document.querySelector(selector);

// Normaliza unidades de medida
export function normalizeUnit(u) {
  if (!u) return 'un';
  const key = u.toString().toLowerCase().replace(/\s+/g, '').replace(/[.,]/g, '').trim();
  const map = {
    'kg': 'kg', 'kilo': 'kg', 'g': 'g', 'grama': 'g', 'gr': 'g',
    'l': 'l', 'litro': 'l', 'ml': 'ml', 'xic': 'xic', 'xicara': 'xic',
    'xícara': 'xic', 'cs': 'cs', 'colher_sopa': 'cs', 'ch': 'ch',
    'colher_cha': 'ch', 'un': 'un', 'lat': 'lat', 'cx': 'cx',
    'caixa': 'cx', 'pacote': 'pacote'
  };
  return map[key] || key;
}

// Converte para gramas
export function toGrams(qty, unit, name) {
  if (qty == null || isNaN(qty)) return null;
  const u = normalizeUnit(unit || 'un');
  const c = DEFAULTS.conv;

  if (u === 'g') return qty;
  if (u === 'kg') return qty * c.kg_to_g;
  if (u === 'mg') return qty / c.g_to_mg;

  const d = DENSITIES[name?.toLowerCase()];
  if (!d) return null;

  switch (u) {
    case 'ml': return qty * d;
    case 'l': return (qty * c.l_to_ml) * d;
    case 'xic': return (qty * c.cup_ml) * d;
    case 'cs': return (qty * c.tbsp_ml) * d;
    case 'ch': return (qty * c.tsp_ml) * d;
    default: return null;
  }
}

// Processa linha de texto
export function parseLine(line) {
  const parts = line.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return { name: parts[0].toLowerCase(), qty: 1, unit: 'un' };
  const qty = parseFloat(parts[1]) || 0;
  return { name: parts[0].toLowerCase(), qty, unit: normalizeUnit(parts[2] || 'un') };
}

// Valida JSON
export function validateJSON(data, defaultReturn = []) {
  try {
    if (!data || data === 'null' || data === 'undefined') return defaultReturn;
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : defaultReturn;
  } catch (e) {
    console.warn('Dados corrompidos, usando padrão:', e);
    return defaultReturn;
  }
}

// Obtém o nome formatado do ingrediente
export function getIngredientName(ingredient) {
  if (!ingredient) return '';
  if (typeof ingredient === 'string') return ingredient;
  return ingredient.name || '';
}
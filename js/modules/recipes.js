// js/modules/recipes.js
import { qs } from './utils.js';
import { openModal, setAlert } from './ui.js';
import { normalizeUnit } from './unitNormalizer.js';
import { barcodeScanner } from './barcode.js';

const RECIPE_API_URL = 'https://car-da-pio-da-casa.onrender.com/ler-receita';
const RECIPE_TIMEOUT_MS = 120000; // o servidor gratuito do Render pode levar ~1 min para acordar
const MAX_PHOTOS = 3;

const frequencyLevels = [
  { level: 1, percentage: 10, label: 'Muito Raro' },
  { level: 2, percentage: 25, label: 'Raro' },
  { level: 3, percentage: 50, label: 'Moderado' },
  { level: 4, percentage: 75, label: 'Frequente' },
  { level: 5, percentage: 90, label: 'Muito Frequente' }
];

const MACRO_TAGS = [
  { key: 'proteina', label: '🥩 Proteína' },
  { key: 'carbo', label: '🌾 Carboidrato' },
  { key: 'vegetais', label: '🥦 Vegetais' },
  { key: 'gordura', label: '🥑 Gordura' }
];

// Grupos da lista de receitas (o campo "category" da receita)
const CATEGORY_GROUPS = [
  { key: 'proteina', label: '🥩 Proteínas' },
  { key: 'carboidrato', label: '🌾 Carboidratos' },
  { key: 'vegetais', label: '🥦 Vegetais' },
  { key: 'outros', label: '🍽️ Outros' }
];

const UNITS = ['g', 'kg', 'ml', 'l', 'un'];

// Medidas caseiras: só existem no formulário; ao salvar viram g ou ml
const HOME_UNITS = [
  { key: 'xic', label: 'xícara', short: 'xícara', perCup: 1 },
  { key: 'cs', label: 'colher de sopa', short: 'c. sopa', perCup: 1 / 16 },
  { key: 'cc', label: 'colher de chá', short: 'c. chá', perCup: 1 / 48 }
];

// Quanto pesa 1 xícara (240 ml) de cada ingrediente. O primeiro que bater vale,
// por isso os nomes mais específicos vêm antes ("leite em po" antes de "leite").
const CUP_WEIGHTS = [
  ['leite condensado', 306, 'g'], ['leite em po', 100, 'g'], ['creme de leite', 240, 'g'],
  ['chocolate em po', 90, 'g'], ['cacau', 90, 'g'], ['achocolatado', 90, 'g'],
  ['chocolate', 160, 'g'], ['acucar mascavo', 150, 'g'], ['acucar de confeiteiro', 120, 'g'],
  ['acucar', 180, 'g'], ['farinha de rosca', 110, 'g'], ['farinha de mandioca', 150, 'g'],
  ['farinha', 120, 'g'], ['amido', 150, 'g'], ['maisena', 150, 'g'], ['fuba', 120, 'g'],
  ['polvilho', 150, 'g'], ['tapioca', 150, 'g'], ['aveia', 80, 'g'], ['granola', 100, 'g'],
  ['arroz', 185, 'g'], ['feijao', 180, 'g'], ['lentilha', 190, 'g'], ['grao de bico', 200, 'g'],
  ['quinoa', 170, 'g'], ['milho', 160, 'g'], ['ervilha', 150, 'g'], ['coco ralado', 80, 'g'],
  ['queijo ralado', 90, 'g'], ['queijo', 110, 'g'], ['manteiga', 200, 'g'], ['margarina', 200, 'g'],
  ['requeijao', 240, 'g'], ['iogurte', 240, 'g'], ['mel', 340, 'g'], ['fermento', 225, 'g'],
  ['bicarbonato', 220, 'g'], ['sal', 290, 'g'], ['canela', 110, 'g'], ['nozes', 100, 'g'],
  ['castanha', 130, 'g'], ['amendoim', 140, 'g'], ['uva passa', 150, 'g'], ['gergelim', 140, 'g'],
  ['chia', 160, 'g'], ['linhaca', 150, 'g'], ['oleo', 240, 'ml'], ['azeite', 240, 'ml'],
  ['leite', 240, 'ml'], ['agua', 240, 'ml'], ['suco', 240, 'ml'], ['caldo', 240, 'ml'],
  ['vinagre', 240, 'ml'], ['molho', 240, 'ml'], ['vinho', 240, 'ml'], ['cafe', 240, 'ml']
];

// "1 xícara de chocolate em pó" -> { qty: 90, unit: 'g' } (null se não souber)
function convertHomeMeasure(name, qty, unitKey) {
  const home = HOME_UNITS.find(u => u.key === unitKey);
  const key = normalizeIngredientText(splitIngredientAlternatives(name).primary);
  const match = home && CUP_WEIGHTS.find(([word]) => key.includes(word));
  if (!match) return null;
  return { qty: roundMeasure(match[1] * home.perCup * qty), unit: match[2] };
}

// Receita aberta no formulário (null = nova receita)
let editingRecipe = null;
let selectedMacros = new Set();
let selectedFrequency = 3;
// Receitas na ordem em que aparecem na lista (os botões apontam para cá)
let renderedRecipes = [];
let searchTerm = '';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeIngredientText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

function splitIngredientAlternatives(value = '') {
  const parts = String(value || '')
    .split('||')
    .map(part => normalizeIngredientText(part))
    .filter(Boolean);

  if (parts.length === 0) {
    return { primary: '', alternatives: [] };
  }

  return {
    primary: parts[0],
    alternatives: parts.slice(1)
  };
}

function formatIngredientName(ingredient = {}) {
  const parts = [ingredient.name || ''];
  if (Array.isArray(ingredient.alternatives) && ingredient.alternatives.length > 0) {
    parts.push(...ingredient.alternatives);
  }
  return parts.filter(Boolean).join(' || ');
}

function formatQty(qty) {
  const value = Number(qty);
  if (!Number.isFinite(value)) return '';
  return String(Math.round(value * 1000) / 1000).replace('.', ',');
}

// Arredonda medidas convertidas para números fáceis: 16,83 g -> 17 g; 243 g -> 245 g; 2,37 g -> 2,5 g
function roundMeasure(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n < 10) return Math.max(0.5, Math.round(n * 2) / 2);
  if (n < 100) return Math.round(n);
  return Math.round(n / 5) * 5;
}

// Aceita "2", "0,5", "1/2" e "1 1/2"
function parseQty(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  const fraction = text.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  if (fraction && Number(fraction[3]) > 0) {
    return Number(fraction[1] || 0) + Number(fraction[2]) / Number(fraction[3]);
  }
  const parsed = parseFloat(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ensureInventoryItemsForRecipe(ingredients = []) {
  if (!Array.isArray(window.inventory)) {
    window.inventory = [];
  }

  const created = [];

  ingredients.forEach(ingredient => {
    const primaryName = normalizeIngredientText(ingredient.name);
    if (!primaryName) {
      return;
    }

    const existing = window.inventory.find(item =>
      normalizeIngredientText(item.name) === primaryName && String(item.unit || '').toLowerCase() === String(ingredient.unit || '').toLowerCase()
    );

    if (!existing) {
      window.inventory.push({
        name: primaryName,
        qty: 0,
        unit: ingredient.unit || 'un',
        category: 'outros'
      });
      created.push(primaryName);
    }
  });

  return created;
}

function getMacroValues() {
  const share = selectedMacros.size === 0 ? 0 : Number((100 / selectedMacros.size).toFixed(2));
  return {
    carbo: selectedMacros.has('carbo') ? share : 0,
    proteina: selectedMacros.has('proteina') ? share : 0,
    vegetais: selectedMacros.has('vegetais') ? share : 0,
    gordura: selectedMacros.has('gordura') ? share : 0
  };
}

// Receitas antigas podem ter só "category" ou só "macros"
function getRecipeMacroSelection(recipe = {}) {
  const next = new Set();
  const macros = recipe.macros;

  if (macros && typeof macros === 'object') {
    if (macros.carbo || macros.carboidrato) next.add('carbo');
    if (macros.proteina) next.add('proteina');
    if (macros.vegetais) next.add('vegetais');
    if (macros.gordura || macros.outros) next.add('gordura');
  }

  if (next.size === 0) {
    if (recipe.category === 'proteina') next.add('proteina');
    if (recipe.category === 'carboidrato') next.add('carbo');
    if (recipe.category === 'vegetais' || recipe.category === 'verdura') next.add('vegetais');
  }

  return next;
}

// O grupo da lista sai do que foi marcado (antes era um campo separado e repetido)
function getCategoryFromMacros() {
  if (selectedMacros.has('proteina')) return 'proteina';
  if (selectedMacros.has('carbo')) return 'carboidrato';
  if (selectedMacros.has('vegetais')) return 'vegetais';
  return 'outros';
}

function getCategoryGroup(category) {
  const key = category === 'verdura' ? 'vegetais' : category;
  return CATEGORY_GROUPS.some(group => group.key === key) ? key : 'outros';
}

// Encontra a receita em window.recipes mesmo se a nuvem trocou o objeto
function findRecipeIndex(recipe) {
  if (!recipe) return -1;
  const direct = window.recipes.indexOf(recipe);
  if (direct >= 0) return direct;

  return window.recipes.findIndex(r =>
    r.name === recipe.name &&
    JSON.stringify(r.ingredients) === JSON.stringify(recipe.ingredients)
  );
}

function getKnownIngredients() {
  try {
    return barcodeScanner.getKnownIngredients();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Lista de receitas
// ---------------------------------------------------------------------------

export function showRecipes(message = null) {
  if (window.recipes.length <= 5) searchTerm = '';

  const html = `
    <div class="rc">
      <div class="rc-add">
        <div class="rc-add-title">Adicionar receita</div>
        <button type="button" class="rc-add-main" data-rc="photo">
          <span class="rc-add-icon">📷</span>
          <span><strong>Tirar foto da receita</strong><small>de livro, caderno escrito à mão ou print</small></span>
        </button>
        <div class="rc-add-row">
          <button type="button" class="rc-add-alt" data-rc="new">✍️ Digitar</button>
          <button type="button" class="rc-add-alt" data-rc="text">🎤 Colar ou falar</button>
        </div>
        <input type="file" id="rc_photoInput" accept="image/*" multiple hidden />
      </div>
      <div id="rc_status"></div>
      <div class="rc-list-head">
        <strong>Suas receitas (${window.recipes.length})</strong>
      </div>
      ${window.recipes.length > 5 ? `<input id="rc_search" class="rc-search" type="search" placeholder="🔎 Buscar receita" value="${escapeHtml(searchTerm)}" />` : ''}
      <div id="rc_list" class="rc-list"></div>
    </div>
  `;

  openModal('Receitas', html);
  if (message) showStatus(message.text, message.level);

  qs('#rc_photoInput')?.addEventListener('change', handlePhotoSelected);
  qs('#rc_search')?.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderRecipeList();
  });

  renderRecipeList();
}

function showStatus(text, level = 'info', { loading = false } = {}) {
  const el = qs('#rc_status');
  if (!el) return;
  if (!text) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<div class="rc-status rc-status-${level}">${loading ? '<span class="rc-spinner"></span>' : ''}<span>${escapeHtml(text)}</span></div>`;
}

function renderRecipeList() {
  const el = qs('#rc_list');
  if (!el) return;

  renderedRecipes = [];

  if (window.recipes.length === 0) {
    el.innerHTML = '<div class="rc-empty">Nenhuma receita ainda. Comece tirando uma foto de uma receita que vocês fazem sempre!</div>';
    return;
  }

  const term = normalizeIngredientText(searchTerm);
  const visible = window.recipes.filter(recipe => !term || normalizeIngredientText(recipe.name).includes(term));

  if (visible.length === 0) {
    el.innerHTML = '<div class="rc-empty">Nenhuma receita com esse nome.</div>';
    return;
  }

  el.innerHTML = CATEGORY_GROUPS.map(group => {
    const recipes = visible
      .filter(recipe => getCategoryGroup(recipe.category) === group.key)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { sensitivity: 'base' }));

    if (recipes.length === 0) return '';

    return `
      <section class="rc-group">
        <h3 class="rc-group-title">${group.label} <span>${recipes.length}</span></h3>
        ${recipes.map(recipe => renderRecipeCard(recipe)).join('')}
      </section>
    `;
  }).join('');
}

function renderRecipeCard(recipe) {
  const ref = renderedRecipes.push(recipe) - 1;
  const freqInfo = frequencyLevels.find(f => f.level === (recipe.frequency || 3)) || frequencyLevels[2];
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const macros = getRecipeMacroSelection(recipe);

  const ingredientsHtml = ingredients.length > 0
    ? ingredients.map(ing => `
        <li><span>${escapeHtml(formatIngredientName(ing).replace(/ \|\| /g, ' ou '))}</span><span>${escapeHtml(formatQty(ing.qty))} ${escapeHtml(ing.unit || '')}</span></li>
      `).join('')
    : '<li><span>Nenhum ingrediente cadastrado</span></li>';

  const macrosHtml = MACRO_TAGS
    .filter(tag => macros.has(tag.key))
    .map(tag => `<span class="rc-tag">${tag.label}</span>`)
    .join('');

  return `
    <div class="rc-card">
      <button type="button" class="rc-card-head" data-rc="toggle" data-ref="${ref}">
        <span class="rc-card-name">${escapeHtml(recipe.name)}</span>
        <span class="rc-card-meta">${recipe.servings || 4} porções · ${freqInfo.label} · ${ingredients.length} ingred.</span>
      </button>
      <div class="rc-card-body" hidden>
        ${macrosHtml ? `<div class="rc-tags">${macrosHtml}</div>` : ''}
        <ul class="rc-ing-view">${ingredientsHtml}</ul>
        <div class="rc-card-actions">
          <button type="button" class="btn-ghost" data-rc="edit" data-ref="${ref}">✏️ Editar</button>
          <button type="button" class="btn-ghost rc-danger" data-rc="delete" data-ref="${ref}">🗑️ Excluir</button>
        </div>
      </div>
    </div>
  `;
}

function deleteRecipe(recipe) {
  if (!recipe || !confirm(`Excluir a receita "${recipe.name}"?`)) return;

  const idx = findRecipeIndex(recipe);
  if (idx < 0) return;

  window.recipes.splice(idx, 1);
  window.saveAll();
  showRecipes({ text: `Receita excluída: ${recipe.name}`, level: 'success' });
}

// ---------------------------------------------------------------------------
// Formulário (nova receita, edição e conferência da receita lida da foto)
// ---------------------------------------------------------------------------

function ingredientRowHtml(ing = {}) {
  const unit = UNITS.includes(ing.unit) ? ing.unit : 'g';
  // Só explica de onde veio quando o mesmo ingrediente foi somado de partes diferentes
  const original = ing.original && ing.original.includes(' + ')
    ? `<div class="rc-ing-original">Somado: ${escapeHtml(ing.original)}</div>`
    : '';

  return `
    <div class="rc-ing-row${ing.missing ? ' rc-missing' : ''}">
      <input class="rc-ing-name" list="rc_known" placeholder="Ingrediente" value="${escapeHtml(ing.name || '')}" autocomplete="off" />
      <input class="rc-ing-qty" type="text" inputmode="decimal" placeholder="Qtd" value="${escapeHtml(ing.qty ? formatQty(ing.qty) : '')}" />
      <select class="rc-ing-unit">
        ${UNITS.map(u => `<option value="${u}"${u === unit ? ' selected' : ''}>${u}</option>`).join('')}
        <optgroup label="Medida caseira">
          ${HOME_UNITS.map(u => `<option value="${u.key}">${u.short}</option>`).join('')}
        </optgroup>
      </select>
      <button type="button" class="rc-ing-remove" data-rc="remove-ing" aria-label="Remover ingrediente">✕</button>
      <div class="rc-ing-conv" hidden></div>
      ${original}
    </div>
  `;
}

// draft: { name, servings, frequency, macros:Set, ingredients:[{name, qty, unit, original, missing}] }
function openRecipeForm(draft, { recipe = null, issues = [], imported = false } = {}) {
  editingRecipe = recipe;
  selectedMacros = new Set(draft.macros || []);
  selectedFrequency = draft.frequency || 3;

  const ingredients = draft.ingredients && draft.ingredients.length > 0
    ? draft.ingredients
    : [{}, {}, {}];

  const knownNames = Array.from(new Set(getKnownIngredients().map(item => item.name)));

  const issuesHtml = issues.length > 0
    ? `<div class="rc-check">
        <strong>${imported ? 'Confira antes de salvar' : 'Atenção'}</strong>
        <ul>${issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join('')}</ul>
      </div>`
    : '';

  const html = `
    <div class="rc rc-form" data-imported="${imported ? '1' : ''}">
      ${issuesHtml}
      <div id="rc_formMsg"></div>

      <label class="rc-label" for="rc_name">Nome da receita</label>
      <input id="rc_name" class="${draft.nameMissing ? 'rc-input-missing' : ''}" placeholder="Ex: Frango com batata" value="${escapeHtml(draft.name || '')}" />

      <label class="rc-label" for="rc_servings">Rende quantas porções?</label>
      <div class="rc-stepper${draft.servingsMissing ? ' rc-input-missing' : ''}">
        <button type="button" data-rc="serv-minus" aria-label="Menos">−</button>
        <input id="rc_servings" type="number" inputmode="numeric" min="1" value="${draft.servings || 4}" />
        <button type="button" data-rc="serv-plus" aria-label="Mais">+</button>
      </div>

      <div class="rc-label">Com que frequência querem comer?</div>
      <div class="rc-chips" id="rc_freq">
        ${frequencyLevels.map(f => `<button type="button" class="rc-chip" data-rc="freq" data-value="${f.level}">${f.label}</button>`).join('')}
      </div>

      <div class="rc-label">O que essa receita tem? <small>(pode marcar mais de um)</small></div>
      <div class="rc-chips" id="rc_macros">
        ${MACRO_TAGS.map(tag => `<button type="button" class="rc-chip" data-rc="macro" data-value="${tag.key}">${tag.label}</button>`).join('')}
      </div>

      <div class="rc-label">Ingredientes</div>
      <div class="rc-ing-head"><span>Nome</span><span>Qtd</span><span>Unid.</span><span></span></div>
      <div id="rc_ings">${ingredients.map(ing => ingredientRowHtml(ing)).join('')}</div>
      <button type="button" class="rc-add-ing" data-rc="add-ing">+ Adicionar ingrediente</button>
      <p class="rc-hint">Pode usar um ou outro? Escreva os dois com || no meio. Ex: penne || parafuso</p>

      <datalist id="rc_known">${knownNames.map(name => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>

      <div class="rc-form-actions">
        <button type="button" class="btn-ghost" data-rc="cancel">Cancelar</button>
        <button type="button" data-rc="save">${recipe ? 'Salvar alterações' : 'Salvar receita'}</button>
      </div>
    </div>
  `;

  openModal(recipe ? 'Editar receita' : 'Nova receita', html);
  updateChipStates();

  // Ao escolher um ingrediente conhecido, já usa a mesma unidade da despensa
  qs('#rc_ings')?.addEventListener('change', (e) => {
    if (!e.target.classList.contains('rc-ing-name')) return;
    const row = e.target.closest('.rc-ing-row');
    const name = normalizeIngredientText(splitIngredientAlternatives(e.target.value).primary);
    const known = getKnownIngredients().find(item => normalizeIngredientText(item.name) === name);
    const unitSelect = row?.querySelector('.rc-ing-unit');
    // Não troca se a pessoa escolheu xícara/colher
    const isHome = HOME_UNITS.some(u => u.key === unitSelect?.value);
    if (known && unitSelect && !isHome && UNITS.includes(known.unit)) unitSelect.value = known.unit;
  });

  qs('#rc_ings')?.addEventListener('change', (e) => updateConversionHint(e.target.closest('.rc-ing-row')));
  qs('#rc_ings')?.addEventListener('input', (e) => {
    const row = e.target.closest('.rc-ing-row');
    row?.classList.remove('rc-missing');
    updateConversionHint(row);
  });
  qs('#rc_name')?.addEventListener('input', (e) => e.target.classList.remove('rc-input-missing'));
}

// Mostra embaixo da linha quanto a xícara/colher vai virar ao salvar
function updateConversionHint(row) {
  const hint = row?.querySelector('.rc-ing-conv');
  if (!hint) return;

  const unit = row.querySelector('.rc-ing-unit').value;
  const qty = parseQty(row.querySelector('.rc-ing-qty').value);
  const name = row.querySelector('.rc-ing-name').value.trim();
  const isHome = HOME_UNITS.some(u => u.key === unit);

  if (!isHome || !name || qty <= 0) {
    hint.hidden = true;
    return;
  }

  const converted = convertHomeMeasure(name, qty, unit);
  hint.textContent = converted
    ? `≈ ${formatQty(converted.qty)} ${converted.unit} (valor aproximado)`
    : 'O peso será calculado pela IA ao salvar';
  hint.hidden = false;
}

// Troca xícaras/colheres por g ou ml antes de salvar.
// O que não está na tabela é perguntado à IA (um único pedido para todos).
async function convertHomeMeasureRows() {
  const pending = [];

  document.querySelectorAll('#rc_ings .rc-ing-row').forEach(row => {
    const unitSelect = row.querySelector('.rc-ing-unit');
    const home = HOME_UNITS.find(u => u.key === unitSelect.value);
    const qtyInput = row.querySelector('.rc-ing-qty');
    const name = row.querySelector('.rc-ing-name').value.trim();
    const qty = parseQty(qtyInput.value);
    if (!home || !name || qty <= 0) return;

    const written = `${qtyInput.value.trim()} ${home.label} de ${splitIngredientAlternatives(name).primary}`;
    const converted = convertHomeMeasure(name, qty, home.key);
    if (converted) {
      applyConversion(row, converted, written);
    } else {
      pending.push({ row, written, name: splitIngredientAlternatives(name).primary });
    }
  });

  if (pending.length === 0) return true;

  const saveBtn = qs('[data-rc="save"]');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Calculando medidas...';
  }

  try {
    const receita = await requestRecipe({
      texto: `Converta cada medida para g ou ml. Mantenha o nome de cada ingrediente:\n${pending.map(p => `- ${p.written}`).join('\n')}`
    });
    const results = receita.ingredientes || [];

    pending.forEach((item, index) => {
      const key = normalizeIngredientText(item.name);
      const found = results.find(r => normalizeIngredientText(r.nome) === key) || results[index];
      if (found && Number(found.qtd) > 0 && ['g', 'ml'].includes(found.unidade)) {
        applyConversion(item.row, { qty: roundMeasure(found.qtd), unit: found.unidade }, item.written);
      }
    });
  } catch {
    // Sem servidor: a pessoa preenche em g/ml
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = editingRecipe ? 'Salvar alterações' : 'Salvar receita';
    }
  }

  const failed = pending.filter(item => HOME_UNITS.some(u => u.key === item.row.querySelector('.rc-ing-unit').value));
  if (failed.length > 0) {
    failed.forEach(item => item.row.classList.add('rc-missing'));
    showFormMessage([`Não consegui calcular o peso de: ${failed.map(f => f.name).join(', ')}. Escreva em g ou ml, ou tente salvar de novo.`]);
    return false;
  }
  return true;
}

function applyConversion(row, converted, written) {
  row.querySelector('.rc-ing-qty').value = formatQty(converted.qty);
  row.querySelector('.rc-ing-unit').value = converted.unit;
  row.querySelector('.rc-ing-conv').hidden = true;
  let original = row.querySelector('.rc-ing-original');
  if (!original) {
    original = document.createElement('div');
    original.className = 'rc-ing-original';
    row.appendChild(original);
  }
  original.textContent = `Você escreveu: ${written}`;
}

function updateChipStates() {
  document.querySelectorAll('[data-rc="freq"]').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.value) === selectedFrequency);
  });
  document.querySelectorAll('[data-rc="macro"]').forEach(btn => {
    btn.classList.toggle('active', selectedMacros.has(btn.dataset.value));
  });
}

function recipeToDraft(recipe) {
  return {
    name: recipe.name || '',
    servings: recipe.servings || 4,
    frequency: recipe.frequency || 3,
    macros: getRecipeMacroSelection(recipe),
    ingredients: (recipe.ingredients || []).map(ing => ({
      name: formatIngredientName(ing),
      qty: ing.qty,
      unit: ing.unit
    }))
  };
}

function showFormMessage(problems) {
  const el = qs('#rc_formMsg');
  if (!el) return;
  el.innerHTML = problems.length
    ? `<div class="rc-check rc-check-error"><strong>Falta pouco:</strong><ul>${problems.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul></div>`
    : '';
  if (problems.length) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

let saving = false;

async function saveRecipeFromForm() {
  if (saving) return;
  saving = true;
  try {
    if (await convertHomeMeasureRows()) saveConvertedForm();
  } finally {
    saving = false;
  }
}

function saveConvertedForm() {
  const problems = [];
  const nameInput = qs('#rc_name');
  const name = nameInput.value.trim().toLowerCase().replace(/^\w/, c => c.toUpperCase());
  const servings = parseInt(qs('#rc_servings').value, 10);

  if (!name) {
    problems.push('Escreva o nome da receita.');
    nameInput.classList.add('rc-input-missing');
  }
  if (!servings || servings < 1) {
    problems.push('Diga quantas porções a receita rende.');
  }

  const ingredients = [];
  const missingQty = [];
  const missingName = [];

  document.querySelectorAll('#rc_ings .rc-ing-row').forEach(row => {
    const rawName = row.querySelector('.rc-ing-name').value.trim();
    const rawQty = row.querySelector('.rc-ing-qty').value.trim();
    const unit = row.querySelector('.rc-ing-unit').value;

    // Linha vazia: só ignora
    if (!rawName && !rawQty) return;

    const quantity = parseQty(rawQty);
    if (!rawName) {
      missingName.push(rawQty);
      row.classList.add('rc-missing');
      return;
    }
    if (quantity <= 0) {
      missingQty.push(rawName);
      row.classList.add('rc-missing');
      return;
    }

    // Mesmo formato de antes: kg vira g, l vira ml; nome sem acento e alternativas separadas
    const normalized = normalizeUnit(quantity, unit) || { qty: quantity, unit: 'un' };
    const { primary, alternatives } = splitIngredientAlternatives(rawName);
    const ingredient = { name: primary, qty: normalized.qty, unit: normalized.unit };
    if (alternatives.length > 0) ingredient.alternatives = alternatives;
    ingredients.push(ingredient);
  });

  if (missingQty.length > 0) {
    problems.push(`Falta a quantidade de: ${missingQty.join(', ')}. Preencha ou toque no ✕ para tirar da receita.`);
  }
  if (missingName.length > 0) {
    problems.push('Tem quantidade sem nome de ingrediente. Escreva o nome ou toque no ✕.');
  }
  if (ingredients.length === 0 && missingQty.length === 0 && missingName.length === 0) {
    problems.push('Adicione pelo menos um ingrediente.');
  }

  if (problems.length > 0) {
    showFormMessage(problems);
    return;
  }

  const isEditing = !!editingRecipe;
  if (!isEditing) {
    const duplicate = window.recipes.some(r => normalizeIngredientText(r.name) === normalizeIngredientText(name));
    if (duplicate && !confirm(`Já existe uma receita chamada "${name}". Salvar mesmo assim?`)) return;
  }

  const recipe = {
    ...(editingRecipe || {}),
    name,
    frequency: selectedFrequency,
    servings,
    category: getCategoryFromMacros(),
    ingredients,
    macros: getMacroValues()
  };

  const idx = isEditing ? findRecipeIndex(editingRecipe) : -1;
  if (idx >= 0) {
    window.recipes[idx] = recipe;
  } else {
    window.recipes.push(recipe);
  }
  editingRecipe = null;

  const createdIngredients = ensureInventoryItemsForRecipe(ingredients);
  window.saveAll();

  if (createdIngredients.length > 0) {
    setAlert('Ingredientes novos foram adicionados à despensa com quantidade zero, para entrarem na lista de compras.', 'info', 8000);
  }
  showRecipes({ text: `Receita ${isEditing ? 'atualizada' : 'salva'}: ${name}`, level: 'success' });
}

// ---------------------------------------------------------------------------
// Ler receita por foto ou texto (servidor + IA)
// ---------------------------------------------------------------------------

// Reduz a foto para enviar rápido (e caber no limite do servidor)
function imageFileToJpeg(file, maxSide = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não consegui abrir essa imagem. Tente tirar a foto de novo.'));
    };
    img.src = url;
  });
}

async function requestRecipe(body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RECIPE_TIMEOUT_MS);

  try {
    let response;
    try {
      response = await fetch(RECIPE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, knownIngredients: getKnownIngredients() }),
        signal: controller.signal
      });
    } catch (error) {
      throw new Error(error?.name === 'AbortError'
        ? 'O servidor demorou demais para responder. Tente de novo.'
        : 'Sem conexão com o servidor. Verifique sua internet e tente de novo.');
    }

    if (response.status === 413) {
      throw new Error('As fotos ficaram grandes demais. Tente com menos fotos.');
    }

    // Enquanto o Render acorda ele pode devolver uma página HTML em vez de JSON
    let data = null;
    try {
      data = await response.json();
    } catch {
      throw new Error('O servidor ainda está iniciando. Aguarde alguns segundos e tente de novo.');
    }

    if (!response.ok || !data?.sucesso || !data.receita) {
      throw new Error(data?.erro || `Erro ao ler a receita (${response.status}).`);
    }

    return data.receita;
  } finally {
    clearTimeout(timeout);
  }
}

// Transforma a resposta do servidor no rascunho do formulário e lista o que faltou
function importedToDraft(receita, fromPhoto) {
  const issues = [];
  const source = fromPhoto ? 'A foto' : 'O texto';

  const ingredients = (receita.ingredientes || []).map(item => {
    const name = [item.nome, ...(item.alternativas || [])].filter(Boolean).join(' || ');
    const hasQty = Number(item.qtd) > 0 && UNITS.includes(item.unidade);
    return {
      name,
      qty: hasQty ? roundMeasure(item.qtd) : '',
      unit: hasQty ? item.unidade : 'g',
      original: item.original || '',
      missing: !hasQty
    };
  });

  if (!receita.nome) {
    issues.push(`${source} não mostra o nome da receita. Escreva um nome.`);
  }
  if (!receita.porcoes) {
    issues.push(`${source} não diz quantas porções rende. Colocamos 4: ajuste se precisar.`);
  }

  const missingQty = ingredients.filter(ing => ing.missing).map(ing => ing.name);
  if (missingQty.length > 0) {
    issues.push(`Sem quantidade escrita (ex: "a gosto"): ${missingQty.join(', ')}. Preencha ou toque no ✕ para tirar.`);
  }

  const homeMeasure = /x[ií]cara|colher|copo|lata|caixinha|pitada|punhado|ma[cç]o/i;
  if (ingredients.some(ing => !ing.missing && homeMeasure.test(ing.original))) {
    issues.push('Medidas como xícara e colher foram convertidas para g/ml (valor aproximado). Pode corrigir o número se quiser.');
  }

  if (receita.observacao) {
    issues.push(receita.observacao);
  }

  return {
    draft: {
      name: receita.nome || '',
      nameMissing: !receita.nome,
      servings: receita.porcoes || 4,
      servingsMissing: !receita.porcoes,
      frequency: 3,
      macros: new Set(receita.macros || []),
      ingredients
    },
    issues
  };
}

async function handlePhotoSelected(e) {
  const files = Array.from(e.target.files || []).slice(0, MAX_PHOTOS);
  e.target.value = '';
  if (files.length === 0) return;

  const tooMany = (e.target.files?.length || 0) > MAX_PHOTOS;
  setAddButtonsDisabled(true);
  showStatus(`Lendo a receita${files.length > 1 ? ` (${files.length} fotos)` : ''}... pode levar até 1 minuto.`, 'info', { loading: true });

  try {
    const imagens = [];
    for (const file of files) {
      imagens.push({ mimeType: 'image/jpeg', data: await imageFileToJpeg(file) });
    }

    const receita = await requestRecipe({ imagens });
    const { draft, issues } = importedToDraft(receita, true);
    if (tooMany) issues.unshift(`Só usamos as ${MAX_PHOTOS} primeiras fotos.`);
    openRecipeForm(draft, { issues, imported: true });
  } catch (error) {
    showStatus(error?.message || 'Não foi possível ler a receita.', 'error');
    setAddButtonsDisabled(false);
  }
}

function setAddButtonsDisabled(disabled) {
  document.querySelectorAll('[data-rc="photo"], [data-rc="new"], [data-rc="text"]').forEach(btn => {
    btn.disabled = disabled;
  });
}

function showTextImport() {
  const html = `
    <div class="rc">
      <p class="rc-hint" style="margin-top:0">
        Cole a receita (de um site, do WhatsApp...) ou toque no 🎤 do teclado do celular e fale.
        Diga o nome, quantas porções rende e cada ingrediente com a quantidade.
      </p>
      <textarea id="rc_text" class="rc-textarea" rows="9" placeholder="Ex: Bolo de cenoura, rende 8 porções. 3 cenouras, 3 ovos, 2 xícaras de farinha, 1 xícara de óleo, 2 xícaras de açúcar, 1 colher de fermento."></textarea>
      <div id="rc_status"></div>
      <div class="rc-form-actions">
        <button type="button" class="btn-ghost" data-rc="back">Voltar</button>
        <button type="button" data-rc="read-text">Ler receita</button>
      </div>
    </div>
  `;
  openModal('Colar ou falar receita', html);
  qs('#rc_text')?.focus();
}

async function readTextRecipe(button) {
  const texto = qs('#rc_text')?.value.trim();
  if (!texto) {
    showStatus('Escreva ou fale a receita primeiro.', 'error');
    return;
  }

  button.disabled = true;
  showStatus('Lendo a receita... pode levar até 1 minuto.', 'info', { loading: true });

  try {
    const receita = await requestRecipe({ texto });
    const { draft, issues } = importedToDraft(receita, false);
    openRecipeForm(draft, { issues, imported: true });
  } catch (error) {
    showStatus(error?.message || 'Não foi possível ler a receita.', 'error');
    button.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Cliques (um único listener para todas as telas de receita)
// ---------------------------------------------------------------------------

document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-rc]');
  if (!target) return;

  const action = target.dataset.rc;
  const recipe = target.dataset.ref !== undefined ? renderedRecipes[Number(target.dataset.ref)] : null;

  switch (action) {
    case 'photo':
      qs('#rc_photoInput')?.click();
      break;
    case 'new':
      openRecipeForm({ frequency: 3, servings: 4 });
      break;
    case 'text':
      showTextImport();
      break;
    case 'read-text':
      readTextRecipe(target);
      break;
    case 'back':
      showRecipes();
      break;
    case 'toggle': {
      const body = target.parentElement.querySelector('.rc-card-body');
      if (body) {
        body.hidden = !body.hidden;
        target.classList.toggle('open', !body.hidden);
      }
      break;
    }
    case 'edit':
      if (recipe) openRecipeForm(recipeToDraft(recipe), { recipe });
      break;
    case 'delete':
      deleteRecipe(recipe);
      break;
    case 'freq':
      selectedFrequency = Number(target.dataset.value) || 3;
      updateChipStates();
      break;
    case 'macro':
      if (selectedMacros.has(target.dataset.value)) {
        selectedMacros.delete(target.dataset.value);
      } else {
        selectedMacros.add(target.dataset.value);
      }
      updateChipStates();
      break;
    case 'serv-minus':
    case 'serv-plus': {
      const input = qs('#rc_servings');
      const current = parseInt(input.value, 10) || 4;
      input.value = Math.max(1, current + (action === 'serv-plus' ? 1 : -1));
      input.parentElement.classList.remove('rc-input-missing');
      break;
    }
    case 'add-ing': {
      const list = qs('#rc_ings');
      list.insertAdjacentHTML('beforeend', ingredientRowHtml());
      list.lastElementChild.querySelector('.rc-ing-name').focus();
      break;
    }
    case 'remove-ing':
      target.closest('.rc-ing-row')?.remove();
      break;
    case 'cancel': {
      const imported = qs('.rc-form')?.dataset.imported;
      if (imported && !confirm('Sair sem salvar a receita lida?')) break;
      editingRecipe = null;
      showRecipes();
      break;
    }
    case 'save':
      saveRecipeFromForm();
      break;
  }
});

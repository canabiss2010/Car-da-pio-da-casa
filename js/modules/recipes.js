// js/modules/recipes.js
import { qs, getIngredientName } from './utils.js';
import { openModal, closeModal, setAlert, clearAlerts } from './ui.js';
import { normalizeUnit, isValidUnit, getValidUnits } from './unitNormalizer.js';

const frequencyLevels = [
  { level: 1, percentage: 10, label: 'Muito Raro' },
  { level: 2, percentage: 25, label: 'Raro' },
  { level: 3, percentage: 50, label: 'Moderado' },
  { level: 4, percentage: 75, label: 'Frequente' },
  { level: 5, percentage: 90, label: 'Muito Frequente' }
];

let currentEditIndex = -1;
export function showRecipes() {
  const html = `
    <div style="margin-bottom: 16px">
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <input id="m_recName" placeholder="Nome da receita" style="flex:1" />
      </div>
      <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <select id="m_recFrequency" style="flex:1;min-width:120px">
          <option value="" selected disabled>Frequência</option>
          <option value="1">Muito Raro</option>
          <option value="2">Raro</option>
          <option value="3">Moderado</option>
          <option value="4">Frequente</option>
          <option value="5">Muito Frequente</option>
        </select>
        <select id="m_recCategory" style="min-width:140px">
          <option value="" disabled>Categorias</option>
          <option value="proteina">Proteínas</option>
          <option value="carboidrato">Carboidratos</option>
          <option value="vegetais">Vegetais</option>
          <option value="outros">Outros</option>
        </select>
        <div style="display:flex;align-items:center;gap:4px;margin:0 8px">
          <span>Porções:</span>
          <input id="m_recServings" type="number" min="1" value="4" style="width:50px;text-align:center" />
        </div>  
      </div>
      <label>Ingredientes (um por linha: nome,quantidade,unidade)</label>
      <div class="autocomplete-wrapper" style="position:relative;width:100%;">
        <textarea id="m_recIngredients" rows="6" placeholder="arroz,2,xic\nfeijao,1,kg" style="width:100%;"></textarea>
        <!-- box de sugestões de ingrediente, posicionada dentro da caixa -->
        <ul id="ingredientSuggestions" class="suggestions"></ul>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="m_addRec" class="btn">Salvar Receita</button>
        <button id="m_clearRec" class="btn-ghost">Limpar</button>
      </div>
    </div>
    <div id="m_recList" class="list"></div>
  `;
  openModal('Receitas', html);
  renderRecipeList();
  // ativa autocomplete de ingredientes
  setupIngredientAutocomplete();
}

function renderRecipeList() {
  const el = qs('#m_recList');
  if (!el) return;

  el.innerHTML = '';

  if (window.recipes.length === 0) {
    el.innerHTML = '<div class="small">Nenhuma receita cadastrada</div>';
    return;
  }

  // Agrupa receitas por categoria
  const recipesByCategory = window.recipes.reduce((acc, recipe) => {
    const category = recipe.category || 'outros';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(recipe);
    return acc;
  }, {});

  // Ordem desejada das categorias
  const categoryOrder = ['proteina', 'carboidrato', 'vegetais', 'outros'];

  // Renderiza cada categoria
  categoryOrder.forEach(category => {
    if (!recipesByCategory[category]) return;

    const categoryName = {
      'proteina': 'Proteínas',
      'carboidrato': 'Carboidratos',
      'verdura': 'Verduras e Legumes',
      'outros': 'Outros'
    }[category] || 'Outros';

    const categoryEl = document.createElement('div');
    categoryEl.className = 'category-section';
    categoryEl.innerHTML = `
      <div class="category-header">
        <h3>${categoryName}</h3>
      </div>
      <div class="recipes-container" id="category-${category}"></div>
    `;
    el.appendChild(categoryEl);

    // Ordena as receitas da categoria em ordem alfabética
    const sortedRecipes = [...recipesByCategory[category]].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
    );

    // Renderiza as receitas desta categoria
    const container = qs(`#category-${category}`);
    sortedRecipes.forEach((recipe, idx) => {
      const node = document.createElement('div');
      node.className = 'item';
      const freqInfo = frequencyLevels.find(f => f.level === (recipe.frequency || 3)) || frequencyLevels[2];

      node.innerHTML = `
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong>${recipe.name}</strong>
          </div>
          <div class="small" style="margin-top:4px">
            ${recipe.servings || 4} porções • ${freqInfo.label}
          </div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button data-idx="${getRecipeIndex(recipe)}" data-action="view" class="btn-ghost" style="flex:1">
              Ver detalhes
            </button>
            <button data-idx="${getRecipeIndex(recipe)}" data-action="edit" class="btn-ghost" style="flex:1">
              Editar
            </button>
            <button data-idx="${getRecipeIndex(recipe)}" data-action="delete" class="btn-ghost" style="flex:1">
              Excluir
            </button>
          </div>
        </div>
      `;
      container.appendChild(node);
    });
  });

  // Adiciona os eventos dos botões
  el.querySelectorAll('button[data-idx]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = Number(btn.dataset.idx);
      const action = btn.dataset.action;
      const recipe = window.recipes[idx];

      if (!recipe) return;

      if (action === 'delete') {
        if (confirm(`Tem certeza que deseja excluir a receita "${recipe.name}"?`)) {
          window.recipes.splice(idx, 1);
          window.saveAll();
          renderRecipeList();
          setAlert(`Receita excluída: ${recipe.name}`, 'success');
        }
      } else if (action === 'edit') {
        loadRecipeForEdit(idx);
      } else if (action === 'view') {
        showRecipeDetails(recipe);
      }
    });
  });
}


function showRecipeDetails(recipe) {
  if (!recipe) return;

  const freqInfo = frequencyLevels.find(f => f.level === (recipe.frequency || 3)) || frequencyLevels[2];

  const ingredientsHtml = recipe.ingredients && recipe.ingredients.length > 0
    ? recipe.ingredients.map(ing => `<li>${ing.name}: ${ing.qty}${ing.unit}</li>`).join('')
    : '<li>Nenhum ingrediente cadastrado</li>';

  const html = `
    <div style="padding: 16px;">
      <h3 style="margin-bottom: 16px; color: var(--accent);">${recipe.name}</h3>

      <div style="display: grid; gap: 12px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #f5f5f5; border-radius: 6px;">
          <span><strong>Porções:</strong></span>
          <span>${recipe.servings || 4} pessoas</span>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #f5f5f5; border-radius: 6px;">
          <span><strong>Frequência:</strong></span>
          <span>${freqInfo.label}</span>
        </div>
      </div>

      <div>
        <strong style="margin-bottom: 8px; display: block;">Ingredientes:</strong>
        <ul style="margin: 0; padding-left: 20px; background: #f9f9f9; padding: 12px; border-radius: 6px; border-left: 3px solid var(--accent);">
          ${ingredientsHtml}
        </ul>
      </div>
    </div>
  `;

  openModal(`Detalhes: ${recipe.name}`, html);
}

function clearRecipeForm() {
  qs('#m_recName').value = '';
  qs('#m_recFrequency').value = '';
  qs('#m_recCategory').value = '';
  qs('#m_recServings').value = '4';
  qs('#m_recIngredients').value = '';
  currentEditIndex = -1;
  qs('#m_addRec').textContent = 'Salvar Receita';
}


// Função auxiliar para encontrar o índice de uma receita
function getRecipeIndex(recipe) {
  return window.recipes.findIndex(r =>
    r.name === recipe.name &&
    JSON.stringify(r.ingredients) === JSON.stringify(recipe.ingredients)
  );
}

function loadRecipeForEdit(idx) {
  const recipe = window.recipes[idx];
  if (!recipe) return;

  const nameInput = qs('#m_recName');
  const servingsInput = qs('#m_recServings');
  const categorySelect = qs('#m_recCategory');
  const frequencySelect = qs('#m_recFrequency');
  const ingredientsTextarea = qs('#m_recIngredients');

  if (nameInput) nameInput.value = recipe.name || '';
  if (servingsInput) servingsInput.value = recipe.servings || 4;
  if (categorySelect) categorySelect.value = recipe.category || 'verdura';
  if (frequencySelect) frequencySelect.value = recipe.frequency || 3;

  // Preenche os ingredientes
  if (ingredientsTextarea) {
    ingredientsTextarea.value = recipe.ingredients
      .map(ing => {
        const name = ing.name || '';
        const qty = typeof ing.qty !== 'undefined' ? ing.qty : '';
        const unit = ing.unit || '';
        return `${name},${qty},${unit}`;
      })
      .filter(line => line !== ',,')
      .join('\n');
  }

  // Remove a receita antiga
  window.recipes.splice(idx, 1);
  window.saveAll();
  renderRecipeList();
  setAlert(`Editando: ${recipe.name}. Faça as alterações e clique em Salvar.`, 'info');
  currentEditIndex = idx;
}

// --- autocomplete helpers --------------------------------------------------

// normaliza texto removendo acentos e caracteres especiais para comparação
function normalizeText(text) {
  // remove diacritics like á â ã etc so comparisons are accent-insensitive
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// retorna o prefixo do ingrediente sendo editado no textarea (antes da vírgula)
function getCurrentIngredientPrefix(textarea) {
  const pos = textarea.selectionStart;
  const before = textarea.value.substring(0, pos);
  const lines = before.split('\n');
  const current = lines[lines.length - 1];
  return current.split(',')[0].trim();
}

// calcula coordenadas do caret dentro do textarea (fantasma div)
function getCaretCoordinates(el, position) {
  const div = document.createElement('div');
  const style = window.getComputedStyle(el);
  Array.from(style).forEach(name => {
    div.style[name] = style[name];
  });
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordWrap = 'break-word';
  div.style.overflow = 'auto';
  div.style.width = el.offsetWidth + 'px';
  div.textContent = el.value.substring(0, position);
  const span = document.createElement('span');
  span.textContent = el.value.substring(position) || '.';
  div.appendChild(span);
  document.body.appendChild(div);
  const coords = { top: span.offsetTop, left: span.offsetLeft };
  document.body.removeChild(div);
  return coords;
}

// aplica sugestão ao textarea substituindo o prefixo atual
function applySuggestion(textarea, suggestion) {
  const pos = textarea.selectionStart;
  const before = textarea.value.substring(0, pos);
  const after = textarea.value.substring(pos);

  const lines = before.split('\n');
  let current = lines[lines.length - 1];
  const commaIdx = current.indexOf(',');
  if (commaIdx >= 0) {
    // there is already a comma, keep the remainder (quantity/unit)
    current = suggestion + current.substring(commaIdx);
  } else {
    // no comma yet: replace prefix and add a comma to help user continue
    current = suggestion + ',';
  }
  lines[lines.length - 1] = current;
  const newBefore = lines.join('\n');
  textarea.value = newBefore + after;
  const newPos = newBefore.length;
  textarea.setSelectionRange(newPos, newPos);
  textarea.focus();
  qs('#ingredientSuggestions').classList.remove('active');
}

// configura o comportamento de autocomplete no textarea de ingredientes
function setupIngredientAutocomplete() {
  const textarea = qs('#m_recIngredients');
  const box = qs('#ingredientSuggestions');
  if (!textarea || !box) return;

  let currentMatches = [];
  let selectedIndex = -1;

  function updateHighlight() {
    const items = box.querySelectorAll('.suggestion-item');
    items.forEach((item, i) => {
      if (i === selectedIndex) {
        item.classList.add('highlighted');
      } else {
        item.classList.remove('highlighted');
      }
    });
  }

  textarea.addEventListener('input', () => {
    const pos = textarea.selectionStart;
    const before = textarea.value.substring(0, pos);
    // se o caractere imediatamente anterior for vírgula, estamos na quantidade/uni e não devemos sugerir
    if (before.endsWith(',')) {
      box.classList.remove('active');
      currentMatches = [];
      selectedIndex = -1;
      return;
    }

    const prefix = getCurrentIngredientPrefix(textarea);
    if (!prefix) {
      box.classList.remove('active');
      currentMatches = [];
      selectedIndex = -1;
      return;
    }

    const normalizedPrefix = normalizeText(prefix);
    const uniqueNames = Array.from(new Set((window.inventory || []).map(i => i.name)));
    currentMatches = uniqueNames.filter(name =>
      normalizeText(name).startsWith(normalizedPrefix)
    );

    if (currentMatches.length === 0) {
      box.classList.remove('active');
      selectedIndex = -1;
      return;
    }

    box.innerHTML = currentMatches
      .map(m => `<li class="suggestion-item" style="padding:2px 0;cursor:pointer">${m}</li>`)
      .join('');
    box.classList.add('active');
    selectedIndex = -1;

    // position box near caret, just below the current line
    const coords = getCaretCoordinates(textarea, textarea.selectionStart);
    // account for vertical scrolling inside textarea
    const scrollTop = textarea.scrollTop;
    box.style.left = coords.left + 'px';
    // place well below the current line so it doesn't cover the text being typed
    box.style.top = (coords.top - scrollTop + 20) + 'px';

    box.querySelectorAll('.suggestion-item').forEach((el, idx) => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        applySuggestion(textarea, currentMatches[idx]);
      });
    });
  });
  textarea.addEventListener('keydown', (e) => {
    if (!box.classList.contains('active') || currentMatches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % currentMatches.length;
      updateHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + currentMatches.length) % currentMatches.length;
      updateHighlight();
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      applySuggestion(textarea, currentMatches[selectedIndex]);
    }
  });

  textarea.addEventListener('blur', () => {
    setTimeout(() => { box.classList.remove('active'); }, 150);
  });
}

document.addEventListener('click', (e) => {

  // Salvar receita
  if (e.target.id === 'm_addRec') {
    const name = qs('#m_recName').value.trim().toLowerCase().replace(/^\w/, c => c.toUpperCase());
    const frequencyValue = qs('#m_recFrequency').value;
    const categoryValue = qs('#m_recCategory').value;
    const servings = Math.max(1, parseInt(qs('#m_recServings').value) || 4);

    const ingredientsText = qs('#m_recIngredients').value.trim();
    const ingredientLines = ingredientsText
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    // Valida ANTES de fazer filter: se tem linhas, todas precisam de quantidade
    let ingredientValidationError = '';
    let invalidUnits = [];
    ingredientLines.forEach(line => {
      const parts = line.split(',').map(s => s.trim());
      const ingredientName = parts[0];

      // Se tem nome mas sem vírgula = esqueceu completamente da quantidade
      if (ingredientName && !line.includes(',')) {
        ingredientValidationError = `Ingrediente '${ingredientName}' da receita '${name}' incompleto`;
      }
      // Se tem vírgula mas não tem pelo menos 2 partes = formato inválido
      if (ingredientName && line.includes(',') && parts.length < 2) {
        ingredientValidationError = `Ingrediente '${ingredientName}' da receita '${name}' incompleto`;
      }
    });

    const ingredients = ingredientLines
      .map(line => {
        const parts = line.split(',').map(s => s.trim());
        let name, qty, unit;

        if (parts.length >= 2) {
          name = parts[0];

          // Se temos 3+ partes, assume nome,qtd,unidade
          if (parts.length >= 3) {
            qty = parts[1];
            unit = parts.slice(2).join(' ').trim();

            // Se a quantidade parece incompleta (ex: "0" quando deveria ser "0,2")
            // e a unidade começa com dígito, tenta recombinação
            const testQty = parseFloat(qty.replace(',', '.')) || 0;
            if (testQty === 0 && unit && /^[\d,.]/.test(unit)) {
              // Qty é 0 e unit começa com dígito/vírgula: provavelmente separação incorreta
              const firstUnitPart = unit.split(' ')[0];
              if (/^[\d,.]+/.test(firstUnitPart)) {
                qty = qty + ',' + firstUnitPart; // "0" + "," + "2" = "0,2"
                unit = unit.split(' ').slice(1).join(' ').trim() || 'un';
              }
            }
          } else {
            // 2 partes: nome,qtd+unidade ou nome,qtd
            const qtyUnit = parts[1];

            // Tenta detectar se é só quantidade (números) ou quantidade+unidade
            if (/^\d+([,.]\d+)?$/.test(qtyUnit)) {
              // Só números: assume que é quantidade sem unidade
              qty = qtyUnit;
              unit = 'un';
            } else {
              // Contém letras/não-números: tenta separar quantidade e unidade
              const qtyMatch = qtyUnit.match(/^([\d,.]+)(.*)$/);
              if (qtyMatch) {
                qty = qtyMatch[1];
                unit = qtyMatch[2].trim() || 'un';
              } else {
                // Não conseguiu separar, assume tudo como quantidade
                qty = qtyUnit;
                unit = 'un';
              }
            }
          }
        } else {
          // Menos de 2 partes: inválido
          name = parts[0] || '';
          qty = '0';
          unit = 'un';
        }

        const quantity = parseFloat(qty.replace(',', '.')) || 0;

        // Verifica se a unidade é válida antes de normalizar
        if (!isValidUnit(unit)) {
          invalidUnits.push(unit);
          return null; // Ingrediente inválido
        }

        // Normaliza a unidade antes de salvar
        const normalized = normalizeUnit(quantity, unit || 'un');

        return {
          name: name.toLowerCase(),
          qty: normalized.qty,
          unit: normalized.unit
        };
      })
      .filter(ing => ing !== null && ing.name && !isNaN(ing.qty) && ing.qty > 0);

    // Verifica unidades inválidas
    if (invalidUnits.length > 0) {
      const validUnits = getValidUnits();
      const uniqueInvalid = [...new Set(invalidUnits)];
      return setAlert(`Unidades não suportadas: ${uniqueInvalid.join(', ')}. Use apenas: ${validUnits.join(', ')}`, 'error', 0);
    }

    if (!name) return setAlert('Digite um nome para a receita', 'error', 0);
    if (!frequencyValue) return setAlert('Selecione a frequência da receita', 'error', 0);
    if (!categoryValue || categoryValue === '') return setAlert('Selecione o tipo de refeição', 'error', 0);
    if (ingredientValidationError) return setAlert(ingredientValidationError, 'error', 0);
    if (ingredients.length === 0) return setAlert('Adicione pelo menos um ingrediente', 'error', 0);

    const frequency = parseInt(frequencyValue);
    const category = categoryValue;
    const recipe = {
      name,
      frequency,
      servings,
      category,
      ingredients
    };

    if (currentEditIndex >= 0) {
      // Se está editando, substitui a receita existente
      window.recipes.splice(currentEditIndex, 0, recipe);
      currentEditIndex = -1;
    } else {
      // Se é uma nova receita, adiciona normalmente
      window.recipes.push(recipe);
    }

    window.saveAll();
    clearAlerts();

    // Limpa o formulário
    qs('#m_recName').value = '';
    qs('#m_recServings').value = '4';
    qs('#m_recFrequency').value = '';
    qs('#m_recCategory').value = '';
    qs('#m_recIngredients').value = '';
    currentEditIndex = -1;

    renderRecipeList();
    setAlert(`Receita ${currentEditIndex >= 0 ? 'atualizada' : 'salva'}: ${name}`, 'success');
  }

  // Limpar formulário
  if (e.target.id === 'm_clearRec') {
    if (confirm('Limpar o formulário de receita?')) {
      qs('#m_recName').value = '';
      qs('#m_recServings').value = '4';
      qs('#m_recFrequency').value = '';
      qs('#m_recCategory').value = '';
      qs('#m_recIngredients').value = '';
      currentEditIndex = -1;
    }
  }
});
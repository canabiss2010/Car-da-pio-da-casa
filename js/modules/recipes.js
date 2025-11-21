// js/modules/recipes.js
import { qs, getIngredientName } from './utils.js';
import { openModal, closeModal, setAlert } from './ui.js';
let currentEditIndex = -1;
export function showRecipes() {
  const html = `
    <div style="margin-bottom: 16px">
      <div style="display:grid;gap:12px">
        <div>
          <label for="m_recName">Nome da Receita</label>
          <input 
            id="m_recName" 
            type="text"
            placeholder="Ex: Arroz com Frango"
            aria-required="true"
            aria-label="Nome da receita"
          />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <label for="m_recServes">Rendimento</label>
            <input 
              id="m_recServes" 
              type="number" 
              min="1" 
              value="4" 
              aria-required="true"
              aria-label="Número de porções"
            />
          </div>
          <div>
            <label for="m_recPriority">Prioridade (1-10)</label>
            <input 
              id="m_recPriority" 
              type="number" 
              min="1" 
              max="10" 
              value="5" 
              aria-required="true"
              aria-label="Prioridade da receita de 1 a 10"
            />
          </div>
        </div>
        <div>
          <label for="m_recDays">Duração (dias)</label>
          <input 
            id="m_recDays" 
            type="number" 
            min="1" 
            value="2" 
            aria-required="true"
            aria-label="Duração em dias"
          />
        </div>
        <div>
          <label for="m_recIngredients">Ingredientes</label>
          <div class="small" style="margin-bottom:4px">
            Um por linha, no formato: nome,quantidade,unidade
          </div>
          <textarea 
            id="m_recIngredients" 
            rows="6" 
            placeholder="Ex: arroz,2,xicara&#10;frango,500,gramas"
            aria-required="true"
            aria-label="Lista de ingredientes"
            style="width:100%"
          ></textarea>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button id="m_addRec" class="btn" aria-label="Salvar receita">
            <span id="saveBtnText">Salvar Receita</span>
          </button>
          <button id="m_clearRec" class="btn-ghost" aria-label="Limpar formulário">
            Limpar
          </button>
        </div>
      </div>
    </div>
    <div id="m_recList" class="list" aria-live="polite"></div>
  `;

  openModal('Receitas', html);
  renderRecipeList();
  setupEventListeners();
}

function setupEventListeners() {
  // Salvar receita
  document.getElementById('m_addRec')?.addEventListener('click', saveRecipe);
  
  // Limpar formulário
  document.getElementById('m_clearRec')?.addEventListener('click', clearForm);
}

function validateRecipe(recipe) {
  if (!recipe.name || recipe.name.length < 3) {
    return { valid: false, message: MESSAGES.INVALID_NAME };
  }
  if (!recipe.ingredients || recipe.ingredients.length === 0) {
    return { valid: false, message: MESSAGES.INVALID_INGREDIENTS };
  }
  return { valid: true };
}

function parseIngredients(ingredientsText) {
  return ingredientsText
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [name, qty, unit] = line.split(',').map(s => s.trim());
      if (!name || isNaN(parseFloat(qty)) || !unit) {
        UI.setAlert(
          `Linha ${index + 1}: ${MESSAGES.INVALID_INGREDIENT_FORMAT}`,
          'warn'
        );
        return null;
      }
      return { 
        name: name.toLowerCase(), 
        qty: parseFloat(qty.replace(',', '.')), 
        unit 
      };
    })
    .filter(Boolean);
}

async function saveRecipe() {
  const saveBtn = qs('#m_addRec');
  const saveBtnText = qs('#saveBtnText');
  const originalText = saveBtnText?.textContent || 'Salvar Receita';
  
  try {
    // Desabilita o botão durante o salvamento
    saveBtn.disabled = true;
    if (saveBtnText) saveBtnText.textContent = 'Salvando...';

    const name = qs('#m_recName').value.trim();
    const serves = parseInt(qs('#m_recServes').value) || 1;
    const priority = Math.min(10, Math.max(1, parseInt(qs('#m_recPriority').value) || 5));
    const days = Math.max(1, parseInt(qs('#m_recDays').value) || 2);
    
    const ingredients = parseIngredients(qs('#m_recIngredients').value.trim());
    
    const recipe = { name, serves, priority, days, ingredients };
    
    // Validação
    const validation = validateRecipe(recipe);
    if (!validation.valid) {
      return UI.setAlert(validation.message, 'error');
    }

    // Salva a receita
    window.recipes.push(recipe);
    await window.saveAll();
    
    // Limpa o formulário
    clearForm();
    
    // Atualiza a lista
    renderRecipeList();
    UI.setAlert(MESSAGES.RECIPE_SAVED, 'success');
  } catch (error) {
    console.error('Erro ao salvar receita:', error);
    UI.setAlert('Ocorreu um erro ao salvar a receita', 'error');
  } finally {
    // Reabilita o botão
    saveBtn.disabled = false;
    if (saveBtnText) saveBtnText.textContent = originalText;
  }
}

function clearForm() {
  if (!confirm(MESSAGES.CONFIRM_CLEAR)) return;
  
  qs('#m_recName').value = '';
  qs('#m_recServes').value = '4';
  qs('#m_recPriority').value = '5';
  qs('#m_recDays').value = '2';
  qs('#m_recIngredients').value = '';
}

function renderRecipeList() {
  const el = qs('#m_recList');
  if (!el) return;

  // Ordena as receitas por prioridade (maior primeiro) e depois por nome
  const sortedRecipes = [...window.recipes].sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    return a.name.localeCompare(b.name);
  });

  if (sortedRecipes.length === 0) {
    el.innerHTML = '<div class="small">Nenhuma receita cadastrada</div>';
    return;
  }

  el.innerHTML = sortedRecipes.map((recipe, idx) => `
    <div class="item" data-idx="${idx}">
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong style="text-transform:capitalize">${recipe.name}</strong>
          <div class="small">P${recipe.priority} • ${recipe.serves} porções</div>
        </div>
        <div class="small" style="margin-top:4px">
          Dura ${recipe.days} ${recipe.days === 1 ? 'dia' : 'dias'} • 
          ${recipe.ingredients.length} ${recipe.ingredients.length === 1 ? 'ingrediente' : 'ingredientes'}
        </div>
      </div>
      <div style="display:flex;gap:4px">
        <button data-idx="${idx}" data-action="edit" class="btn-ghost" aria-label="Editar receita ${recipe.name}">
          Editar
        </button>
        <button data-idx="${idx}" data-action="delete" class="btn-ghost" aria-label="Excluir receita ${recipe.name}">
          Excluir
        </button>
      </div>
    </div>
  `).join('');

  // Eventos dos botões
  el.querySelectorAll('button[data-idx]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = Number(btn.dataset.idx);
      const action = btn.dataset.action;
      
      if (action === 'delete') {
        if (confirm(`Tem certeza que deseja excluir a receita "${window.recipes[idx].name}"?`)) {
          const name = window.recipes[idx].name;
          window.recipes.splice(idx, 1);
          window.saveAll();
          renderRecipeList();
          setAlert(`Receita excluída: ${name}`);
        }
      } else if (action === 'edit') {
        loadRecipeForEdit(idx);
      }
    });
  });
}

function handleRecipeAction(e) {
  const btn = e.currentTarget;
  const idx = Number(btn.dataset.idx);
  const action = btn.dataset.action;
  
  if (action === 'delete') {
    deleteRecipe(idx);
  } else if (action === 'edit') {
    loadRecipeForEdit(idx);
  }
}

async function deleteRecipe(idx) {
  const recipe = window.recipes[idx];
  if (!confirm(`Tem certeza que deseja excluir a receita "${recipe.name}"?`)) {
    return;
  }

  try {
    window.recipes.splice(idx, 1);
    await window.saveAll();
    renderRecipeList();
    UI.setAlert(`Receita "${recipe.name}" excluída`, 'success');
  } catch (error) {
    console.error('Erro ao excluir receita:', error);
    UI.setAlert('Ocorreu um erro ao excluir a receita', 'error');
  }
}

function loadRecipeForEdit(idx) {
  const recipe = window.recipes[idx];
  qs('#m_recName').value = recipe.name;
  qs('#m_recServes').value = recipe.serves;
  qs('#m_recPriority').value = recipe.priority;
  qs('#m_recDays').value = recipe.days;
  qs('#m_recIngredients').value = recipe.ingredients
    .map(ing => `${ing.name},${ing.qty},${ing.unit}`)
    .join('\n');

  // Remove a receita antiga
  window.recipes.splice(idx, 1);
  window.saveAll();
  renderRecipeList();
  setAlert(`Editando: ${recipe.name}. Faça as alterações e clique em Salvar.`);
  currentEditIndex = idx;
}

// Event listeners
document.addEventListener('click', (e) => {
  // Salvar receita
  if (e.target.id === 'm_addRec') {
    const name = qs('#m_recName').value.trim();
    const serves = parseInt(qs('#m_recServes').value) || 1;
    const priority = Math.min(10, Math.max(1, parseInt(qs('#m_recPriority').value) || 5));
    const days = Math.max(1, parseInt(qs('#m_recDays').value) || 2);
    
    const ingredientsText = qs('#m_recIngredients').value.trim();
    const ingredients = ingredientsText
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [name, qty, unit] = line.split(',').map(s => s.trim());
        return { 
          name: name.toLowerCase(), 
          qty: parseFloat(qty.replace(',', '.')) || 0, 
          unit: unit || 'un' 
        };
      })
      .filter(ing => ing.name && !isNaN(ing.qty) && ing.qty > 0);

    if (!name) return alert('Digite um nome para a receita');
    if (ingredients.length === 0) return alert('Adicione pelo menos um ingrediente');

    const recipe = { name, serves, priority, days, ingredients };

   if (currentEditIndex >= 0) {
    // Se está editando, substitui a receita existente
    window.recipes.splice(currentEditIndex, 0, recipe);
    currentEditIndex = -1; // Reseta o índice de edição
   } else {
    // Se é uma nova receita, adiciona normalmente
    window.recipes.push(recipe);
   }
    
    window.saveAll();
    
    // Limpa o formulário
    qs('#m_recName').value = '';
    qs('#m_recServes').value = '4';
    qs('#m_recPriority').value = '5';
    qs('#m_recDays').value = '2';
    qs('#m_recIngredients').value = '';
    
    renderRecipeList();
    setAlert(`Receita ${currentEditIndex >= 0 ? 'atualizada' : 'salva'}: ${name}`);
  }

  // Limpar formulário
  if (e.target.id === 'm_clearRec') {
    if (confirm('Limpar o formulário de receita?')) {
      qs('#m_recName').value = '';
      qs('#m_recServes').value = '4';
      qs('#m_recPriority').value = '5';
      qs('#m_recDays').value = '2';
      qs('#m_recIngredients').value = '';
    }
  }
});

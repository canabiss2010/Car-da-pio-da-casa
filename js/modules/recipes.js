// js/modules/recipes.js
import { qs, getIngredientName } from './utils.js';
import { openModal, closeModal, setAlert } from './ui.js';

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
          <option value="1">Muito Raro</option>
          <option value="2">Raro</option>
          <option value="3" selected>Moderado</option>
          <option value="4">Frequente</option>
          <option value="5">Muito Frequente</option>
        </select>
        <select id="m_recCategory" style="min-width:140px">
          <option value="proteina">Proteínas</option>
          <option value="carboidrato">Carboidratos</option>
          <option value="vegetais" selected>Vegetais</option>
          <option value="outros">Outros</option>
        </select>
        <div style="display:flex;align-items:center;gap:4px;margin:0 8px">
          <span>Dura</span>
          <input id="m_recDays" type="number" min="1" value="2" style="width:50px;text-align:center" />
          <span> dias</span>
        </div>  
      </div>
      <label>Ingredientes (um por linha: nome,quantidade,unidade)</label>
      <textarea id="m_recIngredients" rows="6" placeholder="arroz,2,xic\nfeijao,1,kg" style="width:100%"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="m_addRec" class="btn">Salvar Receita</button>
        <button id="m_clearRec" class="btn-ghost">Limpar</button>
      </div>
    </div>
    <div id="m_recList" class="list"></div>
  `;
  openModal('Receitas', html);
  renderRecipeList();
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
  const categoryOrder = ['proteina', 'carboidrato', 'verdura', 'outros'];
  
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
      a.name.localeCompare(b.name, 'pt-BR', {sensitivity: 'base'})
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
            Dura ${recipe.days} dias •   ${freqInfo.label}
          </div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button data-idx="${getRecipeIndex(recipe)}" data-action="edit" class="btn-ghost">
              Editar
            </button>
            <button data-idx="${getRecipeIndex(recipe)}" data-action="delete" class="btn-ghost">
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
      }
    });
  });
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
  const servesInput = qs('#m_recServes');
  const daysInput = qs('#m_recDays');
  const categorySelect = qs('#m_recCategory');
  const frequencySelect = qs('#m_recFrequency');
  const ingredientsTextarea = qs('#m_recIngredients');
  
  if (nameInput) nameInput.value = recipe.name || '';
  if (servesInput) servesInput.value = recipe.serves || 1;
  if (daysInput) daysInput.value = recipe.days || 2;
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

document.addEventListener('click', (e) => {

  // Salvar receita
  if (e.target.id === 'm_addRec') {
    const name = qs('#m_recName').value.trim().toLowerCase().replace(/^\w/, c => c.toUpperCase());
    const frequency = parseInt(qs('#m_recFrequency').value) || 3;
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

    if (!name) return setAlert('Digite um nome para a receita', 'error');
    if (ingredients.length === 0) return setAlert('Adicione pelo menos um ingrediente', 'error');

    const category = qs('#m_recCategory').value || 'outros';
    const recipe = { 
      name, 
      frequency,  // Usando frequency ao invés de priority
      days,
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
    
    // Limpa o formulário
    qs('#m_recName').value = '';
    qs('#m_recServes').value = '4';
    qs('#m_recFrequency').value = '3';
    qs('#m_recDays').value = '2';
    qs('#m_recIngredients').value = '';
    
    renderRecipeList();
    setAlert(`Receita ${currentEditIndex >= 0 ? 'atualizada' : 'salva'}: ${name}`, 'success');
  }

  // Limpar formulário
  if (e.target.id === 'm_clearRec') {
    if (confirm('Limpar o formulário de receita?')) {
      qs('#m_recName').value = '';
      qs('#m_recServes').value = '4';
      qs('#m_recFrequency').value = '3';
      qs('#m_recDays').value = '2';
      qs('#m_recIngredients').value = '';
      currentEditIndex = -1;
    }
  }
});
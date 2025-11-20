// js/modules/recipes.js
import { qs } from './utils.js';
import { UI } from './ui.js';

export function showRecipes() {
  const html = `
    <div style="margin-bottom: 16px">
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <input id="m_recName" placeholder="Nome da receita" style="flex:1" />
        <input id="m_recServes" type="number" placeholder="Rende" value="4" style="width:80px" />
      </div>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <input id="m_recPriority" type="number" placeholder="Prioridade (1-10)" min="1" max="10" value="5" style="flex:1" />
        <input id="m_recDays" type="number" placeholder="Duração (dias)" min="1" value="2" style="width:120px" />
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

  UI.openModal('Receitas', html);
  renderRecipeList();
}
function renderRecipeList() {
  const el = qs('#m_recList');
  el.innerHTML = '';

  if (window.recipes.length === 0) {
    el.innerHTML = '<div class="small">Nenhuma receita cadastrada</div>';
    return;
  }

  window.recipes.forEach((recipe, idx) => {
    const node = document.createElement('div');
    node.className = 'item';
    node.innerHTML = `
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong style="text-transform:capitalize">${recipe.name}</strong>
          <div class="small">P${recipe.priority} • ${recipe.serves} porções</div>
        </div>
        <div class="small" style="margin-top:4px">Dura ${recipe.days} dias • ${recipe.ingredients.length} ingredientes</div>
      </div>
      <div style="display:flex;gap:4px">
        <button data-idx="${idx}" data-action="edit" class="btn-ghost">Editar</button>
        <button data-idx="${idx}" data-action="delete" class="btn-ghost">Excluir</button>
      </div>
    `;
    el.appendChild(node);
  });

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
          UI.setAlert(`Receita excluída: ${name}`);
        }
      } else if (action === 'edit') {
        loadRecipeForEdit(idx);
      }
    });
  });
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
  UI.setAlert(`Editando: ${recipe.name}. Faça as alterações e clique em Salvar.`);
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
    window.recipes.push(recipe);
    window.saveAll();
    
    // Limpa o formulário
    qs('#m_recName').value = '';
    qs('#m_recServes').value = '4';
    qs('#m_recPriority').value = '5';
    qs('#m_recDays').value = '2';
    qs('#m_recIngredients').value = '';
    
    renderRecipeList();
    UI.setAlert(`Receita salva: ${name}`);
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
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
        <input id="m_recServes" type="number" placeholder="Rende" value="4" min="1" style="width:80px" />
      </div>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <select id="m_recFrequency" style="flex:1">
          <option value="1">Muito Raro</option>
          <option value="2">Raro</option>
          <option value="3" selected>Moderado</option>
          <option value="4">Frequente</option>
          <option value="5">Muito Frequente</option>
        </select>
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

  window.recipes.forEach((recipe, idx) => {
    const node = document.createElement('div');
    node.className = 'item';
    const freqInfo = frequencyLevels.find(f => f.level === (recipe.frequency || 3)) || frequencyLevels[2];
    node.innerHTML = `
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong style="text-transform:capitalize">${recipe.name}</strong>
          <div class="small">${freqInfo.label} • ${recipe.serves} porções</div>
        </div>
        <div class="small" style="margin-top:4px">
          Dura ${recipe.days} dias • ${recipe.ingredients.length} ingredientes
        </div>
      </div>
      <div style="display:flex;gap:4px">
        <button data-idx="${idx}" data-action="edit" class="btn-ghost">Editar</button>
        <button data-idx="${idx}" data-action="delete" class="btn-ghost">Excluir</button>
      </div>
    `;
    el.appendChild(node);
  });

  // Adiciona os eventos dos botões
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
          setAlert(`Receita excluída: ${name}`, 'success');
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
  qs('#m_recDays').value = recipe.days;
  
  // Define a frequência correta no select
  const frequencySelect = qs('#m_recFrequency');
  if (frequencySelect) {
    frequencySelect.value = recipe.frequency || 3;
  }
  
  // Preenche os ingredientes
  qs('#m_recIngredients').value = recipe.ingredients
    .map(ing => {
      const name = ing.name || '';
      const qty = typeof ing.qty !== 'undefined' ? ing.qty : '';
      const unit = ing.unit || '';
      return `${name},${qty},${unit}`;
    })
    .filter(line => line !== ',,')
    .join('\n');

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
    const name = qs('#m_recName').value.trim();
    const serves = parseInt(qs('#m_recServes').value) || 1;
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

    const recipe = { 
      name, 
      serves, 
      frequency,  // Usando frequency ao invés de priority
      days, 
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
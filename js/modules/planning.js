// js/modules/planning.js
import { qs } from './utils.js';
import { UI } from './ui.js';

export function showCreatePlan() {
  const html = `
    <div class="small" style="margin-bottom:16px">
      Ajuste as configurações e gere um plano automático.
    </div>
    <div style="display:grid;gap:12px">
      <div>
        <label>Número de Pessoas</label>
        <input id="m_people" type="number" min="1" value="4" />
      </div>
      <div>
        <label>Dias do Plano</label>
        <input id="m_days" type="number" min="1" max="14" value="7" />
      </div>
      <div>
        <label>Refeições por Dia</label>
        <select id="m_meals">
          <option value="2">2 (Almoço e Jantar)</option>
          <option value="3">3 (Café, Almoço e Jantar)</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="m_genPlan" class="btn">Gerar Plano</button>
        <button id="m_sim" class="btn-ghost">Simular</button>
      </div>
    </div>
    <div id="m_planPreview" style="margin-top:16px"></div>
  `;

  UI.openModal('Criar Plano', html);
  
  // Adiciona os event listeners após o modal ser renderizado
  setTimeout(() => {
    const genPlanBtn = document.getElementById('m_genPlan');
    const simBtn = document.getElementById('m_sim');
    
    if (genPlanBtn) genPlanBtn.addEventListener('click', generatePlan);
    if (simBtn) simBtn.addEventListener('click', simulatePlan);
  }, 100);
}

function generatePlan() {
  const people = parseInt(qs('#m_people').value) || 4;
  const days = parseInt(qs('#m_days').value) || 7;
  const mealsPerDay = parseInt(qs('#m_meals').value) || 2;
  
  if (!window.recipes || window.recipes.length === 0) {
    return UI.setAlert('Adicione receitas primeiro!', 'error');
  }

  const plan = [];
  let remainingRecipes = [...window.recipes];
  let lastUsedRecipes = new Set();

  for (let day = 0; day < days; day++) {
    const dailyMeals = [];
    
    for (let meal = 0; meal < mealsPerDay; meal++) {
      const availableRecipes = remainingRecipes.filter(
        r => !lastUsedRecipes.has(r.name)
      );
      
      const recipePool = availableRecipes.length > 0 ? availableRecipes : [...remainingRecipes];
      const randomIndex = Math.floor(Math.random() * recipePool.length);
      const selectedRecipe = recipePool[randomIndex];
      
      dailyMeals.push({
        name: selectedRecipe.name,
        recipe: selectedRecipe,
        suggested: false
      });

      lastUsedRecipes.add(selectedRecipe.name);
      if (lastUsedRecipes.size > 3) {
        const first = Array.from(lastUsedRecipes)[0];
        lastUsedRecipes.delete(first);
      }
    }
    
    plan.push(dailyMeals);
  }

  window.plan = plan;
  window.saveAll();
  showPlanPreview(plan, qs('#m_people').value || 4, true);
  UI.setAlert('Plano gerado com sucesso!');
}

function simulatePlan() {
  const people = parseInt(qs('#m_people').value) || 4;
  const days = parseInt(qs('#m_days').value) || 7;
  const mealsPerDay = parseInt(qs('#m_meals').value) || 2;
  
  if (!window.recipes || window.recipes.length === 0) {
    return UI.setAlert('Adicione receitas primeiro!', 'error');
  }

  const plan = [];
  let remainingRecipes = [...window.recipes];
  let lastUsedRecipes = new Set();

  for (let day = 0; day < days; day++) {
    const dailyMeals = [];
    
    for (let meal = 0; meal < mealsPerDay; meal++) {
      const availableRecipes = remainingRecipes.filter(
        r => !lastUsedRecipes.has(r.name)
      );
      
      const recipePool = availableRecipes.length > 0 ? availableRecipes : [...remainingRecipes];
      const randomIndex = Math.floor(Math.random() * recipePool.length);
      const selectedRecipe = recipePool[randomIndex];
      
      dailyMeals.push({
        name: selectedRecipe.name,
        recipe: selectedRecipe,
        suggested: false
      });

      lastUsedRecipes.add(selectedRecipe.name);
      if (lastUsedRecipes.size > 3) {
        const first = Array.from(lastUsedRecipes)[0];
        lastUsedRecipes.delete(first);
      }
    }
    
    plan.push(dailyMeals);
  }

  showPlanPreview(plan, qs('#m_people').value || 4, false);
  UI.setAlert('Simulação concluída. Para aplicar o plano, clique em "Gerar Plano".');
}

function showPlanPreview(plan, people, isRealPlan) {
  const container = qs('#m_planPreview');
  if (!container) return;
  
  container.innerHTML = '<h3>Prévia do Plano</h3>';

  plan.forEach((dayMeals, dayIndex) => {
    const dayElement = document.createElement('div');
    dayElement.style.marginBottom = '16px';
    dayElement.innerHTML = `<strong>Dia ${dayIndex + 1}</strong>`;
    
    const mealsList = document.createElement('div');
    mealsList.style.marginLeft = '16px';
    
    dayMeals.forEach((meal, mealIndex) => {
      const mealElement = document.createElement('div');
      mealElement.style.padding = '4px 0';
      mealElement.innerHTML = `
        <div style="display:flex;justify-content:space-between">
          <span>${meal.name} (${(meal.recipe.serves * people).toFixed(0)} porções)</span>
          ${isRealPlan ? `<button class="btn-ghost" data-day="${dayIndex}" data-meal="${mealIndex}">Trocar</button>` : ''}
        </div>
      `;
      mealsList.appendChild(mealElement);
    });
    
    dayElement.appendChild(mealsList);
    container.appendChild(dayElement);
  });

  if (isRealPlan) {
    const saveButton = document.createElement('div');
    saveButton.style.marginTop = '16px';
    saveButton.innerHTML = '<button id="m_savePlan" class="btn">Salvar Plano</button>';
    container.appendChild(saveButton);

    saveButton.querySelector('#m_savePlan').addEventListener('click', () => {
      window.saveAll();
      UI.closeModal();
      UI.setAlert('Plano salvo com sucesso!');
    });
  }
}

export function showCurrentPlan() {
  if (!window.plan || window.plan.length === 0) {
    return UI.openModal('Plano Atual', '<p>Nenhum plano gerado ainda.</p>');
  }

  const people = 4;
  const html = `
    <div id="m_currentPlan" style="margin-bottom:16px"></div>
    <div style="display:flex;gap:8px">
      <button id="m_exportPlan" class="btn-ghost">Exportar</button>
      <button id="m_clearPlan" class="btn-ghost">Limpar Plano</button>
    </div>
  `;

  UI.openModal('Plano Atual', html);
  showPlanPreview(window.plan, people, true);

  // Adiciona os event listeners após o modal ser renderizado
  setTimeout(() => {
    const exportBtn = document.getElementById('m_exportPlan');
    const clearBtn = document.getElementById('m_clearPlan');
    
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const dataStr = JSON.stringify(window.plan, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        const exportName = `plano-${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportName);
        linkElement.click();
        
        UI.setAlert('Plano exportado com sucesso!');
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja limpar o plano atual?')) {
          window.plan = [];
          window.saveAll();
          UI.closeModal();
          UI.setAlert('Plano limpo com sucesso!');
        }
      });
    }
  }, 100);
}
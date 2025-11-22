// js/modules/planning.js
import { qs } from './utils.js';
import { openModal, closeModal, setAlert } from './ui.js';

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

  openModal('Criar Plano', html);
  
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
    return setAlert('Adicione receitas primeiro!', 'error');
  }

  const plan = [];
  let activeRecipes = []; // { recipe, daysLeft, isCookingDay }

  for (let day = 0; day < days; day++) {
    const dailyMeals = [];
    
    // 1. Atualiza as receitas ativas
    activeRecipes.forEach(recipe => {
      recipe.daysLeft--;
      recipe.isCookingDay = false; // Reseta a flag de cozinhar
    });

    // Remove receitas que já expiraram
    const activeRecipesBefore = [...activeRecipes]; // Cópia para comparação
    activeRecipes = activeRecipes.filter(r => r.daysLeft > 0);

    // 2. Adiciona as receitas ativas ao cardápio do dia
    activeRecipes.forEach(active => {
      dailyMeals.push({
        name: active.recipe.name,
        recipe: active.recipe,
        suggested: false,
        isCookingDay: false // Não é dia de cozinhar, só consumir
      });
    });

    // 3. Adiciona novas receitas se necessário
    while (dailyMeals.length < mealsPerDay && window.recipes.length > 0) {
      // Filtra receitas que não estão ativas
      const availableRecipes = window.recipes.filter(recipe => 
        !activeRecipes.some(ar => ar.recipe.name === recipe.name)
      );

      if (availableRecipes.length === 0) break;

      // Seleciona uma receita aleatória, considerando a frequência
      const totalFrequency = availableRecipes.reduce((sum, r) => sum + (r.frequency || 1), 0);
      let random = Math.random() * totalFrequency;
      let selectedRecipe;
      
      for (const recipe of availableRecipes) {
        random -= (recipe.frequency || 1);
        if (random <= 0) {
          selectedRecipe = recipe;
          break;
        }
      }

      // Calcula quantas porções são necessárias
      const portionsNeeded = Math.ceil(people / (selectedRecipe.serves || 4));
      const daysLast = Math.min(selectedRecipe.days || 1, Math.ceil(portionsNeeded / 2));

      // Adiciona ao cardápio do dia
      dailyMeals.push({
        name: selectedRecipe.name,
        recipe: selectedRecipe,
        suggested: false,
        isCookingDay: true, // É dia de cozinhar esta receita
        portions: portionsNeeded
      });

      // Se a receita durar mais de 1 dia, adiciona às ativas
      if (daysLast > 1) {
        activeRecipes.push({
          recipe: selectedRecipe,
          daysLeft: daysLast - 1, // Já contamos o dia atual
          isCookingDay: false
        });
      }
    }

    plan.push(dailyMeals);
  }

  window.plan = plan;
  showPlanPreview(plan, people, true);
  setAlert('Prévia do plano gerada. Revise e clique em "Salvar Plano" para confirmar.');
}

function simulatePlan() {
  const people = parseInt(qs('#m_people').value) || 4;
  const days = parseInt(qs('#m_days').value) || 7;
  const mealsPerDay = parseInt(qs('#m_meals').value) || 2;
  
  if (!window.recipes || window.recipes.length === 0) {
    return setAlert('Adicione receitas primeiro!', 'error');
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
  setAlert('Simulação concluída. Para aplicar o plano, clique em "Gerar Plano".');
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
      mealElement.className = 'meal-item' + (meal.isCookingDay ? ' cooking-day' : '');
      mealElement.style.padding = '4px 0';
      mealElement.innerHTML = `
       <div style="display:flex;justify-content:space-between;align-items:center">
         <span>
           ${meal.name.charAt(0).toUpperCase() + meal.name.slice(1).toLowerCase()}
           ${meal.isCookingDay ? '<span class="cooking-badge">cozinhar</span>' : ''}
         </span>
         ${isRealPlan ? `<button class="btn-ghost" data-day="${dayIndex}" data-meal="${mealIndex}">Trocar</button>` : ''}
       </div>
     `;
     mealsList.appendChild(mealElement);
    });
    
    dayElement.appendChild(mealsList);
    container.appendChild(dayElement);
  });

  if (isRealPlan) {
    // 1. Primeiro, o código do botão Salvar Plano
    const saveButton = document.createElement('div');
    saveButton.style.marginTop = '16px';
    saveButton.innerHTML = '<button id="m_savePlan" class="btn">Salvar Plano</button>';
    container.appendChild(saveButton);

  // 2. Depois o evento do botão Salvar
    saveButton.querySelector('#m_savePlan').addEventListener('click', () => {
      window.saveAll();
      closeModal();
      setAlert('Plano salvo com sucesso!');
    });

    // 3. E por fim, o evento do botão Trocar (fora do evento do Salvar)
    container.addEventListener('click', (e) => {
      const trocarBtn = e.target.closest('.btn-ghost[data-day][data-meal]');
      if (!trocarBtn) return;
      
      const dayIndex = parseInt(trocarBtn.dataset.day);
      const mealIndex = parseInt(trocarBtn.dataset.meal);
  
      // Cria um seletor com todas as receitas
      let optionsHtml = window.recipes.map(recipe => 
        `<option value="${recipe.name}">${recipe.name}</option>`
      ).join('');
  
      const selectHtml = `
        <div style="margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 4px;">
          <select id="recipeSelect" class="form-control" style="margin-bottom: 10px;">
            ${optionsHtml}
          </select>
          <button id="confirmChange" class="btn">Confirmar Troca</button>
          <button id="cancelChange" class="btn-ghost" style="margin-left: 5px;">Cancelar</button>
        </div>
      `;
  
      // Mostra o seletor de receitas
      const selectContainer = document.createElement('div');
      selectContainer.style.marginTop = '10px';
      selectContainer.innerHTML = selectHtml;
  
      // Remove qualquer seletor anterior
      const oldSelect = container.querySelector('#recipeSelectContainer');
      if (oldSelect) oldSelect.remove();
  
      // Adiciona o novo seletor após o botão clicado
      trocarBtn.parentNode.insertAdjacentElement('afterend', selectContainer);
      selectContainer.id = 'recipeSelectContainer';
  
      // Adiciona evento ao botão de confirmar
      selectContainer.querySelector('#confirmChange').addEventListener('click', () => {
        const select = selectContainer.querySelector('#recipeSelect');
        const selectedRecipeName = select.value;
        const selectedRecipe = window.recipes.find(r => r.name === selectedRecipeName);
        
        if (selectedRecipe) {
          // Atualiza o plano
          plan[dayIndex][mealIndex] = {
            name: selectedRecipe.name,
            recipe: selectedRecipe,
            suggested: false
          };
          
          // Atualiza a visualização
          showPlanPreview(plan, people, isRealPlan);
          setAlert('Receita trocada com sucesso!');
        }
      });
  
      // Adiciona evento ao botão de cancelar
      selectContainer.querySelector('#cancelChange').addEventListener('click', () => {
        selectContainer.remove();
      });
    });
  }
}
export function showCurrentPlan() {
  if (!window.plan || window.plan.length === 0) {
    return openModal('Plano Atual', '<p>Nenhum plano gerado ainda.</p>');
  }

  const people = 4;
  const html = `
    <div id="m_currentPlan" style="margin-bottom:16px"></div>
    <div style="display:flex;gap:8px">
      <button id="m_exportPlan" class="btn-ghost">Exportar</button>
      <button id="m_clearPlan" class="btn-ghost">Limpar Plano</button>
    </div>
  `;

  openModal('Plano Atual', html);
  
  // Mostra o preview no container correto
  const container = qs('#m_currentPlan');
  if (container) {
    container.innerHTML = ''; // Limpa o container primeiro

    // Mostra os dias do plano
    window.plan.forEach((dayMeals, dayIndex) => {
      const dayElement = document.createElement('div');
      dayElement.style.marginBottom = '16px';
      dayElement.innerHTML = `<strong>Dia ${dayIndex + 1}</strong>`;
      
      const mealsList = document.createElement('div');
      mealsList.style.marginLeft = '16px';
      
      dayMeals.forEach((meal) => {
        const mealElement = document.createElement('div');
        mealElement.style.padding = '4px 0';
        const recipeName = meal.name.charAt(0).toUpperCase() + meal.name.slice(1).toLowerCase();
        mealElement.textContent = recipeName;
        mealsList.appendChild(mealElement);
      });
      
      dayElement.appendChild(mealsList);
      container.appendChild(dayElement);
    });
  }

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
        
        setAlert('Plano exportado com sucesso!');
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja limpar o plano atual?')) {
          window.plan = [];
          window.saveAll();
          closeModal();
          setAlert('Plano limpo com sucesso!');
        }
      });
    }
  }, 100);
}
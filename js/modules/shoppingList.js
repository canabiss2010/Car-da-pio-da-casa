import { qs } from './utils.js';
import { openModal, closeModal, setAlert } from './ui.js';
import { normalizeUnit } from './unitNormalizer.js';

function normalizeShoppingName(name) {
  return String(name || '').trim();
}

function shoppingItemKey(name, unit = 'un') {
  const normalizedUnit = normalizeUnit(unit) || 'un';
  return `${normalizeShoppingName(name).toLowerCase()}|${normalizedUnit}`;
}

function ensureShoppingList() {
  if (!window.shoppingList) {
    window.shoppingList = [];
  }
  return window.shoppingList;
}

function saveShoppingList() {
  if (typeof window.saveAll === 'function') {
    window.saveAll();
  }
}

function addOrUpdateShoppingListItem(name, qty, unit = 'un', note = '') {
  const finalName = normalizeShoppingName(name);
  if (!finalName) return null;

  const normalizedUnit = normalizeUnit(unit) || 'un';
  const amount = Math.max(0, Number(qty) || 0);
  if (amount <= 0) return null;

  const list = ensureShoppingList();
  const key = shoppingItemKey(finalName, normalizedUnit);
  const existing = list.find(item => shoppingItemKey(item.name, item.unit) === key);

  if (existing) {
    existing.qty = Number(existing.qty || 0) + amount;
    if (note) existing.note = note;
    return existing;
  }

  const newItem = {
    id: key,
    name: finalName,
    qty: amount,
    unit: normalizedUnit,
    note: String(note || '')
  };
  list.push(newItem);
  return newItem;
}

export function getShoppingList() {
  return ensureShoppingList();
}

export function addToShoppingList(productId, amount = 1, unit = 'un', note = '') {
  const added = addOrUpdateShoppingListItem(productId, amount, unit, note);
  if (!added) {
    setAlert('Não foi possível adicionar o item. Verifique o nome e a quantidade.', 'warn', 4000);
    return;
  }
  saveShoppingList();
  setAlert(`Item adicionado: ${added.name} (${added.qty.toFixed(2)} ${added.unit})`, 'success', 4000);
  return getShoppingList();
}

export function removeFromShoppingList(productId, unit = 'un') {
  const list = ensureShoppingList();
  const key = shoppingItemKey(productId, unit);
  const previousLength = list.length;
  window.shoppingList = list.filter(item => shoppingItemKey(item.name, item.unit) !== key);
  if (window.shoppingList.length === previousLength) {
    setAlert('Item não encontrado na lista de compras.', 'warn', 4000);
    return getShoppingList();
  }
  saveShoppingList();
  setAlert('Item removido da lista de compras.', 'info', 4000);
  return getShoppingList();
}

export function clearShoppingList() {
  window.shoppingList = [];
  saveShoppingList();
  setAlert('Lista de compras limpa.', 'info', 4000);
  return getShoppingList();
}

export function getPlanIngredientItems(plan = window.plan, people = window.planMeta?.people || 4) {
  if (!plan || plan.length === 0) return [];

  const planMap = {};

  plan.forEach(dayMeals => {
    dayMeals.forEach(meal => {
      if (!meal.recipe?.ingredients) return;
      const recipeServings = meal.recipe.servings || 4;
      const portionScale = people / recipeServings;

      meal.recipe.ingredients.forEach(ingredient => {
        const normalizedUnit = normalizeUnit(ingredient.unit) || 'un';
        const ingredientName = normalizeShoppingName(ingredient.name);
        if (!ingredientName) return;

        const key = `${ingredientName.toLowerCase()}|${normalizedUnit}`;
        if (!planMap[key]) {
          planMap[key] = {
            name: ingredientName,
            unit: normalizedUnit,
            qty: 0
          };
        }

        planMap[key].qty += (Number(ingredient.qty) || 0) * portionScale;
      });
    });
  });

  return Object.values(planMap).filter(item => item.qty > 0);
}

export function getPlanMissingItems(plan = window.plan, people = window.planMeta?.people || 4) {
  if (!plan || plan.length === 0) return [];

  const missingMap = {};

  plan.forEach(dayMeals => {
    dayMeals.forEach(meal => {
      if (!meal.recipe?.ingredients) return;
      const recipeServings = meal.recipe.servings || 4;
      const portionScale = people / recipeServings;

      meal.recipe.ingredients.forEach(ingredient => {
        const normalizedUnit = normalizeUnit(ingredient.unit) || 'un';
        const ingredientName = normalizeShoppingName(ingredient.name);
        if (!ingredientName) return;

        const key = `${ingredientName.toLowerCase()}|${normalizedUnit}`;
        if (!missingMap[key]) {
          missingMap[key] = {
            name: ingredientName,
            unit: normalizedUnit,
            qty: 0
          };
        }

        missingMap[key].qty += (Number(ingredient.qty) || 0) * portionScale;
      });
    });
  });

  Object.values(missingMap).forEach(item => {
    const inventoryItem = window.inventory?.find(inv =>
      normalizeShoppingName(inv.name).toLowerCase() === item.name.toLowerCase() &&
      normalizeUnit(inv.unit) === item.unit
    );
    if (inventoryItem) {
      item.qty = Math.max(0, item.qty - (Number(inventoryItem.qty) || 0));
    }
  });

  return Object.values(missingMap).filter(item => item.qty > 0);
}

export function showShoppingList() {
  const customList = getShoppingList();
  const planItems = getPlanIngredientItems();

  const listHtml = customList.length
    ? `<div class="shopping-list-items">
        ${customList.map(item => `
          <div class="item-row" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #eee;">
            <div>
              <strong>${item.name}</strong>
              <div style="font-size:0.9em;color:#555;">${item.qty.toFixed(2)} ${item.unit}${item.note ? ` · ${item.note}` : ''}</div>
            </div>
            <button class="btn-ghost shopping-delete-button" data-name="${item.name}" data-unit="${item.unit}">Remover</button>
          </div>
        `).join('')}
      </div>`
    : '<p>Nenhum item na sua lista de compras.</p>';

  const planHtml = planItems.length
    ? `<div class="shopping-plan-items" style="margin-top:16px">
        <h4 style="margin-bottom:8px;">Ingredientes do plano</h4>
        ${planItems.map(item => `
          <div class="item-row" style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;">
            <span>${item.name}</span>
            <span>${item.qty.toFixed(2)} ${item.unit}</span>
          </div>
        `).join('')}
      </div>`
    : '';

  const html = `
    <div class="small" style="margin-bottom:16px">
      Esta lista mostra automaticamente os ingredientes consumidos pelo último plano criado para que os mesmos sejam repostos. Além disso é possível adicionar itens extras manualmente.
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      <button id="m_addShoppingItem" class="btn">Adicionar item</button>
      <button id="m_clearShoppingList" class="btn-ghost">Limpar lista</button>
    </div>
    <div id="shopping-add-form" style="display:none;margin-bottom:16px;padding:12px;background:#f8f9fa;border:1px solid #e5e5e5;border-radius:8px;">
      <div style="display:grid;gap:10px;">
        <div>
          <label>Nome do item</label>
          <input id="m_shoppingItemName" type="text" placeholder="Ex: arroz" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label>Quantidade</label>
            <input id="m_shoppingItemQty" type="number" min="0.1" step="0.1" value="1" />
          </div>
          <div>
            <label>Unidade</label>
            <input id="m_shoppingItemUnit" type="text" placeholder="g / ml / un" value="un" />
          </div>
        </div>
        <div>
          <label>Observação (opcional)</label>
          <input id="m_shoppingItemNote" type="text" placeholder="Ex: para o café da manhã" />
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="m_confirmAddShoppingItem" class="btn">Salvar item</button>
          <button id="m_cancelAddShoppingItem" class="btn-ghost">Cancelar</button>
        </div>
      </div>
    </div>
    <div style="margin-top:8px;">
      <h4>Lista de compras</h4>
      ${listHtml}
    </div>
    <div>
      ${planHtml}
    </div>
  `;

  openModal('Lista de Compras', html);

  setTimeout(() => {
    const addItemButton = document.getElementById('m_addShoppingItem');
    const clearButton = document.getElementById('m_clearShoppingList');
    const form = document.getElementById('shopping-add-form');
    const cancelForm = document.getElementById('m_cancelAddShoppingItem');
    const confirmForm = document.getElementById('m_confirmAddShoppingItem');

    if (addItemButton) {
      addItemButton.addEventListener('click', () => {
        if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
      });
    }

    if (cancelForm) {
      cancelForm.addEventListener('click', () => {
        if (form) form.style.display = 'none';
      });
    }

    if (confirmForm) {
      confirmForm.addEventListener('click', () => {
        const nameInput = document.getElementById('m_shoppingItemName');
        const qtyInput = document.getElementById('m_shoppingItemQty');
        const unitInput = document.getElementById('m_shoppingItemUnit');
        const noteInput = document.getElementById('m_shoppingItemNote');

        const name = nameInput?.value || '';
        const qty = Number(qtyInput?.value) || 0;
        const unit = unitInput?.value || 'un';
        const note = noteInput?.value || '';

        if (!name || qty <= 0) {
          setAlert('Informe nome e quantidade válidos.', 'warn', 4000);
          return;
        }

        addToShoppingList(name, qty, unit, note);
        showShoppingList();
      });
    }

    if (clearButton) {
      clearButton.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja limpar toda a lista de compras?')) {
          clearShoppingList();
          showShoppingList();
        }
      });
    }

    document.getElementById('modalContent')?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.matches('.shopping-delete-button')) {
        const itemName = target.getAttribute('data-name');
        const itemUnit = target.getAttribute('data-unit') || 'un';
        removeFromShoppingList(itemName, itemUnit);
        showShoppingList();
      }
    });
  }, 100);
}

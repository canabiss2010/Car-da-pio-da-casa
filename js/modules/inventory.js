// js/modules/inventory.js
import { qs, parseLine } from './utils.js';
import { openModal, setAlert } from './ui.js';
import { barcodeScanner } from './barcode.js';


export function showInventory() {
  const html = `

    <button id="startBarcode" class="btn" style="width: 100%; margin-bottom: 16px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 10px; font-size: 0.95em; font-weight: 500; height: 44px; box-sizing: border-box;">
      <span style="font-size: 1.2em; line-height: 1;">📷</span>
      <span>Ler Código de Barras</span>
    </button>

    <label style="font-size: 1.1em; display: block; margin-bottom: 8px;">Adicione manualmente</label>
    <div style="display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">
      <input type="text" id="m_itemName" placeholder="Nome do item" style="flex: 2; min-width: 150px; padding: 10px; border-radius: 8px; border: 1px solid #e0e0e0;">
      <input 
        type="number" 
        id="m_itemQty" 
        placeholder="Qtd" 
        inputmode="decimal"
        style="flex: 1; min-width: 60px; padding: 10px; border-radius: 8px; border: 1px solid #e0e0e0; text-align: center; -moz-appearance: textfield;-webkit-appearance: textfield; appearance: textfield;">
      <select id="m_itemUnit" style="flex: 1; min-width: 80px; padding: 10px; border-radius: 8px; border: 1px solid #e0e0e0; text-align: center; background-color: white;">
        <option value="Litro">Litro</option>
        <option value="Kg">Kg</option>
        <option value="Grama">Grama</option>
        <option value="Ml">Ml</option>
        <option value="Unidade" selected>Unidade</option>
      </select>
      <select id="m_itemCategory" style="flex: 3; min-width: 200px; padding: 10px; border-radius: 8px; border: 1px solid #e0e0e0; background-color: white;">
        <option value="">Selecione a categoria</option>
        <option value="hortifruti">Hortifrúti</option>
        <option value="carnes">Carnes, Aves e Ovo</option>
        <option value="laticinios">Laticínios e Frios</option>
        <option value="graos">Grãos e Cereais</option>
        <option value="padaria">Padaria e Matinais</option>
        <option value="bebidas">Bebidas</option>
        <option value="enlatados">Enlatados e Conservas</option>
        <option value="oleaginosas">Oleaginosas e Sementes</option>
        <option value="temperos">Temperos e especiarias</option>
        <option value="oleos">Óleos e Gorduras</option>
        <option value="acucares">Açúcares e Ingredientes de Forno</option>
        <option value="molhos">Molhos, Condimentos e Vinagres</option>
        <option value="lanches">Lanches e Petiscos</option>
      </select>
    </div>

    <div style="display:flex;gap:8px;margin-top:8px">
      <button id="m_paste" class="btn">Adicionar item</button>
    </div>

  <div style="position: relative; margin: 16px 0;">
    <div style="position: absolute; left: 16px; top: 55%; transform: translateY(-50%); display: flex; align-items: center; height: 20px; pointer-events: none;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="position: relative; top: 2px;">
        <path d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z" stroke="#9E9E9E" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M21 21L16.65 16.65" stroke="#9E9E9E" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg> 
    </div>
    <input type="text" placeholder="Pesquisar itens..." style="width: 100%; padding: 12px 46px 12px 48px; border-radius: 20px; border: 1px solid #e0e0e0; font-size: 1em; background-color: #f8f9fa; outline: none; height: 44px; box-sizing: border-box; color: #333; font-weight: 400; line-height: 1.5;">
    <div style="position: absolute; right: 16px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; height: 20px; cursor: pointer; pointer-events: none;">
      <img src="icons/filtro.png" alt="Filtro" style="width: 20px; height: 20px; object-fit: contain; opacity: 0.7; position: relative; top: 2px;">
    </div>
  </div>
    <div id="m_invList" class="list" style="margin-top:12px"></div>
  `;
  
  openModal('Dispensa', html);
  renderList();
  
  // Configura o evento do botão de código de barras
  const barcodeBtn = qs('#startBarcode');
  if (barcodeBtn) {
    barcodeBtn.addEventListener('click', () => barcodeScanner.openScanner());
  }
}

// Função para normalizar texto (remover acentos e caracteres especiais)
function normalizeText(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function renderList() {
  const el = qs('#m_invList'); 
  if (!el) return;
  
  el.innerHTML = '';
  
  if (window.inventory.length === 0) {
    el.innerHTML = '<div class="small">Sem itens</div>';
    return;
  }
  
  // Agrupa itens por categoria
  const itemsByCategory = window.inventory.reduce((acc, item) => {
    const category = item.category || 'outros';
    if (!acc[category]) {
      acc[category] = [];
    }
    
    // Verifica se já existe um item com o mesmo nome e unidade
    const existingItemIndex = acc[category].findIndex(i => 
      normalizeText(i.name) === normalizeText(item.name) && i.unit === item.unit
    );
    
    if (existingItemIndex >= 0) {
      // Se existir, soma as quantidades
      acc[category][existingItemIndex].qty += item.qty;
    } else {
      // Se não existir, adiciona o item
      acc[category].push({
        ...item,
        normalizedName: normalizeText(item.name)
      });
    }
    
    return acc;
  }, {});

  // Ordem desejada das categorias
  const categoryOrder = [
    'carnes', 'laticinios', 'graos', 'padaria', 'hortifruti',
    'bebidas', 'enlatados', 'oleaginosas', 'temperos', 'oleos',
    'acucares', 'molhos', 'lanches', 'outros'
  ];

  // Renderiza cada categoria
  categoryOrder.forEach(category => {
    if (!itemsByCategory[category] || itemsByCategory[category].length === 0) return;

    const categoryName = {
      'hortifruti': 'Hortifrúti',
      'carnes': 'Carnes, Aves e Ovo',
      'laticinios': 'Laticínios e Frios',
      'graos': 'Grãos e Cereais',
      'padaria': 'Padaria e Matinais',
      'bebidas': 'Bebidas',
      'enlatados': 'Enlatados e Conservas',
      'oleaginosas': 'Oleaginosas e Sementes',
      'temperos': 'Temperos e Especiarias',
      'oleos': 'Óleos e Gorduras',
      'acucares': 'Açúcares e Ingredientes de Forno',
      'molhos': 'Molhos, Condimentos e Vinagres',
      'lanches': 'Lanches e Petiscos',
      'outros': 'Outros'
    }[category] || 'Outros';

    const categoryEl = document.createElement('div');
    categoryEl.className = 'category-section';
    categoryEl.innerHTML = `
      <div class="category-header">
        <h3>${categoryName}</h3>
      </div>
      <div class="items-container" id="category-${category}"></div>
    `;
    el.appendChild(categoryEl);

    const categoryItemsEl = categoryEl.querySelector('.items-container');
    
    // Ordena os itens da categoria em ordem alfabética
    const sortedItems = [...itemsByCategory[category]].sort((a, b) => 
      a.normalizedName.localeCompare(b.normalizedName, 'pt-BR', {sensitivity: 'base'})
    );

    // Renderiza os itens da categoria
    sortedItems.forEach(item => {
      const node = document.createElement('div');
      node.className = 'item';
      node.innerHTML = `
        <div style="max-width:70%">
          <strong style="text-transform:capitalize">${item.name}</strong>
          <div class="small">${item.qty} ${item.unit}</div>
        </div>
        <div>
          <button data-name="${item.name}" data-unit="${item.unit}" class="btn-ghost">Remover</button>
        </div>
      `;
      categoryItemsEl.appendChild(node);
    });
  });

  // Atualiza os eventos dos botões de remover
  el.querySelectorAll('button[data-name]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = btn.dataset.name;
      const unit = btn.dataset.unit;
      const normalizedSearch = normalizeText(name);
      
      // Remove todos os itens com o mesmo nome (normalizado) e unidade
      window.inventory = window.inventory.filter(item => {
        return !(normalizeText(item.name) === normalizedSearch && item.unit === unit);
      });
      
      window.saveAll();
      renderList();
      setAlert(`Item removido: ${name}`);
    });
  });
}

document.addEventListener('click', (e) => {
  // Adicionar item manual
  if (e.target.id === 'm_paste') {
    const name = qs('#m_itemName').value.trim();
    const qty = parseFloat(qs('#m_itemQty').value);
    const unit = qs('#m_itemUnit').value;
    const category = qs('#m_itemCategory').value;

    if (!name || isNaN(qty) || qty <= 0) {
      return alert('Preencha todos os campos corretamente');
    }

    const newItem = {
      name: name,
      qty: qty,
      unit: unit,
      category: category
    };

    window.inventory.push(newItem);
    window.saveAll();
    renderList();
    setAlert('Item adicionado com sucesso!');

    // Limpa os campos
    qs('#m_itemName').value = '';
    qs('#m_itemQty').value = '';
    qs('#m_itemUnit').value = 'Unidade';
  }

});
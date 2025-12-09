// js/modules/inventory.js
import { qs, parseLine } from './utils.js';
import { openModal, setAlert } from './ui.js';
import { barcodeScanner } from './barcode.js';


export function showInventory() {
  const html = `
    <button id="startBarcode" class="btn" style="width: 100%; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;">
      <span>Ler Código de Barras</span>
    </button>

    <label style="font-size: 1.1em; display: block; margin-bottom: 8px;">Adicionar manualmente</label>
    <div style="display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">
      <input type="text" id="m_itemName" placeholder="Nome do item" style="flex: 2; min-width: 150px; padding: 10px; border-radius: 8px; border: 1px solid #e0e0e0;">
      <input type="number" id="m_itemQty" placeholder="Qtd" style="flex: 1; min-width: 60px; padding: 10px; border-radius: 8px; border: 1px solid #e0e0e0; text-align: center;">
      <input type="text" id="m_itemUnit" placeholder="Un" style="flex: 1; min-width: 50px; padding: 10px; border-radius: 8px; border: 1px solid #e0e0e0; text-align: center;">
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
      <button id="m_paste" class="btn">Adicionar itens</button>
      <button id="m_clearInv" class="btn-ghost">Limpar</button>
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
  el.innerHTML = '';
  
  if (window.inventory.length === 0) {
    el.innerHTML = '<div class="small">Sem itens</div>';
    return;
  }
  
  // Agrupa itens por nome (normalizado) e unidade
  const groupedItems = window.inventory.reduce((acc, item) => {
    const normalizedItem = {
      ...item,
      originalName: item.name, // Mantém o nome original para exibição
      normalizedName: normalizeText(item.name) // Nome normalizado para agrupamento
    };
    
    const key = `${normalizedItem.normalizedName}_${item.unit}`;
    
    if (!acc[key]) {
      acc[key] = { ...normalizedItem };
    } else {
      acc[key].qty += normalizedItem.qty;
      // Mantém o nome com a primeira letra maiúscula se existir
      if (normalizedItem.originalName[0] === normalizedItem.originalName[0].toUpperCase()) {
        acc[key].name = normalizedItem.originalName;
        acc[key].originalName = normalizedItem.originalName;
      }
    }
    return acc;
  }, {});
  
  // Ordena os itens por nome
  const sortedItems = Object.values(groupedItems).sort((a, b) => 
    a.normalizedName.localeCompare(b.normalizedName)
  );
  
  // Renderiza os itens agrupados
  sortedItems.forEach((item) => {
    const node = document.createElement('div'); 
    node.className = 'item';
    node.innerHTML = `
      <div style="max-width:70%">
        <strong style="text-transform:capitalize">${item.originalName || item.name}</strong>
        <div class="small">${item.qty} ${item.unit}</div>
      </div>
      <div>
        <button data-name="${item.name}" data-unit="${item.unit}" class="btn-ghost">Remover</button>
      </div>
    `;
    el.appendChild(node);
  });

  // Atualiza os eventos dos botões de remover
  el.querySelectorAll('button[data-name]').forEach(btn => {
    btn.addEventListener('click', () => {
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

// Adicionar item único
document.addEventListener('click', (e) => {
  // Adicionar vários itens
  if (e.target.id === 'm_paste') {
    const text = qs('#m_invBulk').value.trim();
    if (!text) return alert('Cole as linhas com os itens');
    
    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    
    let added = 0;
    lines.forEach(line => {
      const item = parseLine(line);
      if (item) {
        window.inventory.push(item);
        added++;
      }
    });
    
    window.saveAll();
    qs('#m_invBulk').value = '';
    renderList();
    setAlert(`Adicionados ${added} itens`);
  }

  // Limpar inventário
  if (e.target.id === 'm_clearInv') {
    if (!confirm('Tem certeza que deseja limpar todo o inventário?')) return;
    window.inventory = [];
    window.saveAll();
    renderList();
    setAlert('Inventário limpo');
  }
});//
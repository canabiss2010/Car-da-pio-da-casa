// js/modules/inventory.js
import { qs, parseLine } from './utils.js';
import { openModal, setAlert } from './ui.js';
import { barcodeScanner } from './barcode.js';


export function showInventory() {
  const html = `
    <button id="startBarcode" class="btn" style="width: 100%; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;">
      <span>Ler Código de Barras</span>
    </button>

    <label style="font-size: 1.1em;">Adicione manualmente <span style="font-size: 0.9em;">(um por linha, separado por vírgula)</span></label>
    <textarea id="m_invBulk" rows="6" placeholder="arroz,2,kg\nleite,2,l"></textarea>

    <div style="display:flex;gap:8px;margin-top:8px">
      <button id="m_paste" class="btn">Adicionar itens</button>
      <button id="m_clearInv" class="btn-ghost">Limpar</button>
    </div>

    <div style="position: relative; margin: 16px 0;">
      <div style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%);">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z" stroke="#9E9E9E" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M21 21L16.65 16.65" stroke="#9E9E9E" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <input type="text" placeholder="Pesquisar itens..." style="width: 100%; padding: 10px 46px 10px 48px; border-radius: 20px; border: 1px solid #e0e0e0; font-size: 1em; background-color: #f8f9fa; outline: none; height: 44px; box-sizing: border-box; color: #333; font-weight: 400;">
      <div style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%);">
        <img src="icons/filtro.png" alt="Filtro" style="width: 24px; height: 24px; object-fit: contain;">
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
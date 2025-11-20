// js/modules/inventory.js
import { qs, parseLine } from './utils.js';
import { openModal, setAlert } from './ui.js';

function groupItems(items) {
  const grouped = {};
  items.forEach(item => {
    const key = `${item.name.toLowerCase()}_${item.unit}`;
    if (!grouped[key]) {
      grouped[key] = { ...item };
    } else {
      grouped[key].qty += item.qty;
    }
  });
  return Object.values(grouped);
}

export function showInventory() {
  const html = `
    <div style="display:flex;gap:8px">
      <input id="m_invLine" placeholder="ex: arroz,2,kg" />
      <button id="m_addInv" class="btn-ghost">Adicionar</button>
    </div>
    <label style="margin-top:8px">Cole várias linhas</label>
    <textarea id="m_invBulk" rows="6" placeholder="arroz,2,kg\nleite,2,l"></textarea>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button id="m_paste" class="btn">Adicionar todas</button>
      <button id="m_clearInv" class="btn-ghost">Limpar</button>
    </div>
    <div id="m_invList" class="list" style="margin-top:12px"></div>
  `;
  
  openModal('Dispensa', html);
  renderList();
}

function renderList() {
  const el = qs('#m_invList'); 
  el.innerHTML = '';
  
  if (window.inventory.length === 0) {
    el.innerHTML = '<div class="small">Sem itens</div>';
    return;
  }
  
  const groupedItems = groupItems(window.inventory);
  
  groupedItems.forEach((item, idx) => {
    const node = document.createElement('div'); 
    node.className = 'item';
    node.innerHTML = `
      <div style="max-width:70%">
        <strong style="text-transform:capitalize">${item.name}</strong>
        <div class="small">${item.qty.toFixed(2)} ${item.unit} (${window.inventory.filter(i => 
          i.name.toLowerCase() === item.name.toLowerCase() && i.unit === item.unit
        ).length} itens)</div>
      </div>
      <div>
        <button data-name="${item.name}" data-unit="${item.unit}" class="btn-ghost">Remover</button>
      </div>
    `;
    el.appendChild(node);
  });

  el.querySelectorAll('button[data-name]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const name = btn.dataset.name;
      const unit = btn.dataset.unit;
      window.inventory = window.inventory.filter(i => 
        !(i.name.toLowerCase() === name.toLowerCase() && i.unit === unit)
      );
      window.saveAll();
      renderList();
      setAlert(`Todos os ${name} foram removidos`);
    });
  });
}

// Adicionar item único
document.addEventListener('click', (e) => {
  if (e.target.id === 'm_addInv') {
    const input = qs('#m_invLine').value.trim();
    if (!input) {
      setAlert('Digite: nome,quantidade,unidade', 'error');
      return;
    }

    const item = parseLine(input);
    if (!item) {
      setAlert('Formato inválido. Use: nome,quantidade,unidade', 'error');
      return;
    }

    // Padroniza o nome
    item.name = item.name.toLowerCase().trim();
    
    window.inventory.push(item);
    window.saveAll();
    qs('#m_invLine').value = '';
    renderList();
    setAlert(`Item adicionado: ${item.name}`);
  }

  // Adicionar múltiplos itens
  if (e.target.id === 'm_paste') {
    const textarea = qs('#m_invBulk');
    const text = textarea.value.trim();
    
    if (!text) {
      setAlert('Cole as linhas com os itens', 'error');
      return;
    }
    
    const lines = text
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    
    let added = 0;
    lines.forEach(line => {
      const item = parseLine(line);
      if (item) {
        // Padroniza o nome
        item.name = item.name.toLowerCase().trim();
        window.inventory.push(item);
        added++;
      }
    });
    
    if (added > 0) {
      window.saveAll();
      textarea.value = '';
      renderList();
      setAlert(`Adicionados ${added} itens`);
    } else {
      setAlert('Nenhum item válido encontrado', 'error');
    }
  }

  // Limpar inventário
  if (e.target.id === 'm_clearInv') {
    if (!confirm('Tem certeza que deseja limpar todo o inventário?')) return;
    window.inventory = [];
    window.saveAll();
    renderList();
    setAlert('Inventário limpo');
  }
});
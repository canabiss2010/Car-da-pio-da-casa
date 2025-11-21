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

// Cache de seletores DOM
const selectors = {
  invLine: '#m_invLine',
  invBulk: '#m_invBulk',
  invList: '#m_invList',
  addBtn: '#m_addInv',
  pasteBtn: '#m_paste',
  clearBtn: '#m_clearInv'
};

// Validação de entrada
function validateItemInput(input) {
  if (!input) {
    UI.setAlert('Por favor, preencha todos os campos', 'warn');
    return false;
  }
  return true;
}

// Adiciona um único item
function addSingleItem() {
  const input = qs(selectors.invLine);
  if (!validateItemInput(input?.value)) return;
  
  const item = parseLine(input.value.trim());
  if (!item) {
    UI.setAlert('Formato inválido. Use: nome,quantidade,unidade', 'error');
    return;
  }
  
  window.inventory.push(item);
  window.saveAll();
  input.value = '';
  renderList();
  UI.setAlert(`Item adicionado: ${item.name}`);
}

// Adiciona múltiplos itens
function addMultipleItems() {
  const textarea = qs(selectors.invBulk);
  if (!validateItemInput(textarea?.value)) return;
  
  const lines = textarea.value
    .split('\n')
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
  
  if (added > 0) {
    window.saveAll();
    textarea.value = '';
    renderList();
    UI.setAlert(`Adicionados ${added} itens`);
  } else {
    UI.setAlert('Nenhum item válido encontrado', 'warn');
  }
}

// Limpa o inventário
function clearInventory() {
  if (!confirm('Tem certeza que deseja limpar todo o inventário?')) return;
  window.inventory = [];
  window.saveAll();
  renderList();
  UI.setAlert('Inventário limpo');
}

export function showInventory() {
  const html = `
    <div style="display:flex;gap:8px">
      <input 
        id="m_invLine" 
        type="text"
        placeholder="ex: arroz,2,kg" 
        aria-label="Adicionar item no formato: nome, quantidade, unidade"
        autocomplete="off"
      />
      <button id="m_addInv" class="btn-ghost" aria-label="Adicionar item">
        Adicionar
      </button>
    </div>
    <label for="m_invBulk" style="margin-top:8px">
      Cole várias linhas (uma por item)
    </label>
    <textarea 
      id="m_invBulk" 
      rows="6" 
      placeholder="arroz,2,kg\nleite,2,l"
      aria-label="Cole vários itens, um por linha, no formato: nome, quantidade, unidade"
    ></textarea>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button id="m_paste" class="btn" aria-label="Adicionar todos os itens listados">
        Adicionar todas
      </button>
      <button id="m_clearInv" class="btn-ghost" aria-label="Limpar todos os itens">
        Limpar
      </button>
    </div>
    <div id="m_invList" class="list" style="margin-top:12px" aria-live="polite"></div>
  `;
  
  openModal('Dispensa', html);
  renderList();
}

function renderList() {
  const el = qs('#m_invList'); 
  el.innerHTML = '';
  
  // Botões
  qs(selectors.addBtn)?.addEventListener('click', addSingleItem);
  qs(selectors.pasteBtn)?.addEventListener('click', addMultipleItems);
  qs(selectors.clearBtn)?.addEventListener('click', clearInventory);
}

// Renderiza a lista de itens
function renderList() {
  const el = qs(selectors.invList);
  if (!el) return;
  
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

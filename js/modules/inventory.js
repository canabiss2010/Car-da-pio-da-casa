// js/modules/inventory.js
import { qs, parseLine } from './utils.js';
import { openModal, setAlert } from './ui.js';

export function showInventory() {
  const html = `
    <label style="font-size: 1.1em;">Cole os itens (um por linha)</label>
    <textarea id="m_invBulk" rows="6" placeholder="arroz,2,kg\nleite,2,l"></textarea>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button id="m_paste" class="btn">Adicionar itens</button>
      <button id="m_clearInv" class="btn-ghost">Limpar</button>
    </div>
    <div id="m_invList" class="list" style="margin-top:12px"></div>
  `;
  
  openModal('Dispensa', html);
  renderList();
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
});
// js/modules/inventory.js
import { qs, parseLine } from './utils.js';
import { openModal, setAlert } from './ui.js';

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
  
  window.inventory.forEach((item, idx) => {
    const node = document.createElement('div'); 
    node.className = 'item';
    node.innerHTML = `
      <div style="max-width:70%">
        <strong style="text-transform:capitalize">${item.name}</strong>
        <div class="small">${item.qty} ${item.unit}</div>
      </div>
      <div>
        <button data-idx="${idx}" class="btn-ghost">Remover</button>
      </div>
    `;
    el.appendChild(node);
  });

  // Eventos dos botões de remover
  el.querySelectorAll('button[data-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      const name = window.inventory[idx]?.name || 'item';
      window.inventory.splice(idx, 1);
      window.saveAll();
      renderList();
      setAlert(`Item removido: ${name}`);
    });
  });
}
// Adicionar item único
document.addEventListener('click', (e) => {
  if (e.target.id === 'm_addInv') {
    const input = qs('#m_invLine').value.trim();
    if (!input) return alert('Digite: nome,quantidade,unidade');
    
    const item = parseLine(input);
    if (!item) return alert('Formato inválido. Use: nome,quantidade,unidade');
    
    window.inventory.push(item);
    window.saveAll();
    qs('#m_invLine').value = '';
    renderList();
    setAlert(`Item adicionado: ${item.name}`);
  }

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
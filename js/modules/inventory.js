// js/modules/inventory.js
import { qs, parseLine } from './utils.js';
import { UI } from './ui.js';

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
  
  UI.openModal('Dispensa', html);
  setupEventListeners();
  renderList();
}

// Configura os event listeners
function setupEventListeners() {
  // Adicionar item ao pressionar Enter
  qs(selectors.invLine)?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addSingleItem();
  });
  
  // Botões
  qs(selectors.addBtn)?.addEventListener('click', addSingleItem);
  qs(selectors.pasteBtn)?.addEventListener('click', addMultipleItems);
  qs(selectors.clearBtn)?.addEventListener('click', clearInventory);
}

// Renderiza a lista de itens
function renderList() {
  const el = qs(selectors.invList);
  if (!el) return;
  
  el.innerHTML = window.inventory.length === 0 
    ? '<div class="small">Sem itens</div>'
    : window.inventory.map((item, idx) => `
        <div class="item">
          <div style="max-width:70%">
            <strong style="text-transform:capitalize">${item.name}</strong>
            <div class="small">${item.qty} ${item.unit}</div>
          </div>
          <div>
            <button 
              data-idx="${idx}" 
              class="btn-ghost"
              aria-label="Remover ${item.name}"
            >
              Remover
            </button>
          </div>
        </div>
      `).join('');

  // Adiciona eventos de remoção
  el.querySelectorAll('button[data-idx]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = Number(e.currentTarget.dataset.idx);
      const name = window.inventory[idx]?.name || 'item';
      window.inventory.splice(idx, 1);
      window.saveAll();
      renderList();
      UI.setAlert(`Item removido: ${name}`);
    });
  });
}
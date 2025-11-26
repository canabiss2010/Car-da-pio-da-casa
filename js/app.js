// Importações
import { STORAGE_KEYS } from './config.js';
import * as UI from './modules/ui.js';
import { qs, validateJSON } from './modules/utils.js';
import { barcodeScanner } from './modules/barcode.js';
// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  console.log('App inicializado!');
  UI.initUI();
  setupEventListeners();
  loadInitialData();
  setupServiceWorker();
});

// Carrega dados iniciais
function loadInitialData() {
  window.inventory = validateJSON(localStorage.getItem(STORAGE_KEYS.INVENTORY)) || [];
  window.recipes = validateJSON(localStorage.getItem(STORAGE_KEYS.RECIPES)) || [];
  window.plan = validateJSON(localStorage.getItem(STORAGE_KEYS.PLAN)) || [];
  
  // Migração de versão (se necessário)
  if (window.recipes.length > 0) {
    window.recipes = window.recipes.map(r => ({ 
      ...r, 
      frequency: r.frequency || r.priority || 1,
      servings: r.servings || 4
    }));
    saveAll();
  }
}

// Salva todos os dados
function saveAll() {
  try {
    localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(window.inventory));
    localStorage.setItem(STORAGE_KEYS.RECIPES, JSON.stringify(window.recipes));
    localStorage.setItem(STORAGE_KEYS.PLAN, JSON.stringify(window.plan));
  } catch (e) {
    console.error('Erro ao salvar dados:', e);
    UI.setAlert('Erro ao salvar dados. Verifique o espaço de armazenamento.', 'error');
  }
}

// Carrega um módulo com tratamento de erro
async function loadModule(modulePath, callback) {
  try {
    const module = await import(modulePath);
    UI.showLoading();
    await callback(module);
  } catch (error) {
    console.error(`Erro ao carregar o módulo ${modulePath}:`, error);
    UI.setAlert('Erro ao carregar a funcionalidade. Tente novamente.', 'error');
  } finally {
    UI.hideLoading();
  }
}

// Configura os listeners
function setupEventListeners() {
  // Blocos principais
  const buttons = {
  '#b-inv': './modules/inventory.js',
  '#b-rec': './modules/recipes.js',
  '#b-create': './modules/planning.js',
  '#b-current': './modules/planning.js'
};

  Object.entries(buttons).forEach(([selector, modulePath]) => {
    const button = qs(selector);
    if (button) {
      button.addEventListener('click', function handleClick() {
        const action = selector === '#b-current' ? 'showCurrentPlan' : 
                      selector === '#b-create' ? 'showCreatePlan' : 
                      selector === '#b-rec' ? 'showRecipes' : 'showInventory';
        
        loadModule(modulePath, (module) => {
          if (typeof module[action] === 'function') {
            module[action]();
          }
        });
      });
    }
  });

  // Navegação por teclado
  document.querySelectorAll('.block').forEach(block => {
    block.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        block.click();
      }
    });
    
    block.addEventListener('focus', () => {
      block.style.outline = '2px solid var(--accent)';
      block.style.outlineOffset = '2px';
    });
    
    block.addEventListener('blur', () => {
      block.style.outline = 'none';
    });
  });

  // Fechar modal ao clicar fora
  qs('#modalBack')?.addEventListener('click', (e) => {
    if (e.target === qs('#modalBack')) UI.closeModal();
  });
}

// Service Worker
function setupServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./cardapio_sw.js')
      .then(() => console.log('Service Worker registrado'))
      .catch(err => console.error('Falha no Service Worker:', err));
  }
}

// Torna funções disponíveis globalmente
window.saveAll = saveAll;
window.loadModule = loadModule;
window.barcodeScanner = barcodeScanner;
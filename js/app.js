// js/app.js
import { STORAGE_KEYS, APP_CONFIG } from './config.js';
import { UI } from './modules/ui.js';
import { qs, validateJSON } from './modules/utils.js';
// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
  try {
    UI.showLoading('Inicializando...');
    await initializeApp();
    setupEventListeners();
    setupServiceWorker();
    appState.isInitialized = true;
    
    // Dispara evento de inicialização
    document.dispatchEvent(new CustomEvent(APP_EVENTS.DATA_LOADED, {
      detail: { 
        inventory: window.inventory,
        recipes: window.recipes,
        plan: window.plan 
      }
    }));
  } catch (error) {
    console.error('Erro na inicialização:', error);
    UI.setAlert('Falha ao inicializar o aplicativo', 'error');
  } finally {
    UI.hideLoading();
  }
});

/**
 * Inicializa a aplicação
 */
async function initializeApp() {
  try {
    await loadInitialData();
    migrateDataIfNeeded();
    console.log('Aplicativo inicializado com sucesso');
  } catch (error) {
    console.error('Erro na inicialização:', error);
    throw error;
  }
}

/**
 * Carrega os dados iniciais do armazenamento local
 */
async function loadInitialData() {
  try {
    window.inventory = validateJSON(
      localStorage.getItem(STORAGE_KEYS.INVENTORY), 
      []
    );
    window.recipes = validateJSON(
      localStorage.getItem(STORAGE_KEYS.RECIPES), 
      []
    );
    window.plan = validateJSON(
      localStorage.getItem(STORAGE_KEYS.PLAN), 
      { days: [], generatedAt: null }
    );
  } catch (error) {
    console.error('Erro ao carregar dados:', error);
    throw new Error('Não foi possível carregar os dados do aplicativo');
  }
}

/**
 * Migração de dados entre versões
 */
function migrateDataIfNeeded() {
  // Migração de receitas
  if (window.recipes.length > 0 && !window.recipes[0].hasOwnProperty('frequency')) {
    window.recipes = window.recipes.map(recipe => ({
      ...recipe,
      frequency: recipe.priority || 1,
      servings: recipe.servings || 4,
      lastUsed: recipe.lastUsed || null,
      createdAt: recipe.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    saveAll();
  }
}

/**
 * Salva todos os dados no armazenamento local
 * @returns {Promise<void>}
 */
async function saveAll() {
  if (appState.isSaving) {
    console.warn('Já existe uma operação de salvamento em andamento');
    return;
  }

  appState.isSaving = true;
  UI.showLoading('Salvando...');

  try {
    const savePromises = [
      localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(window.inventory)),
      localStorage.setItem(STORAGE_KEYS.RECIPES, JSON.stringify(window.recipes)),
      localStorage.setItem(STORAGE_KEYS.PLAN, JSON.stringify(window.plan))
    ];

    await Promise.all(savePromises);
    appState.lastSaved = new Date();
    
    // Dispara evento de salvamento
    document.dispatchEvent(new CustomEvent(APP_EVENTS.DATA_SAVED, {
      detail: { timestamp: appState.lastSaved }
    }));
  } catch (error) {
    console.error('Erro ao salvar dados:', error);
    document.dispatchEvent(new CustomEvent(APP_EVENTS.ERROR, {
      detail: { 
        message: 'Erro ao salvar dados',
        error 
      }
    }));
    throw error;
  } finally {
    appState.isSaving = false;
    UI.hideLoading();
  }
}

/**
 * Carrega um módulo dinamicamente
 * @param {string} modulePath - Caminho do módulo
 * @param {Function} callback - Função de callback
 */
async function loadModule(modulePath, callback) {
  if (!modulePath || typeof callback !== 'function') {
    throw new Error('Parâmetros inválidos para carregar o módulo');
  }

  UI.showLoading('Carregando...');
  
  try {
    const module = await import(modulePath);
    const result = await callback(module);
    return result;
  } catch (error) {
    console.error(`Erro ao carregar o módulo ${modulePath}:`, error);
    UI.setAlert('Erro ao carregar a funcionalidade', 'error');
    throw error;
  } finally {
    UI.hideLoading();
  }
}

/**
 * Configura os listeners de eventos
 */
function setupEventListeners() {
  // Blocos principais
  const buttons = {
  '#b-inv': './modules/inventory.js',
  '#b-rec': './modules/recipes.js',
  '#b-create': './modules/planning.js',
  '#b-current': './modules/planning.js'
};

  buttonConfigs.forEach(({ selector, module, action }) => {
    const button = qs(selector);
    if (!button) return;

    const handleClick = async () => {
      try {
        await loadModule(module, (mod) => {
          if (typeof mod[action] === 'function') {
            return mod[action]();
          }
          throw new Error(`Ação '${action}' não encontrada no módulo`);
        });
      } catch (error) {
        console.error(`Erro ao executar ${action}:`, error);
      }
    };

    button.addEventListener('click', handleClick);
    
    // Acessibilidade
    button.setAttribute('aria-label', action.replace(/([A-Z])/g, ' $1').trim());
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
  });

  // Navegação por teclado
  document.querySelectorAll('.block').forEach(block => {
    block.addEventListener('keydown', (e) => {
      if (['Enter', ' '].includes(e.key)) {
        e.preventDefault();
        block.click();
      }
    });
    
    // Melhorias de acessibilidade
    block.setAttribute('role', 'button');
    block.setAttribute('tabindex', '0');
    
    // Feedback visual para foco
    const setFocusStyle = (hasFocus) => {
      block.style.outline = hasFocus 
        ? '2px solid var(--accent)' 
        : 'none';
      block.style.outlineOffset = hasFocus ? '2px' : '0';
    };
    
    block.addEventListener('focus', () => setFocusStyle(true));
    block.addEventListener('blur', () => setFocusStyle(false));
    block.addEventListener('mouseenter', () => block.classList.add('hover'));
    block.addEventListener('mouseleave', () => block.classList.remove('hover'));
  });

  // Fechar modal ao clicar fora
  const modalBack = qs('#modalBack');
  if (modalBack) {
    modalBack.addEventListener('click', (e) => {
      if (e.target === modalBack) {
        UI.closeModal();
      }
    });
  }

  // Atalhos de teclado
  document.addEventListener('keydown', (e) => {
    // Fechar modal com ESC
    if (e.key === 'Escape') {
      UI.closeModal();
    }
  });
}

/**
 * Configura o Service Worker
 */
async function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker não suportado');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('./cardapio_sw.js', {
      scope: '/',
      type: 'module'
    });
    
    console.log('Service Worker registrado com sucesso:', registration);
    
    // Atualização do Service Worker
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      console.log('Nova versão do Service Worker encontrada');
      
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('Nova versão disponível! Por favor, atualize a página.');
          UI.showUpdateNotification();
        }
      });
    });
  } catch (error) {
    console.error('Falha ao registrar Service Worker:', error);
  }
}

// Torna funções disponíveis globalmente
Object.assign(window, {
  saveAll,
  loadModule,
  appState: Object.freeze({
    get isInitialized() { return appState.isInitialized; },
    get lastSaved() { return appState.lastSaved; }
  })
});

// Inicializa a verificação de conexão
function setupConnectionMonitor() {
  const updateConnectionStatus = () => {
    const isOnline = navigator.onLine;
    document.documentElement.setAttribute('data-online', isOnline);
    
    if (!isOnline) {
      UI.setAlert('Você está offline. Algumas funcionalidades podem estar limitadas.', 'warn');
    }
  };

  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);
  updateConnectionStatus(); // Verifica o estado inicial
}

// Inicializa o monitor de conexão quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupConnectionMonitor);
} else {
  setupConnectionMonitor();
}
// Importações
import { STORAGE_KEYS } from './config.js';
console.log('📦 Config importado');
import * as UI from './modules/ui.js';
console.log('📦 UI importado');
import { qs, validateJSON } from './modules/utils.js';
console.log('📦 Utils importado');
import { barcodeScanner } from './modules/barcode.js';
console.log('📦 Barcode importado');

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 DOMContentLoaded - Iniciando app...');
  try {
    // Aguardar um pouco para garantir que os módulos estão carregados
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('📦 Módulos carregados, iniciando UI...');

    UI.initUI();
    console.log('🎛️ UI inicializada, configurando listeners...');
    setupEventListeners();
    console.log('👂 Listeners configurados, carregando dados iniciais...');
    loadInitialData();
    console.log('💾 Dados carregados, configurando service worker...');
    setupServiceWorker();
    console.log('✅ App totalmente inicializado!');
  } catch (error) {
    console.error('❌ Erro na inicialização:', error);
    // Mostrar tela de criação como fallback
    console.log('🔄 Fallback: mostrando tela de criação');
    document.querySelectorAll('.wrap').forEach(el => el.style.display = 'none');
    const createScreen = document.getElementById('createScreen');
    if (createScreen) {
      createScreen.style.display = 'block';
      console.log('✅ Tela de criação mostrada como fallback');
    }
  }
});

function groupItemKey(baseKey) {
  const code = String(window.activeGroupCode || 'default').trim().toUpperCase();
  return `${baseKey}_${code}`;
}

function loadInitialData() {
  try {
    // Verificar se há perfil antigo com 'code' em vez de 'groupId'
    const oldProfile = validateJSON(localStorage.getItem(STORAGE_KEYS.USER_PROFILE));
    if (oldProfile && oldProfile.code && !oldProfile.groupId) {
      console.log('Migrando perfil antigo');
      // Migrar perfil antigo
      const newProfile = {
        name: oldProfile.name,
        groupId: oldProfile.code,
        menuName: null,
        isHost: oldProfile.isHost || false
      };
      localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(newProfile));
    }

    const urlParams = new URLSearchParams(window.location.search);
    const groupId = urlParams.get('group');
    console.log('URL params:', groupId);

    if (groupId) {
      // Entrada via link compartilhado
      console.log('Mostrando tela de entrada para grupo:', groupId);
      showJoinScreen(groupId);
    } else {
      // Verificar se já há perfil salvo
      const profile = validateJSON(localStorage.getItem(STORAGE_KEYS.USER_PROFILE));
      if (profile && profile.name && profile.groupId) {
        console.log('Perfil encontrado, carregando app:', profile);
        window.user = profile;
        window.activeGroupCode = profile.groupId;
        showAppScreen(profile);
        loadGroupData();
      } else {
        // Acesso direto - mostrar criação
        console.log('Mostrando tela de criação');
        showCreateScreen();
      }
    }
  } catch (error) {
    console.error('Erro em loadInitialData:', error);
    // Fallback: mostrar criação
    showCreateScreen();
  }
}

function loadGroupData() {
  window.inventory = validateJSON(localStorage.getItem(groupItemKey(STORAGE_KEYS.INVENTORY))) || [];
  window.recipes = validateJSON(localStorage.getItem(groupItemKey(STORAGE_KEYS.RECIPES))) || [];
  window.plan = validateJSON(localStorage.getItem(groupItemKey(STORAGE_KEYS.PLAN))) || [];

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

function saveAll() {
  try {
    localStorage.setItem(groupItemKey(STORAGE_KEYS.INVENTORY), JSON.stringify(window.inventory));
    localStorage.setItem(groupItemKey(STORAGE_KEYS.RECIPES), JSON.stringify(window.recipes));
    localStorage.setItem(groupItemKey(STORAGE_KEYS.PLAN), JSON.stringify(window.plan));
  } catch (e) {
    console.error('Erro ao salvar dados:', e);
    UI.setAlert('Erro ao salvar dados. Verifique o espaço de armazenamento.', 'error', 0);
  }
}

function setUserProfile(name, groupId, menuName = null, isHost = false) {
  if (!name || !groupId) {
    UI.setAlert('Nome e grupo são obrigatórios.', 'warn', 4000);
    return;
  }

  const profile = {
    name: String(name).trim(),
    groupId: String(groupId).trim(),
    menuName: menuName ? String(menuName).trim() : null,
    isHost: !!isHost
  };

  localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
  window.user = profile;
  window.activeGroupCode = groupId;
  showAppScreen(profile);
  loadGroupData();

  UI.setAlert(`Olá ${profile.name}! ${isHost ? 'Cardápio criado' : 'Entrou no cardápio'}.`, 'info', 5000);
}

function showCreateScreen() {
  console.log('Executando showCreateScreen');
  const createScreen = qs('#createScreen');
  const joinScreen = qs('#joinScreen');
  const appScreen = qs('#appScreen');

  if (createScreen) createScreen.style.display = 'block';
  if (joinScreen) joinScreen.style.display = 'none';
  if (appScreen) appScreen.style.display = 'none';

  const logoutBtn = qs('#logoutBtn');
  const userStatus = qs('#userStatus');
  if (logoutBtn) logoutBtn.style.display = 'none';
  if (userStatus) userStatus.textContent = '';

  const createForm = qs('#createForm');
  if (createForm && !createForm.dataset.bound) {
    createForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const menuName = qs('#menuName').value;
      const creatorName = qs('#creatorName').value;
      const groupId = `GRP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      console.log('Criando cardápio:', menuName, creatorName, groupId);
      setUserProfile(creatorName, groupId, menuName, true);
    });
    createForm.dataset.bound = 'true';
  }
}

function showJoinScreen(groupId) {
  console.log('Executando showJoinScreen para grupo:', groupId);
  const createScreen = qs('#createScreen');
  const joinScreen = qs('#joinScreen');
  const appScreen = qs('#appScreen');

  if (createScreen) createScreen.style.display = 'none';
  if (joinScreen) joinScreen.style.display = 'block';
  if (appScreen) appScreen.style.display = 'none';

  const logoutBtn = qs('#logoutBtn');
  const userStatus = qs('#userStatus');
  if (logoutBtn) logoutBtn.style.display = 'none';
  if (userStatus) userStatus.textContent = '';

  const joinMessage = qs('#joinMessage');
  if (joinMessage) {
    joinMessage.textContent = `Você foi convidado para participar do cardápio ${groupId}. Digite seu nome para entrar.`;
  }

  const joinForm = qs('#joinForm');
  if (joinForm && !joinForm.dataset.bound) {
    joinForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = qs('#joinName').value;
      console.log('Entrando no cardápio:', name, groupId);
      setUserProfile(name, groupId, null, false);
    });
    joinForm.dataset.bound = 'true';
  }
}

function showAppScreen(profile) {
  console.log('Executando showAppScreen para perfil:', profile);
  const createScreen = qs('#createScreen');
  const joinScreen = qs('#joinScreen');
  const appScreen = qs('#appScreen');

  if (createScreen) createScreen.style.display = 'none';
  if (joinScreen) joinScreen.style.display = 'none';
  if (appScreen) appScreen.style.display = 'block';

  const status = qs('#userStatus');
  if (status) {
    status.textContent = `Olá, ${profile.name}! ${profile.menuName ? `Cardápio: ${profile.menuName}` : `Grupo: ${profile.groupId}`}`;
  }

  const logoutBtn = qs('#logoutBtn');
  if (logoutBtn) logoutBtn.style.display = 'inline-flex';
}

function handleShare() {
  if (!window.user || !window.user.groupId) {
    UI.setAlert('Erro: perfil não encontrado.', 'error', 4000);
    return;
  }

  const shareUrl = `${window.location.origin}${window.location.pathname}?group=${window.user.groupId}`;
  console.log('Compartilhando URL:', shareUrl);
  if (navigator.share) {
    navigator.share({
      title: 'Mamão com Açúcar',
      text: `Entre no meu cardápio compartilhado: ${window.user.menuName || window.user.groupId}`,
      url: shareUrl
    });
  } else {
    navigator.clipboard.writeText(shareUrl).then(() => {
      UI.setAlert('Link copiado para a área de transferência!', 'info', 3000);
    }).catch(() => {
      UI.setAlert(`Compartilhe este link: ${shareUrl}`, 'info', 10000);
    });
  }
}

function handleLogout() {
  localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
  window.user = null;
  window.activeGroupCode = null;
  window.inventory = [];
  window.recipes = [];
  window.plan = [];
  qs('#userStatus').textContent = '';
  // Limpar URL params
  window.history.replaceState({}, document.title, window.location.pathname);
  loadInitialData();
  UI.setAlert('Sessão encerrada.', 'info', 4000);
}

// Carrega um módulo com tratamento de erro
async function loadModule(modulePath, callback) {
  try {
    const module = await import(modulePath);
    UI.showLoading();
    await callback(module);
  } catch (error) {
    console.error(`Erro ao carregar o módulo ${modulePath}:`, error);
    UI.setAlert('Erro ao carregar a funcionalidade. Tente novamente.', 'error', 0);
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
    '#b-current': './modules/planning.js',
    '#b-shopping': './modules/planning.js'
  };

  Object.entries(buttons).forEach(([selector, modulePath]) => {
    const button = qs(selector);
    if (button) {
      button.addEventListener('click', function handleClick() {
        const action = selector === '#b-current' ? 'showCurrentPlan' :
          selector === '#b-create' ? 'showCreatePlan' :
          selector === '#b-shopping' ? 'showShoppingList' :
            selector === '#b-rec' ? 'showRecipes' : 'showInventory';

        loadModule(modulePath, (module) => {
          if (typeof module[action] === 'function') {
            module[action]();
          }
        });
      });
    }
  });

  // Bloco de compartilhar
  const shareBlock = qs('#b-share');
  if (shareBlock) {
    shareBlock.addEventListener('click', handleShare);
  }

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

  const logoutBtn = qs('#logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
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
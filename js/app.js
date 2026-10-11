// Importações
import { STORAGE_KEYS } from './config.js';
console.log('📦 Config importado');
import * as UI from './modules/ui.js';
console.log('📦 UI importado');
import { qs, validateJSON } from './modules/utils.js';
console.log('📦 Utils importado');
import { barcodeScanner } from './modules/barcode.js';
console.log('📦 Barcode importado');
import { db, auth } from '../firebase-config.js';
import {
  joinGroup, createInvite, removeMember, claimLegacyGroup, claimLegacyGroupWithGoogle,
  logout, authErrorMessage, INVITE_HOURS
} from './modules/groups.js';
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
console.log('📦 Firestore importado');

function persistProfileFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const groupId = urlParams.get('group');
  const userName = urlParams.get('user');

  if (!groupId || !userName) {
    return false;
  }

  const profile = {
    name: String(userName).trim(),
    groupId: String(groupId).trim().toUpperCase(),
    menuName: null,
    isHost: false
  };

  localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
  window.user = profile;
  window.activeGroupCode = profile.groupId;
  console.log('📥 Perfil salvo a partir da URL:', profile);
  return true;
}

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 DOMContentLoaded - Iniciando app...');
  try {
    persistProfileFromUrl();
    console.log('📥 Parâmetros de URL processados antes de iniciar o app');

    // Aguardar um pouco para garantir que os módulos estão carregados
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('📦 Módulos carregados, iniciando UI...');

    UI.initUI();
    console.log('🎛️ UI inicializada, configurando listeners...');
    setupEventListeners();
    console.log('👂 Listeners configurados, carregando dados iniciais...');
    await loadInitialData();
    console.log('💾 Dados carregados, configurando service worker...');
    setupServiceWorker();
    console.log('✅ App totalmente inicializado!');
  } catch (error) {
    console.error('❌ Erro na inicialização:', error);
    console.log('🔄 Fallback: redirecionando para a página de criação');
    const createScreen = document.getElementById('createScreen');
    if (createScreen) {
      document.querySelectorAll('.wrap').forEach(el => el.style.display = 'none');
      createScreen.style.display = 'block';
      console.log('✅ Tela de criação mostrada como fallback');
    } else {
      window.location.replace('create.html');
    }
  }
});

function groupItemKey(baseKey) {
  const code = String(window.activeGroupCode || 'default').trim().toUpperCase();
  return `${baseKey}_${code}`;
}

function normalizeMenuName(name) {
  return String(name || '').trim().toLowerCase();
}

function getGroupMetaStore() {
  return validateJSON(localStorage.getItem(STORAGE_KEYS.GROUP_META)) || {};
}

function saveGroupMetaStore(store) {
  localStorage.setItem(STORAGE_KEYS.GROUP_META, JSON.stringify(store));
}

function getGroupMeta(groupId) {
  const store = getGroupMetaStore();
  return store[String(groupId || '').trim().toUpperCase()] || null;
}

function groupExists(groupId) {
  return !!getGroupMeta(groupId);
}

window.isSyncing = false;
let currentGroupUnsubscribe = null;
let currentGroupWatch = null;

function unsubscribeRealtime() {
  currentGroupWatch = null;
  if (typeof currentGroupUnsubscribe === 'function') {
    currentGroupUnsubscribe();
    currentGroupUnsubscribe = null;
  }
}

function arraysEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function saveAllLocal() {
  try {
    localStorage.setItem(groupItemKey(STORAGE_KEYS.INVENTORY), JSON.stringify(window.inventory || []));
    localStorage.setItem(groupItemKey(STORAGE_KEYS.RECIPES), JSON.stringify(window.recipes || []));
    localStorage.setItem(groupItemKey(STORAGE_KEYS.PLAN), JSON.stringify(window.plan || []));
    localStorage.setItem(groupItemKey(STORAGE_KEYS.SHOPPING_LIST), JSON.stringify(window.shoppingList || []));
  } catch (error) {
    console.error('Erro ao salvar localmente:', error);
  }
}

function updateSidebarDetails(profile) {
  const menuNameEl = qs('#sidebarMenuName');
  if (menuNameEl) {
    menuNameEl.textContent = profile.menuName ? `Cardápio: ${profile.menuName}` : 'Cardápio: —';
  }
}

function renderMembers(groupId, cloudData) {
  const list = qs('#membersList');
  if (!list) return;

  const myUid = auth.currentUser?.uid;
  const ownerUid = cloudData.ownerUid || null;
  const iAmOwner = !!myUid && myUid === ownerUid;
  let members = Object.entries(cloudData.memberNames || {}).map(([uid, name]) => ({ uid, name }));

  // Grupos antigos guardavam só os nomes
  if (!members.length && Array.isArray(cloudData.members)) {
    members = cloudData.members.map(name => ({ uid: null, name }));
  }

  members.sort((a, b) => (b.uid === ownerUid) - (a.uid === ownerUid) || String(a.name).localeCompare(String(b.name)));

  list.innerHTML = '';
  if (!members.length) {
    list.innerHTML = '<li class="members-empty">Ninguém por aqui ainda.</li>';
    return;
  }

  members.forEach(({ uid, name }) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${uid && uid === ownerUid ? '👑 ' : ''}${name || 'Sem nome'}${uid && uid === myUid ? ' (você)' : ''}`;
    li.appendChild(label);

    if (iAmOwner && uid && uid !== myUid) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'member-remove';
      removeBtn.textContent = 'Remover';
      removeBtn.addEventListener('click', () => handleRemoveMember(groupId, uid, name));
      li.appendChild(removeBtn);
    }
    list.appendChild(li);
  });
}

async function handleRemoveMember(groupId, uid, name) {
  const ok = window.confirm(`Remover ${name || 'esta pessoa'} do cardápio?\n\nOs links de convite já enviados vão parar de funcionar. Se precisar, é só mandar um novo.`);
  if (!ok) return;
  try {
    await removeMember(groupId, uid);
    cachedInvite = null;
    UI.setAlert(`${name || 'A pessoa'} foi removida do cardápio.`, 'success', 4000);
  } catch (error) {
    console.error('Erro ao remover membro:', error);
    UI.setAlert(`Não foi possível remover. ${authErrorMessage(error)}`, 'error', 6000);
  }
}

// Criadora de grupo antigo: pede (no máximo uma vez por semana) para cadastrar e-mail e senha
const CLAIM_DISMISS_KEY = 'cc_claim_dismissed_until';
let claimPromptShown = false;

function maybeAskLegacyClaim(groupId, cloudData) {
  if (claimPromptShown || cloudData.ownerUid || !window.user?.isHost || auth.currentUser?.email) return;
  try {
    if (Number(localStorage.getItem(CLAIM_DISMISS_KEY) || 0) > Date.now()) return;
    localStorage.setItem(CLAIM_DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  } catch (error) {
    // sem localStorage: mostra mesmo assim
  }
  claimPromptShown = true;

  UI.openModal('🔒 Proteja seu cardápio', `
    <p>Agora quem cria o cardápio tem e-mail e senha. Assim você nunca perde o acesso, mesmo trocando de celular, e pode remover pessoas do grupo.</p>
    <button type="button" id="claimGoogle" class="btn" style="width:100%;margin:4px 0 12px">Continuar com Google</button>
    <p class="small" style="text-align:center;margin:0 0 12px">ou cadastre e-mail e senha</p>
    <form id="claimForm">
      <label for="claimEmail">Seu e-mail</label>
      <input id="claimEmail" type="email" required autocomplete="email" style="width:100%;margin:4px 0 12px">
      <label for="claimPassword">Crie uma senha (pelo menos 6 caracteres)</label>
      <input id="claimPassword" type="password" minlength="6" required autocomplete="new-password" style="width:100%;margin:4px 0 16px">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="submit" class="btn">Salvar</button>
        <button type="button" id="claimLater" class="btn-ghost">Agora não</button>
      </div>
    </form>
  `);

  qs('#claimLater')?.addEventListener('click', UI.closeModal);
  qs('#claimGoogle')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await claimLegacyGroupWithGoogle(groupId, window.user?.name);
      UI.closeModal();
      UI.setAlert('✅ Pronto! Agora você entra com sua conta Google.', 'success', 5000);
    } catch (error) {
      console.error('Erro ao cadastrar com Google:', error);
      if (!['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error.code)) {
        UI.setAlert(authErrorMessage(error), 'error', 6000);
      }
      button.disabled = false;
    }
  });
  qs('#claimForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await claimLegacyGroup(groupId, qs('#claimEmail').value, qs('#claimPassword').value, window.user?.name);
      UI.closeModal();
      UI.setAlert('✅ Pronto! Agora você entra com seu e-mail e senha.', 'success', 5000);
    } catch (error) {
      console.error('Erro ao cadastrar e-mail:', error);
      UI.setAlert(authErrorMessage(error), 'error', 6000);
      button.disabled = false;
    }
  });
}

function showLostAccess() {
  const list = qs('#membersList');
  if (list) list.innerHTML = '<li class="members-empty">Você não faz mais parte deste grupo.</li>';
  UI.setAlert('Você não faz mais parte deste cardápio. Para voltar, peça um link novo a alguém da família.', 'error', 0);
}

function openMenu() {
  const sidebar = qs('#sidebarMenu');
  const backdrop = qs('#sidebarBackdrop');
  if (sidebar && backdrop) {
    sidebar.classList.add('open');
    sidebar.setAttribute('aria-hidden', 'false');
    backdrop.classList.add('active');
    backdrop.setAttribute('aria-hidden', 'false');
  }
  prepareInvite().catch(error => console.warn('Convite não preparado:', error));
}

function closeMenu() {
  const sidebar = qs('#sidebarMenu');
  const backdrop = qs('#sidebarBackdrop');
  if (sidebar && backdrop) {
    sidebar.classList.remove('open');
    sidebar.setAttribute('aria-hidden', 'true');
    backdrop.classList.remove('active');
    backdrop.setAttribute('aria-hidden', 'true');
  }
}

function toggleMenu() {
  const sidebar = qs('#sidebarMenu');
  if (!sidebar) return;
  if (sidebar.classList.contains('open')) {
    closeMenu();
  } else {
    openMenu();
  }
}

function watchGroupRealtime(groupId) {
  unsubscribeRealtime();
  if (!groupId) {
    return;
  }

  const watchToken = {};
  currentGroupWatch = watchToken;
  joinGroup(groupId, window.user?.name)
    .catch((error) => {
      console.warn('⚠️ Não foi possível registrar este aparelho no grupo:', error);
      if (error.code === 'permission-denied') return 'denied';
    })
    .then((result) => {
  if (currentGroupWatch !== watchToken) return;
  if (result === 'denied') {
    showLostAccess();
    return;
  }
  const groupRef = doc(db, 'grupos', groupId);
  currentGroupUnsubscribe = onSnapshot(groupRef, (snapshot) => {
    if (!snapshot.exists()) {
      return;
    }

    renderMembers(groupId, snapshot.data() || {});
    maybeAskLegacyClaim(groupId, snapshot.data() || {});

    if (window.isSyncing) {
      return;
    }

    window.isSyncing = true;
    try {
      const cloudData = snapshot.data() || {};
      const nextInventory = Array.isArray(cloudData.dispensa) ? cloudData.dispensa : [];
      const nextRecipes = Array.isArray(cloudData.receitas) ? cloudData.receitas : [];
      const nextPlan = Array.isArray(cloudData.cardapio) ? cloudData.cardapio : [];
      const nextShoppingList = Array.isArray(cloudData.shoppingList) ? cloudData.shoppingList : [];

      let changed = false;

      if (!arraysEqual(nextInventory, window.inventory)) {
        window.inventory = nextInventory;
        changed = true;
      }
      if (!arraysEqual(nextRecipes, window.recipes)) {
        window.recipes = nextRecipes;
        changed = true;
      }
      if (!arraysEqual(nextPlan, window.plan)) {
        window.plan = nextPlan;
        changed = true;
      }
      if (!arraysEqual(nextShoppingList, window.shoppingList)) {
        window.shoppingList = nextShoppingList;
        changed = true;
      }

      if (changed) {
        if (qs('#m_invList')) {
          loadModule('./modules/inventory.js', (module) => module.showInventory());
        }
        if (qs('#m_currentPlan')) {
          loadModule('./modules/planning.js', (module) => module.showCurrentPlan());
        }
        console.log('🟢 Dados sincronizados em tempo real para o grupo', groupId);
      }
    } finally {
      window.isSyncing = false;
    }
  }, (error) => {
    console.error('Erro no listener em tempo real:', error);
    if (error.code === 'permission-denied') showLostAccess();
  });
    });
}

function menuNameExists(menuName) {
  const normalized = normalizeMenuName(menuName);
  if (!normalized) return false;
  return Object.values(getGroupMetaStore()).some(meta => normalizeMenuName(meta.menuName) === normalized);
}

function findGroupIdByMenuName(menuName) {
  const normalized = normalizeMenuName(menuName);
  if (!normalized) return null;
  const store = getGroupMetaStore();
  for (const [groupId, meta] of Object.entries(store)) {
    if (meta && normalizeMenuName(meta.menuName) === normalized) {
      return groupId;
    }
  }
  return null;
}

function addGroupMeta(groupId, menuName, creatorName) {
  const store = getGroupMetaStore();
  const key = String(groupId).trim().toUpperCase();
  store[key] = {
    menuName: String(menuName).trim(),
    creatorName: String(creatorName || '').trim(),
    createdAt: new Date().toISOString()
  };
  saveGroupMetaStore(store);
}

async function syncCloudGroupData() {
  const groupId = String(window.activeGroupCode || window.user?.groupId || '').trim().toUpperCase();
  if (!groupId) {
    console.warn('syncCloudGroupData: nenhum groupId disponível para sincronizar');
    return;
  }

  try {
    await joinGroup(groupId, window.user?.name);
    const groupRef = doc(db, 'grupos', groupId);
    await updateDoc(groupRef, {
      dispensa: window.inventory || [],
      receitas: window.recipes || [],
      cardapio: window.plan || [],
      shoppingList: window.shoppingList || []
    });
    console.log('✅ Firestore sincronizado para grupo', groupId);
  } catch (error) {
    console.error('❌ Falha ao sincronizar com o Firestore:', error);
  }
}

async function fetchCloudGroupData(groupId) {
  try {
    await joinGroup(groupId, window.user?.name);
    const groupRef = doc(db, 'grupos', groupId);
    const snapshot = await getDoc(groupRef);

    if (!snapshot.exists()) {
      console.warn('⚠️ Documento Firestore não encontrado para grupo', groupId);
      return null;
    }

    const cloudData = snapshot.data();

    if (cloudData.menuName || cloudData.creatorName) {
      const store = getGroupMetaStore();
      store[groupId] = {
        menuName: cloudData.menuName || '',
        creatorName: cloudData.creatorName || '',
        createdAt: cloudData.createdAt || new Date().toISOString()
      };
      saveGroupMetaStore(store);
      if (window.user && window.user.groupId === groupId && !window.user.menuName && cloudData.menuName) {
        window.user.menuName = cloudData.menuName;
        localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(window.user));
      }
    }

    window.inventory = Array.isArray(cloudData.dispensa) ? cloudData.dispensa : window.inventory;
    window.recipes = Array.isArray(cloudData.receitas) ? cloudData.receitas : window.recipes;
    window.plan = Array.isArray(cloudData.cardapio) ? cloudData.cardapio : window.plan;
    window.shoppingList = Array.isArray(cloudData.shoppingList) ? cloudData.shoppingList : window.shoppingList;

    saveAll();
    console.log('✅ Dados do Firestore carregados e armazenados localmente');
    return cloudData;
  } catch (error) {
    console.error('❌ Erro ao carregar dados do Firestore:', error);
    return null;
  }
}

async function renderInitialAppView() {
  try {
    if (window.inventory.length > 0) {
      await loadModule('./modules/inventory.js', (module) => module.showInventory());
      return;
    }
    if (window.recipes.length > 0) {
      await loadModule('./modules/recipes.js', (module) => module.showRecipes());
      return;
    }
    if (window.plan.length > 0) {
      await loadModule('./modules/planning.js', (module) => module.showCurrentPlan());
      return;
    }
  } catch (error) {
    console.warn('⚠️ Não foi possível renderizar visão inicial automática:', error);
  }
}

async function loadGroupData() {
  window.inventory = validateJSON(localStorage.getItem(groupItemKey(STORAGE_KEYS.INVENTORY))) || [];
  window.recipes = validateJSON(localStorage.getItem(groupItemKey(STORAGE_KEYS.RECIPES))) || [];
  window.plan = validateJSON(localStorage.getItem(groupItemKey(STORAGE_KEYS.PLAN))) || [];
  window.shoppingList = validateJSON(localStorage.getItem(groupItemKey(STORAGE_KEYS.SHOPPING_LIST))) || [];

  // Migração de versão (se necessário)
  if (window.recipes.length > 0) {
    window.recipes = window.recipes.map(r => ({
      ...r,
      frequency: r.frequency || r.priority || 1,
      servings: r.servings || 4
    }));
    saveAll();
  }

  const groupId = String(window.activeGroupCode || window.user?.groupId || '').trim().toUpperCase();
  if (!groupId) {
    console.warn('loadGroupData: nenhum groupId disponível para carregar Firestore');
    return;
  }

  const groupMeta = getGroupMeta(groupId);
  const shouldFetchCloud = (!window.inventory.length && !window.recipes.length && !window.plan.length) || !groupMeta || !window.user?.menuName;

  if (shouldFetchCloud) {
    console.log('🔌 Forçando carregamento do Firestore para grupo', groupId);
    const cloudData = await fetchCloudGroupData(groupId);
    if (cloudData) {
      await renderInitialAppView();
    }
    return;
  }

  console.log('ℹ️ Dados locais encontrados, não foi necessário carregar Firestore automaticamente para este grupo');
}

async function loadInitialData() {
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
    const userName = urlParams.get('user');
    console.log('URL params:', { group: groupId, user: userName });

    const profile = validateJSON(localStorage.getItem(STORAGE_KEYS.USER_PROFILE));
    console.log('USER_PROFILE lido do localStorage:', localStorage.getItem(STORAGE_KEYS.USER_PROFILE));
    if (profile && profile.name && profile.groupId) {
      console.log('Perfil encontrado, carregando app:', profile);
      window.user = profile;
      window.activeGroupCode = profile.groupId;
      showAppScreen(profile);
      loadGroupData().catch(error => console.error('loadGroupData error:', error));
      return;
    }

    if (groupId) {
      const normalizedGroupId = String(groupId).trim().toUpperCase();
      if (!groupExists(normalizedGroupId)) {
        UI.setAlert('Grupo de cardápio inválido ou inexistente.', 'error', 0);
        window.location.replace('create.html');
        return;
      }

      if (userName) {
        const name = String(userName).trim();
        if (name) {
          const meta = getGroupMeta(normalizedGroupId);
          if (meta) {
            setUserProfile(name, normalizedGroupId, meta.menuName, false);
            window.history.replaceState({}, document.title, window.location.pathname + `?group=${normalizedGroupId}`);
            return;
          }
        }
      }

      window.location.replace(`join.html?group=${encodeURIComponent(normalizedGroupId)}`);
      return;
    }

    console.log('Sem perfil local, redirecionando para create.html');
    window.location.replace('create.html');
  } catch (error) {
    console.error('Erro em loadInitialData:', error);
    window.location.replace('create.html');
  }
}

function saveAll() {
  try {
    localStorage.setItem(groupItemKey(STORAGE_KEYS.INVENTORY), JSON.stringify(window.inventory));
    localStorage.setItem(groupItemKey(STORAGE_KEYS.RECIPES), JSON.stringify(window.recipes));
    localStorage.setItem(groupItemKey(STORAGE_KEYS.PLAN), JSON.stringify(window.plan));
    localStorage.setItem(groupItemKey(STORAGE_KEYS.SHOPPING_LIST), JSON.stringify(window.shoppingList || []));

    // Sincroniza com Firestore de forma assíncrona para não bloquear a UI
    syncCloudGroupData();
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
  loadGroupData().catch(error => console.error('loadGroupData error:', error));

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
      const menuName = qs('#menuName').value.trim();
      const creatorName = qs('#creatorName').value.trim();

      if (!menuName || !creatorName) {
        UI.setAlert('Preencha o nome do cardápio e o seu nome.', 'warn', 4000);
        return;
      }

      if (menuNameExists(menuName)) {
        UI.setAlert('Esse nome de cardápio já está em uso. Escolha outro.', 'error', 0);
        return;
      }

      const groupId = `GRP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      console.log('Criando cardápio:', menuName, creatorName, groupId);
      addGroupMeta(groupId, menuName, creatorName);
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
      const name = qs('#joinName').value.trim();
      const meta = getGroupMeta(groupId);

      if (!name) {
        UI.setAlert('Digite seu nome para entrar no cardápio.', 'warn', 4000);
        return;
      }

      if (!meta) {
        UI.setAlert('Código inválido. Não foi possível entrar no cardápio.', 'error', 0);
        return;
      }

      console.log('Entrando no cardápio:', name, groupId);
      setUserProfile(name, groupId, meta.menuName, false);
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

  updateSidebarDetails(profile);
  closeMenu();

  const logoutBtn = qs('#logoutBtn');
  if (logoutBtn) logoutBtn.style.display = 'inline-flex';

  watchGroupRealtime(profile.groupId);
}

// Link de convite com validade de 24h. É preparado ao abrir o menu, para o
// WhatsApp abrir na hora do toque (alguns celulares bloqueiam janelas abertas com atraso).
let cachedInvite = null;
let invitePromise = null;

function freshInvite() {
  const groupId = window.user?.groupId;
  if (cachedInvite && cachedInvite.groupId === groupId && cachedInvite.expiresAt - Date.now() > 60 * 60 * 1000) {
    return cachedInvite;
  }
  return null;
}

function prepareInvite() {
  const groupId = window.user?.groupId;
  if (!groupId) return Promise.resolve(null);
  if (freshInvite()) return Promise.resolve(cachedInvite);
  if (!invitePromise) {
    invitePromise = createInvite(groupId, window.user.menuName || '')
      .then(({ inviteId, expiresAt }) => {
        const link = new URL(`join.html?convite=${inviteId}`, window.location.href).href;
        cachedInvite = { groupId, expiresAt, link };
        return cachedInvite;
      })
      .finally(() => { invitePromise = null; });
  }
  return invitePromise;
}

async function handleShare() {
  if (!window.user || !window.user.groupId) {
    UI.setAlert('Erro: perfil não encontrado.', 'error', 4000);
    return;
  }

  let invite = freshInvite();
  if (!invite) {
    UI.showLoading();
    try {
      invite = await prepareInvite();
    } catch (error) {
      console.error('Erro ao criar convite:', error);
      UI.setAlert(`Não foi possível criar o convite. ${authErrorMessage(error)}`, 'error', 6000);
      return;
    } finally {
      UI.hideLoading();
    }
  }

  const menuName = window.user.menuName || 'Cardápio';
  const message = `🍽️ Convite para o Cardápio "${menuName}"\n\nOlá! Você foi convidado para planejar o cardápio junto.\n\nToque no link para entrar (vale por ${INVITE_HOURS} horas):\n${invite.link}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  const opened = window.open(whatsappUrl, '_blank');
  if (opened) return;

  // Se o celular bloqueou a janela, oferece compartilhar ou copiar
  if (navigator.share) {
    navigator.share({ title: 'Mamão com Açúcar', text: message }).catch(() => {});
    return;
  }
  navigator.clipboard.writeText(message).then(() => {
    UI.setAlert('✅ Convite copiado! Cole no WhatsApp para convidar sua família.', 'success', 4000);
  }).catch(() => {
    UI.setAlert(`Compartilhe este link: ${invite.link}`, 'info', 10000);
  });
}

async function handleLogout() {
  unsubscribeRealtime();
  cachedInvite = null;
  await logout().catch(error => console.warn('Erro ao sair do Firebase:', error));
  localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
  window.user = null;
  window.activeGroupCode = null;
  window.inventory = [];
  window.recipes = [];
  window.plan = [];
  window.shoppingList = [];
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

  // Botão de compartilhar específico
  const shareBtn = qs('#shareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleShare();
    });
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

  const menuToggle = qs('#menuToggle');
  const sidebarBackdrop = qs('#sidebarBackdrop');

  if (menuToggle) {
    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', closeMenu);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenu();
    }
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
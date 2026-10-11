import { STORAGE_KEYS } from './config.js';
import { qs, validateJSON } from './modules/utils.js';
import {
    currentUser, ensureCreatorAccount, googleCreatorAccount, createGroup,
    loginCreator, loginCreatorWithGoogle, resetPassword, authErrorMessage
} from './modules/groups.js';

/**
 * Mostra um alerta simples (fallback se UI não estiver disponível)
 */
function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 14px 20px;
        background: ${type === 'error' ? '#ff6b6b' : type === 'success' ? '#51cf66' : '#ffd700'};
        color: white;
        border-radius: 8px;
        font-weight: 600;
        font-size: 14px;
        z-index: 9999;
        max-width: 90%;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        animation: slideDown 0.3s ease;
    `;

    const style = document.createElement('style');
    if (!document.querySelector('style[data-alert-animation]')) {
        style.setAttribute('data-alert-animation', '');
        style.textContent = `
            @keyframes slideDown {
                from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
                to { transform: translateX(-50%) translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    alertDiv.textContent = message;
    document.body.appendChild(alertDiv);

    setTimeout(() => alertDiv.remove(), type === 'error' ? 5000 : 3000);
}

function normalize(text) {
    return String(text || '').trim().toLowerCase();
}

function getGroupMetaStore() {
    return validateJSON(localStorage.getItem(STORAGE_KEYS.GROUP_META)) || {};
}

function saveGroupMetaStore(store) {
    localStorage.setItem(STORAGE_KEYS.GROUP_META, JSON.stringify(store));
}

function menuNameExists(menuName) {
    const normalized = normalize(menuName);
    if (!normalized) return false;
    return Object.values(getGroupMetaStore()).some(meta => normalize(meta.menuName) === normalized);
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

function saveProfileAndOpenApp(name, groupId, menuName) {
    addGroupMeta(groupId, menuName, name);
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify({
        name,
        groupId,
        menuName,
        isHost: true
    }));
    setTimeout(() => {
        window.location.replace('cardapio_casa_pwa.html');
    }, 800);
}

function setBusy(form, busy) {
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = busy;
}

async function handleCreateSubmit(event) {
    event.preventDefault();
    const form = event.target;

    const menuName = qs('#menuName').value.trim();
    const creatorName = qs('#creatorName').value.trim();
    const email = qs('#creatorEmail').value.trim();
    const password = qs('#creatorPassword').value;
    const needsAccount = !qs('#accountFields').hidden;

    if (!menuName || !creatorName) {
        showAlert('Preencha o nome do cardápio e o seu nome.', 'error');
        return;
    }

    if (needsAccount && (!email || !password)) {
        showAlert('Preencha seu e-mail e crie uma senha.', 'error');
        return;
    }

    if (menuNameExists(menuName)) {
        showAlert('Esse nome de cardápio já está em uso. Escolha outro.', 'error');
        return;
    }

    setBusy(form, true);
    try {
        if (needsAccount) {
            await ensureCreatorAccount(email, password);
        }
        const groupId = await createGroup(menuName, creatorName);
        console.log('✅ Cardápio criado:', groupId);
        showAlert('✨ Cardápio criado com sucesso! Redirecionando...', 'success');
        saveProfileAndOpenApp(creatorName, groupId, menuName);
    } catch (error) {
        console.error('❌ Erro ao criar grupo:', error);
        showAlert(authErrorMessage(error), 'error');
        setBusy(form, false);
    }
}

// Ignora quando a pessoa só fechou a janela do Google
function isPopupCancel(error) {
    return ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error && error.code);
}

async function handleCreateWithGoogle(event) {
    const button = event.currentTarget;
    const menuName = qs('#menuName').value.trim();
    const typedName = qs('#creatorName').value.trim();

    if (!menuName) {
        showAlert('Primeiro dê um nome ao cardápio.', 'error');
        qs('#menuName').focus();
        return;
    }

    if (menuNameExists(menuName)) {
        showAlert('Esse nome de cardápio já está em uso. Escolha outro.', 'error');
        return;
    }

    button.disabled = true;
    try {
        const user = await googleCreatorAccount();
        const creatorName = typedName || (user.displayName || '').split(' ')[0] || 'Eu';
        const groupId = await createGroup(menuName, creatorName);
        console.log('✅ Cardápio criado com Google:', groupId);
        showAlert('✨ Cardápio criado com sucesso! Redirecionando...', 'success');
        saveProfileAndOpenApp(creatorName, groupId, menuName);
    } catch (error) {
        console.error('❌ Erro ao criar com Google:', error);
        if (!isPopupCancel(error)) showAlert(authErrorMessage(error), 'error');
        button.disabled = false;
    }
}

async function handleLoginWithGoogle(event) {
    const button = event.currentTarget;
    button.disabled = true;
    try {
        const group = await loginCreatorWithGoogle();
        if (!group) {
            showAlert('Não achamos cardápio nesta conta. Você pode criar um agora.', 'info');
            showCard('create');
            await updateAccountFields();
            button.disabled = false;
            return;
        }
        showAlert(`Bem-vinda de volta ao "${group.menuName}"!`, 'success');
        saveProfileAndOpenApp(group.name, group.groupId, group.menuName);
    } catch (error) {
        console.error('❌ Erro ao entrar com Google:', error);
        if (!isPopupCancel(error)) showAlert(authErrorMessage(error), 'error');
        button.disabled = false;
    }
}

async function handleLoginSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const email = qs('#loginEmail').value.trim();
    const password = qs('#loginPassword').value;

    setBusy(form, true);
    try {
        const group = await loginCreator(email, password);
        if (!group) {
            showAlert('Não achamos cardápio nesta conta. Você pode criar um agora.', 'info');
            showCard('create');
            await updateAccountFields();
            setBusy(form, false);
            return;
        }
        showAlert(`Bem-vinda de volta ao "${group.menuName}"!`, 'success');
        saveProfileAndOpenApp(group.name, group.groupId, group.menuName);
    } catch (error) {
        console.error('❌ Erro ao entrar:', error);
        showAlert(authErrorMessage(error), 'error');
        setBusy(form, false);
    }
}

async function handleForgotPassword() {
    const email = qs('#loginEmail').value.trim();
    if (!email) {
        showAlert('Digite seu e-mail acima e toque de novo em "Esqueci minha senha".', 'info');
        qs('#loginEmail').focus();
        return;
    }
    try {
        await resetPassword(email);
        showAlert('Enviamos um e-mail para você criar uma senha nova. Confira também o spam.', 'success');
    } catch (error) {
        console.error('❌ Erro ao enviar e-mail de senha:', error);
        showAlert(authErrorMessage(error), 'error');
    }
}

function showCard(which) {
    qs('#createCard').hidden = which !== 'create';
    qs('#loginCard').hidden = which !== 'login';
}

// Se este aparelho já entrou com e-mail, não pede de novo
async function updateAccountFields() {
    try {
        const user = await currentUser();
        const hasAccount = !!(user && user.email);
        qs('#accountFields').hidden = hasAccount;
        const info = qs('#accountInfo');
        info.hidden = !hasAccount;
        if (hasAccount) info.textContent = `Criando com a conta ${user.email}`;
    } catch (error) {
        console.error('Erro ao verificar conta:', error);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    qs('#createForm').addEventListener('submit', handleCreateSubmit);
    qs('#loginForm').addEventListener('submit', handleLoginSubmit);
    qs('#forgotPasswordBtn').addEventListener('click', handleForgotPassword);
    qs('#createGoogleBtn').addEventListener('click', handleCreateWithGoogle);
    qs('#loginGoogleBtn').addEventListener('click', handleLoginWithGoogle);
    qs('#showLoginBtn').addEventListener('click', () => showCard('login'));
    qs('#showCreateBtn').addEventListener('click', () => showCard('create'));

    if (window.location.hash === '#entrar') showCard('login');
    updateAccountFields();
});

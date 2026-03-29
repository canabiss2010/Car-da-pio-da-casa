import { STORAGE_KEYS } from './config.js';
import * as UI from './modules/ui.js';
import { qs, validateJSON } from './modules/utils.js';

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

function generateGroupId() {
    return `GRP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

window.addEventListener('DOMContentLoaded', () => {
    const form = qs('#createForm');
    if (!form) return;

    form.addEventListener('submit', (event) => {
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

        const groupId = generateGroupId();
        addGroupMeta(groupId, menuName, creatorName);

        const profile = {
            name: creatorName,
            groupId,
            menuName,
            isHost: true
        };

        localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
        console.log('Perfil criado e salvo no localStorage:', profile);
        console.log('USER_PROFILE no storage:', localStorage.getItem(STORAGE_KEYS.USER_PROFILE));
        window.location.replace('cardapio_casa_pwa.html');
    });
});

import { STORAGE_KEYS } from './config.js';
import { qs, validateJSON } from './modules/utils.js';

function normalize(text) {
    return String(text || '').trim().toLowerCase();
}

function findGroupIdByMenuName(menuName) {
    const normalized = normalize(menuName);
    if (!normalized) return null;
    const stored = validateJSON(localStorage.getItem(STORAGE_KEYS.GROUP_META)) || {};
    for (const [groupId, meta] of Object.entries(stored)) {
        if (meta && normalize(meta.menuName) === normalized) {
            return groupId;
        }
    }
    return null;
}

function setNotice(text, isError = true) {
    const notice = qs('#joinNotice');
    if (!notice) return;
    notice.textContent = text;
    notice.style.color = isError ? '#b47c00' : '#1f6f3b';
}

window.addEventListener('DOMContentLoaded', () => {
    const form = qs('#joinExistingForm');
    if (!form) return;

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const menuName = qs('#existingMenuName').value.trim();
        const userName = qs('#existingUserName').value.trim();

        if (!menuName || !userName) {
            setNotice('Preencha o nome do cardápio e o seu nome.', true);
            return;
        }

        const groupId = findGroupIdByMenuName(menuName);
        if (!groupId) {
            setNotice('Nome de cardápio não encontrado. Verifique e tente novamente.', true);
            return;
        }

        const target = `cardapio_casa_pwa.html?group=${encodeURIComponent(groupId)}&user=${encodeURIComponent(userName)}`;
        window.location.href = target;
    });
});

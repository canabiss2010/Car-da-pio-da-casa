import { STORAGE_KEYS } from './config.js';
import { qs, validateJSON } from './modules/utils.js';

function normalize(text) {
    return String(text || '').trim().toLowerCase();
}

function getGroupMetaStore() {
    return validateJSON(localStorage.getItem(STORAGE_KEYS.GROUP_META)) || {};
}

function getGroupMeta(groupId) {
    const store = getGroupMetaStore();
    return store[String(groupId || '').trim().toUpperCase()] || null;
}

function findGroupIdByMenuName(menuName) {
    const normalized = normalize(menuName);
    if (!normalized) return null;
    const stored = getGroupMetaStore();
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

    const urlParams = new URLSearchParams(window.location.search);
    const groupIdParam = urlParams.get('group');
    let inviteGroupId = null;

    if (groupIdParam) {
        const normalizedGroupId = String(groupIdParam).trim().toUpperCase();
        const meta = getGroupMeta(normalizedGroupId);
        if (meta) {
            inviteGroupId = normalizedGroupId;
            const groupNameSection = qs('#groupNameSection');
            if (groupNameSection) {
                groupNameSection.style.display = 'none';
            }
            const existingMenuName = qs('#existingMenuName');
            if (existingMenuName) {
                existingMenuName.required = false;
            }
            const joinMessage = qs('#joinMessage');
            if (joinMessage) {
                joinMessage.textContent = `Você foi convidado para participar do cardápio ${meta.menuName}. Digite seu nome para entrar.`;
            }
        } else {
            setNotice('Link de convite inválido. Digite o nome do cardápio ou crie um novo cardápio.', true);
        }
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const menuName = qs('#existingMenuName') ? qs('#existingMenuName').value.trim() : '';
        const userName = qs('#existingUserName').value.trim();

        if (!userName) {
            setNotice('Preencha o seu nome.', true);
            return;
        }

        let groupId = inviteGroupId;
        if (!groupId) {
            if (!menuName) {
                setNotice('Preencha o nome do cardápio e o seu nome.', true);
                return;
            }

            groupId = findGroupIdByMenuName(menuName);
            if (!groupId) {
                setNotice('Nome de cardápio não encontrado. Verifique e tente novamente.', true);
                return;
            }
        }

        const target = `cardapio_casa_pwa.html?group=${encodeURIComponent(groupId)}&user=${encodeURIComponent(userName)}`;
        window.location.href = target;
    });
});

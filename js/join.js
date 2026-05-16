import { STORAGE_KEYS } from './config.js';
import { qs, validateJSON } from './modules/utils.js';
import { db } from '../firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

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

/**
 * Busca o grupo no Firestore pelo código de acesso
 */
async function fetchGroupFromFirestore(accessKey) {
    try {
        const groupRef = doc(db, 'grupos', String(accessKey).trim().toUpperCase());
        const docSnap = await getDoc(groupRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            return {
                accessKey: data.accessKey,
                menuName: data.menuName,
                creatorName: data.creatorName,
                createdAt: data.createdAt
            };
        }
        return null;
    } catch (error) {
        console.error('Erro ao buscar grupo no Firestore:', error);
        return null;
    }
}

function setNotice(text, isError = true) {
    const notice = qs('#joinNotice');
    if (!notice) return;
    notice.textContent = text;
    notice.style.backgroundColor = isError ? '#ffe6e6' : '#e6f7e6';
    notice.style.color = isError ? '#d32f2f' : '#1f6f3b';
    notice.style.borderLeft = `4px solid ${isError ? '#d32f2f' : '#1f6f3b'}`;
    notice.classList.add('visible');
}

window.addEventListener('DOMContentLoaded', async () => {
    const form = qs('#joinExistingForm');
    if (!form) return;

    const urlParams = new URLSearchParams(window.location.search);
    // Verifica se veio via parâmetro 'codigo' (link de compartilhamento) ou 'group' (compatibilidade)
    const codigoParam = urlParams.get('codigo');
    const groupIdParam = urlParams.get('group');
    const accessKeyParam = codigoParam || groupIdParam;

    let inviteGroupId = null;
    let inviteGroupMeta = null;

    if (accessKeyParam) {
        const normalizedAccessKey = String(accessKeyParam).trim().toUpperCase();

        // Primeiro tenta buscar localmente
        let meta = getGroupMeta(normalizedAccessKey);

        // Se não encontrar localmente, tenta buscar no Firestore
        if (!meta) {
            try {
                meta = await fetchGroupFromFirestore(normalizedAccessKey);
                // Se achou no Firestore, salva localmente para próximos usos
                if (meta) {
                    const store = getGroupMetaStore();
                    store[normalizedAccessKey] = {
                        menuName: meta.menuName,
                        creatorName: meta.creatorName,
                        createdAt: meta.createdAt
                    };
                    localStorage.setItem(STORAGE_KEYS.GROUP_META, JSON.stringify(store));
                }
            } catch (error) {
                console.error('Erro ao verificar acesso:', error);
            }
        }

        if (meta) {
            inviteGroupId = normalizedAccessKey;
            inviteGroupMeta = meta;
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
                joinMessage.textContent = `Você foi convidado para participar do cardápio "${meta.menuName}". Digite seu nome para entrar.`;
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

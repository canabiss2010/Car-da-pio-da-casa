import { STORAGE_KEYS } from './config.js';
import { qs, validateJSON } from './modules/utils.js';
import { getInvite, acceptInvite, authErrorMessage } from './modules/groups.js';

function setNotice(text, isError = true) {
    const notice = qs('#joinNotice');
    if (!notice) return;
    notice.textContent = text;
    notice.style.backgroundColor = isError ? '#ffe6e6' : '#e6f7e6';
    notice.style.color = isError ? '#d32f2f' : '#1f6f3b';
    notice.style.borderLeft = `4px solid ${isError ? '#d32f2f' : '#1f6f3b'}`;
    notice.classList.add('visible');
}

function setMessage(text) {
    const joinMessage = qs('#joinMessage');
    if (joinMessage) joinMessage.textContent = text;
}

function saveProfile(name, groupId, menuName) {
    const store = validateJSON(localStorage.getItem(STORAGE_KEYS.GROUP_META)) || {};
    store[groupId] = {
        menuName,
        creatorName: store[groupId]?.creatorName || '',
        createdAt: store[groupId]?.createdAt || new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEYS.GROUP_META, JSON.stringify(store));
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify({
        name,
        groupId,
        menuName,
        isHost: false
    }));
}

window.addEventListener('DOMContentLoaded', async () => {
    const form = qs('#joinForm');
    const inviteId = new URLSearchParams(window.location.search).get('convite');

    // Só se entra num grupo pelo link de convite (os códigos antigos de 4 letras não valem mais)
    if (!inviteId) {
        setMessage('Para entrar no cardápio da sua família, peça para alguém do grupo mandar o link de convite pelo WhatsApp.');
        return;
    }

    let invite = null;
    try {
        invite = await getInvite(inviteId);
    } catch (error) {
        console.error('Erro ao buscar convite:', error);
        setMessage('Não foi possível abrir o convite.');
        setNotice(authErrorMessage(error));
        return;
    }

    if (!invite) {
        setMessage('Este link de convite não é válido.');
        setNotice('Peça um link novo para alguém da família.');
        return;
    }

    if (invite.expired) {
        setMessage(`O convite para o cardápio "${invite.menuName}" expirou.`);
        setNotice('Os links valem por 24 horas. Peça um link novo para alguém da família.');
        return;
    }

    setMessage(`Você foi convidado para o cardápio "${invite.menuName}". Digite seu nome para entrar.`);
    form.hidden = false;
    qs('#joinUserName').focus();

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const userName = qs('#joinUserName').value.trim();
        if (!userName) {
            setNotice('Preencha o seu nome.');
            return;
        }

        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            await acceptInvite(inviteId, invite.groupId, userName);
        } catch (error) {
            console.error('Erro ao entrar no grupo:', error);
            setNotice(error.code === 'permission-denied'
                ? 'Este convite não vale mais. Peça um link novo para alguém da família.'
                : authErrorMessage(error));
            button.disabled = false;
            return;
        }

        saveProfile(userName, invite.groupId, invite.menuName);
        window.location.replace('cardapio_casa_pwa.html');
    });
});

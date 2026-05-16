import { STORAGE_KEYS } from './config.js';
import * as UI from './modules/ui.js';
import { qs, validateJSON } from './modules/utils.js';
import { db } from '../firebase-config.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

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

/**
 * Gera uma chave de acesso aleatória no formato: XXXX-YYYY
 * Exemplo: CASA-A42K
 */
function generateAccessKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    for (let i = 0; i < 4; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

/**
 * Salva o grupo no Firestore com a chave como ID do documento
 */
async function saveGroupToFirestore(accessKey, menuName, creatorName) {
    try {
        const groupRef = doc(db, 'grupos', accessKey);
        await setDoc(groupRef, {
            accessKey,
            menuName: String(menuName).trim(),
            creatorName: String(creatorName).trim(),
            createdAt: new Date().toISOString(),
            members: [creatorName],
            data: {}
        });
        console.log('Grupo salvo no Firestore com chave:', accessKey);
    } catch (error) {
        console.error('Erro ao salvar grupo no Firestore:', error);
        throw error;
    }
}

/**
 * Gera o link de compartilhamento para WhatsApp
 */
function generateShareLink(accessKey) {
    const baseUrl = window.location.origin + window.location.pathname.replace('create.html', 'join.html');
    return `${baseUrl}?codigo=${accessKey}`;
}

/**
 * Gera a mensagem de compartilhamento para WhatsApp
 */
function generateWhatsAppMessage(menuName, accessKey, shareLink) {
    const message = `🍽️ Convite para o Cardápio "${menuName}"\n\nOlá! Você foi convidado para compartilhar o planejamento de cardápio.\n\nCódigo de acesso: ${accessKey}\nOu clique aqui: ${shareLink}`;
    return encodeURIComponent(message);
}

/**
 * Cria a URL para compartilhar via WhatsApp
 */
function generateWhatsAppShareUrl(menuName, accessKey, shareLink) {
    const message = generateWhatsAppMessage(menuName, accessKey, shareLink);
    return `https://wa.me/?text=${message}`;
}

window.addEventListener('DOMContentLoaded', () => {
    const form = qs('#createForm');
    if (!form) {
        console.error('❌ Formulário não encontrado!');
        showAlert('Erro: Formulário não carregou corretamente', 'error');
        return;
    }

    console.log('✅ Formulário encontrado, vinculando eventos...');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        console.log('📋 Submit acionado');

        const menuNameInput = qs('#menuName');
        const creatorNameInput = qs('#creatorName');

        if (!menuNameInput || !creatorNameInput) {
            console.error('❌ Inputs não encontrados');
            showAlert('Erro: Campos de entrada não encontrados', 'error');
            return;
        }

        const menuName = menuNameInput.value.trim();
        const creatorName = creatorNameInput.value.trim();

        console.log('Dados:', { menuName, creatorName });

        if (!menuName || !creatorName) {
            showAlert('Preencha o nome do cardápio e o seu nome.', 'error');
            return;
        }

        if (menuNameExists(menuName)) {
            showAlert('Esse nome de cardápio já está em uso. Escolha outro.', 'error');
            return;
        }

        try {
            console.log('🔄 Gerando chave de acesso...');
            // Gera a chave de acesso
            const accessKey = generateAccessKey();
            console.log('🔑 Chave gerada:', accessKey);
            
            console.log('💾 Salvando no Firestore...');
            // Salva no Firestore
            await saveGroupToFirestore(accessKey, menuName, creatorName);
            console.log('✅ Salvo no Firestore!');

            // Salva no localStorage para backup local
            addGroupMeta(accessKey, menuName, creatorName);
            console.log('✅ Salvo no localStorage!');

            // Cria o perfil do usuário
            const profile = {
                name: creatorName,
                groupId: accessKey,
                menuName,
                isHost: true
            };

            localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
            
            // Gera o link de compartilhamento
            const shareLink = generateShareLink(accessKey);
            
            console.log('✅ Grupo criado com sucesso!');
            console.log('Chave de acesso:', accessKey);
            console.log('Link de compartilhamento:', shareLink);
            console.log('Perfil criado:', profile);

            // Armazena o link para uso posterior (compartilhamento)
            sessionStorage.setItem('currentShareLink', shareLink);
            sessionStorage.setItem('currentMenuName', menuName);
            sessionStorage.setItem('currentAccessKey', accessKey);

            showAlert('✨ Cardápio criado com sucesso! Redirecionando...', 'success');

            // Redireciona para a tela principal após um pequeno delay
            setTimeout(() => {
                window.location.replace('cardapio_casa_pwa.html');
            }, 800);
        } catch (error) {
            console.error('❌ Erro ao criar grupo:', error);
            showAlert(`Erro ao criar o cardápio: ${error.message}`, 'error');
        }
    });
});

/**
 * Exports para uso em outras páginas
 * Exemplo de uso em app.js:
 * import { generateShareLink, generateWhatsAppShareUrl } from './create.js';
 */
export {
    generateAccessKey,
    generateShareLink,
    generateWhatsAppMessage,
    generateWhatsAppShareUrl,
    saveGroupToFirestore
};


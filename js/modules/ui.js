import { qs } from './utils.js';

let modalBack, modalContent, alertsEl, loadingElement;

export function initUI() {
  modalBack = qs('#modalBack');
  modalContent = qs('#modalContent');
  alertsEl = qs('#alerts');
}

export function openModal(title, contentHTML) {
  if (!modalBack || !modalContent) initUI();

  closeModal();

  modalContent.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h2 style="margin:0">${title}</h2>
      <button id="closeModal" class="btn-ghost">Fechar</button>
    </div>
    <div style="margin-top:12px">${contentHTML}</div>
  `;

  modalBack.style.display = 'flex';
  qs('#closeModal')?.addEventListener('click', closeModal);
}

export function closeModal() {
  if (modalBack) modalBack.style.display = 'none';
  if (modalContent) modalContent.innerHTML = '';
}

const alertPlaceholderText = 'Você não tem novos avisos.';

function showAlertPlaceholder() {
  if (!alertsEl) initUI();
  alertsEl.textContent = alertPlaceholderText;
}

function clearAlertPlaceholder() {
  if (!alertsEl) initUI();
  if (alertsEl.textContent.trim() === alertPlaceholderText) {
    alertsEl.textContent = '';
  }
}

// level: 'info' | 'warn' | 'error' etc
// duration: milliseconds to keep the alert visible; pass 0 to never auto-remove
export function setAlert(text, level = 'info', duration = 5000) {
  if (!alertsEl) initUI();
  clearAlertPlaceholder();

  const colors = { info: '#134e3a', warn: '#b47c00', error: 'crimson' };
  const node = document.createElement('div');
  node.textContent = text;
  node.style.marginTop = '6px';
  node.style.color = colors[level] || colors.info;
  alertsEl.prepend(node);

  // auto-dismiss (duration=0 disables)
  if (duration > 0) {
    setTimeout(() => {
      if (node && node.parentNode) {
        node.remove();
        if (alertsEl.childElementCount === 0 && alertsEl.textContent.trim() === '') {
          showAlertPlaceholder();
        }
      }
    }, duration);
  }
}

// optional helper for clearing all alerts at once
export function clearAlerts() {
  if (!alertsEl) initUI();
  showAlertPlaceholder();
}

export function showLoading() {
  if (!loadingElement) {
    loadingElement = document.createElement('div');
    loadingElement.id = 'loading';
    loadingElement.style.position = 'fixed';
    loadingElement.style.top = '50%';
    loadingElement.style.left = '50%';
    loadingElement.style.transform = 'translate(-50%, -50%)';
    loadingElement.style.padding = '20px';
    loadingElement.style.background = 'rgba(0,0,0,0.7)';
    loadingElement.style.color = 'white';
    loadingElement.style.borderRadius = '5px';
    loadingElement.style.zIndex = '1000';
    loadingElement.textContent = 'Carregando...';
    document.body.appendChild(loadingElement);
  } else {
    loadingElement.style.display = 'block';
  }
}

export function hideLoading() {
  if (loadingElement) {
    loadingElement.style.display = 'none';
  }
}
// Modal Component Module
let modalConfirmCallback = null;

export function showAlert(message) {
    const modal = document.getElementById('sys-modal');
    document.getElementById('modal-title').innerText = "提示";
    document.getElementById('modal-message').innerText = message;
    document.getElementById('modal-btn-cancel').classList.add('hidden-section');
    modalConfirmCallback = () => { modal.classList.add('hidden-section'); };
    modal.classList.remove('hidden-section');
}

export function showConfirm(message, onConfirm) {
    const modal = document.getElementById('sys-modal');
    document.getElementById('modal-title').innerText = "確認";
    document.getElementById('modal-message').innerText = message;
    document.getElementById('modal-btn-cancel').classList.remove('hidden-section');
    modalConfirmCallback = () => {
        modal.classList.add('hidden-section');
        if (onConfirm) onConfirm();
    };
    modal.classList.remove('hidden-section');
}

export function initModal() {
    document.getElementById('modal-btn-confirm').onclick = () => {
        if (modalConfirmCallback) modalConfirmCallback();
    };
    document.getElementById('modal-btn-cancel').onclick = () => {
        document.getElementById('sys-modal').classList.add('hidden-section');
    };
}

// Make available globally for onclick handlers
window.showAlert = showAlert;
window.showConfirm = showConfirm;

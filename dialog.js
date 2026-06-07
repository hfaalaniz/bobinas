// ============================================================================
// DIALOG.JS — Diálogos custom que reemplazan alert / confirm / prompt
// Expone: showAlert(msg), showConfirm(msg) → Promise<bool>, showPrompt(msg,def) → Promise<str|null>
// ============================================================================

(function () {
    // ── Inyectar estilos ─────────────────────────────────────────────────────
    const style = document.createElement('style');
    style.textContent = `
    .dlg-overlay {
        position: fixed; inset: 0; z-index: 9000;
        background: rgba(0,0,0,0.65);
        backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
        opacity: 0; transition: opacity .18s;
    }
    .dlg-overlay.dlg-visible { opacity: 1; }
    .dlg-box {
        background: linear-gradient(145deg, rgba(30,27,75,0.97) 0%, rgba(15,12,41,0.98) 100%);
        border: 1px solid rgba(102,126,234,0.35);
        border-radius: 16px;
        box-shadow: 0 24px 64px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06);
        padding: 28px 28px 22px;
        min-width: 320px; max-width: 480px; width: 90%;
        transform: translateY(18px) scale(0.97);
        transition: transform .18s, opacity .18s;
        opacity: 0;
    }
    .dlg-overlay.dlg-visible .dlg-box {
        transform: translateY(0) scale(1);
        opacity: 1;
    }
    .dlg-icon {
        font-size: 2rem; text-align: center; margin-bottom: 10px;
        line-height: 1;
    }
    .dlg-title {
        font-size: 1rem; font-weight: 700; color: #f1f5f9;
        margin-bottom: 10px; text-align: center; line-height: 1.4;
    }
    .dlg-msg {
        font-size: 0.875rem; color: #94a3b8; line-height: 1.6;
        text-align: center; margin-bottom: 20px; white-space: pre-line;
    }
    .dlg-input {
        width: 100%; box-sizing: border-box;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 8px; padding: 10px 12px;
        color: #f1f5f9; font-size: 0.9rem;
        margin-bottom: 18px;
        outline: none;
        transition: border-color .15s;
    }
    .dlg-input:focus { border-color: rgba(102,126,234,0.7); }
    .dlg-actions {
        display: flex; gap: 10px; justify-content: center;
    }
    .dlg-btn {
        flex: 1; max-width: 160px;
        padding: 10px 16px;
        border: none; border-radius: 9px;
        font-size: 0.875rem; font-weight: 600; cursor: pointer;
        transition: transform .12s, box-shadow .12s, opacity .12s;
    }
    .dlg-btn:hover { transform: translateY(-1px); opacity: .92; }
    .dlg-btn:active { transform: scale(.97); }
    .dlg-btn-primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #fff;
        box-shadow: 0 4px 12px rgba(102,126,234,0.4);
    }
    .dlg-btn-danger {
        background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
        color: #fff;
        box-shadow: 0 4px 12px rgba(239,68,68,0.35);
    }
    .dlg-btn-secondary {
        background: rgba(255,255,255,0.07);
        color: #94a3b8;
        border: 1px solid rgba(255,255,255,0.12);
    }
    .dlg-btn-secondary:hover { background: rgba(255,255,255,0.12); color: #f1f5f9; }
    `;
    document.head.appendChild(style);

    // ── Crear overlay DOM ────────────────────────────────────────────────────
    function _buildOverlay(content) {
        const overlay = document.createElement('div');
        overlay.className = 'dlg-overlay';
        overlay.innerHTML = `<div class="dlg-box">${content}</div>`;
        document.body.appendChild(overlay);
        // Animar entrada
        requestAnimationFrame(() => {
            requestAnimationFrame(() => overlay.classList.add('dlg-visible'));
        });
        return overlay;
    }

    function _close(overlay) {
        overlay.classList.remove('dlg-visible');
        setTimeout(() => overlay.remove(), 200);
    }

    // ── Detectar tipo de mensaje para elegir ícono ───────────────────────────
    function _icon(msg) {
        const m = (msg || '').toLowerCase();
        if (m.includes('error') || m.includes('❌') || m.includes('eliminar') || m.includes('borrar'))
            return '❌';
        if (m.includes('advertencia') || m.includes('⚠') || m.includes('atención'))
            return '⚠️';
        if (m.includes('éxito') || m.includes('guardado') || m.includes('importado') || m.includes('✓'))
            return '✅';
        return 'ℹ️';
    }

    // ────────────────────────────────────────────────────────────────────────
    // showAlert(message, title?) → Promise<void>
    // ────────────────────────────────────────────────────────────────────────
    window.showAlert = function (message, title) {
        return new Promise(resolve => {
            const icon    = _icon(message);
            const heading = title || (icon === '❌' ? 'Error' : icon === '⚠️' ? 'Advertencia' : 'Información');
            const overlay = _buildOverlay(`
                <div class="dlg-icon">${icon}</div>
                <div class="dlg-title">${heading}</div>
                <div class="dlg-msg">${message}</div>
                <div class="dlg-actions">
                    <button class="dlg-btn dlg-btn-primary" id="dlgOk">Aceptar</button>
                </div>
            `);
            overlay.querySelector('#dlgOk').addEventListener('click', () => {
                _close(overlay);
                resolve();
            });
            overlay.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                    _close(overlay); resolve();
                }
            });
            overlay.querySelector('#dlgOk').focus();
        });
    };

    // ────────────────────────────────────────────────────────────────────────
    // showConfirm(message, title?, danger?) → Promise<boolean>
    // danger=true → botón confirmar en rojo
    // ────────────────────────────────────────────────────────────────────────
    window.showConfirm = function (message, title, danger) {
        return new Promise(resolve => {
            const icon    = danger ? '⚠️' : _icon(message);
            const heading = title || '¿Confirmar acción?';
            const btnCls  = danger ? 'dlg-btn-danger' : 'dlg-btn-primary';
            const overlay = _buildOverlay(`
                <div class="dlg-icon">${icon}</div>
                <div class="dlg-title">${heading}</div>
                <div class="dlg-msg">${message}</div>
                <div class="dlg-actions">
                    <button class="dlg-btn dlg-btn-secondary" id="dlgCancel">Cancelar</button>
                    <button class="dlg-btn ${btnCls}" id="dlgOk">Confirmar</button>
                </div>
            `);
            overlay.querySelector('#dlgOk').addEventListener('click', () => {
                _close(overlay); resolve(true);
            });
            overlay.querySelector('#dlgCancel').addEventListener('click', () => {
                _close(overlay); resolve(false);
            });
            overlay.addEventListener('keydown', e => {
                if (e.key === 'Enter') { _close(overlay); resolve(true); }
                if (e.key === 'Escape') { _close(overlay); resolve(false); }
            });
            overlay.querySelector('#dlgOk').focus();
        });
    };

    // ────────────────────────────────────────────────────────────────────────
    // showPrompt(message, defaultValue?, title?) → Promise<string|null>
    // null = cancelado
    // ────────────────────────────────────────────────────────────────────────
    window.showPrompt = function (message, defaultValue, title) {
        return new Promise(resolve => {
            const heading = title || 'Ingrese un valor';
            const overlay = _buildOverlay(`
                <div class="dlg-icon">✏️</div>
                <div class="dlg-title">${heading}</div>
                <div class="dlg-msg">${message}</div>
                <input class="dlg-input" id="dlgInput" type="text"
                    value="${(defaultValue || '').toString().replace(/"/g, '&quot;')}"
                    autocomplete="off" spellcheck="false">
                <div class="dlg-actions">
                    <button class="dlg-btn dlg-btn-secondary" id="dlgCancel">Cancelar</button>
                    <button class="dlg-btn dlg-btn-primary" id="dlgOk">Aceptar</button>
                </div>
            `);
            const input = overlay.querySelector('#dlgInput');
            input.focus();
            input.select();

            const confirm = () => {
                _close(overlay); resolve(input.value);
            };
            overlay.querySelector('#dlgOk').addEventListener('click', confirm);
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') confirm();
                if (e.key === 'Escape') { _close(overlay); resolve(null); }
            });
            overlay.querySelector('#dlgCancel').addEventListener('click', () => {
                _close(overlay); resolve(null);
            });
        });
    };

})();

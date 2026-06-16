(function () {
  'use strict';

  const FORM_STORAGE_KEY = 'totp_form_draft';
  const el = {
    accountsList: document.getElementById('accounts-list'),
    emptyState: document.getElementById('empty-state'),
    searchInput: document.getElementById('search-input'),
    btnAdd: document.getElementById('btn-add'),
    btnTheme: document.getElementById('btn-theme'),
    btnMenu: document.getElementById('btn-menu'),
    dropdownMenu: document.getElementById('dropdown-menu'),
    menuExport: document.getElementById('menu-export'),
    menuImport: document.getElementById('menu-import'),
    modalAdd: document.getElementById('modal-add'),
    btnCancel: document.getElementById('btn-cancel'),
    btnSave: document.getElementById('btn-save'),
    btnScanPage: document.getElementById('btn-scan-page'),
    inputQrFile: document.getElementById('input-qr-file'),
    inputIssuer: document.getElementById('input-issuer'),
    inputLabel: document.getElementById('input-label'),
    inputSecret: document.getElementById('input-secret'),
    inputCategory: document.getElementById('input-category'),
    inputImportFile: document.getElementById('input-import-file'),
    qrResult: document.getElementById('qr-result'),
    qrAccountInfo: document.getElementById('qr-account-info'),
    qrDropZone: document.getElementById('qr-drop-zone'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message'),
    confirmModal: document.getElementById('modal-confirm'),
    confirmMessage: document.getElementById('confirm-message'),
    btnConfirmYes: document.getElementById('btn-confirm-yes'),
    btnConfirmNo: document.getElementById('btn-confirm-no')
  };

  let accounts = [];
  let updateInterval = null;
  let qrParsedData = null;
  let confirmCallback = null;

  async function init() {
    await initTheme();
    await loadAccounts();
    restoreFormDraft();
    startUpdateLoop();
    bindEvents();
  }

  async function initTheme() {
    const theme = await StorageManager.getTheme();
    let resolved = theme;
    if (theme === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
  }

  async function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    await StorageManager.setTheme(next);
  }

  function saveFormDraft() {
    const draft = {
      issuer: el.inputIssuer.value,
      label: el.inputLabel.value,
      secret: el.inputSecret.value,
      category: el.inputCategory.value,
      modalOpen: !el.modalAdd.classList.contains('hidden'),
      activeTab: document.querySelector('.tab.active')?.dataset.tab || 'manual'
    };
    chrome.storage.local.set({ [FORM_STORAGE_KEY]: draft });
  }

  function restoreFormDraft() {
    chrome.storage.local.get([FORM_STORAGE_KEY], (result) => {
      const draft = result[FORM_STORAGE_KEY];
      if (!draft) return;
      el.inputIssuer.value = draft.issuer || '';
      el.inputLabel.value = draft.label || '';
      el.inputSecret.value = draft.secret || '';
      el.inputCategory.value = draft.category || '';
      if (draft.modalOpen) {
        el.modalAdd.classList.remove('hidden');
        switchTab(draft.activeTab || 'manual');
      }
    });
  }

  function clearFormDraft() {
    chrome.storage.local.remove(FORM_STORAGE_KEY);
  }

  async function loadAccounts() {
    accounts = await StorageManager.getAccounts();
    renderAccounts();
  }

  function renderAccounts(filter = '') {
    const filtered = filter
      ? accounts.filter(a => a.issuer.toLowerCase().includes(filter) || a.label.toLowerCase().includes(filter))
      : accounts;

    if (filtered.length === 0) {
      el.accountsList.classList.add('hidden');
      el.emptyState.classList.remove('hidden');
      return;
    }

    el.emptyState.classList.add('hidden');
    el.accountsList.classList.remove('hidden');

    const groups = {};
    filtered.forEach(a => {
      const cat = a.category || 'ungrouped';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(a);
    });

    const order = ['work', 'social', 'finance', 'email', 'development', 'other', 'ungrouped'];
    const sortedKeys = Object.keys(groups).sort((a, b) => order.indexOf(a) - order.indexOf(b));

    el.accountsList.innerHTML = '';
    sortedKeys.forEach(category => {
      const group = document.createElement('div');
      group.className = 'category-group';

      if (category !== 'ungrouped' || sortedKeys.length > 1) {
        const label = document.createElement('div');
        label.className = 'category-label';
        label.textContent = category === 'ungrouped' ? 'Other' : category;
        group.appendChild(label);
      }

      groups[category].forEach(account => group.appendChild(createAccountCard(account)));
      el.accountsList.appendChild(group);
    });
  }

  function createAccountCard(account) {
    const card = document.createElement('div');
    card.className = 'account-card';
    card.setAttribute('draggable', 'true');
    card.dataset.id = account.id;

    const initials = account.issuer.split(/[\s\-_.]/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const remaining = TOTP.getRemaining(account.period || 30);
    const circ = 2 * Math.PI * 10;
    const progress = (remaining / (account.period || 30)) * circ;
    const expiring = remaining <= 5;

    card.innerHTML = `
      <div class="account-icon">${initials}</div>
      <div class="account-info">
        <div class="account-issuer">${escapeHtml(account.issuer)}</div>
        <div class="account-label">${escapeHtml(account.label || '')}</div>
      </div>
      <div class="account-code ${expiring ? 'expiring' : ''}" data-secret="${account.secret}" data-period="${account.period || 30}">------</div>
      <div class="countdown-ring">
        <svg width="28" height="28" viewBox="0 0 28 28">
          <circle class="ring-bg" cx="14" cy="14" r="10"/>
          <circle class="ring-progress ${expiring ? 'expiring' : ''}" cx="14" cy="14" r="10" stroke-dasharray="${circ}" stroke-dashoffset="${circ - progress}"/>
        </svg>
        <span class="countdown-text">${remaining}</span>
      </div>
      <div class="account-actions"><button class="btn-delete" title="Delete">✕</button></div>
      <div class="copy-feedback">Copied!</div>
    `;

    generateCode(card, account);

    card.addEventListener('click', e => {
      if (e.target.closest('.account-actions')) return;
      copyCode(card);
    });

    card.querySelector('.btn-delete').addEventListener('click', e => {
      e.stopPropagation();
      showConfirm(`Delete "${account.issuer}"? This cannot be undone.`, async () => {
        await StorageManager.deleteAccount(account.id);
        await loadAccounts();
        showToast('Account deleted');
      });
    });

    card.addEventListener('dragstart', function (e) { draggedEl = this; this.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    card.addEventListener('dragover', function (e) { e.preventDefault(); this.classList.add('drag-over'); });
    card.addEventListener('drop', function (e) { e.preventDefault(); this.classList.remove('drag-over'); handleDrop(this); });
    card.addEventListener('dragend', function () { this.classList.remove('dragging'); el.accountsList.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over')); });

    return card;
  }

  async function generateCode(card, account) {
    try {
      const code = await TOTP.generate(account.secret, account.period || 30, account.digits || 6);
      card.querySelector('.account-code').textContent = code.slice(0, 3) + ' ' + code.slice(3);
    } catch {
      const codeEl = card.querySelector('.account-code');
      codeEl.textContent = 'ERROR';
      codeEl.style.color = 'var(--danger)';
    }
  }

  function startUpdateLoop() {
    updateInterval = setInterval(updateAllCodes, 1000);
  }

  async function updateAllCodes() {
    for (const card of el.accountsList.querySelectorAll('.account-card')) {
      const codeEl = card.querySelector('.account-code');
      const secret = codeEl.dataset.secret;
      const period = parseInt(codeEl.dataset.period) || 30;
      const remaining = TOTP.getRemaining(period);
      const circ = 2 * Math.PI * 10;
      const progress = (remaining / period) * circ;
      const expiring = remaining <= 5;

      card.querySelector('.ring-progress').style.strokeDashoffset = circ - progress;
      card.querySelector('.countdown-text').textContent = remaining;
      codeEl.classList.toggle('expiring', expiring);
      card.querySelector('.ring-progress').classList.toggle('expiring', expiring);

      if (remaining === period) {
        try {
          const code = await TOTP.generate(secret, period);
          codeEl.textContent = code.slice(0, 3) + ' ' + code.slice(3);
        } catch {}
      }
    }
  }

  async function copyCode(card) {
    const code = card.querySelector('.account-code').textContent.replace(/\s/g, '');
    if (code === '------' || code === 'ERROR') return;
    try {
      await navigator.clipboard.writeText(code);
      card.classList.add('copied');
      card.querySelector('.copy-feedback').classList.add('show');
      setTimeout(() => { card.classList.remove('copied'); card.querySelector('.copy-feedback').classList.remove('show'); }, 1500);
      showToast('Code copied');
    } catch {
      showToast('Failed to copy');
    }
  }

  function openAddModal() { el.modalAdd.classList.remove('hidden'); saveFormDraft(); }
  function closeAddModal() { el.modalAdd.classList.add('hidden'); resetForm(); clearFormDraft(); }

  function resetForm() {
    el.inputIssuer.value = '';
    el.inputLabel.value = '';
    el.inputSecret.value = '';
    el.inputCategory.value = '';
    el.qrResult.classList.add('hidden');
    qrParsedData = null;
  }

  async function saveAccount() {
    const issuer = el.inputIssuer.value.trim() || (qrParsedData?.issuer || '');
    const label = el.inputLabel.value.trim() || (qrParsedData?.label || '');
    const secret = (el.inputSecret.value.trim().replace(/\s/g, '') || (qrParsedData?.secret || ''));
    const category = el.inputCategory.value;
    const period = qrParsedData?.period || 30;
    const digits = qrParsedData?.digits || 6;

    if (!issuer) { showToast('Service name is required'); el.inputIssuer.focus(); return; }
    if (!secret) { showToast('Secret key is required'); el.inputSecret.focus(); return; }
    if (!TOTP.isValidSecret(secret)) { showToast('Invalid secret key format'); el.inputSecret.focus(); return; }

    await StorageManager.saveAccount({ issuer, label, secret: secret.toUpperCase(), category, period, digits });
    await loadAccounts();
    closeAddModal();
    showToast('Account added');
  }

  async function scanFromPage() {
    showToast('Scanning page...');
    try {
      const result = await QRScanner.scanFromPage();
      if (!result) { showToast('No QR code found on this page'); return; }
      handleQRResult(result);
    } catch { showToast('Cannot scan this page'); }
  }

  async function scanFromFile(file) {
    if (!file || !file.type.startsWith('image/')) { showToast('Please use an image file'); return; }
    showToast('Reading QR code...');
    try {
      const result = await QRScanner.scanFromFile(file);
      if (!result) { showToast('No QR code found in this image'); return; }
      handleQRResult(result);
    } catch { showToast('Error reading image'); }
  }

  function handleQRResult(data) {
    const parsed = QRScanner.parseResult(data);
    if (!parsed) {
      showToast(data.startsWith('otpauth://') ? 'Not a TOTP code' : 'Not an authenticator QR code');
      return;
    }
    qrParsedData = parsed;
    el.qrResult.classList.remove('hidden');
    el.qrAccountInfo.textContent = `${parsed.issuer || 'Unknown'}${parsed.label ? ' — ' + parsed.label : ''}`;
    el.inputIssuer.value = parsed.issuer || '';
    el.inputLabel.value = parsed.label || '';
    el.inputSecret.value = parsed.secret || '';
    switchTab('manual');
    saveFormDraft();
    showToast('QR scanned! Review and Save.');
  }

  async function exportVault() {
    try {
      const json = await StorageManager.exportVault();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shieldkey-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Vault exported');
    } catch { showToast('Export failed'); }
    closeDropdown();
  }

  async function importVault(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const result = await StorageManager.importVault(text);
      await loadAccounts();
      showToast(`Imported ${result.imported} accounts (${result.skipped} skipped)`);
    } catch (e) { showToast(e.message); }
    closeDropdown();
  }

  let draggedEl = null;

  function handleDrop(target) {
    if (!draggedEl || draggedEl === target) return;
    const cards = [...el.accountsList.querySelectorAll('.account-card')];
    const from = cards.indexOf(draggedEl);
    const to = cards.indexOf(target);
    if (from < to) target.parentNode.insertBefore(draggedEl, target.nextSibling);
    else target.parentNode.insertBefore(draggedEl, target);
    StorageManager.saveOrder([...el.accountsList.querySelectorAll('.account-card')].map(c => c.dataset.id));
  }

  function showConfirm(message, onConfirm) {
    el.confirmMessage.textContent = message;
    el.confirmModal.classList.remove('hidden');
    confirmCallback = onConfirm;
  }

  function hideConfirm() { el.confirmModal.classList.add('hidden'); confirmCallback = null; }

  function closeDropdown() { el.dropdownMenu.classList.add('hidden'); }

  function showToast(message) {
    el.toastMessage.textContent = message;
    el.toast.classList.remove('hidden');
    el.toast.classList.add('show');
    setTimeout(() => { el.toast.classList.remove('show'); setTimeout(() => el.toast.classList.add('hidden'), 300); }, 2500);
  }

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelector(`[data-tab="${name}"]`).classList.add('active');
    document.getElementById(`tab-${name}`).classList.add('active');
  }

  function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

  function bindEvents() {
    el.btnTheme.addEventListener('click', toggleTheme);
    el.btnMenu.addEventListener('click', e => { e.stopPropagation(); el.dropdownMenu.classList.toggle('hidden'); });
    document.addEventListener('click', e => { if (!e.target.closest('#dropdown-menu') && !e.target.closest('#btn-menu')) closeDropdown(); });
    el.searchInput.addEventListener('input', e => renderAccounts(e.target.value.toLowerCase()));

    el.btnAdd.addEventListener('click', openAddModal);
    el.btnCancel.addEventListener('click', closeAddModal);
    el.modalAdd.querySelector('.modal-backdrop').addEventListener('click', closeAddModal);
    el.btnSave.addEventListener('click', saveAccount);

    document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));

    el.btnScanPage.addEventListener('click', scanFromPage);
    el.inputQrFile.addEventListener('change', e => { if (e.target.files[0]) scanFromFile(e.target.files[0]); e.target.value = ''; });

    el.menuExport.addEventListener('click', exportVault);
    el.menuImport.addEventListener('click', () => { el.inputImportFile.click(); closeDropdown(); });
    el.inputImportFile.addEventListener('change', e => { if (e.target.files[0]) importVault(e.target.files[0]); e.target.value = ''; });

    el.btnConfirmYes.addEventListener('click', () => { if (confirmCallback) confirmCallback(); hideConfirm(); });
    el.btnConfirmNo.addEventListener('click', hideConfirm);
    el.confirmModal.querySelector('.modal-backdrop').addEventListener('click', hideConfirm);

    [el.inputIssuer, el.inputLabel, el.inputSecret, el.inputCategory].forEach(input => {
      input.addEventListener('input', saveFormDraft);
      input.addEventListener('change', saveFormDraft);
    });

    const dz = el.qrDropZone;
    if (dz) {
      ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('drag-active'); }));
      ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('drag-active'); }));
      dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) scanFromFile(e.dataTransfer.files[0]); });
    }

    document.addEventListener('paste', e => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) { scanFromFile(item.getAsFile()); break; }
      }
    });
  }

  init();
})();

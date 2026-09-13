(() => {
  const toast = (message) => {
    let element = document.getElementById('consoleToast');
    if (!element) { element = document.createElement('div'); element.id = 'consoleToast'; element.className = 'console-toast'; document.body.appendChild(element); }
    element.textContent = message; element.classList.add('is-visible'); clearTimeout(window.consoleToastTimer); window.consoleToastTimer = setTimeout(() => element.classList.remove('is-visible'), 2200);
  };
  document.querySelectorAll('[data-console-action]').forEach((button) => button.addEventListener('click', () => {
    const labels = { spotlight: 'High-lumen spotlight enabled', detect: 'AI detection boxes enabled', snapshot: 'Live area saved to Recon Vault', expand: 'Viewport expanded', search: 'Search sector updated', gimbal: 'Gimbal locked to target', sos: 'SOS dispatch sent to response teams', drop: 'Medical pod release queued', latch: 'Safety latch state changed', siren: 'Acoustic siren and strobe engaged' };
    if (button.dataset.consoleAction === 'latch') button.textContent = button.textContent.includes('LOCKED') ? 'ARMED (READY)' : 'LOCKED (SAFE)';
    if (button.dataset.consoleAction === 'snapshot') { const count = document.querySelectorAll('[data-console-action="snapshot"]').length; const vault = document.querySelector('[data-bind="vaultCount"]'); if (vault) vault.textContent = `(${count})`; }
    toast(labels[button.dataset.consoleAction] || 'Command accepted');
  }));
  document.querySelectorAll('[data-feed]').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('[data-feed]').forEach((item) => item.classList.remove('is-selected')); button.classList.add('is-selected'); toast(`${button.dataset.feed} view selected`); }));
  document.querySelectorAll('.quick-zones button').forEach((button) => button.addEventListener('click', () => { const input = document.getElementById('sectorSearch'); if (input) input.value = button.textContent.trim().replace(/^\S+\s/, ''); toast(`${button.textContent.trim()} zone loaded`); }));
})();
(function () {
  if (typeof window === 'undefined') return;

  const recoverForm = document.getElementById('recoverForm');
  const authMessage = document.getElementById('authMessage');

  recoverForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!recoverForm.reportValidity()) return;
    authMessage.textContent = 'Sending recovery link...';
    try {
      const response = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: recoverForm.email.value.trim().toLowerCase() })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Recovery request failed.');
      authMessage.textContent = 'Recovery link sent. Check your email inbox.';
      recoverForm.reset();
    } catch (error) {
      authMessage.textContent = error.message;
    }
  });
})();

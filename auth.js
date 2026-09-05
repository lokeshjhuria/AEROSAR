const passwordInput = document.getElementById('operatorPassword');
const togglePassword = document.getElementById('togglePassword');
const signInForm = document.getElementById('signInForm');
const authMessage = document.getElementById('authMessage');

togglePassword.addEventListener('click', () => {
  const isHidden = passwordInput.type === 'password';
  passwordInput.type = isHidden ? 'text' : 'password';
  togglePassword.textContent = isHidden ? 'HIDE' : 'SHOW';
  togglePassword.setAttribute('aria-label', isHidden ? 'Hide access key' : 'Show access key');
});

signInForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!signInForm.reportValidity()) return;
  authMessage.textContent = 'Connecting to identity service...';
  try {
    const response = await fetch('/api/auth/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: signInForm.email.value, password: signInForm.password.value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Sign-in failed.');
    window.location.assign('index.html');
  } catch (error) {
    authMessage.textContent = error.message;
  }
});

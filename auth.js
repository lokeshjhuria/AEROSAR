const hash = window.location.hash.substring(1);
const params = new URLSearchParams(hash);
const recoveryToken = params.get('access_token');
const hashType = params.get('type');

const signInForm = document.getElementById('signInForm');

if (recoveryToken && hashType === 'recovery') {
  document.querySelector('.auth-form-wrap h2').innerHTML = 'Set new<br><span>access key.</span>';
  document.querySelector('.form-intro').textContent = 'Enter your new access key below.';
  
  signInForm.innerHTML = `
    <label for="operatorPassword">New access key</label>
    <div class="password-field">
      <input id="operatorPassword" name="password" type="password" autocomplete="new-password" placeholder="At least 6 characters" minlength="6" required>
      <button type="button" id="togglePassword" aria-label="Show access key">SHOW</button>
    </div>
    <button class="submit-button" type="submit">UPDATE KEY <span>→</span></button>
    <p class="auth-message" id="authMessage" role="status" aria-live="polite"></p>
  `;
  
  const passwordInput = document.getElementById('operatorPassword');
  const togglePassword = document.getElementById('togglePassword');
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
    authMessage.textContent = 'Updating access key...';
    try {
      const response = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ access_token: recoveryToken, password: passwordInput.value })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Update failed.');
      authMessage.textContent = 'Key updated successfully. Redirecting...';
      setTimeout(() => {
        window.location.hash = '';
        window.location.reload();
      }, 1500);
    } catch (error) {
      authMessage.textContent = error.message;
    }
  });
} else {
  const passwordInput = document.getElementById('operatorPassword');
  const togglePassword = document.getElementById('togglePassword');
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
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ 
          email: signInForm.email.value.trim().toLowerCase(), 
          password: signInForm.password.value,
          remember: signInForm.remember.checked 
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Sign-in failed.');
      if (!result.authenticated) throw new Error('Sign-in was not authenticated.');
      window.location.assign('/index.html');
    } catch (error) {
      authMessage.textContent = error.message;
    }
  });
}

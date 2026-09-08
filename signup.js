const signUpForm = document.getElementById('signUpForm');
const signUpMessage = document.getElementById('signUpMessage');
const emailInput = document.getElementById('operatorEmail');
const passwordInput = document.getElementById('operatorPassword');
const togglePassword = document.getElementById('togglePassword');
const emailHint = document.getElementById('emailHint');
const passwordHint = document.getElementById('passwordHint');

// Password visibility toggle
togglePassword.addEventListener('click', () => {
  const isHidden = passwordInput.type === 'password';
  passwordInput.type = isHidden ? 'text' : 'password';
  togglePassword.textContent = isHidden ? 'HIDE' : 'SHOW';
  togglePassword.setAttribute('aria-label', isHidden ? 'Hide access key' : 'Show access key');
});

// Live validation helpers
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(showIfEmpty = false) {
  const value = emailInput.value.trim();
  if (!value) {
    if (showIfEmpty) {
      emailHint.textContent = 'Email address is required.';
      emailHint.className = 'field-hint invalid';
      return false;
    }
    emailHint.textContent = '';
    emailHint.className = 'field-hint muted';
    return false;
  }
  if (emailPattern.test(value)) {
    emailHint.textContent = '✓ Valid email address';
    emailHint.className = 'field-hint valid';
    return true;
  }
  emailHint.textContent = 'Please enter a valid email address';
  emailHint.className = 'field-hint invalid';
  return false;
}

function validatePassword(showIfEmpty = false) {
  const value = passwordInput.value;
  if (!value) {
    if (showIfEmpty) {
      passwordHint.textContent = 'Access key is required.';
      passwordHint.className = 'field-hint invalid';
      return false;
    }
    passwordHint.textContent = 'Minimum 6 characters';
    passwordHint.className = 'field-hint muted';
    return false;
  }
  if (value.length < 6) {
    const diff = 6 - value.length;
    passwordHint.textContent = `At least 6 characters (${diff} more needed)`;
    passwordHint.className = 'field-hint invalid';
    return false;
  }
  passwordHint.textContent = '✓ Access key meets requirements';
  passwordHint.className = 'field-hint valid';
  return true;
}

// Attach live input & blur listeners
emailInput.addEventListener('input', () => validateEmail(false));
emailInput.addEventListener('blur', () => validateEmail(true));
passwordInput.addEventListener('input', () => validatePassword(false));
passwordInput.addEventListener('blur', () => validatePassword(true));

// Form submission with email sanitization
signUpForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  
  const isEmailValid = validateEmail(true);
  const isPasswordValid = validatePassword(true);

  if (!isEmailValid || !isPasswordValid) {
    signUpMessage.textContent = 'Please check the requirements above.';
    return;
  }

  // Sanitize email: trim whitespace and convert to lowercase
  const sanitizedEmail = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  signUpMessage.textContent = 'Creating operator account...';
  try {
    const response = await fetch('/api/auth/sign-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: sanitizedEmail, password })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Account creation failed.');

    if (result.confirmationRequired) {
      signUpMessage.textContent = 'Account created. Check your email to confirm access, then sign in.';
      signUpForm.reset();
      emailHint.textContent = '';
      emailHint.className = 'field-hint muted';
      passwordHint.textContent = 'Minimum 6 characters';
      passwordHint.className = 'field-hint muted';
      return;
    }

    signUpMessage.textContent = 'Account created. Entering command center...';
    setTimeout(() => {
      window.location.assign('index.html');
    }, 400);
  } catch (error) {
    signUpMessage.textContent = error.message;
  }
});
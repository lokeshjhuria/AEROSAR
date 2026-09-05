const signUpForm = document.getElementById('signUpForm');
const signUpMessage = document.getElementById('signUpMessage');

signUpForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!signUpForm.reportValidity()) return;
  if (signUpForm.password.value !== signUpForm.passwordConfirm.value) {
    signUpMessage.textContent = 'Access keys do not match.';
    return;
  }

  signUpMessage.textContent = 'Creating operator account...';
  try {
    const response = await fetch('/api/auth/sign-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: signUpForm.email.value, password: signUpForm.password.value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Account creation failed.');
    if (result.confirmationRequired) {
      signUpMessage.textContent = 'Account created. Check your email to confirm access, then sign in.';
      signUpForm.reset();
      return;
    }
    window.location.assign('index.html');
  } catch (error) {
    signUpMessage.textContent = error.message;
  }
});
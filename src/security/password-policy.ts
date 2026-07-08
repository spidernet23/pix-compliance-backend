/**
 * Password Policy (ASVS 2.1)
 * ═══════════════════════════════════════════════════════════════
 *
 * Enforces strong credentials for a financial-compliance product:
 *   • Minimum 12 characters (ASVS 2.1.1 requires ≥ 12 for L2)
 *   • Upper, lower, digit, and symbol required
 *   • Rejects a blocklist of common/breached passwords (ASVS 2.1.7)
 *   • Rejects passwords containing the user's email local-part
 *
 * Note: we validate complexity but never cap length or forbid any
 * character class (ASVS 2.1.2/2.1.3) — long passphrases are welcome.
 */

const COMMON_PASSWORDS = new Set([
  'password', 'senha123', '12345678', '123456789', 'qwerty123',
  'admin123', 'password123', 'welcome123', 'letmein123', 'abc123456',
  'iloveyou', 'sunshine1', 'princess1', 'football1', 'monkey123',
  'password1', 'senhasenha', 'mudar123', 'brasil123', 'pix123456',
]);

export interface PasswordCheck {
  valid: boolean;
  errors: string[];
}

export function validatePassword(password: string, email?: string): PasswordCheck {
  const errors: string[] = [];

  if (password.length < 12) {
    errors.push('A senha deve ter no mínimo 12 caracteres');
  }
  if (!/[A-Z]/.test(password)) errors.push('A senha deve conter ao menos uma letra maiúscula');
  if (!/[a-z]/.test(password)) errors.push('A senha deve conter ao menos uma letra minúscula');
  if (!/[0-9]/.test(password)) errors.push('A senha deve conter ao menos um número');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('A senha deve conter ao menos um símbolo');

  const lower = password.toLowerCase();
  // Check both the raw lowercase and an alphanumeric-normalized form,
  // so "Password123!" is caught via "password123".
  const normalized = lower.replace(/[^a-z0-9]/g, '');
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(normalized)) {
    errors.push('Esta senha é muito comum e não pode ser usada');
  }

  // Reject passwords built around the email local-part.
  if (email) {
    const local = email.split('@')[0]?.toLowerCase();
    if (local && local.length >= 3 && lower.includes(local)) {
      errors.push('A senha não pode conter seu nome de usuário/e-mail');
    }
  }

  // Reject trivial sequences and repeats.
  if (/(.)\1{3,}/.test(password)) {
    errors.push('A senha não pode conter caracteres repetidos em sequência');
  }

  return { valid: errors.length === 0, errors };
}

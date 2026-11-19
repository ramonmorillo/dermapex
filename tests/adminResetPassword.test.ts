import { describe, expect, it } from 'vitest';

import { generateTemporaryPassword, TEMP_PASSWORD_LENGTH } from '../supabase/functions/admin-reset-password/passwordGenerator';

describe('generateTemporaryPassword', () => {
  it('tiene 16 caracteres y las cuatro clases en todas las muestras', () => {
    for (let i = 0; i < 2000; i += 1) {
      const p = generateTemporaryPassword();
      expect(p).toHaveLength(TEMP_PASSWORD_LENGTH);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[!#$%&*+\-=?@_]/);
      expect(p).not.toMatch(/[0OIl1]/);
    }
  });

  it('no repite contraseñas (entropía real)', () => {
    const seen = new Set(Array.from({ length: 5000 }, () => generateTemporaryPassword()));
    expect(seen.size).toBe(5000);
  });

  it('usa solo la fuente criptográfica inyectada (sin Math.random)', () => {
    const original = Math.random;
    Math.random = () => { throw new Error('Math.random no permitido'); };
    try {
      let calls = 0;
      const p = generateTemporaryPassword((a) => { calls += 1; return crypto.getRandomValues(a); });
      expect(p).toHaveLength(TEMP_PASSWORD_LENGTH);
      expect(calls).toBeGreaterThan(0);
    } finally {
      Math.random = original;
    }
  });

  it('distribución sin sesgo apreciable por carácter', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 20000; i += 1) for (const ch of generateTemporaryPassword()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    const values = [...counts.values()];
    // Cada símbolo restante aparece en torno a una media; ninguno debe disparar o desaparecer.
    expect(Math.max(...values) / Math.min(...values)).toBeLessThan(6);
  });
});

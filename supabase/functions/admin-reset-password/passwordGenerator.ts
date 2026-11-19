// Generador de contraseñas temporales criptográficamente seguras (Web Crypto, sin Math.random).
// Módulo puro: lo usa la Edge Function y lo prueban los tests (tests/adminResetPassword.test.ts).

// Alfabetos sin caracteres ambiguos (0/O, 1/l/I) para poder dictarse o copiarse sin errores.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!#$%&*+-=?@_';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

export const TEMP_PASSWORD_LENGTH = 16;

export type RandomBytes = (array: Uint8Array) => Uint8Array;

const defaultRandomBytes: RandomBytes = (array) => crypto.getRandomValues(array);

/** Entero uniforme en [0, max) por muestreo con rechazo (sin sesgo de módulo). */
function randomIndex(max: number, random: RandomBytes): number {
  const limit = 256 - (256 % max);
  const buffer = new Uint8Array(1);
  for (;;) {
    random(buffer);
    if (buffer[0] < limit) return buffer[0] % max;
  }
}

function pick(alphabet: string, random: RandomBytes): string {
  return alphabet[randomIndex(alphabet.length, random)];
}

/** 16 caracteres con al menos una mayúscula, una minúscula, un dígito y un símbolo, en orden aleatorio. */
export function generateTemporaryPassword(random: RandomBytes = defaultRandomBytes): string {
  const chars = [pick(UPPER, random), pick(LOWER, random), pick(DIGITS, random), pick(SYMBOLS, random)];
  while (chars.length < TEMP_PASSWORD_LENGTH) chars.push(pick(ALL, random));
  // Fisher–Yates con la misma fuente aleatoria.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1, random);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

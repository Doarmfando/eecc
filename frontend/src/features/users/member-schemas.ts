import { z } from 'zod';

/** Los mismos límites que aplica la API; aquí solo evitan una llamada condenada a fallar. */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;

const nombre = z
  .string()
  .trim()
  .min(2, 'Escribe el nombre completo')
  .max(160, 'Como mucho 160 caracteres');

const correo = z
  .string()
  .trim()
  .min(1, 'Escribe el correo')
  .email('Ese correo no es válido')
  .max(320, 'Como mucho 320 caracteres');

const rol = z.enum(['ADMIN', 'MEMBER']);

/** `generar`: el servidor crea una temporal. `elegir`: la escribe quien administra. */
const modoClave = z.enum(['generar', 'elegir']);

function validarClaveElegida(
  valores: { modoClave: 'generar' | 'elegir'; password: string },
  ctx: z.RefinementCtx,
): void {
  if (valores.modoClave !== 'elegir') {
    return;
  }
  if (valores.password.length < MIN_PASSWORD_LENGTH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['password'],
      message: `Al menos ${String(MIN_PASSWORD_LENGTH)} caracteres`,
    });
  } else if (valores.password.length > MAX_PASSWORD_LENGTH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['password'],
      message: `Como mucho ${String(MAX_PASSWORD_LENGTH)} caracteres`,
    });
  }
}

/** `["empresa.pe", "hotmail.com"]` → `"@empresa.pe o @hotmail.com"`. */
export function describirDominios(dominios: readonly string[]): string {
  const conArroba = dominios.map((dominio) => `@${dominio}`);
  if (conArroba.length <= 1) {
    return conArroba.join('');
  }
  return `${conArroba.slice(0, -1).join(', ')} o ${conArroba[conArroba.length - 1] ?? ''}`;
}

/**
 * Misma regla que la API: coincidencia exacta tras la última arroba y lista vacía
 * sin restricción. `salvo` deja pasar el correo que la cuenta ya tenía, para no
 * obligar a cambiarlo al corregir otro dato.
 */
function exigirDominio(
  dominios: readonly string[],
  salvo?: string,
): (email: string, ctx: z.RefinementCtx) => void {
  return (email, ctx) => {
    const normalizado = email.toLowerCase();
    if (dominios.length === 0 || normalizado === salvo) {
      return;
    }
    if (!dominios.includes(normalizado.split('@').pop() ?? '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Solo se admiten correos ${describirDominios(dominios)}`,
      });
    }
  };
}

const nuevaCuentaBase = z.object({
  displayName: nombre,
  email: correo,
  role: rol,
  modoClave,
  password: z.string(),
});

export type NuevaCuenta = z.infer<typeof nuevaCuentaBase>;

export function nuevaCuentaSchema(dominios: readonly string[]): z.ZodType<NuevaCuenta> {
  return nuevaCuentaBase
    .extend({ email: correo.superRefine(exigirDominio(dominios)) })
    .superRefine(validarClaveElegida);
}

const edicionBase = z.object({ displayName: nombre, email: correo, role: rol });

export type Edicion = z.infer<typeof edicionBase>;

export function edicionSchema(
  dominios: readonly string[],
  correoActual: string,
): z.ZodType<Edicion> {
  return edicionBase.extend({ email: correo.superRefine(exigirDominio(dominios, correoActual)) });
}

export const claveSchema = z
  .object({ modoClave, password: z.string() })
  .superRefine(validarClaveElegida);

export type CambioDeClave = z.infer<typeof claveSchema>;

/** Cambio de la propia contraseña: exige la actual y repetir la nueva. */
export const clavePropiaSchema = z
  .object({
    currentPassword: z.string().min(1, 'Escribe tu contraseña actual'),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Al menos ${String(MIN_PASSWORD_LENGTH)} caracteres`)
      .max(MAX_PASSWORD_LENGTH, `Como mucho ${String(MAX_PASSWORD_LENGTH)} caracteres`),
    confirmation: z.string(),
  })
  .refine((valores) => valores.newPassword === valores.confirmation, {
    path: ['confirmation'],
    message: 'No coincide con la nueva contraseña',
  });

export type ClavePropia = z.infer<typeof clavePropiaSchema>;

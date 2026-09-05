import { z } from 'zod';

/** Mismo formato que exige el guard del API: se valida antes de enviar. */
export const credentialSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._-]{32,128}$/, 'La credencial no tiene el formato esperado.'),
});

export type CredentialValues = z.infer<typeof credentialSchema>;

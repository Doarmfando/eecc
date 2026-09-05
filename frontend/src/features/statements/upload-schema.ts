import { z } from 'zod';

import { validateStatementFile } from './validate-file';

/**
 * La validación del archivo vive en `validate-file` para poder probarla sola;
 * aquí solo se conecta al esquema del formulario.
 */
export const uploadSchema = z.object({
  document: z
    .custom<FileList | undefined>()
    .refine((list) => (list?.length ?? 0) > 0, 'Selecciona un archivo PDF.')
    .superRefine((list, ctx) => {
      const problem = validateStatementFile(list?.item(0) ?? null);
      if (problem !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
      }
    }),
  defaultYear: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d{4}$/.test(value), 'El año debe tener cuatro dígitos.'),
});

export type UploadFormSchema = z.infer<typeof uploadSchema>;

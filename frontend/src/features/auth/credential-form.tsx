import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, LogOut } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';

import { useApiConfig } from '@/app/use-api-config';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { credentialSchema, type CredentialValues } from './credential-schema';

export function CredentialForm(): ReactNode {
  const { apiKey, setApiKey } = useApiConfig();
  const inputId = useId();
  const errorId = useId();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<CredentialValues>({
    resolver: zodResolver(credentialSchema),
    mode: 'onChange',
    defaultValues: { apiKey: '' },
  });

  if (apiKey) {
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardHeader>
            <CardTitle>Sesión activa</CardTitle>
            <CardDescription>
              La credencial se mantiene solo en memoria: al recargar la página deberás escribirla de
              nuevo.
            </CardDescription>
          </CardHeader>
          <Button
            variant="outline"
            onClick={() => {
              setApiKey('');
              reset({ apiKey: '' });
            }}
          >
            <LogOut aria-hidden />
            Salir
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credencial de acceso</CardTitle>
        <CardDescription>
          Mientras no exista inicio de sesión de usuarios, la API se consume con una credencial de
          servicio de tu organización.
        </CardDescription>
      </CardHeader>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          void handleSubmit((values) => {
            setApiKey(values.apiKey);
          })(event);
        }}
        noValidate
      >
        <div className="flex-1">
          <Label htmlFor={inputId}>Credencial</Label>
          <Input
            id={inputId}
            type="password"
            autoComplete="off"
            className="mt-2 font-mono"
            aria-invalid={errors.apiKey ? true : undefined}
            aria-describedby={errors.apiKey ? errorId : undefined}
            {...register('apiKey')}
          />
          {errors.apiKey ? (
            <p id={errorId} role="alert" className="mt-1 text-sm text-destructive">
              {errors.apiKey.message}
            </p>
          ) : null}
        </div>
        <Button type="submit" disabled={!isValid}>
          <KeyRound aria-hidden />
          Usar credencial
        </Button>
      </form>
    </Card>
  );
}

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { QueryClientProvider } from '@tanstack/react-query';
import { ApiConfigProvider } from '@/app/api-config';
import { createQueryClient } from '@/app/query-client';
import { render } from '@testing-library/react';

import { CredentialForm } from './credential-form';
import { credentialSchema } from './credential-schema';

function renderForm(): void {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <ApiConfigProvider baseUrl="http://127.0.0.1:3000">
        <CredentialForm />
      </ApiConfigProvider>
    </QueryClientProvider>,
  );
}

describe('credentialSchema', () => {
  it('acepta el formato que exige el guard del API', () => {
    expect(credentialSchema.safeParse({ apiKey: 'k'.repeat(48) }).success).toBe(true);
    expect(credentialSchema.safeParse({ apiKey: 'a-b_c.'.repeat(6) }).success).toBe(true);
  });

  it('rechaza credenciales cortas, largas o con caracteres no permitidos', () => {
    expect(credentialSchema.safeParse({ apiKey: 'corta' }).success).toBe(false);
    expect(credentialSchema.safeParse({ apiKey: 'k'.repeat(129) }).success).toBe(false);
    expect(credentialSchema.safeParse({ apiKey: `${'k'.repeat(40)} con espacio` }).success).toBe(
      false,
    );
  });
});

describe('CredentialForm', () => {
  it('mantiene el envío bloqueado hasta que la credencial es válida', async () => {
    const user = userEvent.setup();
    renderForm();

    const submit = screen.getByRole('button', { name: 'Usar credencial' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Credencial'), 'corta');
    expect(await screen.findByRole('alert')).toHaveTextContent('formato esperado');
    expect(submit).toBeDisabled();

    await user.clear(screen.getByLabelText('Credencial'));
    await user.type(screen.getByLabelText('Credencial'), 'k'.repeat(48));
    expect(submit).toBeEnabled();
  });

  it('cambia a sesión activa y permite salir sin dejar rastro', async () => {
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    renderForm();

    await user.type(screen.getByLabelText('Credencial'), 'k'.repeat(48));
    await user.click(screen.getByRole('button', { name: 'Usar credencial' }));

    expect(await screen.findByText('Sesión activa')).toBeInTheDocument();
    expect(setItem).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Salir' }));
    expect(await screen.findByLabelText('Credencial')).toBeInTheDocument();
    setItem.mockRestore();
  });
});

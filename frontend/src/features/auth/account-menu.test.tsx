import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, TEST_USER } from '@/test/render';

import { AccountMenu } from './account-menu';

function respuesta(status: number, body?: unknown): Response {
  return body === undefined
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
}

async function abrirCambioDeClave(): Promise<{
  user: ReturnType<typeof userEvent.setup>;
  dialogo: HTMLElement;
}> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: `Cuenta de ${TEST_USER.displayName}` }));
  const dialogo = await screen.findByRole('dialog');
  await user.click(within(dialogo).getByRole('button', { name: 'Cambiar contraseña' }));
  return { user, dialogo };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AccountMenu', () => {
  it('muestra quién ha entrado y con qué rol', async () => {
    renderWithProviders(<AccountMenu />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: `Cuenta de ${TEST_USER.displayName}` }));

    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent(TEST_USER.email);
    expect(dialogo).toHaveTextContent('Organización de prueba · Administrador');
  });

  it('cambia la propia contraseña y cierra la sesión explicando por qué', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(204));
    vi.stubGlobal('fetch', fetchMock);
    const cerrar = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<AccountMenu />, { cerrar });

    const { user, dialogo } = await abrirCambioDeClave();
    await user.type(within(dialogo).getByLabelText('Contraseña actual'), 'la-clave-de-antes');
    await user.type(within(dialogo).getByLabelText('Nueva contraseña'), 'la-clave-nueva-larga');
    await user.type(within(dialogo).getByLabelText('Repite la nueva'), 'la-clave-nueva-larga');
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(cerrar).toHaveBeenCalledWith(expect.stringContaining('Contraseña cambiada'));
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/auth/password');
    expect(JSON.parse(init.body as string)).toEqual({
      currentPassword: 'la-clave-de-antes',
      newPassword: 'la-clave-nueva-larga',
    });
  });

  it('no envía nada si la repetición no coincide', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<AccountMenu />);

    const { user, dialogo } = await abrirCambioDeClave();
    await user.type(within(dialogo).getByLabelText('Contraseña actual'), 'la-clave-de-antes');
    await user.type(within(dialogo).getByLabelText('Nueva contraseña'), 'la-clave-nueva-larga');
    await user.type(within(dialogo).getByLabelText('Repite la nueva'), 'otra-cosa-distinta');
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    expect(
      await within(dialogo).findByText('No coincide con la nueva contraseña'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('avisa si la contraseña actual no es correcta y no cierra la sesión', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(respuesta(401, { code: 'INVALID_CREDENTIALS' })),
    );
    const cerrar = vi.fn();
    renderWithProviders(<AccountMenu />, { cerrar });

    const { user, dialogo } = await abrirCambioDeClave();
    await user.type(within(dialogo).getByLabelText('Contraseña actual'), 'equivocada');
    await user.type(within(dialogo).getByLabelText('Nueva contraseña'), 'la-clave-nueva-larga');
    await user.type(within(dialogo).getByLabelText('Repite la nueva'), 'la-clave-nueva-larga');
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    expect(
      await within(dialogo).findByText('La contraseña actual no es correcta.'),
    ).toBeInTheDocument();
    expect(cerrar).not.toHaveBeenCalled();
  });
});

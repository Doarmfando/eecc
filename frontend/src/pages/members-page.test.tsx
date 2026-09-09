import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, TEST_USER } from '@/test/render';

import { MembersPage } from './members-page';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const YO = {
  userId: TEST_USER.userId,
  email: TEST_USER.email,
  displayName: TEST_USER.displayName,
  role: 'ADMIN',
  membershipStatus: 'ACTIVE',
  lastLoginAt: '2026-08-26T15:30:00.000Z',
};

const OTRA = {
  userId: '44444444-4444-4444-8444-444444444444',
  email: 'otra@empresa.pe',
  displayName: 'Otra persona',
  role: 'MEMBER',
  membershipStatus: 'ACTIVE',
  lastLoginAt: null,
};

/** Doble que responde por método y ruta, para medir qué se pidió y no solo qué se pintó. */
function apiFalsa(
  respuestas: Partial<{ post: () => Response; patch: () => Response; lista: () => Response }> = {},
): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const metodo = (init?.method ?? 'GET').toUpperCase();
    if (metodo === 'GET') {
      return Promise.resolve(respuestas.lista?.() ?? jsonResponse(200, [YO, OTRA]));
    }
    if (metodo === 'PATCH') {
      return Promise.resolve(respuestas.patch?.() ?? jsonResponse(200, OTRA));
    }
    if (url.includes('/password-reset')) {
      return Promise.resolve(jsonResponse(201, { temporaryPassword: 'clave-temporal-larga' }));
    }
    return Promise.resolve(
      respuestas.post?.() ??
        jsonResponse(201, {
          member: { ...OTRA, email: 'nueva@empresa.pe', displayName: 'Persona nueva' },
          temporaryPassword: 'clave-generada-larga',
        }),
    );
  });
}

function filaDe(nombre: string): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(nombre) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MembersPage', () => {
  it('lista las cuentas con su rol, estado y último acceso', async () => {
    vi.stubGlobal('fetch', apiFalsa());
    renderWithProviders(<MembersPage />);

    expect(await screen.findByText('Otra persona')).toBeInTheDocument();
    expect(screen.getByText('otra@empresa.pe')).toBeInTheDocument();
    // Quien nunca entró no debe aparecer con una fecha inventada.
    expect(within(filaDe('Otra persona')).getByText('Nunca')).toBeInTheDocument();
    expect(screen.getAllByText('Activa')).toHaveLength(2);
  });

  it('marca la propia cuenta y no deja cambiarse el rol ni quitarse el acceso', async () => {
    // Es la salvaguarda que evita que alguien se deje fuera de su organización.
    vi.stubGlobal('fetch', apiFalsa());
    renderWithProviders(<MembersPage />);

    await screen.findByText('Otra persona');
    const mia = filaDe(TEST_USER.displayName);

    expect(within(mia).getByText('(tú)')).toBeInTheDocument();
    expect(within(mia).getByLabelText(`Rol de ${TEST_USER.displayName}`)).toBeDisabled();
    expect(within(mia).getByRole('button', { name: 'Quitar acceso' })).toBeDisabled();
  });

  it('no envía nada al servidor cuando el correo no es válido', async () => {
    const fetchMock = apiFalsa();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<MembersPage />);
    await screen.findByText('Otra persona');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Nombre'), 'Persona nueva');
    await user.type(screen.getByLabelText('Correo'), 'no-es-un-correo');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('Ese correo no es válido')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('da de alta y muestra la contraseña temporal una sola vez', async () => {
    const fetchMock = apiFalsa();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<MembersPage />);
    await screen.findByText('Otra persona');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Nombre'), 'Persona nueva');
    await user.type(screen.getByLabelText('Correo'), 'nueva@empresa.pe');
    await user.selectOptions(screen.getByLabelText('Rol'), 'VIEWER');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('clave-generada-larga')).toBeInTheDocument();

    const alta = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(alta?.[1]?.body))).toEqual({
      displayName: 'Persona nueva',
      email: 'nueva@empresa.pe',
      role: 'VIEWER',
    });

    // Se puede descartar: la contraseña no debe quedarse en pantalla indefinidamente.
    await user.click(screen.getByRole('button', { name: 'Entendido' }));
    await waitFor(() => {
      expect(screen.queryByText('clave-generada-larga')).not.toBeInTheDocument();
    });
  });

  it('traduce el rechazo del servidor a un motivo entendible', async () => {
    vi.stubGlobal(
      'fetch',
      apiFalsa({ post: () => jsonResponse(409, { code: 'MEMBER_ALREADY_EXISTS' }) }),
    );
    renderWithProviders(<MembersPage />);
    await screen.findByText('Otra persona');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Nombre'), 'Persona repetida');
    await user.type(screen.getByLabelText('Correo'), 'otra@empresa.pe');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(
      await screen.findByText('Esa persona ya pertenece a la organización.'),
    ).toBeInTheDocument();
  });

  it('cambia el rol de otra persona enviando solo ese campo', async () => {
    const fetchMock = apiFalsa();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<MembersPage />);
    await screen.findByText('Otra persona');

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Rol de Otra persona'), 'ADMIN');

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ role: 'ADMIN' });
    });
  });

  it('quita el acceso sin borrar la cuenta', async () => {
    const fetchMock = apiFalsa();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<MembersPage />);
    await screen.findByText('Otra persona');

    const user = userEvent.setup();
    await user.click(within(filaDe('Otra persona')).getByRole('button', { name: 'Quitar acceso' }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ membershipStatus: 'REVOKED' });
    });
  });

  it('ofrece reactivar a quien está sin acceso, y no cambiarle el rol', async () => {
    vi.stubGlobal(
      'fetch',
      apiFalsa({
        lista: () => jsonResponse(200, [YO, { ...OTRA, membershipStatus: 'REVOKED' }]),
      }),
    );
    renderWithProviders(<MembersPage />);
    await screen.findByText('Otra persona');

    const fila = filaDe('Otra persona');
    expect(within(fila).getByText('Sin acceso')).toBeInTheDocument();
    expect(within(fila).getByRole('button', { name: 'Reactivar' })).toBeEnabled();
    expect(within(fila).getByLabelText('Rol de Otra persona')).toBeDisabled();
  });

  it('restablece la contraseña y entrega la temporal', async () => {
    vi.stubGlobal('fetch', apiFalsa());
    renderWithProviders(<MembersPage />);
    await screen.findByText('Otra persona');

    const user = userEvent.setup();
    await user.click(
      within(filaDe('Otra persona')).getByRole('button', { name: 'Restablecer contraseña' }),
    );

    expect(await screen.findByText('clave-temporal-larga')).toBeInTheDocument();
    expect(screen.getByText('otra@empresa.pe', { selector: 'strong' })).toBeInTheDocument();
  });

  it('explica por qué no puede quedarse sin propietarios', async () => {
    vi.stubGlobal('fetch', apiFalsa({ patch: () => jsonResponse(409, { code: 'LAST_OWNER' }) }));
    renderWithProviders(<MembersPage />);
    await screen.findByText('Otra persona');

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Rol de Otra persona'), 'VIEWER');

    expect(
      await screen.findByText('No puedes dejar la organización sin ningún propietario activo.'),
    ).toBeInTheDocument();
  });

  it('muestra el motivo cuando no puede cargar la lista', async () => {
    vi.stubGlobal(
      'fetch',
      apiFalsa({ lista: () => jsonResponse(403, { code: 'INSUFFICIENT_ROLE' }) }),
    );
    renderWithProviders(<MembersPage />);

    expect(await screen.findByText('Tu rol no permite hacer este cambio.')).toBeInTheDocument();
  });
});

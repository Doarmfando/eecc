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
  status: 'ACTIVE',
  membershipStatus: 'ACTIVE',
  documentCount: 0,
  lastLoginAt: '2026-08-26T15:30:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const OTRA = {
  userId: '44444444-4444-4444-8444-444444444444',
  email: 'otra@empresa.pe',
  displayName: 'Otra persona',
  role: 'MEMBER',
  status: 'ACTIVE',
  membershipStatus: 'ACTIVE',
  documentCount: 2,
  lastLoginAt: null,
  createdAt: '2026-02-01T00:00:00.000Z',
};

const JEFA = {
  ...OTRA,
  userId: '55555555-5555-4555-8555-555555555555',
  email: 'jefa@empresa.pe',
  displayName: 'Jefa de área',
  role: 'ADMIN',
  documentCount: 3,
};

type Respuestas = Partial<{
  lista: () => Response;
  alta: () => Response;
  edicion: () => Response;
  clave: () => Response;
  borrado: () => Response;
}>;

/** Doble que responde por método y ruta, para medir qué se pidió y no solo qué se pintó. */
function apiFalsa(respuestas: Respuestas = {}): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const metodo = (init?.method ?? 'GET').toUpperCase();
    if (metodo === 'GET') {
      return Promise.resolve(respuestas.lista?.() ?? jsonResponse(200, [YO, OTRA, JEFA]));
    }
    if (metodo === 'PATCH') {
      return Promise.resolve(respuestas.edicion?.() ?? jsonResponse(200, OTRA));
    }
    if (metodo === 'DELETE') {
      return Promise.resolve(respuestas.borrado?.() ?? new Response(null, { status: 204 }));
    }
    if (url.includes('/password-reset')) {
      return Promise.resolve(
        respuestas.clave?.() ?? jsonResponse(201, { temporaryPassword: 'clave-temporal-larga' }),
      );
    }
    return Promise.resolve(
      respuestas.alta?.() ??
        jsonResponse(201, {
          member: { ...OTRA, email: 'nueva@empresa.pe', displayName: 'Persona nueva' },
          temporaryPassword: 'clave-generada-larga',
        }),
    );
  });
}

function peticiones(fetchMock: ReturnType<typeof vi.fn>, metodo: string): [string, RequestInit][] {
  return (fetchMock.mock.calls as [string, RequestInit | undefined][])
    .filter(([, init]) => (init?.method ?? 'GET') === metodo)
    .map(([url, init]) => [url, init ?? {}]);
}

function cuerpo(init: RequestInit | undefined): unknown {
  return JSON.parse(init?.body as string);
}

function filaDe(nombre: string): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(nombre) });
}

async function montar(respuestas: Respuestas = {}): Promise<ReturnType<typeof vi.fn>> {
  const fetchMock = apiFalsa(respuestas);
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(<MembersPage />);
  await screen.findByText('Otra persona');
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MembersPage: listado', () => {
  it('muestra rol, estado, documentos y último acceso de cada cuenta', async () => {
    await montar();

    const otra = filaDe('Otra persona');
    expect(within(otra).getByText('otra@empresa.pe')).toBeInTheDocument();
    expect(within(otra).getByText('Usuario')).toBeInTheDocument();
    expect(within(otra).getByText('Activa')).toBeInTheDocument();
    // El administrador sabe cuántos archivos tiene cargados cada persona.
    expect(within(otra).getByText(/de 3/).parentElement).toHaveTextContent('2 de 3');
    // Quien nunca entró no debe aparecer con una fecha inventada.
    expect(within(otra).getByText('Nunca')).toBeInTheDocument();
    expect(within(filaDe('Jefa de área')).getByText('Administrador')).toBeInTheDocument();
  });

  it('resume cuentas, administradores y documentos cargados', async () => {
    await montar();

    const indicador = (etiqueta: string): HTMLElement =>
      screen.getByText(etiqueta, { selector: 'p' }).parentElement as HTMLElement;
    expect(indicador('Cuentas')).toHaveTextContent('31 usuario');
    expect(indicador('Administradores')).toHaveTextContent('2');
    expect(indicador('Documentos cargados')).toHaveTextContent('5');
  });

  it('marca la propia cuenta y no deja quitarse el acceso ni cambiarse la contraseña desde aquí', async () => {
    await montar();

    const mia = filaDe(TEST_USER.displayName);
    expect(within(mia).getByText('(tú)')).toBeInTheDocument();
    expect(
      within(mia).getByRole('button', { name: `Desactivar a ${TEST_USER.displayName}` }),
    ).toBeDisabled();
    expect(
      within(mia).getByRole('button', {
        name: `Cambiar la contraseña de ${TEST_USER.displayName}`,
      }),
    ).toBeDisabled();
  });

  it('no ofrece eliminar a un administrador', async () => {
    await montar();

    expect(
      within(filaDe('Jefa de área')).getByRole('button', {
        name: 'Jefa de área es administrador y no se puede eliminar',
      }),
    ).toBeDisabled();
    expect(
      within(filaDe('Otra persona')).getByRole('button', { name: 'Eliminar a Otra persona' }),
    ).toBeEnabled();
  });

  it('busca por nombre o correo y filtra por tipo de cuenta', async () => {
    await montar({
      lista: () => jsonResponse(200, [YO, { ...OTRA, membershipStatus: 'REVOKED' }, JEFA]),
    });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Buscar por nombre o correo'), 'JEFA@');
    expect(screen.getByText('Jefa de área')).toBeInTheDocument();
    expect(screen.queryByText('Otra persona')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Buscar por nombre o correo'));
    await user.click(screen.getByRole('button', { name: 'Desactivados' }));
    expect(screen.getByText('Otra persona')).toBeInTheDocument();
    expect(screen.queryByText('Jefa de área')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Buscar por nombre o correo'), 'nadie');
    expect(screen.getByText('Ninguna cuenta coincide con la búsqueda.')).toBeInTheDocument();
  });

  it('muestra el motivo cuando no puede cargar la lista', async () => {
    vi.stubGlobal(
      'fetch',
      apiFalsa({ lista: () => jsonResponse(403, { code: 'INSUFFICIENT_ROLE' }) }),
    );
    renderWithProviders(<MembersPage />);

    expect(
      await screen.findByText('Solo un administrador puede gestionar cuentas.'),
    ).toBeInTheDocument();
  });
});

describe('MembersPage: alta', () => {
  async function abrirAlta(): Promise<{
    user: ReturnType<typeof userEvent.setup>;
    dialogo: HTMLElement;
  }> {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    return { user, dialogo: await screen.findByRole('dialog') };
  }

  it('crea una cuenta con contraseña generada y la muestra una sola vez', async () => {
    const fetchMock = await montar();
    const { user, dialogo } = await abrirAlta();

    await user.type(within(dialogo).getByLabelText('Nombre'), 'Persona nueva');
    await user.type(within(dialogo).getByLabelText('Correo'), 'nueva@empresa.pe');
    await user.click(within(dialogo).getByRole('button', { name: 'Crear usuario' }));

    expect(await screen.findByText('clave-generada-larga')).toBeInTheDocument();
    const [, alta] = peticiones(fetchMock, 'POST')[0] ?? [];
    // Sin `password`: es lo que le pide al servidor que la genere.
    expect(cuerpo(alta)).toEqual({
      displayName: 'Persona nueva',
      email: 'nueva@empresa.pe',
      role: 'MEMBER',
    });

    // Se puede descartar: la contraseña no debe quedarse en pantalla indefinidamente.
    await user.click(screen.getByRole('button', { name: 'Entendido' }));
    await waitFor(() => {
      expect(screen.queryByText('clave-generada-larga')).not.toBeInTheDocument();
    });
  });

  it('crea un administrador con la contraseña que escribe quien administra', async () => {
    const fetchMock = await montar({
      alta: () =>
        jsonResponse(201, {
          member: { ...JEFA, email: 'nuevo-admin@empresa.pe' },
          temporaryPassword: null,
        }),
    });
    const { user, dialogo } = await abrirAlta();

    await user.type(within(dialogo).getByLabelText('Nombre'), 'Nuevo admin');
    await user.type(within(dialogo).getByLabelText('Correo'), 'nuevo-admin@empresa.pe');
    await user.click(within(dialogo).getByRole('radio', { name: /Administrador/ }));
    await user.click(within(dialogo).getByRole('radio', { name: /Escribirla yo/ }));
    await user.type(within(dialogo).getByLabelText('Contraseña inicial'), 'una-clave-bien-larga');
    await user.click(within(dialogo).getByRole('button', { name: 'Crear usuario' }));

    expect(
      await screen.findByText('Cuenta creada para nuevo-admin@empresa.pe.'),
    ).toBeInTheDocument();
    const [, alta] = peticiones(fetchMock, 'POST')[0] ?? [];
    expect(cuerpo(alta)).toEqual({
      displayName: 'Nuevo admin',
      email: 'nuevo-admin@empresa.pe',
      role: 'ADMIN',
      password: 'una-clave-bien-larga',
    });
  });

  it('no envía nada con un correo inválido o una contraseña corta', async () => {
    const fetchMock = await montar();
    const { user, dialogo } = await abrirAlta();

    await user.type(within(dialogo).getByLabelText('Nombre'), 'Persona nueva');
    await user.type(within(dialogo).getByLabelText('Correo'), 'no-es-un-correo');
    await user.click(within(dialogo).getByRole('radio', { name: /Escribirla yo/ }));
    await user.type(within(dialogo).getByLabelText('Contraseña inicial'), 'corta');
    await user.click(within(dialogo).getByRole('button', { name: 'Crear usuario' }));

    expect(await within(dialogo).findByText('Ese correo no es válido')).toBeInTheDocument();
    expect(within(dialogo).getByText('Al menos 12 caracteres')).toBeInTheDocument();
    expect(peticiones(fetchMock, 'POST')).toHaveLength(0);
  });

  it('deja ver la contraseña escrita para comprobarla antes de entregarla', async () => {
    await montar();
    const { user, dialogo } = await abrirAlta();

    await user.click(within(dialogo).getByRole('radio', { name: /Escribirla yo/ }));
    const campo = within(dialogo).getByLabelText('Contraseña inicial');
    expect(campo).toHaveAttribute('type', 'password');

    await user.click(within(dialogo).getByRole('button', { name: 'Mostrar contraseña' }));
    expect(campo).toHaveAttribute('type', 'text');
  });

  it('traduce el rechazo del servidor a un motivo entendible', async () => {
    await montar({ alta: () => jsonResponse(409, { code: 'MEMBER_ALREADY_EXISTS' }) });
    const { user, dialogo } = await abrirAlta();

    await user.type(within(dialogo).getByLabelText('Nombre'), 'Persona repetida');
    await user.type(within(dialogo).getByLabelText('Correo'), 'otra@empresa.pe');
    await user.click(within(dialogo).getByRole('button', { name: 'Crear usuario' }));

    expect(
      await within(dialogo).findByText('Ya existe una cuenta con ese correo en la organización.'),
    ).toBeInTheDocument();
  });
});

describe('MembersPage: edición', () => {
  it('cambia nombre y correo enviando solo lo que cambió', async () => {
    const fetchMock = await montar();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Editar a Otra persona' }));
    const dialogo = await screen.findByRole('dialog');
    const nombre = within(dialogo).getByLabelText('Nombre');
    await user.clear(nombre);
    await user.type(nombre, 'Otra persona renombrada');
    const correo = within(dialogo).getByLabelText('Correo');
    await user.clear(correo);
    await user.type(correo, 'renombrada@empresa.pe');
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      const [url, init] = peticiones(fetchMock, 'PATCH')[0] ?? [];
      expect(url).toContain(`/v1/users/${OTRA.userId}`);
      expect(cuerpo(init)).toEqual({
        displayName: 'Otra persona renombrada',
        email: 'renombrada@empresa.pe',
      });
    });
    expect(await screen.findByText(/Cambios guardados/)).toBeInTheDocument();
  });

  it('no llama al servidor si no cambió nada', async () => {
    const fetchMock = await montar();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Editar a Otra persona' }));
    const dialogo = await screen.findByRole('dialog');
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(peticiones(fetchMock, 'PATCH')).toHaveLength(0);
  });

  it('asciende a un usuario a administrador', async () => {
    const fetchMock = await montar();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Editar a Otra persona' }));
    const dialogo = await screen.findByRole('dialog');
    await user.click(within(dialogo).getByRole('radio', { name: /Administrador/ }));
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(cuerpo(peticiones(fetchMock, 'PATCH')[0]?.[1])).toEqual({ role: 'ADMIN' });
    });
  });

  it('no deja degradar a un administrador', async () => {
    await montar();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Editar a Jefa de área' }));
    const dialogo = await screen.findByRole('dialog');

    expect(within(dialogo).getByRole('radio', { name: /Usuario/ })).toBeDisabled();
    expect(
      within(dialogo).getByText('Un administrador no puede pasar a ser usuario.'),
    ).toBeInTheDocument();
  });

  it('explica el conflicto cuando el correo ya lo usa otra cuenta', async () => {
    await montar({ edicion: () => jsonResponse(409, { code: 'EMAIL_ALREADY_IN_USE' }) });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Editar a Otra persona' }));
    const dialogo = await screen.findByRole('dialog');
    const correo = within(dialogo).getByLabelText('Correo');
    await user.clear(correo);
    await user.type(correo, 'jefa@empresa.pe');
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    expect(
      await within(dialogo).findByText('Ese correo ya lo usa otra cuenta.'),
    ).toBeInTheDocument();
  });
});

describe('MembersPage: contraseña', () => {
  it('genera una temporal y la entrega', async () => {
    const fetchMock = await montar();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Cambiar la contraseña de Otra persona' }));
    const dialogo = await screen.findByRole('dialog');
    await user.click(within(dialogo).getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByText('clave-temporal-larga')).toBeInTheDocument();
    expect(screen.getByText('otra@empresa.pe', { selector: 'strong' })).toBeInTheDocument();
    expect(cuerpo(peticiones(fetchMock, 'POST')[0]?.[1])).toEqual({});
  });

  it('fija la que escribe quien administra', async () => {
    const fetchMock = await montar({
      clave: () => jsonResponse(201, { temporaryPassword: null }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Cambiar la contraseña de Otra persona' }));
    const dialogo = await screen.findByRole('dialog');
    await user.click(within(dialogo).getByRole('radio', { name: /Escribirla yo/ }));
    await user.type(within(dialogo).getByLabelText('Nueva contraseña'), 'otra-clave-bien-larga');
    await user.click(within(dialogo).getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByText(/Contraseña cambiada para Otra persona/)).toBeInTheDocument();
    const [url, init] = peticiones(fetchMock, 'POST')[0] ?? [];
    expect(url).toContain(`/v1/users/${OTRA.userId}/password-reset`);
    expect(cuerpo(init)).toEqual({ password: 'otra-clave-bien-larga' });
  });
});

describe('MembersPage: acceso y eliminación', () => {
  it('desactiva sin borrar la cuenta', async () => {
    const fetchMock = await montar({
      edicion: () => jsonResponse(200, { ...OTRA, membershipStatus: 'REVOKED' }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Desactivar a Otra persona' }));

    await waitFor(() => {
      expect(cuerpo(peticiones(fetchMock, 'PATCH')[0]?.[1])).toEqual({
        membershipStatus: 'REVOKED',
      });
    });
    expect(await screen.findByText(/ya no puede entrar/)).toBeInTheDocument();
    expect(peticiones(fetchMock, 'DELETE')).toHaveLength(0);
  });

  it('reactiva a quien estaba desactivado', async () => {
    const fetchMock = await montar({
      lista: () => jsonResponse(200, [YO, { ...OTRA, membershipStatus: 'REVOKED' }]),
    });
    const user = userEvent.setup();

    expect(within(filaDe('Otra persona')).getByText('Desactivada')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Activar a Otra persona' }));

    await waitFor(() => {
      expect(cuerpo(peticiones(fetchMock, 'PATCH')[0]?.[1])).toEqual({
        membershipStatus: 'ACTIVE',
      });
    });
  });

  it('elimina tras confirmar y advierte de los documentos que arrastra', async () => {
    const fetchMock = await montar();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Eliminar a Otra persona' }));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('sus 2 documentos procesados');
    // Nada se borra hasta confirmar.
    expect(peticiones(fetchMock, 'DELETE')).toHaveLength(0);

    await user.click(within(dialogo).getByRole('button', { name: 'Eliminar usuario' }));

    await waitFor(() => {
      const [url] = peticiones(fetchMock, 'DELETE')[0] ?? [];
      expect(url).toContain(`/v1/users/${OTRA.userId}`);
    });
    expect(await screen.findByText(/fue eliminado junto con sus documentos/)).toBeInTheDocument();
  });

  it('explica el rechazo si el servidor se niega a eliminar', async () => {
    await montar({ borrado: () => jsonResponse(409, { code: 'ADMIN_CANNOT_BE_DELETED' }) });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Eliminar a Otra persona' }));
    const dialogo = await screen.findByRole('dialog');
    await user.click(within(dialogo).getByRole('button', { name: 'Eliminar usuario' }));

    expect(
      await within(dialogo).findByText(
        'Un administrador no se puede eliminar. Puedes desactivarlo.',
      ),
    ).toBeInTheDocument();
  });
});

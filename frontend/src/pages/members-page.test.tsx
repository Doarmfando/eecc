import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { hoyLocal, sumarMeses } from '@/lib/plan-dates';
import { renderWithProviders, TEST_USER } from '@/test/render';

import { MembersPage } from './members-page';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const TODAS = [
  'EDIT_PROFILE',
  'CHANGE_PLAN',
  'CHANGE_ROLE',
  'CHANGE_STATUS',
  'RESET_PASSWORD',
  'DELETE',
];

const ATLAS = {
  planCode: 'ATLAS',
  planName: 'Atlas',
  maxRetainedStatements: 20,
  maxPagesPerDocument: null,
};

const BASICA = {
  planCode: 'BASICA',
  planName: 'Básica',
  maxRetainedStatements: 3,
  maxPagesPerDocument: 15,
};

/** Lo que la API manda a un administrador: las acciones ya vienen calculadas por rango. */
const YO = {
  userId: TEST_USER.userId,
  email: TEST_USER.email,
  displayName: TEST_USER.displayName,
  role: 'ADMIN',
  roleName: 'Administrador',
  roleRank: 50,
  ...ATLAS,
  actions: ['EDIT_PROFILE', 'CHANGE_PLAN'],
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
  roleName: 'Usuario',
  roleRank: 10,
  ...BASICA,
  planExpiryRequired: true,
  planExpiresOn: '2099-12-31',
  planExpired: false,
  actions: TODAS,
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
  roleName: 'Administrador',
  roleRank: 50,
  ...ATLAS,
  // Los administradores no vencen.
  planExpiryRequired: false,
  planExpiresOn: null,
  actions: ['EDIT_PROFILE', 'CHANGE_PLAN', 'CHANGE_STATUS', 'RESET_PASSWORD'],
  documentCount: 3,
};

const DUENO = {
  ...OTRA,
  userId: '66666666-6666-4666-8666-666666666666',
  email: 'brando@hotmail.com',
  displayName: 'Brando',
  role: 'SUPER_ADMIN',
  roleName: 'Superadministrador',
  roleRank: 100,
  ...ATLAS,
  planExpiryRequired: false,
  planExpiresOn: null,
  actions: [],
};

/** Roles que un administrador puede asignar: el suyo y los de rango inferior. */
const ROLES = [
  {
    code: 'MEMBER',
    name: 'Usuario',
    description: 'Convierte estados de cuenta.',
    rank: 10,
    defaultPlanCode: null,
    planExpiryRequired: true,
    permissions: ['STATEMENTS_CONVERT'],
  },
  {
    code: 'ADMIN',
    name: 'Administrador',
    description: 'Gestiona cuentas.',
    rank: 50,
    defaultPlanCode: 'ATLAS',
    planExpiryRequired: false,
    permissions: ['STATEMENTS_CONVERT', 'USERS_MANAGE'],
  },
];

const PLANES = [
  {
    code: 'BASICA',
    name: 'Básica',
    description: 'Solo conversión',
    maxRetainedStatements: 3,
    maxPagesPerDocument: 15,
    features: [],
    isDefault: true,
  },
  {
    code: 'ATLAS',
    name: 'Atlas',
    description: 'Todo',
    maxRetainedStatements: 20,
    maxPagesPerDocument: null,
    features: ['FINANCIAL_CALENDAR', 'FINANCIAL_CENTER', 'HISTORY'],
    isDefault: false,
  },
];

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
    if (metodo === 'GET' && url.includes('/v1/roles')) {
      return Promise.resolve(jsonResponse(200, ROLES));
    }
    if (metodo === 'GET' && url.includes('/v1/plans')) {
      return Promise.resolve(jsonResponse(200, PLANES));
    }
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
    expect(indicador('Administración')).toHaveTextContent('2');
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
        name: 'Jefa de área no se puede eliminar desde tu cuenta',
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
    await user.click(await within(dialogo).findByRole('radio', { name: /^Usuario/ }));
    await user.click(within(dialogo).getByRole('radio', { name: /^Básica/ }));
    await user.click(within(dialogo).getByRole('button', { name: 'Crear usuario' }));

    expect(await screen.findByText('clave-generada-larga')).toBeInTheDocument();
    const [, alta] = peticiones(fetchMock, 'POST')[0] ?? [];
    // Sin `password`: es lo que le pide al servidor que la genere.
    // Un usuario normal nace con vencimiento: se propone un mes, visible y editable.
    expect(cuerpo(alta)).toEqual({
      displayName: 'Persona nueva',
      email: 'nueva@empresa.pe',
      role: 'MEMBER',
      planCode: 'BASICA',
      planExpiresOn: sumarMeses(hoyLocal(), 1),
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
    await user.click(await within(dialogo).findByRole('radio', { name: /^Administrador/ }));
    // Otro administrador para la empresa: su rol propone Atlas.
    expect(within(dialogo).getByRole('radio', { name: /^Atlas/ })).toBeChecked();
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
      planCode: 'ATLAS',
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

  it('solo admite correos de los dominios de la organización y lo avisa antes', async () => {
    const fetchMock = await montar();
    const { user, dialogo } = await abrirAlta();

    expect(
      within(dialogo).getByText('Admitidos: @hotmail.com, @empresa.pe o @eecc.local'),
    ).toBeInTheDocument();

    await user.type(within(dialogo).getByLabelText('Nombre'), 'Diego');
    await user.type(within(dialogo).getByLabelText('Correo'), 'diego@avax.pe');
    await user.click(within(dialogo).getByRole('button', { name: 'Crear usuario' }));

    expect(
      await within(dialogo).findByText(
        'Solo se admiten correos @hotmail.com, @empresa.pe o @eecc.local',
      ),
    ).toBeInTheDocument();
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
    await user.click(await within(dialogo).findByRole('radio', { name: /^Usuario/ }));
    await user.click(within(dialogo).getByRole('radio', { name: /^Básica/ }));
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

  it('deja renombrar una cuenta antigua con otro dominio sin obligar a cambiar su correo', async () => {
    const antigua = { ...OTRA, email: 'vieja@avax.pe' };
    const fetchMock = await montar({ lista: () => jsonResponse(200, [YO, antigua]) });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Editar a Otra persona' }));
    const dialogo = await screen.findByRole('dialog');
    const nombre = within(dialogo).getByLabelText('Nombre');
    await user.clear(nombre);
    await user.type(nombre, 'Nombre corregido');
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(cuerpo(peticiones(fetchMock, 'PATCH')[0]?.[1])).toEqual({
        displayName: 'Nombre corregido',
      });
    });
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
    await user.click(await within(dialogo).findByRole('radio', { name: /^Administrador/ }));
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

    expect(await within(dialogo).findByRole('radio', { name: /^Usuario/ })).toBeDisabled();
    expect(
      within(dialogo).getByText(
        'Solo alguien de rango superior puede cambiar el rol de esta cuenta.',
      ),
    ).toBeInTheDocument();
    // Entre administradores, la membresía sí se puede cambiar.
    expect(within(dialogo).getByRole('radio', { name: /^Básica/ })).toBeEnabled();
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
      await within(dialogo).findByText(/No puedes eliminar una cuenta de tu mismo rango/),
    ).toBeInTheDocument();
    // Y lo que soporte necesita para encontrarlo, por si hay que llamar.
    expect(within(dialogo).getByText('ADMIN_CANNOT_BE_DELETED')).toBeInTheDocument();
    expect(within(dialogo).getByText('Permisos')).toBeInTheDocument();
  });
});

describe('MembersPage: membresías y jerarquía', () => {
  it('muestra la membresía de cada cuenta y su cupo', async () => {
    await montar();

    const otra = filaDe('Otra persona');
    expect(within(otra).getByText('Básica')).toBeInTheDocument();
    expect(within(otra).getByText(/de 3/).parentElement).toHaveTextContent('2 de 3');
    const jefa = filaDe('Jefa de área');
    expect(within(jefa).getByText('Atlas')).toBeInTheDocument();
    expect(within(jefa).getByText(/de 20/).parentElement).toHaveTextContent('3 de 20');
  });

  it('el alta siempre pide rol y membresía', async () => {
    const fetchMock = await montar();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    const dialogo = await screen.findByRole('dialog');

    await user.type(within(dialogo).getByLabelText('Nombre'), 'Persona nueva');
    await user.type(within(dialogo).getByLabelText('Correo'), 'nueva@empresa.pe');
    await user.click(within(dialogo).getByRole('button', { name: 'Crear usuario' }));

    expect(await within(dialogo).findByText('Elige el rol')).toBeInTheDocument();
    expect(within(dialogo).getByText('Elige la membresía')).toBeInTheDocument();
    expect(peticiones(fetchMock, 'POST')).toHaveLength(0);
  });

  it('cambia la membresía de un usuario y avisa si guardará menos documentos', async () => {
    const fetchMock = await montar({
      lista: () => jsonResponse(200, [YO, { ...OTRA, ...ATLAS, documentCount: 12 }]),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Editar a Otra persona' }));
    const dialogo = await screen.findByRole('dialog');
    await user.click(await within(dialogo).findByRole('radio', { name: /^Básica/ }));

    expect(within(dialogo).getByText(/Tiene 12 documentos y Básica guarda 3/)).toBeInTheDocument();
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(cuerpo(peticiones(fetchMock, 'PATCH')[0]?.[1])).toEqual({ planCode: 'BASICA' });
    });
  });

  it('a un superadministrador se le ve, pero un administrador no puede tocarlo', async () => {
    await montar({ lista: () => jsonResponse(200, [DUENO, YO, OTRA]) });

    const dueno = filaDe('Brando');
    expect(within(dueno).getByText('Superadministrador')).toBeInTheDocument();
    expect(
      within(dueno).getByRole('button', { name: 'Brando tiene un rol superior al tuyo' }),
    ).toBeDisabled();
    expect(
      within(dueno).getByRole('button', { name: 'Cambiar la contraseña de Brando' }),
    ).toBeDisabled();
    expect(within(dueno).getByRole('button', { name: 'Desactivar a Brando' })).toBeDisabled();
    // Los filtros salen de los roles presentes, del más alto al más bajo.
    expect(screen.getByRole('button', { name: 'Superadministrador' })).toBeInTheDocument();
  });
});

describe('MembersPage: vigencia de la membresía', () => {
  it('el alta de un usuario normal pide hasta cuándo vale, con atajos', async () => {
    const fetchMock = await montar();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    const dialogo = await screen.findByRole('dialog');

    await user.type(within(dialogo).getByLabelText('Nombre'), 'Cliente nuevo');
    await user.type(within(dialogo).getByLabelText('Correo'), 'cliente@empresa.pe');
    await user.click(await within(dialogo).findByRole('radio', { name: /^Usuario/ }));
    await user.click(within(dialogo).getByRole('radio', { name: /^Atlas/ }));
    expect(within(dialogo).getByLabelText('Vence el')).toHaveValue(sumarMeses(hoyLocal(), 1));
    await user.click(within(dialogo).getByRole('button', { name: '3 meses' }));
    await user.click(within(dialogo).getByRole('button', { name: 'Crear usuario' }));

    await waitFor(() => {
      expect(cuerpo(peticiones(fetchMock, 'POST')[0]?.[1])).toMatchObject({
        role: 'MEMBER',
        planCode: 'ATLAS',
        planExpiresOn: sumarMeses(hoyLocal(), 3),
      });
    });
  });

  it('un administrador no lleva vencimiento', async () => {
    await montar();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    const dialogo = await screen.findByRole('dialog');

    await user.click(await within(dialogo).findByRole('radio', { name: /^Administrador/ }));

    expect(within(dialogo).queryByLabelText('Vence el')).not.toBeInTheDocument();
  });

  it('no deja dar de alta a un usuario ya vencido', async () => {
    const fetchMock = await montar();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    const dialogo = await screen.findByRole('dialog');

    await user.type(within(dialogo).getByLabelText('Nombre'), 'Cliente nuevo');
    await user.type(within(dialogo).getByLabelText('Correo'), 'cliente@empresa.pe');
    await user.click(await within(dialogo).findByRole('radio', { name: /^Usuario/ }));
    await user.click(within(dialogo).getByRole('radio', { name: /^Básica/ }));
    const fecha = within(dialogo).getByLabelText('Vence el');
    await user.clear(fecha);
    await user.type(fecha, '2020-01-01');
    await user.click(within(dialogo).getByRole('button', { name: 'Crear usuario' }));

    expect(await within(dialogo).findByText('No puede vencer antes de hoy')).toBeInTheDocument();
    expect(peticiones(fetchMock, 'POST')).toHaveLength(0);
  });

  it('cada usuario normal muestra su vencimiento y los vencidos se filtran', async () => {
    const vencida = {
      ...OTRA,
      userId: '77777777-7777-4777-8777-777777777777',
      email: 'vencida@empresa.pe',
      displayName: 'Cuenta vencida',
      planExpiresOn: '2020-01-31',
      planExpired: true,
    };
    await montar({ lista: () => jsonResponse(200, [YO, OTRA, vencida, JEFA]) });
    const user = userEvent.setup();

    expect(within(filaDe('Otra persona')).getByText(/^Vence el /)).toBeInTheDocument();
    expect(within(filaDe('Cuenta vencida')).getByText(/^Venció el /)).toBeInTheDocument();
    // Los administradores no vencen: no muestran nada.
    expect(within(filaDe('Jefa de área')).queryByText(/Vence|Venció/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Vencidas' }));
    expect(screen.getByText('Cuenta vencida')).toBeInTheDocument();
    expect(screen.queryByText('Otra persona')).not.toBeInTheDocument();
  });

  it('renueva desde el vencimiento actual y puede quitarlo', async () => {
    const fetchMock = await montar();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Editar a Otra persona' }));
    let dialogo = await screen.findByRole('dialog');
    expect(await within(dialogo).findByLabelText('Vence el')).toHaveValue('2099-12-31');
    await user.click(within(dialogo).getByRole('button', { name: '1 mes' }));
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => {
      expect(cuerpo(peticiones(fetchMock, 'PATCH')[0]?.[1])).toEqual({
        planExpiresOn: '2100-01-31',
      });
    });

    await user.click(screen.getByRole('button', { name: 'Editar a Otra persona' }));
    dialogo = await screen.findByRole('dialog');
    await user.click(await within(dialogo).findByRole('button', { name: 'Quitar vencimiento' }));
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => {
      expect(cuerpo(peticiones(fetchMock, 'PATCH')[1]?.[1])).toEqual({ planExpiresOn: null });
    });
  });
});

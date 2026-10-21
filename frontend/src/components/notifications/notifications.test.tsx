import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-error';
import { renderWithProviders } from '@/test/render';

import { useNotifications, useNotifyError, type NotificationInput } from './notifications-context';

function Disparador({ aviso }: { aviso: NotificationInput }): React.ReactNode {
  const { notify } = useNotifications();
  return (
    <button
      type="button"
      onClick={() => {
        notify(aviso);
      }}
    >
      Avisar
    </button>
  );
}

function DisparadorDeError({ error }: { error: unknown }): React.ReactNode {
  const notifyError = useNotifyError();
  return (
    <button
      type="button"
      onClick={() => {
        notifyError(error, 'No se pudo procesar «estado.pdf»');
      }}
    >
      Fallar
    </button>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Avisos', () => {
  it('un error se queda hasta cerrarlo y trae lo que soporte necesita', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DisparadorDeError
        error={
          new ApiError('PDF_PAGE_LIMIT_EXCEEDED', 422, 'req-123', undefined, {
            pageCount: 42,
            maxPages: 15,
          })
        }
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Fallar' }));

    const aviso = screen.getByRole('alert');
    expect(within(aviso).getByText('No se pudo procesar «estado.pdf»')).toBeInTheDocument();
    expect(
      within(aviso).getByText(/El PDF tiene 42 páginas y tu membresía admite hasta 15/),
    ).toBeInTheDocument();
    expect(within(aviso).getByText('Límite de la membresía')).toBeInTheDocument();
    expect(within(aviso).getByText('PDF_PAGE_LIMIT_EXCEEDED')).toBeInTheDocument();
    expect(within(aviso).getByText('req-123')).toBeInTheDocument();
    expect(within(aviso).getByRole('link', { name: /\+51 999 888 777/ })).toHaveAttribute(
      'href',
      'tel:+51999888777',
    );

    await user.click(within(aviso).getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('el mismo fallo avisado dos veces se ve una sola', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DisparadorDeError error={new ApiError('INVALID_PDF', 422, 'req-1')} />);

    await user.click(screen.getByRole('button', { name: 'Fallar' }));
    await user.click(screen.getByRole('button', { name: 'Fallar' }));

    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('un aviso de éxito se retira solo', () => {
    vi.useFakeTimers();
    renderWithProviders(
      <Disparador aviso={{ variant: 'success', title: 'estado.pdf convertido' }} />,
    );

    act(() => {
      screen.getByRole('button', { name: 'Avisar' }).click();
    });
    expect(screen.getByText('estado.pdf convertido')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(6500);
    });
    expect(screen.queryByText('estado.pdf convertido')).not.toBeInTheDocument();
  });

  it('copia los datos para soporte en una línea', async () => {
    const user = userEvent.setup();
    const escribir = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: escribir },
      configurable: true,
    });
    renderWithProviders(<DisparadorDeError error={new ApiError('INVALID_PDF', 422, 'req-9')} />);

    await user.click(screen.getByRole('button', { name: 'Fallar' }));
    await user.click(screen.getByRole('button', { name: 'Copiar datos para soporte' }));

    expect(escribir).toHaveBeenCalledWith(
      expect.stringMatching(/^Tipo: Documento · Código: INVALID_PDF · Referencia: req-9 · Hora: /),
    );
    expect(screen.getByText('Datos copiados')).toBeInTheDocument();
  });

  it('sin teléfono de soporte dice que se avise a un administrador', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DisparadorDeError error={new Error('inesperado')} />, {
      usuario: {
        userId: 'u',
        email: 'a@empresa.pe',
        displayName: 'A',
        organizationId: 'o',
        organizationName: 'O',
        role: 'MEMBER',
        retainedStatementsPerUser: 3,
        supportPhone: null,
      },
    });

    await user.click(screen.getByRole('button', { name: 'Fallar' }));

    const aviso = screen.getByRole('alert');
    expect(within(aviso).getByText('UNEXPECTED_ERROR')).toBeInTheDocument();
    expect(within(aviso).getByText(/avisa a un administrador/)).toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UploadForm } from './upload-form';

describe('UploadForm: nombre del documento', () => {
  it('muestra el nombre seleccionado y lo actualiza al reemplazar el archivo', async () => {
    const user = userEvent.setup();
    render(<UploadForm pending={false} onSubmit={vi.fn()} />);
    const input = screen.getByLabelText('Estado de cuenta en PDF');
    await user.upload(
      input,
      new File(['pdf'], 'Cuenta sintética agosto.pdf', { type: 'application/pdf' }),
    );
    expect(screen.getByText('Cuenta sintética agosto.pdf')).toBeVisible();
    await user.upload(
      input,
      new File(['pdf'], 'Cuenta septiembre.pdf', { type: 'application/pdf' }),
    );
    expect(screen.getByText('Cuenta septiembre.pdf')).toBeVisible();
    expect(screen.queryByText('Cuenta sintética agosto.pdf')).not.toBeInTheDocument();
  });

  it('recuerda y envía el archivo arrastrado, sin depender de abrir el selector', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const file = new File(['pdf'], 'Arrastrado agosto.pdf', { type: 'application/pdf' });
    const files = { 0: file, length: 1, item: () => file };
    render(<UploadForm pending={false} onSubmit={onSubmit} />);
    fireEvent.drop(screen.getByLabelText('Estado de cuenta en PDF'), { dataTransfer: { files } });
    expect(await screen.findByText(file.name)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Procesar estado de cuenta' }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ file });
    });
  });
});

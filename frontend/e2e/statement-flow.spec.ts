import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';

const API_KEY = process.env.E2E_API_KEY;
const PDF_PATH = process.env.E2E_PDF ?? '';

test.skip(
  !API_KEY || !existsSync(PDF_PATH),
  'Requiere E2E_API_KEY y E2E_PDF con la pila levantada',
);

test('carga un estado de cuenta, revisa el resultado y descarga el Excel', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Credencial de acceso' })).toBeVisible();

  await page.getByLabel('Credencial').fill(API_KEY as string);
  await page.getByRole('button', { name: 'Usar credencial' }).click();
  await expect(page.getByRole('heading', { name: 'Sesión activa' })).toBeVisible();

  await page.getByLabel('Estado de cuenta en PDF').setInputFiles(PDF_PATH);
  await page.getByRole('button', { name: 'Procesar estado de cuenta' }).click();

  const badge = page.getByTestId('status-badge');
  await expect(badge).toBeVisible({ timeout: 30_000 });
  await expect(badge).toHaveText(/Reconciliado|Requiere revisión/);

  await expect(page.getByRole('heading', { name: 'Invariantes verificadas' })).toBeVisible();
  await expect(page.getByText('Se extrajeron filas del documento')).toBeVisible();
  // El nombre del botón es único; el rótulo del archivo se repite dentro de él.
  const workbookDownload = page.getByRole('button', {
    name: 'Descargar Excel del estado de cuenta',
  });
  await expect(workbookDownload).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    workbookDownload.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);

  await page.screenshot({ path: 'e2e/resultado.png', fullPage: true });

  // El documento recién procesado debe quedar en el historial de la organización.
  await page.getByRole('link', { name: 'Volver a cargar otro documento' }).click();
  const history = page.getByRole('heading', { name: 'Documentos procesados' });
  await expect(history).toBeVisible();
  await expect(page.getByRole('link', { name: /movimientos/ }).first()).toBeVisible();
  await page.screenshot({ path: 'e2e/historial.png', fullPage: true });
});

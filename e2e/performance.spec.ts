import { expect, test } from '@playwright/test';

test('la portada no descarga Monaco, el verificador ni el worker', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto('#/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const heavy = urls.filter((u) =>
    /CodeEditor|VerifierPage|verifier\.worker|editor\.worker/.test(u),
  );
  expect(heavy).toEqual([]);
});

test('el verificador solo carga Monaco al editar o verificar', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto('#/verificador?ejemplo=contador-mutex');
  await expect(page.getByTestId('editor-facade')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(urls.some((u) => u.includes('CodeEditor'))).toBe(false);
  expect(urls.some((u) => u.includes('verifier.worker'))).toBe(false);

  await page.getByTestId('verify').click();
  await expect(page.getByTestId('verdict')).toHaveText('Sin errores');
  expect(urls.some((u) => u.includes('verifier.worker'))).toBe(true);
  await expect(page.locator('.monaco-editor')).toBeVisible();
});

test('modo ligero: se puede activar y queda guardado', async ({ page }) => {
  await page.goto('#/');
  const html = page.locator('html');
  const toggle = page.getByTestId('lite-toggle');
  const wasLite = (await html.getAttribute('class'))?.includes('lite') ?? false;
  await toggle.click();
  await expect(html).toHaveClass(wasLite ? /^(?!.*\blite\b)/ : /\blite\b/);
  await page.reload();
  await expect(html).toHaveClass(wasLite ? /^(?!.*\blite\b)/ : /\blite\b/);
});

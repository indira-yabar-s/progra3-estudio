import { expect, test } from '@playwright/test';

test('ejemplo de deadlock → verificar → aparece la traza contraejemplo', async ({ page }) => {
  await page.goto('#/verificador?ejemplo=deadlock-clasico');
  await expect(page.getByTestId('example-select')).toHaveValue('deadlock-clasico');
  await expect(page.locator('.monaco-editor')).toBeVisible();

  await page.getByTestId('verify').click();

  const finding = page.getByTestId('finding-deadlock');
  await expect(finding).toBeVisible();
  await expect(finding).toContainText('Deadlock');
  await expect(finding).toContainText('t1 espera b');

  // La traza mínima del deadlock clásico tiene 2 pasos.
  await expect(page.getByTestId('player')).toBeVisible();
  await expect(page.getByTestId('loom').locator('[data-step]')).toHaveCount(2);

  await page.getByTestId('jump-error').click();
  await expect(page.getByTestId('step-description')).toContainText('Paso 2 de 2');
  await expect(page.getByTestId('step-description')).toContainText('deadlock');
  await expect(page.getByText('Ciclo: deadlock')).toBeVisible();
});

test('un programa correcto no reporta errores', async ({ page }) => {
  await page.goto('#/verificador?ejemplo=contador-mutex');
  await page.getByTestId('verify').click();
  await expect(page.getByTestId('verdict')).toHaveText('Sin errores');
});

test('los errores de compilación indican línea y columna', async ({ page }) => {
  await page.goto('#/verificador?ejemplo=contador-race');
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('int y = 0;\nthread t {\n  x = 1;\n}\n');
  const diagnostic = page.getByTestId('diagnostic');
  await expect(diagnostic).toContainText('línea 3, columna 3');
  await expect(diagnostic).toContainText('"x" no está declarada');
  await expect(page.getByTestId('verify')).toBeDisabled();
});

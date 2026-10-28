import { expect, test } from '@playwright/test';

test('lección → responder una pregunta → "Abrir en Telar" carga el ejemplo', async ({ page }) => {
  await page.goto('#/aprende');
  await page.getByTestId('lesson-link-mutex').click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('mutex');

  const q = page.getByTestId('question-mutex-1');
  await q.locator('label').first().click();
  await q.getByRole('button', { name: 'Comprobar' }).click();
  await expect(q.getByRole('status')).toBeVisible();

  await page.getByTestId('open-in-telar').click();
  await expect(page.getByTestId('example-select')).toHaveValue('deadlock-clasico');
});

test('el simulacro calcula una nota sobre 20 y la guarda', async ({ page }) => {
  await page.goto('#/aprende/concurrencia/simulacro');
  await page.getByTestId('exam-start').click();
  await page.locator('fieldset label').first().click();
  await page.getByTestId('exam-finish').click();
  await expect(page.getByTestId('exam-score')).toContainText('/20');

  await page.goto('#/aprende');
  await expect(page.getByText(/Mejor nota: \d+\/20/)).toBeVisible();
});

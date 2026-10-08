import { test, expect, type Page } from '@playwright/test';
async function nav(page: Page, label: string) {
  await expect(page.getByRole('button', { name:'Menu akun' })).toBeVisible();
  const menu = page.getByRole('button', { name:'Buka navigasi' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name:label, exact:true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name:'Siapa yang bisa bantu?' })).toBeVisible();
});
test('search prioritizes backup, opens accessible detail and supports category filters', async ({ page }) => {
  await page.getByRole('button', { name:'akses Figma', exact:true }).click();
  await expect(page.getByText('PIC utama tidak tersedia · Backup siap membantu')).toBeVisible();
  const card=page.locator('.result-card').first();
  await expect(card.getByRole('link', { name:/Kirim chat/ })).toHaveAttribute('rel','noopener noreferrer');
  await card.getByRole('button', { name:'Lihat detail' }).click();
  await expect(page.getByRole('dialog', { name:'Detail masalah dan PIC' })).toBeVisible();
  await expect(page.getByText('Backup PIC', { exact:false }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name:'Keuangan', exact:true }).click();
  await expect(page.getByRole('heading', { name:'Tidak ada hasil di kategori ini' })).toBeVisible();
});
test('unmatched searches are logged once per query group and persist after reload', async ({ page }) => {
  await page.getByRole('textbox', { name:'Cari masalah operasional' }).fill('zxqv zzzzz');
  await page.getByRole('button', { name:'Cari PIC', exact:true }).click();
  await expect(page.getByRole('heading', { name:'Belum menemukan yang cocok.' })).toBeVisible();
  await page.getByRole('button', { name:'Cari PIC', exact:true }).click();
  await nav(page, 'Query belum cocok');
  const row=page.getByRole('row').filter({ hasText:'zxqv zzzzz' });
  await expect(row).toHaveCount(1); await expect(row).toContainText('2 kali');
  await page.reload(); await nav(page, 'Query belum cocok');
  await expect(page.getByRole('row').filter({ hasText:'zxqv zzzzz' })).toContainText('2 kali');
});
test('admin creates a problem with synonyms, PICs and link then finds it', async ({ page }) => {
  await nav(page, 'Kelola masalah');
  await page.getByRole('button', { name:'Tambah masalah' }).click();
  const dialog=page.getByRole('dialog', { name:'Detail masalah' });
  await dialog.getByLabel('Judul masalah').fill('Penggantian kartu akses');
  await dialog.getByLabel('Deskripsi').fill('Bantuan kartu akses kantor yang hilang atau rusak.');
  await dialog.getByLabel('Kategori').selectOption('Fasilitas');
  await dialog.getByLabel('Kata kunci (pisahkan dengan koma)').fill('kartu hilang, kartu rusak');
  await dialog.getByLabel('PIC utama', { exact:true }).selectOption({ label:'Nadia Putri' });
  await dialog.getByLabel('PIC cadangan').selectOption({ label:'Bagas Pratama' });
  await dialog.getByRole('button', { name:'Tambah tautan' }).click();
  await dialog.getByLabel('Nama', { exact:true }).fill('Form kartu');
  await dialog.getByLabel('URL HTTPS').fill('https://example.com/kartu');
  await dialog.getByRole('button', { name:'Simpan perubahan' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('row').filter({ hasText:'Penggantian kartu akses' })).toHaveCount(1);
  await nav(page, 'Temukan PIC');
  await page.getByRole('textbox', { name:'Cari masalah operasional' }).fill('kartu rusak');
  await page.getByRole('button', { name:'Cari PIC', exact:true }).click();
  await expect(page.locator('.result-card').first()).toContainText('Penggantian kartu akses');
});
test('employee view hides administration; bookmarks persist and mobile has no overflow', async ({ page }) => {
  await page.getByRole('button', { name:'Simpan AC bocor atau tidak dingin' }).click();
  await nav(page, 'Tersimpan');
  await expect(page.locator('.problem-card')).toHaveCount(1);
  await page.getByRole('button', { name:'Menu akun' }).click();
  await page.getByRole('button', { name:'Lihat sebagai karyawan' }).click();
  if (await page.getByRole('button', { name:'Buka navigasi' }).isVisible()) await page.getByRole('button', { name:'Buka navigasi' }).click();
  await expect(page.getByRole('button', { name:'Kelola masalah', exact:true })).toHaveCount(0);
  if (await page.getByRole('button', { name:'Tutup navigasi' }).isVisible()) await page.getByRole('button', { name:'Tutup navigasi' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('analytics, directory, guides and keyboard shortcut work without browser errors', async ({ page }) => {
  const errors: string[]=[]; page.on('pageerror', error=>errors.push(error.message));
  await nav(page, 'Ringkasan');
  await expect(page.getByText('Pencarian minggu ini')).toBeVisible();
  await expect(page.locator('.admin-chart')).toHaveAttribute('aria-label', /pencarian/);
  await nav(page, 'Direktori tim'); await expect(page.locator('.person-card')).toHaveCount(8);
  await nav(page, 'SOP & formulir'); await expect(page.locator('.sop-row')).toHaveCount(24);
  await page.keyboard.press('Control+k'); await expect(page.getByRole('textbox', { name:'Cari masalah operasional' })).toBeFocused();
  expect(errors).toEqual([]);
});


test('admin updates employee, cancels leave and routing returns to the primary PIC', async ({ page }) => {
  await nav(page, 'Kelola PIC');
  await page.getByRole('button', { name:'Edit Alya Rahma', exact:true }).click();
  const employeeDialog=page.getByRole('dialog', { name:'Detail karyawan' });
  await employeeDialog.getByLabel('Nama lengkap').fill('Alya Rahma Putri');
  await employeeDialog.getByRole('button', { name:'Simpan perubahan' }).click();
  await expect(employeeDialog).not.toBeVisible();
  await expect(page.getByRole('row').filter({ hasText:'Alya Rahma Putri' })).toHaveCount(1);
  await nav(page, 'Availability');
  page.once('dialog', dialog=>dialog.accept());
  await page.getByRole('button', { name:'Batalkan', exact:true }).click();
  await expect(page.getByText('Dibatalkan', { exact:true })).toBeVisible();
  await nav(page, 'Temukan PIC');
  await page.getByRole('button', { name:'akses Figma', exact:true }).click();
  await expect(page.locator('.result-card').first()).toContainText('PIC utama siap membantu');
  await expect(page.locator('.result-card').first()).toContainText('Alya Rahma Putri');
});
test('demo chat and form actions open usable sample pages', async ({ page }) => {
  await page.getByRole('button', { name:'akses Figma', exact:true }).click();
  const [chat] = await Promise.all([page.waitForEvent('popup'), page.locator('.result-card').first().getByRole('link', { name:/Kirim chat/ }).click()]);
  await expect(chat.getByRole('heading', { name:'Chat dengan Rizky Saputra' })).toBeVisible();
  await chat.getByLabel('Pesan', { exact:true }).fill('Contoh kebutuhan akses Figma.');
  await chat.getByRole('button', { name:'Simpan contoh pesan' }).click();
  await expect(chat.getByRole('heading', { name:'Contoh tersimpan di browser.' })).toBeVisible();
  await chat.close();
  await page.locator('.result-card').first().getByRole('button', { name:'Lihat detail' }).click();
  const [form] = await Promise.all([page.waitForEvent('popup'), page.getByRole('dialog').getByRole('link', { name:/Form pengajuan/ }).click()]);
  await form.getByLabel('Nama pelapor').fill('Karyawan Demo');
  await form.getByLabel('Deskripsi kebutuhan').fill('Contoh permintaan lisensi.');
  await form.getByRole('button', { name:'Simpan contoh pengajuan' }).click();
  await expect(form.getByRole('heading', { name:'Contoh tersimpan di browser.' })).toBeVisible();
  await form.close();
});
test('failed browser persistence surfaces an error without falsely logging a search', async ({ page }) => {
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Quota exceeded','QuotaExceededError');};});
  await page.getByRole('button', { name:'AC bocor', exact:true }).click();
  await expect(page.getByRole('alert', { name:'Pencarian gagal' })).toContainText('Perubahan belum tersimpan');
  await expect(page.getByRole('heading', { name:/Hasil untuk/ })).toHaveCount(0);
});



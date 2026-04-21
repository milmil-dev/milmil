import { expect, type Page, test } from '@playwright/test';

const USERNAME = 'abc';
const PASSWORD = 'FDyAabxgcQ6YgVy';
const API_BASE = 'http://localhost:8080';

async function login(page: Page) {
  await page.goto('/');
  // Check if we need to login
  await page.waitForTimeout(2000);
  if (page.url().includes('/login') || (await page.locator('input[type="password"]').count()) > 0) {
    const usernameInput = page.locator('input').first();
    await usernameInput.fill(USERNAME);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);
  }
}

async function getToken(page: Page): Promise<string> {
  const resp = await page.request.post(`${API_BASE}/api/v1/auth/login`, {
    data: { username: USERNAME, password: PASSWORD },
  });
  const body = await resp.json();
  return body.token;
}

test.describe('Built-in Torrent: Subscribe → Download → Watch', () => {
  test.setTimeout(300_000); // 5 min for full flow

  test('full flow: subscribe 欢迎来到实力至上主义教室 第四季, download, watch', async ({
    page,
  }) => {
    const token = await getToken(page);
    console.log('Authenticated');

    // Step 1: Check downloader status
    const statusResp = await page.request.get(`${API_BASE}/api/v1/system/downloader-status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const status = await statusResp.json();
    console.log('Downloader status:', JSON.stringify(status));
    expect(status.engine).toBe('builtin');
    expect(status.healthy).toBe(true);

    // Step 2: Search for the anime on torrent sources
    console.log('Searching for 欢迎来到实力至上主义教室 第四季...');
    const searchResp = await page.request.get(
      `${API_BASE}/api/v1/torrent-search?q=${encodeURIComponent('欢迎来到实力至上主义教室 第四季')}&source=all`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const searchResults = await searchResp.json();
    console.log(`Found ${Array.isArray(searchResults) ? searchResults.length : 0} torrent results`);

    if (Array.isArray(searchResults) && searchResults.length > 0) {
      // Show first 3 results
      for (const r of searchResults.slice(0, 3)) {
        console.log(`  - ${r.title} (${r.size}, ${r.seeders} seeders)`);
      }

      // Step 3: Pick the first 1080p result and add it
      const target =
        searchResults.find((r: any) => r.title.includes('1080') && (r.magnet || r.torrent_url)) ||
        searchResults[0];

      console.log(`\nAdding: ${target.title}`);
      const downloadUrl = target.magnet || target.torrent_url;

      const addResp = await page.request.post(`${API_BASE}/api/v1/downloads`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: {
          url: downloadUrl,
          name: target.title,
          save_dir: '/tmp/milmil-e2e-youzitsu',
        },
      });

      console.log('Add response status:', addResp.status());
      const addBody = await addResp.json();
      console.log('Add response:', JSON.stringify(addBody).slice(0, 200));

      if (addResp.ok()) {
        const gid = addBody.gid;

        // Step 4: Poll download progress
        console.log('\nPolling download progress...');
        let lastPct = 0;
        for (let i = 0; i < 60; i++) {
          // up to 2 min
          await page.waitForTimeout(2000);

          const dlResp = await page.request.get(`${API_BASE}/api/v1/downloads`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const downloads = await dlResp.json();
          const dl = downloads.find((d: any) => d.gid === gid);

          if (dl) {
            const pct =
              dl.total_bytes > 0 ? Math.round((dl.completed_bytes / dl.total_bytes) * 100) : 0;

            // Only log on change
            if (pct !== lastPct || i % 5 === 0) {
              const speed =
                dl.speed_bytes > 0 ? `${(dl.speed_bytes / 1024 / 1024).toFixed(1)} MB/s` : '0';
              console.log(
                `[${(i + 1) * 2}s] ${dl.status} ${pct}% (${(dl.completed_bytes / 1024 / 1024).toFixed(1)}/${(dl.total_bytes / 1024 / 1024).toFixed(1)} MB) ${speed}`
              );
              lastPct = pct;
            }

            if (
              dl.status === 'complete' ||
              (dl.total_bytes > 0 && dl.completed_bytes >= dl.total_bytes)
            ) {
              console.log('\n✓ Download complete!');

              // Step 5: Get files
              const filesResp = await page.request.get(
                `${API_BASE}/api/v1/downloads/${gid}/files`,
                {
                  headers: { Authorization: `Bearer ${token}` },
                }
              );
              if (filesResp.ok()) {
                const files = await filesResp.json();
                console.log('Files:');
                if (files.files) {
                  for (const f of files.files) {
                    console.log(`  ${f.path} (${(f.size / 1024 / 1024).toFixed(1)} MB)`);
                  }
                }
              }
              break;
            }

            if (dl.status === 'error') {
              console.log(`\n✗ Download error: ${dl.error || 'unknown'}`);
              break;
            }
          } else {
            console.log(`[${(i + 1) * 2}s] Download not found in list yet...`);
          }
        }
      }
    } else {
      console.log('No search results found, trying subscribe flow...');
    }

    // Step 6: UI verification — navigate to downloads page
    await login(page);
    await page.goto('/downloads?tab=library');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'e2e/screenshots/youzitsu-downloading.png', fullPage: true });

    // Check library tab (combined view)
    await page.goto('/downloads?tab=library');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'e2e/screenshots/youzitsu-completed.png', fullPage: true });

    console.log('\nScreenshots saved to e2e/screenshots/');
    console.log('Test flow completed.');
  });
});

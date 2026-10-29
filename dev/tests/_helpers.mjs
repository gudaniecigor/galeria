export async function login(page, t, query = '') {
  await page.goto(`${t.base}${query}`, 600);
  await page.waitFor(`document.querySelector('.gbtn') && !document.querySelector('.gbtn').disabled`);
  await page.clickSel('.gbtn');
  return page.waitFor(`document.querySelectorAll('a.tile').length > 5`);
}

export async function openFolder(page, text) {
  const selector = `[...document.querySelectorAll('a.tile')].find((t) => t.textContent.includes(${JSON.stringify(text)}))`;
  await page.waitFor(selector);
  await page.eval(`${selector}.click()`);
}

export const lbState = (page) =>
  page.eval(`(() => {
    const lb = document.querySelector('.lb');
    return {
      hash: location.hash,
      open: !!lb && !lb.hidden,
      count: document.querySelector('.lb-count')?.textContent ?? null,
      zoomed: !!lb?.classList.contains('is-zoomed'),
      chromeHidden: !!lb?.classList.contains('chrome-hidden'),
    };
  })()`);

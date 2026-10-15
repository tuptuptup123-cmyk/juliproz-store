async function clickAdminAction(page,selector){
 const button=page.locator(selector);
 if(!await button.isVisible()){
  const id=selector.match(/\[data-[\w-]+=["']([^"']+)["']\]/)?.[1];
  if(!id)throw Error('Product id is required to open its actions');
  if(await page.locator('#editor').isVisible())await page.locator('#backToCatalog').click();
  await page.locator(`[data-edit="${id}"]`).click();
 }
 await button.click();
}
module.exports={clickAdminAction};

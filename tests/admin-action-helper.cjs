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
async function clickAdminControl(page,selector){
 const control=page.locator(selector);
 const menu=await control.evaluate(el=>el.closest('details.manager-menu')?.id);
 if(menu&&!await page.locator('#'+menu).evaluate(el=>el.open))await page.locator('#'+menu+'>summary').click();
 await control.click();
}
async function openAdminSection(page,id){
 const details=page.locator('#'+id+' > details');
 if(await details.count()&&!await details.evaluate(e=>e.open))await details.locator(':scope > summary').click();
}
module.exports={clickAdminAction,clickAdminControl,openAdminSection};

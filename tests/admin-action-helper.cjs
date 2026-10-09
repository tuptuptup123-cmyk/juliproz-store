async function clickAdminAction(page,selector){
 const button=page.locator(selector),details=button.locator('xpath=ancestor::details');
 if(await details.count()&&await details.getAttribute('open')===null)await details.locator('summary').click();
 await button.click();
}
module.exports={clickAdminAction};

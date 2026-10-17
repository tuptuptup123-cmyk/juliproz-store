async function clickSiteTab(page,tab){
 const primary=page.locator('.bottom-nav [data-tab="'+tab+'"]');
 if(await primary.isVisible())return primary.click();
 await page.locator('#moreNavigation').click();await page.locator('[data-more-tab="'+tab+'"]').click();
}
module.exports={clickSiteTab};

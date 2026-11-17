/* User-visible paths to retained tools after the approved primary-tab update. */
async function menu(page){if(await page.locator('#navLinks').isHidden())await page.locator('#mobileMenuButton').click();}
async function openMap(page){await menu(page);await page.locator('#navLinks a[href="#map"]').click();}
async function openRouteSearch(page){await openMap(page);const details=page.locator('#mapRouteSearch');if(!await details.evaluate(n=>n.open))await details.locator(':scope>summary').click();}
async function openNearby(page){await menu(page);await page.locator('#nearbyButton').click();}
async function openLegacyStop(page,id='1'){await page.evaluate(id=>AyoHome.openStop(id),id);const details=page.locator('#homeLegacyTools');if(!await details.evaluate(n=>n.open))await details.locator(':scope>summary').click();await page.locator('#selectedArrivals').waitFor({state:'visible'});}
// Playwright's predicate loop treats a Promise as truthy. Await async checks here.
async function waitForAsync(page,predicate,arg){const deadline=Date.now()+30000;while(Date.now()<deadline){if(await page.evaluate(predicate,arg))return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Timed out awaiting asynchronous browser condition');}
module.exports={openMap,openRouteSearch,openNearby,openLegacyStop,waitForAsync};

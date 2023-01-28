import { Page } from "puppeteer"
import { delay } from "../utils"

export class AccountResetter {

  async getPageLength(page: Page) {
    const childTags = await page.$$("#_carManagement > div > *")
    return childTags.length
  }

  async deleteCarsInPage(page: Page) {
    const trTagsSelector = "#_carManagement > table > tbody > tr"
    const tdCheckBoxSelector = "td.align-c > input[type=checkbox]"
    const deleteButtonSelector = "#searchListForm > div.menu-bar.mylist_toolbar.clearfix > div > button.btn_del"
    const deleteConfirmButtonSelector = "#fallr-button-confirmButton2"

    const trTags = await page.$$(trTagsSelector)

    const synchedCarNumsPromise = trTags.map(async tr=>{
      const checkBoxTag = await tr.$(tdCheckBoxSelector)
      if (!checkBoxTag) throw new Error("No checkbox")
      await checkBoxTag.evaluate(el => el.checked = true)
    })
    await Promise.all(synchedCarNumsPromise)

    const deleteButton = await page.$(deleteButtonSelector)
    if (!deleteButton) throw new Error("No deleteButton")

    await deleteButton.click()
    const deleteConrirmButton = await page.waitForSelector(deleteConfirmButtonSelector)
    if (!deleteConrirmButton) throw new Error("No deleteConrirmButton")

    await page.evaluate((deleteConfirmButtonSelector)=>{
      const aButton = document.querySelector(deleteConfirmButtonSelector)
      aButton!.dispatchEvent(new Event('click', { bubbles: true }));
    }, deleteConfirmButtonSelector)

    await page.waitForNavigation({ waitUntil: "networkidle2"})
  }


  async reset(page: Page, manageUrl: string) {
    let pageNumber = await this.getPageLength(page)
    while (pageNumber) {
      console.log("Page :", pageNumber)
      const lastPageUrl = manageUrl + `?page=${pageNumber}`
      await page.goto(lastPageUrl, { waitUntil: "networkidle2"})
      await page.waitForSelector("#_carManagement > table")
      await this.deleteCarsInPage(page)
      pageNumber -= 1
    }
  }
}

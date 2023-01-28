import { Page } from "puppeteer"

export class InvalidCarRemover {

  async getPageLength(page: Page) {
    const childTags = await page.$$("#_carManagement > div > *")
    return childTags.length
  }

  async removeInvalidCarsInPage(page: Page) {
    const trTagsSelector = "#_carManagement > table > tbody > tr"
    const tdCarNumberSelector = "td.photo > a > span"
    const tdPhotoSelector = "td.photo > a > img"
    const tdCheckBoxSelector = "td.align-c > input[type=checkbox]"
    const deleteButtonSelector = "#searchListForm > div.menu-bar.mylist_toolbar.clearfix > div > button.btn_del"
    const deleteConfirmButtonSelector = "#fallr-button-confirmButton2"

    const trTags = await page.$$(trTagsSelector)
    const checkedCarNumbersWithUndefined = await Promise.all(
      trTags.map(async (tr)=>{
        const carNumberTag = await tr.$(tdCarNumberSelector)
        const photoTag = await tr.$(tdPhotoSelector)
        if (!carNumberTag) throw new Error("No carNumberTag")
        if (!photoTag) throw new Error("No photoTag")

        const carNumber = await carNumberTag.evaluate(el => el.textContent)
        const imgSrc = await photoTag.evaluate(el => el.getAttribute('src'))

        if(!carNumber) throw new Error("No car number")
        if(!imgSrc) throw new Error("No imgSrc")

        const checkBoxTag = await tr.$(tdCheckBoxSelector)
        if (!checkBoxTag) throw new Error("No checkbox")

        const response = await fetch(imgSrc)
        if (response.status === 200) return

        await checkBoxTag.evaluate(el => el.checked = true);
        return carNumber
      })
    )

    const carNumbers = checkedCarNumbersWithUndefined.filter((carNumber): carNumber is string => Boolean(carNumber))
    if (!carNumbers.length) return []

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

    return carNumbers
  }


  async remove(page: Page, manageUrl: string) {
    let pageNumber = await this.getPageLength(page)
    let carNumberList: string[]= []
    while (pageNumber) {
      console.log("Page :", pageNumber)
      const lastPageUrl = manageUrl + `?page=${pageNumber}`
      await page.goto(lastPageUrl, { waitUntil: "networkidle2"})
      await page.waitForSelector("#_carManagement > table")
      const carNumbers = await this.removeInvalidCarsInPage(page)
      console.log(carNumbers)

      carNumberList = [...carNumberList, ...carNumbers]
      pageNumber -= 1
    }
    return carNumberList
  }
}

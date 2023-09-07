import { Page } from "puppeteer"
import { Car } from "../entities"

export class CarSynchronizer {
  existingCarMap: Map<string, Car>
  constructor(
    private page: Page,
    private manageUrl: string,
    existingCars: Car[],
  ) {
    this.existingCarMap = new Map<string, Car>(existingCars.map(car=>[car.carNumber, car]))
  }

  async getPageLength() {
    const childTags = await this.page.$$("#_carManagement > div > *")
    return childTags.length
  }

  async deleteExpiredCars() {
    const trTagsSelector = "#_carManagement > table > tbody > tr"
    const tdPhotoSelector = "td.photo > a > span"
    const tdCheckBoxSelector = "td.align-c > input[type=checkbox]"
    const deleteButtonSelector = "#searchListForm > div.menu-bar.mylist_toolbar.clearfix > div > button.btn_del"
    const deleteConfirmButtonSelector = "#fallr-button-confirmButton2"

    const trTags = await this.page.$$(trTagsSelector)

    // check에 대한 결과를 리턴한다.
    const isCheckedList = await Promise.all(trTags.map(async (tr)=>{
      const photoTag = await tr.$(tdPhotoSelector)
      if (!photoTag) throw new Error("No photoTag tag")

      const carNumber = await photoTag.evaluate(el => el.textContent)
      if(!carNumber) throw new Error(`No car number : ${carNumber}`)

      // DB와 Page에 둘 다 있는 것
      const isExist = this.existingCarMap.get(carNumber)

      if (isExist) {
        this.existingCarMap.delete(carNumber)
        return false
      }
      // DB에 없는 차량인 경우 check
      const checkBoxTag = await tr.$(tdCheckBoxSelector)
      if (!checkBoxTag) throw new Error("No checkbox")
      await checkBoxTag.evaluate(el => el.checked = true)

      return true
    }))

    const isChecked = isCheckedList.filter(isChecked=>isChecked).length
    if (!isChecked) return

    const deleteButton = await this.page.$(deleteButtonSelector)
    if (!deleteButton) throw new Error("No deleteButton")
    await deleteButton.click()

    const deleteConrirmButton = await this.page.waitForSelector(deleteConfirmButtonSelector)
    if (!deleteConrirmButton) throw new Error("No deleteConrirmButton")

    await this.page.evaluate((deleteConfirmButtonSelector)=>{
      const aButton = document.querySelector(deleteConfirmButtonSelector)
      aButton!.dispatchEvent(new Event('click', { bubbles: true }));
    }, deleteConfirmButtonSelector)

    await this.page.waitForNavigation({ waitUntil: "networkidle2"})
  }

  async sync() {
    let pageNumber = await this.getPageLength()
    while (pageNumber) {
      console.log(`Page: ${pageNumber}`)
      await this.page.goto(this.manageUrl + `?page=${pageNumber}`, { waitUntil: "networkidle2"})
      await this.page.waitForSelector("#_carManagement > table")
      await this.deleteExpiredCars()
      pageNumber -= 1
    }
    return this.existingCarMap
  }
}

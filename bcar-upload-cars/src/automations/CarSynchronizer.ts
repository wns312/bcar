import { Page } from "puppeteer"
import { delay } from "../utils"

type SynchedCar = {
  carNum: string
  isDeleted: boolean
}

export class CarSynchronizer {
  constructor(
    private page: Page,
    private manageUrl: string,
    private existingCars: string[],
  ) {}

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
    const synchedCarNumsPromise = trTags.map(async (tr): Promise<SynchedCar>=>{
      const photoTag = await tr.$(tdPhotoSelector)
      if (!photoTag) throw new Error("No photoTag tag")

      const carNum = await photoTag.evaluate(el => el.textContent)
      console.log(carNum);
      if(!carNum) throw new Error("No car number")

      const isCarExist = this.existingCars.includes(carNum)
      if (isCarExist) {
        console.log(`${carNum} exists. continue ...`);
        return { carNum, isDeleted: false }  // 여기선 isDeleted: false를 리턴
      }

      const checkBoxTag = await tr.$(tdCheckBoxSelector)
      if (!checkBoxTag) throw new Error("No checkbox")
      await checkBoxTag.evaluate(el => el.checked = true);
      return { carNum, isDeleted: true }  // 여기선 isDeleted: true를 리턴
    })

    const synchedCarNums = await Promise.all(synchedCarNumsPromise)
    const checkedCarNums = synchedCarNums.filter(obj=> obj.isDeleted).map(obj=>obj.carNum)
    const existingCarNums = synchedCarNums.filter(obj=> !obj.isDeleted).map(obj=>obj.carNum)

    // 삭제할 차량이 있는 경우에만 click해야한다.
    if (!checkedCarNums.length) return existingCarNums

    const deleteButton = await this.page.$(deleteButtonSelector)
    if (!deleteButton) throw new Error("No deleteButton")
    await deleteButton.click()

    const deleteConrirmButton = await this.page.waitForSelector(deleteConfirmButtonSelector)
    if (!deleteConrirmButton) throw new Error("No deleteConrirmButton")

    await this.page.evaluate((deleteConfirmButtonSelector)=>{
      const aButton = document.querySelector(deleteConfirmButtonSelector)
      aButton!.dispatchEvent(new Event('click', { bubbles: true }));
    }, deleteConfirmButtonSelector)

    return existingCarNums
  }

  async sync() {
    let pageNumber = await this.getPageLength()
    let existingCarNums: string[] = []
    console.log(pageNumber);

    while (pageNumber) {
      const lastPageUrl = this.manageUrl + `?page=${pageNumber}`
      await this.page.goto(lastPageUrl, { waitUntil: "networkidle2"})
      await this.page.waitForSelector("#_carManagement > table")
      await delay(1000)
      const existingCarNumsInPage = await this.deleteExpiredCars()
      existingCarNums = [...existingCarNums, ...existingCarNumsInPage]
      pageNumber -= 1
    }
    return existingCarNums
  }
}

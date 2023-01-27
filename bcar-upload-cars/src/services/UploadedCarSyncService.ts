import { Page } from "puppeteer"
import { CarSynchronizer } from "../automations"
import { SheetClient, DynamoUploadedCarClient,  } from "../db"
import { Account, RegionUrl, UploadedCar } from "../entities"
import { delay, PageInitializer } from "../utils"

export class UploadedCarSyncService {

  constructor(
    private dynamoUploadedCarClient: DynamoUploadedCarClient,
    private sheetClient: SheetClient,
  ) {}

  private async login(page: Page, url: string, id: string, pw: string) {
    await page.goto(url, { waitUntil: "networkidle2" });

    await page.evaluate((id, pw) => {
      const idInput = document.querySelector('#content > form > fieldset > div.form_inputbox > div:nth-child(1) > input')
      const pwInput = document.querySelector('#content > form > fieldset > div.form_inputbox > div:nth-child(3) > input')
      if (idInput && pwInput) {
        idInput.setAttribute('value', id)
        pwInput.setAttribute('value', pw)
      } else {
        throw new Error("Cannot find id, pw input")
      }
    }, id, pw)

    await page.click("#content > form > fieldset > span > input")

    await page.waitForNavigation({waitUntil: 'networkidle2'})
  }

  private async getUserCars(id: string): Promise<UploadedCar[]> {
    const uploadedCars = await this.dynamoUploadedCarClient.queryById(id)
    return uploadedCars
  }

  private async getAccountMap() {
    const allUsers = await this.sheetClient.getAccounts()
    return allUsers.reduce((map, user)=>map.set(user.id, user), new Map<string, Account>())
  }

  private async getRegionUrlMap() {
    const allUrls = await this.sheetClient.getRegionUrls()
    return allUrls.reduce((map, urlObj)=>map.set(urlObj.region, urlObj), new Map<string, RegionUrl>())
  }

  async syncCarsByEnv() {
    const kcrId = process.env.KCR_ID
    if (!kcrId) {
      throw new Error("No id env");
    }
    await this.syncCarsById(kcrId)
  }


  async syncCarsById(id: string) {
    const [userCars, userMap, regionUrlMap] = await Promise.all([
      this.getUserCars(id),
      this.getAccountMap(),
      this.getRegionUrlMap(),
    ])
    console.log(userCars);


    const user = userMap.get(id)
    if (!user) throw new Error("No user");

    const { pw, region } = user

    const regionUrlObj = regionUrlMap.get(region)
    if (!regionUrlObj) throw new Error("No KCR URL");
    const { loginUrlRedirectManage, manageUrl } = regionUrlObj
    const page = await PageInitializer.createPage()
    await PageInitializer.activateEvents(page)
    page.on("dialog", async (dialog)=>{
      await dialog.accept()
    })

    await this.login(page, loginUrlRedirectManage, id, pw)
    const carNumbers = userCars.map(car=>car.carNumber)
    const synchronizer = new CarSynchronizer(page, manageUrl, carNumbers)
    const existingCarNums = await synchronizer.sync()
    console.log("existingCarNums", existingCarNums);

    await delay(1000)
    await PageInitializer.closePage(page)
    await PageInitializer.deActivateEvents(page)

    if (existingCarNums.length) {
      await this.dynamoUploadedCarClient.batchSave(id, existingCarNums, true)
    }
  }
}

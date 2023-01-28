import { CarSynchronizer } from "../automations"
import { SheetClient, DynamoUploadedCarClient,  } from "../db"
import { delay, PageInitializer } from "../utils"

export class UploadedCarSyncService {

  constructor(
    private dynamoUploadedCarClient: DynamoUploadedCarClient,
    private sheetClient: SheetClient,
  ) {}

  async syncCarsByEnv() {
    const kcrId = process.env.KCR_ID
    if (!kcrId) {
      throw new Error("No id env");
    }
    await this.syncCarsById(kcrId)
  }


  async syncCarsById(id: string) {
    const [cars, { account, regionUrl }] = await Promise.all([
      this.dynamoUploadedCarClient.queryById(id),
      this.sheetClient.getAccountAndRegionUrl(id)
    ])

    const { loginUrlRedirectManage, manageUrl } = regionUrl
    const page = await PageInitializer.createPage()
    await PageInitializer.activateEvents(page)
    page.on("dialog", async (dialog)=>{
      await dialog.accept()
    })
    await PageInitializer.loginKcr(page, loginUrlRedirectManage, account.id, account.pw)

    const carNumbers = cars.map(car=>car.carNumber)
    console.log(carNumbers)

    const synchronizer = new CarSynchronizer(page, manageUrl, carNumbers)
    const existingCarNums = await synchronizer.sync()
    console.log("existingCarNums", existingCarNums);

    await delay(1000)
    await PageInitializer.deactivateEvents(page)
    await PageInitializer.closePage(page)

    if (existingCarNums.length) {
      await this.dynamoUploadedCarClient.batchSaveByCarNumbers(id, existingCarNums, true)
    }
  }
}

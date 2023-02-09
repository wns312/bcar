import { CarSynchronizer } from "../automations"
import { SheetClient, DynamoUploadedCarClient,  } from "../db"
import { delay, PageInitializer } from "../utils"

export class UploadedCarSyncService {

  constructor(
    private dynamoUploadedCarClient: DynamoUploadedCarClient,
    private sheetClient: SheetClient,
  ) {}

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
    // 이건 다 삭제하고 남은 것이므로 업로드 되지 않은 차량들임
    const existingCarMap = await synchronizer.sync()

    const uploadedCarNumbers = cars.filter(car=>!existingCarMap.get(car.carNumber)).map(car=>car.carNumber)
    const unUploadedCarNumbers = Array.from(existingCarMap.keys())
    console.log("uploadedCarNumbers", uploadedCarNumbers.length)
    console.log("unUploadedCarNumbers", unUploadedCarNumbers.length)

    await delay(1000)

    if (uploadedCarNumbers.length) {
      await this.dynamoUploadedCarClient.batchSaveByCarNumbers(id, uploadedCarNumbers, true)
    }

    if (unUploadedCarNumbers.length) {
      await this.dynamoUploadedCarClient.batchSaveByCarNumbers(id, unUploadedCarNumbers, false)
    }
    await PageInitializer.deactivateEvents(page)
    await PageInitializer.closePage(page)
  }
}

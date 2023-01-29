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
    // 이게 남아있는 차량이므로, 이 차량들을 제외한 나머지 차량들은 false로 저장해주어야 한다.
    const existingCarNums = await synchronizer.sync()
    console.log("existingCarNums", existingCarNums)

    const nonExistingCarNumbers = cars.filter(car=>!existingCarNums.includes(car.carNumber)).map(car=>car.carNumber)
    console.log("nonExistingCarNums", nonExistingCarNumbers)

    await delay(1000)

    if (existingCarNums.length) {
      await this.dynamoUploadedCarClient.batchSaveByCarNumbers(id, existingCarNums, true)
    }
    if (nonExistingCarNumbers.length) {
      await this.dynamoUploadedCarClient.batchSaveByCarNumbers(id, nonExistingCarNumbers, false)
    }
    await PageInitializer.deactivateEvents(page)
    await PageInitializer.closePage(page)
  }
}

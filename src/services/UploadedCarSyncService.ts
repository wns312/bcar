import { CarSynchronizer } from "../automations"
import { SheetClient, DynamoCarClient } from "../db"
import { delay, PageInitializer } from "../utils"

export class UploadedCarSyncService {

  constructor(private dynamoCarClient: DynamoCarClient, private sheetClient: SheetClient) {}

  async syncCarsById(id: string) {
    const cars = await this.dynamoCarClient.queryAssignedCarsByUploader(id)
    const { account, regionUrl } = await this.sheetClient.getAccountAndRegionUrlById(id)
    const { loginUrlRedirectManage, manageUrl } = regionUrl

    const page = await PageInitializer.createPage()
    await PageInitializer.activateEvents(page)
    page.on("dialog", async (dialog)=>{ await dialog.accept() })
    await PageInitializer.loginKcr(page, loginUrlRedirectManage, account.id, account.pw)

    const synchronizer = new CarSynchronizer(page, manageUrl, cars)
    const existingCarMap = await synchronizer.sync()

    const uploadedCars = cars.filter(car=>!existingCarMap.get(car.carNumber))
    const unUploadedCars = Array.from(existingCarMap.values())
    console.log("uploadedCars: ", uploadedCars.length, "\nunUploadedCars", unUploadedCars.length)
    await delay(1000)

    if (uploadedCars.length) {
      uploadedCars.forEach((car)=> { car.isUploaded = true })
      await this.dynamoCarClient.batchSaveCar(uploadedCars)
    }

    if (unUploadedCars.length) {
      unUploadedCars.forEach((car)=> { car.isUploaded = false })
      await this.dynamoCarClient.batchSaveCar(unUploadedCars)
    }
    await PageInitializer.deactivateEvents(page)
    await PageInitializer.closePage(page)
  }
}

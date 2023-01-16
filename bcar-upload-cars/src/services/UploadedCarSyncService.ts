import { BrowserInitializer, CarSynchronizer } from "../automations"
import { SheetClient, DynamoUploadedCarClient,  } from "../db"
import { Account, KCRURL } from "../types"
import { delay } from "../utils"

export class UploadedCarSyncService {

  constructor(
    private dynamoUploadedCarClient: DynamoUploadedCarClient,
    private sheetClient: SheetClient,
    private initializer: BrowserInitializer,
  ) {}

  private async getUserCars(id: string): Promise<string[]> {
    const updateCarsResult = await this.dynamoUploadedCarClient.queryById(id)
    if (updateCarsResult.$metadata.httpStatusCode !== 200) {
      console.error(updateCarsResult);
      throw new Error("Response is not 200");
    }
    return updateCarsResult.Items ? updateCarsResult.Items.map(item=>item.SK.S!.replace("#CAR-", "")) : []
  }

  private async getAccountMap() {
    const allUsers = await this.sheetClient.getAccounts()
    return allUsers.reduce((map, user)=>map.set(user.id, user), new Map<string, Account>())
  }

  private async getURLMap() {
    const allUrls = await this.sheetClient.getKcrs()
    return allUrls.reduce((map, urlObj)=>map.set(urlObj.region, urlObj), new Map<string, KCRURL>())
  }

  async syncCarsByEnv() {
    const kcrId = process.env.KCR_ID
    if (!kcrId) {
      throw new Error("No id env");
    }
    await this.syncCarsById(kcrId)
  }


  async syncCarsById(id: string) {
    const [userCars, userMap, urlMap] = await Promise.all([
      this.getUserCars(id),
      this.getAccountMap(),
      this.getURLMap(),
    ])

    const user = userMap.get(id)
    if (!user) throw new Error("No user");

    const { pw, region } = user

    const urlObj = urlMap.get(region)
    if (!urlObj) throw new Error("No KCR URL");
    const { loginUrl, manageUrl } = urlObj

    await this.initializer.initializeBrowsers(1)
    const page = this.initializer.pageList[0]
    await this.initializer.activateEvents(page)
    await page.on("dialog", async (dialog)=>{
      await dialog.accept()
    })
    await this.initializer.login(page, loginUrl + manageUrl, id, pw)

    const synchronizer = new CarSynchronizer(page, manageUrl, userCars)
    const existingCarNums = await synchronizer.sync()
    console.log("existingCarNums", existingCarNums);

    await delay(1000)
    await this.initializer.closePages()

    if (existingCarNums.length) {
      await this.dynamoUploadedCarClient.batchSave(id, existingCarNums, true)
    }
  }
}

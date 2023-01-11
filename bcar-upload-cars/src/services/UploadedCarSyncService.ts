import { BrowserInitializer, CarSynchronizer } from "../puppeteer"
import { AccountSheetClient, DynamoCarClient, DynamoUploadedCarClient, KCRURLSheetClient } from "../db"
import { Account, KCRURL } from "../types"

export class UploadedCarSyncService {

  constructor(
    private dynamoCarClient: DynamoCarClient,
    private dynamoUploadedCarClient: DynamoUploadedCarClient,
    private accountSheetClient: AccountSheetClient,
    private KCRSheetClient: KCRURLSheetClient,
    private initializer: BrowserInitializer,
  ) {}

  private async getExistingUpdatedCarMap() {
    const [carResults, updatedCarResults] = await Promise.all([
      this.dynamoCarClient.segmentScan(10),
      this.dynamoUploadedCarClient.segmentScan(10)
    ])

    const carResultMap = carResults.reduce((map, item)=>
      map.set(item.PK.S!, item.Title.S!),
      new Map<string, string>()
    )

    // 여기서 실제 존재하는 차량만 걸러진다.
    // carResultMap에 있는 차량이라는 것은 유지되어야 할 차량이라는 것을 의미하기 때문.
    const updatedCarResultMap = updatedCarResults.reduce((map, item)=>
      carResultMap.get(item.SK.S!) ? map.set(item.SK.S!.replace("#CAR-", ""), item.PK.S!) : map,
      new Map<string, string>()
    )

    return Array.from(updatedCarResultMap.entries()).reduce((map, [car, userPk])=>{
      const user = userPk.replace('#USER-', '')
      const carList = map.get(user)
      return map.set(user, carList ? [...carList, car]: [car])
    }, new Map<string, string[]>())
  }

  private filterUsers(existingCarMap: Map<string, string[]>, allUsers: Account[]) {
    const userIds = Array.from(existingCarMap.keys())
    return allUsers.filter(user=>userIds.includes(user.id))
  }

  async execute() {
    const [existingCarMap, allUsers, allURL] = await Promise.all([
      this.getExistingUpdatedCarMap(),
      this.accountSheetClient.getAccounts(),
      this.KCRSheetClient.getAll(),
    ])
    console.log(existingCarMap);

    const urlMap = new Map<string, KCRURL>(
      allURL.map(obj=>[obj.region, obj])
    )

    const filteredUsers = this.filterUsers(existingCarMap, allUsers)
    console.log(existingCarMap);
    console.log(filteredUsers);

    await this.initializer.initializeBrowsers(filteredUsers.length)
    const page = this.initializer.pageList[0]
    await this.initializer.activateEvents(page)
    await page.on("dialog", async (dialog)=>{
      await dialog.accept()
    })

    const deletedCarNumsPromises = filteredUsers.map(async ({id, pw, region})=> {
      const kcrUrl = urlMap.get(region)
      if (!kcrUrl) throw new Error("No KCR URL")
      const { loginUrl, manageUrl } = kcrUrl

      await this.initializer.login(page, loginUrl + manageUrl, id, pw)
      const existingCars = existingCarMap.get(id)!

      const synchronizer = new CarSynchronizer(page, manageUrl, existingCars)
      const deletedCarNums = await synchronizer.sync()
      if (!deletedCarNums.length) return

      this.dynamoUploadedCarClient.batchDelete(id, deletedCarNums)
    })

    await Promise.all(deletedCarNumsPromises)
    await this.initializer.closePages()
  }
}

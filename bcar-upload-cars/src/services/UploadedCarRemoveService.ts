import { Page } from "puppeteer"
import { InvalidCarRemover } from "../automations"
import { DynamoUploadedCarClient, SheetClient } from "../db"
import { Account, RegionUrl } from "../entities"
import { delay, PageInitializer } from "../utils"

export class UploadedCarRemoveService {

  constructor(
    private sheetClient: SheetClient,
    private dynamoUploadedCarClient: DynamoUploadedCarClient,
    private invalidCarRemover: InvalidCarRemover
  ) {}

  private async execute(page: Page, account: Account, regionUrl: RegionUrl) {
    // 1. 실제 id에서 모든 차량 삭제
    await PageInitializer.loginKcr(page, regionUrl.loginUrlRedirectManage, account.id, account.pw)
    const removedCarNumbers = await this.invalidCarRemover.remove(page, regionUrl.manageUrl)
    await delay(500)

    // 2. DB에서 UploadedCars 삭제
    if (!removedCarNumbers.length) return
    const responses = await this.dynamoUploadedCarClient.batchSaveByCarNumbers(account.id, removedCarNumbers, false)
    responses.forEach(response=> {
      if (response.$metadata.httpStatusCode !== 200) {
        console.log(response)
      }
    })
  }

  async removeByEnv() {
    const kcrId = process.env.KCR_ID
    if (!kcrId) {
      throw new Error("No id env");
    }
    await this.removeById(kcrId)
  }

  async removeById(id: string) {
    const { account, regionUrl } = await this.sheetClient.getAccountAndRegionUrl(id)
    console.log(id)
    const page = await PageInitializer.createPage()
    page.on("dialog", async (dialog)=>{
      await dialog.accept()
    })
    PageInitializer.activateEvents(page)

    await this.execute(page, account, regionUrl)

    await PageInitializer.closePage(page)
  }

  async removeAll() {
    const [accounts, regionUrlMap] = await Promise.all([
      this.sheetClient.getAccounts(),
      this.sheetClient.getRegionUrlMap(),
    ])

    const page = await PageInitializer.createPage()
    page.on("dialog", async (dialog)=>{
      await dialog.accept()
    })
    PageInitializer.activateEvents(page)

    for (const account of accounts) {
      console.log(account.id)
      const regionUrl = regionUrlMap.get(account.region)
      if (!regionUrl) {
        console.log(`${account.region} does not exist in regionUrlMap`)
        return
      }
      await this.execute(page, account, regionUrl)
    }

    await PageInitializer.closePage(page)
  }

  async removeByIds(ids: string[]) {
    const [accountMap, regionUrlMap] = await Promise.all([
      await this.sheetClient.getAccountIdMap(),
      await this.sheetClient.getRegionUrlMap(),
    ])

    const page = await PageInitializer.createPage()
    page.on("dialog", async (dialog)=>{
      await dialog.accept()
    })
    PageInitializer.activateEvents(page)

    for (const id in ids) {
      console.log(id)
      const account = accountMap.get(id)
      if (!account) {
        console.log(`${id} does not exist in acccountMap`)
        return
      }
      const regionUrl = regionUrlMap.get(account.region)
      if (!regionUrl) {
        console.log(`${account.region} does not exist in regionUrlMap`)
        return
      }
      await this.execute(page, account, regionUrl)
    }

    await PageInitializer.closePage(page)
  }
}


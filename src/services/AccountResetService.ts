import { Page } from "puppeteer"
import { AccountResetter } from "../automations"
import { DynamoUploadedCarClient, SheetClient } from "../db"
import { Account, RegionUrl } from "../entities"
import { delay, PageInitializer } from "../utils"

export class AccountResetService {

  constructor(
    private sheetClient: SheetClient,
    private dynamoUploadedCarClient: DynamoUploadedCarClient,
    private accountResetter: AccountResetter
  ) {}

  private async execute(page: Page, account: Account, regionUrl: RegionUrl) {
    // 1. 실제 id에서 모든 차량 삭제
    await PageInitializer.loginKcr(page, regionUrl.loginUrlRedirectManage, account.id, account.pw)
    await this.accountResetter.reset(page, regionUrl.manageUrl)
    await delay(500)

    // 2. DB에서 UploadedCars 삭제
    const uploadedCarNumbers = await this.dynamoUploadedCarClient.queryCarNumbersById(account.id)
    console.log("uploadedCarNumbers : ", uploadedCarNumbers.length)
    if (!uploadedCarNumbers.length) return
    const responses = await this.dynamoUploadedCarClient.batchSaveByCarNumbers(account.id, uploadedCarNumbers, false)
    responses.forEach(response=> {
      if (response.$metadata.httpStatusCode !== 200) {
        console.log(response)
      }
    })
  }

  async resetByEnv() {
    const kcrId = process.env.KCR_ID
    if (!kcrId) {
      throw new Error("No id env");
    }
    await this.resetById(kcrId)
  }

  async resetById(id: string) {
    const { account, regionUrl } = await this.sheetClient.getAccountAndRegionUrl(id)

    const page = await PageInitializer.createPage()
    page.on("dialog", async (dialog)=>{
      await dialog.accept()
    })
    PageInitializer.activateEvents(page)

    await this.execute(page, account, regionUrl)

    await PageInitializer.closePage(page)
  }

  async resetAll() {
    const [accounts, regionUrlMap] = await Promise.all([
      this.sheetClient.getAccounts(),
      this.sheetClient.getRegionUrlMap(),
    ])

    const page = await PageInitializer.createPage()
    page.on("dialog", async (dialog)=>{
      await dialog.accept()
    })
    PageInitializer.activateEvents(page)
    try {
      for (const account of accounts) {
        console.log(account.id)

        const regionUrl = regionUrlMap.get(account.region)
        if (!regionUrl) {
          console.log(`${account.region} does not exist in regionUrlMap`)
          return
        }
        await this.execute(page, account, regionUrl)
      }
    } catch (error) {
      throw error

    } finally {
      await PageInitializer.closePage(page)
    }
  }

  async resetByIds(ids: string[]) {
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


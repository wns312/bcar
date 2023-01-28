// https://github.com/googleapis/google-api-nodejs-client/tree/main/samples/sheets
import { google, sheets_v4 } from "googleapis"
import { envs } from "../../configs"
import { ResponseError } from "../../errors"
import { Account, RegionUrl } from "../../entities"

export class SheetClient {
  static accountSheetName = envs.GOOGLE_ACCOUNT_SHEET_NAME
  static accountSpreadsheetId = envs.GOOGLE_SPREAD_SHEET_ID
  static accountRangeStart = "A3"
  static accountRangeEnd = "F"

  static regionSheetName = envs.GOOGLE_KCRURL_SHEET_NAME
  static regionSpreadsheetId = envs.GOOGLE_SPREAD_SHEET_ID
  static regionRangeStart = "A3"
  static regionRangeEnd = "B"

  sheets: sheets_v4.Sheets
  accounts: Account[] = []
  regionUrls: RegionUrl[] = []

  constructor(email: string, key: string) {
    const auth = new google.auth.JWT(email, undefined, key, ["https://www.googleapis.com/auth/spreadsheets"])
    this.sheets = google.sheets({ version: "v4", auth })
  }

  get accountRange() {
    const sheetName = SheetClient.accountSheetName
    const rangeStart = SheetClient.accountRangeStart
    const rangeEnd = SheetClient.accountRangeEnd
    return `${sheetName}!${rangeStart}:${rangeEnd}`
  }

  get regionUrlRange() {
    const sheetName = SheetClient.regionSheetName
    const rangeStart = SheetClient.regionRangeStart
    const rangeEnd = SheetClient.regionRangeEnd
    return `${sheetName}!${rangeStart}:${rangeEnd}`
  }

  async getAccounts() {
    if (this.accounts.length) {
      return this.accounts
    }
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: SheetClient.accountSpreadsheetId,
      range: this.accountRange,
    });
    if (response.status != 200) {
      console.error(response);
      throw new ResponseError(response.statusText)
    }
    const values = response.data.values as string[][]
    const accountRawList = values?.splice(1)
    this.accounts = accountRawList.map(
      ([index, id, pw, region, isTestAccount, isErrorOccured, logStreamUrl, errorContent]) => new Account({
        index: parseInt(index),
        id,
        pw,
        region,
        isTestAccount: isTestAccount == "TRUE" ? true : false,
        isErrorOccured: isErrorOccured == "TRUE" ? true : false,
        logStreamUrl: logStreamUrl,
        errorContent: errorContent,
      })
    )
    return this.accounts
  }

  async getRegionUrls() {
    if (this.accounts.length) {
      return this.regionUrls
    }
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: SheetClient.regionSpreadsheetId,
      range: this.regionUrlRange,
    });
    if (response.status != 200) {
      console.error(response);
      throw new ResponseError(response.statusText)
    }
    const values = response.data.values as string[][]
    const rawList = values?.splice(1)
    this.regionUrls = rawList.map(([region, baseUrl]) =>new RegionUrl({
      region,
      baseUrl
    }))
    return this.regionUrls
  }

  async getAccountIdMap() {
    const accounts = await this.getAccounts()
    return new Map<string, Account>(accounts.map(account=>[account.id, account]))
  }

  async getAccountIndexMap() {
    const accounts = await this.getAccounts()
    return new Map<number, Account>(accounts.map(account=>[account.index, account]))
  }

  async getRegionUrlMap() {
    const regionsUrls = await this.getRegionUrls()
    return new Map<string, RegionUrl>(regionsUrls.map(regionsUrl=>[regionsUrl.region, regionsUrl]))
  }

  async getAccountAndRegionUrl(id: string) {
    const [accountMap, regionUrlMap] = await Promise.all([
      this.getAccountIdMap(),
      this.getRegionUrlMap(),
    ])
    const account = accountMap.get(id)
    if (!account) {
      throw new Error("Cannot find account");
    }
    const regionUrl = regionUrlMap.get(account.region)
    if (!regionUrl) {
      throw new Error("Cannot find regionUrl");
    }
    return { account, regionUrl }
  }

  async getTestAccountAndRegionUrl() {
    const [accounts, regionUrlMap] = await Promise.all([
      this.getAccounts(),
      this.getRegionUrlMap(),
    ])
    const testAccounts = accounts.filter(account=>account.isTestAccount)
    if (!testAccounts.length) {
      throw new Error("Cannot find account")
    }
    const account = testAccounts[0]
    const regionUrl = regionUrlMap.get(account.region)
    if (!regionUrl) {
      throw new Error("Cannot find regionUrl")
    }
    return { account, regionUrl }
  }

  async getNextAccount(id: string) {
    const [idMap, indexMap] = await Promise.all([
      this.getAccountIdMap(),
      this.getAccountIndexMap()
    ])

    const currentAccount = idMap.get(id)
    if (!currentAccount) {
      throw new Error(`CurrentAccount does not exist :${id}`)
    }
    return indexMap.get(currentAccount.index + 1)
  }
}

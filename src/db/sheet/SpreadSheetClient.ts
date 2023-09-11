// https://github.com/googleapis/google-api-nodejs-client/tree/main/samples/sheets
import { google, sheets_v4 } from "googleapis"
import { envs } from "../../configs"
import { ResponseError } from "../../errors"
import { Account, Margin, RegionUrl } from "../../entities"
import { Origin } from "../../types"


export class SheetClient {
  static spreadsheetId = envs.GOOGLE_SPREAD_SHEET_ID

  static accountSheetName = "Accounts"
  static accountRangeStart = "A3"
  static accountRangeEnd = "K"

  static regionSheetName = "URLs"
  static regionRangeStart = "A3"
  static regionRangeEnd = "B"

  static commentSheetName = "Comment"
  static marginSheetName = "Margin"

  sheets: sheets_v4.Sheets
  accounts: Account[] = []
  regionUrls: RegionUrl[] = []
  margin: number = -1
  marginMap: Map<Origin, Margin[]> | undefined
  comment: string = ""

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

  get marginRange() {
    return `${SheetClient.marginSheetName}!A4:C`
  }

  get commentRange() {
    return `${SheetClient.commentSheetName}!A1:A1`
  }

  async getMargin() {
    if (this.marginMap) {
      return this.marginMap!
    }
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: SheetClient.spreadsheetId,
      range: this.marginRange,
    })
    if (response.status != 200) {
      console.error(response);
      throw new ResponseError(response.statusText)
    }

    const values = response.data.values as string[][]
    this.marginMap = new Map<Origin, Margin[]>([
      [Origin.Domestic, values.map(([priceRange, price, _])=> new Margin(
        parseInt(priceRange.split('-')[1]), parseInt(price)
      ))],
      [Origin.Imported, values.map(([priceRange, _, price])=> new Margin(
        parseInt(priceRange.split('-')[1]), parseInt(price)
      ))]
    ])
    return this.marginMap!
  }

  async getComment() {
    if (this.comment.length) {
      return this.comment
    }
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: SheetClient.spreadsheetId,
      range: this.commentRange,
    });
    if (response.status != 200) {
      console.error(response);
      throw new ResponseError(response.statusText)
    }
    const values = response.data.values as string[][]
    const value = values[0][0]
    return value
  }

  async getAccounts() {
    if (this.accounts.length) {
      return this.accounts
    }
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: SheetClient.spreadsheetId,
      range: this.accountRange,
    });
    if (response.status != 200) {
      console.error(response);
      throw new ResponseError(response.statusText)
    }
    const values = response.data.values as string[][]
    const accountRawList = values?.splice(1)
    this.accounts = accountRawList.map(
      ([index, id, pw, region, ta, bpa, ia, lta, da, da1000, da2500]) => new Account({
        index: parseInt(index),
        id,
        pw,
        region,
        totalAmount: parseInt(ta),
        bongoPorterAmount: parseInt(bpa),
        importedAmount: parseInt(ia),
        largeTruckAmount: parseInt(lta),
        domesticAmount: parseInt(da),
        domesticAmountUnder1000: parseInt(da1000),
        domesticAmountUnder2500: parseInt(da2500),
      })
    )
    return this.accounts
  }

  async getRegionUrls() {
    if (this.accounts.length) {
      return this.regionUrls
    }
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: SheetClient.spreadsheetId,
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
  async getAccountRegionMap() {
    const accounts = await this.getAccounts()
    return accounts.reduce((map, account) => {
      const accounts = map.get(account.region)
      if (!accounts) {
        return map.set(account.region, [account])
      }
      accounts.push(account)
      return map
    }, new Map<string, Account[]>())
    // return new Map<string, Account>(accounts.map(account=>[account.id, account]))
  }

  async getAccountIndexMap() {
    const accounts = await this.getAccounts()
    return new Map<number, Account>(accounts.map(account=>[account.index, account]))
  }

  async getRegionUrlMap() {
    const regionsUrls = await this.getRegionUrls()
    return new Map<string, RegionUrl>(regionsUrls.map(regionsUrl=>[regionsUrl.region, regionsUrl]))
  }

  async getAccountAndRegionUrlById(id: string) {
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

  async getAccountAndRegionUrl() {
    const [accounts, regionUrlMap] = await Promise.all([
      this.getAccounts(),
      this.getRegionUrlMap(),
    ])
    if (!accounts.length) {
      throw new Error("Cannot find account")
    }
    const account = accounts[0]
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

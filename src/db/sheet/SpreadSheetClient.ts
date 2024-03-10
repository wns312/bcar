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

  static filterSheetName = "Filter"
  static carNumberFilterRangeStart = "A4"
  static carNumberFilterRangeEnd = "A"
  static agentFilterRangeStart = "B4"
  static agentFilterRangeEnd = "B"
  static sellerPhoneFilterRangeStart = "C4"
  static sellerPhoneFilterRangeEnd = "C"

  static commentSheetName = "Comment"
  static marginSheetName = "Margin"

  sheets: sheets_v4.Sheets
  accounts: Account[] = []
  regionUrls: RegionUrl[] = []
  carNumberFilterSet: Set<String> | undefined
  agentFilterSet: Set<String> | undefined
  sellerPhoneFilterSet: Set<String> | undefined
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

  get carNumberFilterRange() {
    const sheetName = SheetClient.filterSheetName
    const rangeStart = SheetClient.carNumberFilterRangeStart
    const rangeEnd = SheetClient.carNumberFilterRangeEnd
    return `${sheetName}!${rangeStart}:${rangeEnd}`
  }
  get agentFilterRange() {
    const sheetName = SheetClient.filterSheetName
    const rangeStart = SheetClient.agentFilterRangeStart
    const rangeEnd = SheetClient.agentFilterRangeEnd
    return `${sheetName}!${rangeStart}:${rangeEnd}`
  }
  get sellerPhoneFilterRange() {
    const sheetName = SheetClient.filterSheetName
    const rangeStart = SheetClient.sellerPhoneFilterRangeStart
    const rangeEnd = SheetClient.sellerPhoneFilterRangeEnd
    return `${sheetName}!${rangeStart}:${rangeEnd}`
  }

  get marginRange() {
    return `${SheetClient.marginSheetName}!A4:C`
  }

  get commentRange() {
    return `${SheetClient.commentSheetName}!A1:A1`
  }

  private async request(range: string) {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: SheetClient.spreadsheetId,
      range,
    })
    if (response.status != 200) throw new ResponseError(response.statusText)
    return response
  }

  async getMargin() {
    if (this.marginMap) return this.marginMap!
    const response = await this.request(this.marginRange)
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
    if (this.comment.length) return this.comment
    const response = await this.request(this.commentRange)
    return response.data.values![0][0] as string
  }

  async getAccounts() {
    if (this.accounts.length) return this.accounts
    const response = await this.request(this.accountRange)
    const values = response.data.values as string[][]
    const accountRawList = values?.splice(1)
    return this.accounts = accountRawList.map(
      ([index, id, pw, region, ta, bpa, ia, lta, da, da1500, da2500]) => new Account({
        id, pw, region,
        index: parseInt(index),
        totalAmount: parseInt(ta),
        bongoPorterAmount: parseInt(bpa),
        importedAmount: parseInt(ia),
        largeTruckAmount: parseInt(lta),
        domesticAmount: parseInt(da),
        domesticAmountUnder1500: parseInt(da1500),
        domesticAmountUnder2500: parseInt(da2500),
      })
    )
  }

  async getRegionUrls() {
    if (this.accounts.length) return this.regionUrls
    const response = await this.request(this.regionUrlRange)
    const values = response.data.values as string[][]
    const rawList = values?.splice(1)
    this.regionUrls = rawList.map(([region, baseUrl]) =>new RegionUrl({
      region,
      baseUrl
    }))
    return this.regionUrls
  }

  async getCarNumberFilterSet() {
    if (this.carNumberFilterSet === undefined) {
      const response = await this.request(this.carNumberFilterRange)
      const values = response.data.values == undefined ? [] : response.data.values.flat() as String[]
      this.carNumberFilterSet = new Set<String>(values)
    }
    return this.carNumberFilterSet
  }

  async getAgentFilterSet() {
    if (this.agentFilterSet === undefined) {
      const response = await this.request(this.agentFilterRange)
      const values = response.data.values == undefined ? [] : response.data.values.flat() as String[]
      this.agentFilterSet = new Set<String>(values)
    }
    return this.agentFilterSet
  }

  async getsellerPhoneFilterSet() {
    if (this.sellerPhoneFilterSet === undefined) {
      const response = await this.request(this.sellerPhoneFilterRange)
      const values = response.data.values == undefined ? [] : response.data.values.flat() as String[]
      this.sellerPhoneFilterSet = new Set<String>(values)
    }
    return this.sellerPhoneFilterSet
  }

  async getFilters() {
    await Promise.all([ this.getCarNumberFilterSet(), this.getAgentFilterSet(), this.getsellerPhoneFilterSet()])
    return {
      carNumberFilterSet: this.carNumberFilterSet!,
      agentFilterSet: this.agentFilterSet!,
      sellerPhoneFilterSet: this.sellerPhoneFilterSet!,
    }
  }

  async getAccountIdMap() {
    const accounts = await this.getAccounts()
    return new Map<string, Account>(accounts.map(account=>[account.id, account]))
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
}

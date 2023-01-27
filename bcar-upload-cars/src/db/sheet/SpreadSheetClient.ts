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
    return accountRawList.map(
      ([id, pw, region, isTestAccount, isErrorOccured, logStreamUrl, errorContent]) => new Account({
        id,
        pw,
        region,
        isTestAccount: isTestAccount == "TRUE" ? true : false,
        isErrorOccured: isErrorOccured == "TRUE" ? true : false,
        logStreamUrl: logStreamUrl,
        errorContent: errorContent,
      })
    )
  }

  async getRegionUrls() {
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
    return rawList.map(([region, baseUrl]) =>new RegionUrl({
      region,
      baseUrl
    }))
  }
}

// https://github.com/googleapis/google-api-nodejs-client/tree/main/samples/sheets
import { google, sheets_v4 } from "googleapis"
import { envs } from "../../configs"
import { ResponseError } from "../../errors"
import { Account, KCRURL } from "../../types"

export class SheetClient {
  static accountSheetName = envs.GOOGLE_ACCOUNT_SHEET_NAME
  static accountSpreadsheetId = envs.GOOGLE_SPREAD_SHEET_ID
  static accountRangeStart = "A3"
  static accountRangeEnd = "F"

  static kcrSheetName = envs.GOOGLE_KCRURL_SHEET_NAME
  static kcrSpreadsheetId = envs.GOOGLE_SPREAD_SHEET_ID
  static kcrRangeStart = "A3"
  static kcrRangeEnd = "D"
  sheets: sheets_v4.Sheets

  constructor(email: string, key: string) {
    const auth = new google.auth.JWT(email, undefined, key, ["https://www.googleapis.com/auth/spreadsheets"])
    this.sheets = google.sheets({ version: "v4", auth })
  }

  // Account
  get accountRange() {
    const sheetName = SheetClient.accountSheetName
    const rangeStart = SheetClient.accountRangeStart
    const rangeEnd = SheetClient.accountRangeEnd
    return `${sheetName}!${rangeStart}:${rangeEnd}`
  }

  private convertAccounts(rawList: string[][]): Account[] {
    return rawList?.map(([id, pw, region, isTest, isError, logUrl, error]) => ({
      id,
      pw,
      region,
      isTestAccount: isTest == "TRUE" ? true : false,
      isErrorOccured: isError == "TRUE" ? true : false,
      logStreamUrl: isError ? logUrl : null,
      errorContent: isError ? error : null,
    }))
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
    return this.convertAccounts(accountRawList)
  }

  async appendAccount(id: string, pw: string, isTestAccount: boolean) {
    const response = await this.sheets.spreadsheets.values.append({
      spreadsheetId: SheetClient.accountSpreadsheetId,
      range: SheetClient.accountSheetName,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [ [id, pw, isTestAccount, false] ]
      }
    })
    if (response.status != 200) {
      console.error(response);
      throw new ResponseError(response.statusText)
    }
    return response.data
  }

  // KCR
  get kcrRange() {
    const sheetName = SheetClient.kcrSheetName
    const rangeStart = SheetClient.kcrRangeStart
    const rangeEnd = SheetClient.kcrRangeEnd
    return `${sheetName}!${rangeStart}:${rangeEnd}`
  }

  private convertKcrs(rawList: string[][]): KCRURL[] {
    return rawList?.map(([region, loginUrl, registerUrl, manageUrl]) =>({
      region,
      loginUrl,
      registerUrl,
      manageUrl,
    }))
  }

  async getKcrs() {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: SheetClient.kcrSpreadsheetId,
      range: this.kcrRange,
    });
    if (response.status != 200) {
      console.error(response);
      throw new ResponseError(response.statusText)
    }
    const values = response.data.values as string[][]
    const rawList = values?.splice(1)
    return this.convertKcrs(rawList)
  }
}

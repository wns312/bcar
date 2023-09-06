import { envs } from "../configs"
import { SheetClient } from "../db"
import { PageInitializer, timer } from "../utils"

export class LoginApp {
  constructor(private sheetClient: SheetClient) {}

  @timer()
  async login(id: string) {
    const { account, regionUrl } = await this.sheetClient.getAccountAndRegionUrlById(id)
    const { loginUrlRedirectManage } = regionUrl
    const page = await PageInitializer.createPage()
    await PageInitializer.loginKcr(page, loginUrlRedirectManage, account.id, account.pw)
  }

}

if (require.main == module) {
  (async ()=>{
    const { GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY } = envs
    const sheetClient = new SheetClient(GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY)
    const id = process.env.KCR_ID
    if (!id) throw new Error("No id env")
    await new LoginApp(sheetClient).login(id)
  })()
}

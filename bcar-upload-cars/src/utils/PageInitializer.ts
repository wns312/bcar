import { Browser, launch, Page } from "puppeteer"
import { envs } from "../configs"

export class PageInitializer {
  static async createPages(amount: number) {
    if (!amount) return []
    const browsersPromises: Promise<Browser>[] = []

    for (let i = 0; i < amount; i++) {
      browsersPromises.push(
        launch({
          defaultViewport: null,
          args: ['--no-sandbox'],
          ignoreDefaultArgs: ['--disable-extensions'],
          headless: envs.NODE_ENV === 'prod',
          devtools: true,
        })
      )
    }

    return Promise.all(
      browsersPromises.map(async browserPromise=>{
        const browser = await browserPromise
        const pages = await browser.pages()
        return pages[0]
      })
    )
  }

  static async closePages(pages: Page[]) {
    await Promise.all(
      pages.map(page => page.browser().close())
    )
    console.info(`Total ${pages.length} browser(s) closed`);
  }

  static async createPage() {
    const pages = await this.createPages(1)
    return pages[0]
  }

  static closePage(page: Page) {
    return this.closePages([page])
  }
}
